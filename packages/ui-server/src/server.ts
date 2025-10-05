#!/usr/bin/env node
/**
 * Backend server for EitherWay UI
 * Provides HTTP API and WebSocket for real-time agent interaction
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { Agent, DatabaseAgent, ConfigLoader } from '@eitherway/runtime';
import { getAllExecutors } from '@eitherway/tools-impl';
import { createDatabaseClient, FilesRepository, SessionsRepository, PostgresFileStore } from '@eitherway/database';
import { readdir, readFile, stat, writeFile, rm, mkdir } from 'fs/promises';
import { join, dirname, resolve, relative } from 'path';
import { fileURLToPath } from 'url';
import { maybeRewriteFile } from './cdn-rewriter.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerSessionFileRoutes } from './routes/session-files.js';

const fastify = Fastify({ logger: true });

// Enable CORS
await fastify.register(cors, {
  origin: true
});

// Enable WebSocket
await fastify.register(websocket);

// Resolve project root (go up from packages/ui-server/src to project root)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../../..');

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || join(PROJECT_ROOT, 'workspace');
const USE_LOCAL_FS = process.env.USE_LOCAL_FS === 'true';

// Load configuration from project root
const loader = new ConfigLoader(join(PROJECT_ROOT, 'configs'));
const { claudeConfig, agentConfig } = await loader.loadAll();

// Initialize database client (optional - will work without DB if not configured)
let db: any = null;
let dbConnected = false;
try {
  db = createDatabaseClient();
  dbConnected = await db.healthCheck();
  if (dbConnected) {
    console.log('✓ Database connected - using DB-backed VFS');
    await registerSessionRoutes(fastify, db);
    await registerSessionFileRoutes(fastify, db);
  } else {
    console.log('⚠ Database not available - files will only be saved to filesystem');
  }
} catch (error) {
  console.log('⚠ Database not configured - files will only be saved to filesystem');
}

/**
 * GET /api/health
 */
fastify.get('/api/health', async () => {
  return {
    status: 'ok',
    workspace: WORKSPACE_DIR,
    database: dbConnected ? 'connected' : 'disconnected'
  };
});

/**
 * GET /api/proxy-cdn
 * Proxy external CDN resources with proper CORS headers for WebContainer
 * Fixes ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep
 */
fastify.get<{ Querystring: { url: string } }>('/api/proxy-cdn', async (request, reply) => {
  const { url } = request.query;

  if (!url) {
    return reply.code(400).send({ error: 'Missing url parameter' });
  }

  try {
    const targetUrl = new URL(url);

    const allowedHosts = [
      'cdn.jsdelivr.net',
      'unpkg.com',
      'cdnjs.cloudflare.com',
      'fonts.googleapis.com',
      'fonts.gstatic.com',
      'raw.githubusercontent.com',
      'i.imgur.com',
      'via.placeholder.com',
      'placehold.co',
      'ui-avatars.com',
      'api.dicebear.com',
      'avatars.githubusercontent.com',
      'source.unsplash.com',
      'cdn.simpleicons.org',
      'cdn.tailwindcss.com',
      'stackpath.bootstrapcdn.com',
      'maxcdn.bootstrapcdn.com',
      'code.jquery.com',
      'ajax.googleapis.com'
    ];

    const isAllowed = allowedHosts.some(host =>
      targetUrl.hostname === host || targetUrl.hostname.endsWith('.' + host)
    );

    if (!isAllowed) {
      return reply.code(403).send({ error: 'CDN host not allowed' });
    }

    const response = await fetch(url);

    if (!response.ok) {
      return reply.code(response.status).send({ error: `CDN returned ${response.status}` });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const buffer = await response.arrayBuffer();

    reply
      .header('Content-Type', contentType)
      .header('Cross-Origin-Resource-Policy', 'cross-origin')
      .header('Access-Control-Allow-Origin', '*')
      .header('Cache-Control', 'public, max-age=86400')
      .send(Buffer.from(buffer));

  } catch (error: any) {
    reply.code(500).send({ error: `Proxy error: ${error.message}` });
  }
});

fastify.get('/api/files', async () => {
  if (!USE_LOCAL_FS) {
    return { files: [], deprecated: true, message: 'Use /api/sessions/:id/files/tree instead' };
  }
  const files = await getFileTree(WORKSPACE_DIR);
  return { files };
});

fastify.get<{ Params: { '*': string } }>('/api/files/*', async (request, reply) => {
  if (!USE_LOCAL_FS) {
    return reply.code(410).send({ error: 'Deprecated. Use /api/sessions/:id/files/read?path=... instead' });
  }
  const filePath = request.params['*'];
  const fullPath = resolve(WORKSPACE_DIR, filePath);

  // Security: Ensure the resolved path is within WORKSPACE_DIR
  const normalizedWorkspace = resolve(WORKSPACE_DIR);
  const normalizedPath = resolve(fullPath);
  const relativePath = relative(normalizedWorkspace, normalizedPath);

  if (relativePath.startsWith('..') || resolve(normalizedWorkspace, relativePath) !== normalizedPath) {
    return reply.code(403).send({ error: 'Access denied: path traversal detected' });
  }

  try {
    const content = await readFile(fullPath, 'utf-8');

    // Get server origin for absolute CDN proxy URLs
    const protocol = request.headers['x-forwarded-proto'] || 'http';
    const host = request.headers.host || `localhost:${PORT}`;
    const serverOrigin = `${protocol}://${host}`;

    const rewrittenContent = maybeRewriteFile(filePath, content, { serverOrigin });
    return { path: filePath, content: rewrittenContent };
  } catch (error: any) {
    reply.code(404).send({ error: error.message });
  }
});

fastify.post<{
  Params: { '*': string };
  Body: { content: string };
}>('/api/files/*', async (request, reply) => {
  if (!USE_LOCAL_FS) {
    return reply.code(410).send({ error: 'Deprecated. Use /api/sessions/:id/files/write instead' });
  }
  const filePath = request.params['*'];
  const { content } = request.body;

  if (!content && content !== '') {
    return reply.code(400).send({ error: 'Content is required' });
  }

  const fullPath = resolve(WORKSPACE_DIR, filePath);

  // Security: Ensure the resolved path is within WORKSPACE_DIR
  const normalizedWorkspace = resolve(WORKSPACE_DIR);
  const normalizedPath = resolve(fullPath);
  const relativePath = relative(normalizedWorkspace, normalizedPath);

  if (relativePath.startsWith('..') || resolve(normalizedWorkspace, relativePath) !== normalizedPath) {
    return reply.code(403).send({ error: 'Access denied: path traversal detected' });
  }

  try {
    // Write to filesystem
    await writeFile(fullPath, content, 'utf-8');

    // Note: Files are saved to database only when switching workspaces
    // to ensure they're associated with the correct session's app_id

    return {
      success: true,
      path: filePath,
      message: 'File saved successfully'
    };
  } catch (error: any) {
    console.error('Error saving file:', error);
    reply.code(500).send({ error: error.message });
  }
});

/**
 * Helper: Save all workspace files to database for a session
 */
async function saveWorkspaceToDatabase(sessionAppId: string): Promise<void> {
  if (!dbConnected || !db) return;

  const filesRepo = new FilesRepository(db);
  const files = await getFileTree(WORKSPACE_DIR);

  for (const fileEntry of files) {
    const filePath = fileEntry.path;
    const fullPath = join(WORKSPACE_DIR, filePath);

    try {
      const content = await readFile(fullPath, 'utf-8');
      await filesRepo.upsertFile(sessionAppId, filePath, content);
    } catch (error) {
      console.error(`Failed to save ${filePath}:`, error);
    }
  }
}

/**
 * Helper: Load workspace files from database for a session
 */
async function loadWorkspaceFromDatabase(sessionAppId: string): Promise<void> {
  if (!dbConnected || !db) {
    console.log('No database connection - cannot load workspace');
    return;
  }

  const filesRepo = new FilesRepository(db);

  // Clear workspace directory (except .git and node_modules)
  const entries = await readdir(WORKSPACE_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;

    const fullPath = join(WORKSPACE_DIR, entry.name);
    await rm(fullPath, { recursive: true, force: true });
  }

  // Load files from database
  const files = await filesRepo.findByApp(sessionAppId);

  for (const file of files) {
    const fullPath = join(WORKSPACE_DIR, file.path);
    const dirPath = dirname(fullPath);

    // Create directory if needed
    await mkdir(dirPath, { recursive: true });

    // Get file content from latest version
    const version = await filesRepo.getHeadVersion(file.id);
    if (version && version.content_text) {
      await writeFile(fullPath, version.content_text, 'utf-8');
    }
  }
}

fastify.post<{
  Params: { id: string };
  Body: { currentSessionId?: string };
}>('/api/sessions/:id/switch-workspace', async (request, reply) => {
  if (!USE_LOCAL_FS) {
    return reply.code(410).send({ error: 'Deprecated. Session switching now happens client-side without reload' });
  }
  const { id: newSessionId } = request.params;
  const { currentSessionId } = request.body;

  if (!dbConnected || !db) {
    return reply.code(503).send({ error: 'Database not available' });
  }

  try {
    const sessionsRepo = new SessionsRepository(db);

    // Save current workspace if there's a current session
    if (currentSessionId) {
      const currentSession = await sessionsRepo.findById(currentSessionId);
      if (currentSession && currentSession.app_id) {
        await saveWorkspaceToDatabase(currentSession.app_id);
      }
    }

    // Load new workspace
    const newSession = await sessionsRepo.findById(newSessionId);
    if (!newSession) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    if (newSession.app_id) {
      await loadWorkspaceFromDatabase(newSession.app_id);
    }

    // Get updated file tree
    const files = await getFileTree(WORKSPACE_DIR);

    return {
      success: true,
      sessionId: newSessionId,
      appId: newSession.app_id,
      files
    };
  } catch (error: any) {
    console.error('Error switching workspace:', error);
    reply.code(500).send({ error: error.message });
  }
});

fastify.register(async (fastify) => {
  fastify.get<{
    Querystring: { sessionId?: string };
  }>('/api/agent', { websocket: true }, async (connection, request) => {
    const { sessionId } = request.query;

    if (!sessionId && !USE_LOCAL_FS) {
      connection.socket.send(JSON.stringify({
        type: 'error',
        message: 'sessionId query parameter is required'
      }));
      connection.socket.close();
      return;
    }

    connection.socket.on('message', async (message: Buffer) => {
      const data = JSON.parse(message.toString());

      if (data.type === 'prompt') {
        try {
          let response: string;

          // Use DatabaseAgent when in database mode
          if (!USE_LOCAL_FS && dbConnected && db && sessionId) {
            const sessionsRepo = new SessionsRepository(db);
            const fileStore = new PostgresFileStore(db);
            const session = await sessionsRepo.findById(sessionId);

            if (!session) {
              connection.socket.send(JSON.stringify({
                type: 'error',
                message: 'Session not found'
              }));
              return;
            }

            const dbAgent = new DatabaseAgent({
              db,
              sessionId,
              appId: session.app_id || undefined,
              workingDir: WORKSPACE_DIR,
              claudeConfig,
              agentConfig,
              executors: getAllExecutors(),
              dryRun: false,
              webSearch: agentConfig.tools.webSearch
            });

            // Set database context for file operations
            if (session.app_id) {
              dbAgent.setDatabaseContext(fileStore, session.app_id, sessionId);
            }

            connection.socket.send(JSON.stringify({
              type: 'status',
              message: 'Processing request...'
            }));

            response = await dbAgent.processRequest(data.prompt);
          } else {
            // Use regular Agent for local filesystem mode
            const agent = new Agent({
              workingDir: WORKSPACE_DIR,
              claudeConfig,
              agentConfig,
              executors: getAllExecutors(),
              dryRun: false,
              webSearch: agentConfig.tools.webSearch
            });

            connection.socket.send(JSON.stringify({
              type: 'status',
              message: 'Processing request...'
            }));

            response = await agent.processRequest(data.prompt);
          }

          connection.socket.send(JSON.stringify({
            type: 'response',
            content: response
          }));

          if (!USE_LOCAL_FS && dbConnected && db && sessionId) {
            const sessionsRepo = new SessionsRepository(db);
            const fileStore = new PostgresFileStore(db);

            const session = await sessionsRepo.findById(sessionId);

            if (session?.app_id) {
              const files = await fileStore.list(session.app_id);

              connection.socket.send(JSON.stringify({
                type: 'files_updated',
                files,
                sessionId
              }));
            }
          } else {
            const files = await getFileTree(WORKSPACE_DIR);
            connection.socket.send(JSON.stringify({
              type: 'files_updated',
              files
            }));
          }

        } catch (error: any) {
          connection.socket.send(JSON.stringify({
            type: 'error',
            message: error.message
          }));
        }
      }
    });

    connection.socket.on('close', () => {
      console.log('Client disconnected');
    });
  });
});

/**
 * Helper: Get file tree
 */
async function getFileTree(dir: string, basePath: string = ''): Promise<FileNode[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nodes: FileNode[] = [];

  for (const entry of entries) {
    // Skip node_modules, .git, etc.
    if (entry.name.startsWith('.') || entry.name === 'node_modules') {
      continue;
    }

    const fullPath = join(dir, entry.name);
    const relativePath = basePath ? join(basePath, entry.name) : entry.name;

    if (entry.isDirectory()) {
      const children = await getFileTree(fullPath, relativePath);
      nodes.push({
        name: entry.name,
        path: relativePath,
        type: 'directory',
        children
      });
    } else {
      const stats = await stat(fullPath);
      nodes.push({
        name: entry.name,
        path: relativePath,
        type: 'file',
        size: stats.size
      });
    }
  }

  return nodes.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'directory' ? -1 : 1;
  });
}

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileNode[];
}

// Start server
const PORT = process.env.PORT || 3001;

try {
  await fastify.listen({ port: Number(PORT), host: '0.0.0.0' });
  console.log(`\n🚀 EitherWay UI Server running on http://localhost:${PORT}`);
  console.log(`📁 Workspace: ${WORKSPACE_DIR}\n`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
