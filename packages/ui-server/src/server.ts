#!/usr/bin/env node
/**
 * Backend server for EitherWay UI
 * Provides HTTP API and WebSocket for real-time agent interaction
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import { Agent, DatabaseAgent, ConfigLoader, StreamingCallbacks } from '@eitherway/runtime';
import { getAllExecutors } from '@eitherway/tools-impl';
import { createDatabaseClient, FilesRepository, SessionsRepository, PostgresFileStore } from '@eitherway/database';
import { readdir, readFile, stat, writeFile, rm, mkdir, access } from 'fs/promises';
import { join, dirname, resolve, relative } from 'path';
import { fileURLToPath } from 'url';
import { maybeRewriteFile } from './cdn-rewriter.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerSessionFileRoutes } from './routes/session-files.js';
import { registerPlanRoutes } from './routes/plans.js';
import { registerBrandKitRoutes } from './routes/brand-kits.js';
import { registerPreviewRoutes } from './routes/preview.js';
import { registerDeploymentRoutes } from './routes/deployments.js';
import { registerNetlifyRoutes } from './routes/netlify.js';
import { registerImageRoutes } from './routes/images.js';
import { registerSecurityMiddleware } from './middleware/index.js';
import { constants } from 'fs';
import { randomUUID } from 'crypto';
import { StreamEvents, createEventSender } from './events/index.js';

// Resolve project root (go up from packages/ui-server/src to project root)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../../..');

const CERTS_DIR = join(PROJECT_ROOT, '.certs');
const CERT_PATH = join(CERTS_DIR, 'localhost-cert.pem');
const KEY_PATH = join(CERTS_DIR, 'localhost-key.pem');

let useHttps = false;
let httpsOptions = {};

try {
  await access(CERT_PATH, constants.R_OK);
  await access(KEY_PATH, constants.R_OK);

  const [cert, key] = await Promise.all([
    readFile(CERT_PATH, 'utf-8'),
    readFile(KEY_PATH, 'utf-8')
  ]);

  httpsOptions = { https: { cert, key } };
  useHttps = true;
  console.log('Success: HTTPS certificates found - server will use HTTPS');
} catch (error) {
  console.log('WARNING: No HTTPS certificates found - server will use HTTP');
  console.log('  Run: npm run setup:https to enable HTTPS for WebContainer preview compatibility');
}

const fastify = Fastify({
  logger: true,
  ...httpsOptions
});

// Enable CORS
await fastify.register(cors as any, {
  origin: true
});

// Enable WebSocket
await fastify.register(websocket as any);

// Enable Multipart (for file uploads)
await fastify.register(multipart as any, {
  limits: {
    fileSize: 200 * 1024 * 1024 // 200MB max (for ZIP brand packages)
  }
});

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || join(PROJECT_ROOT, 'workspace');
const USE_LOCAL_FS = process.env.USE_LOCAL_FS === 'true';

const loader = new ConfigLoader(join(PROJECT_ROOT, 'configs'));
const { claudeConfig, agentConfig } = await loader.loadAll();

let db: any = null;
let dbConnected = false;
try {
  db = createDatabaseClient();
  dbConnected = await db.healthCheck();
  if (dbConnected) {
    console.log('Success: Database connected - using DB-backed VFS');

    // Register security middleware (IP blocking, rate limiting, request validation, security headers)
    await registerSecurityMiddleware(fastify, {
      db,
      enableRequestValidation: true,
      enableRateLimiting: false, // Disabled for local development
      enableSecurityHeaders: true,
      enableIpRiskBlocking: process.env.NODE_ENV === 'production',
      isDevelopment: process.env.NODE_ENV === 'development'
    });

    // Register API routes
    await registerSessionRoutes(fastify, db);
    await registerSessionFileRoutes(fastify, db);
    await registerPlanRoutes(fastify, db);
    await registerBrandKitRoutes(fastify, db);
    await registerPreviewRoutes(fastify, db);
    await registerDeploymentRoutes(fastify, db, WORKSPACE_DIR);
    await registerNetlifyRoutes(fastify, db, WORKSPACE_DIR);
    await registerImageRoutes(fastify, db);
  } else {
    console.log('WARNING: Database not available - files will only be saved to filesystem');
  }
} catch (error) {
  console.log('WARNING: Database not configured - files will only be saved to filesystem');
}

fastify.get('/api/health', async () => {
  return {
    status: 'ok',
    workspace: WORKSPACE_DIR,
    database: dbConnected ? 'connected' : 'disconnected'
  };
});

function isSecureUrl(url: URL): { valid: boolean; error?: string } {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { valid: false, error: 'Only HTTP/HTTPS protocols allowed' };
  }

  const hostname = url.hostname.toLowerCase();

  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
    return { valid: false, error: 'Local addresses not allowed' };
  }

  if (hostname.match(/^10\.|^172\.(1[6-9]|2[0-9]|3[01])\.|^192\.168\./)) {
    return { valid: false, error: 'Private IP ranges not allowed' };
  }

  if (hostname.match(/^169\.254\.|^fc00:|^fe80:/)) {
    return { valid: false, error: 'Link-local addresses not allowed' };
  }

  return { valid: true };
}

fastify.get<{ Querystring: { url: string } }>('/api/proxy-cdn', async (request, reply) => {
  const { url } = request.query;

  if (!url) {
    return reply.code(400).send({ error: 'Missing url parameter' });
  }

  try {
    const targetUrl = new URL(url);
    const securityCheck = isSecureUrl(targetUrl);

    if (!securityCheck.valid) {
      return reply.code(403).send({ error: securityCheck.error });
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': targetUrl.origin + '/',
        'Origin': targetUrl.origin
      }
    });

    if (!response.ok) {
      return reply.code(response.status).send({ error: `Upstream returned ${response.status}` });
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

const COINGECKO_DEMO_KEY = process.env.COINGECKO_DEMO_API_KEY || '';
const COINGECKO_PRO_KEY = process.env.COINGECKO_PRO_API_KEY || '';

const apiCache = new Map<string, { t: number; body: Buffer; headers: Record<string, string>; status: number }>();
const API_CACHE_TTL = 30_000;

fastify.get<{ Querystring: { url: string } }>('/api/proxy-api', async (request, reply) => {
  const { url } = request.query;

  if (!url) {
    return reply.code(400).send({ error: 'Missing url parameter' });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(url);
  } catch {
    return reply.code(400).send({ error: 'Invalid url' });
  }

  const securityCheck = isSecureUrl(targetUrl);
  if (!securityCheck.valid) {
    return reply.code(403).send({ error: securityCheck.error });
  }

  const cacheKey = `GET:${targetUrl.toString()}`;
  const hit = apiCache.get(cacheKey);
  if (hit && (Date.now() - hit.t) < API_CACHE_TTL) {
    return reply
      .headers({
        ...hit.headers,
        'Access-Control-Allow-Origin': '*',
        'Vary': 'Origin',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'X-Cache': 'HIT'
      })
      .code(hit.status)
      .send(hit.body);
  }

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'User-Agent': 'EitherWay-Proxy/1.0'
  };

  if (targetUrl.hostname === 'api.coingecko.com' && COINGECKO_DEMO_KEY) {
    headers['x-cg-demo-api-key'] = COINGECKO_DEMO_KEY;
  }
  if (targetUrl.hostname === 'pro-api.coingecko.com' && COINGECKO_PRO_KEY) {
    headers['x-cg-pro-api-key'] = COINGECKO_PRO_KEY;
  }

  try {
    const upstream = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers,
      credentials: 'omit'
    });

    const body = Buffer.from(await upstream.arrayBuffer());
    const passthrough = Object.fromEntries(upstream.headers);
    const status = upstream.status;

    if (status >= 200 && status < 400) {
      apiCache.set(cacheKey, { t: Date.now(), body, headers: passthrough, status });
    }

    return reply
      .headers({
        ...passthrough,
        'Access-Control-Allow-Origin': '*',
        'Vary': 'Origin',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Cache-Control': passthrough['cache-control'] || 'public, max-age=30',
      })
      .code(status)
      .send(body);
  } catch (error: any) {
    reply.code(500).send({ error: `API proxy error: ${error.message}` });
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

  const files = await filesRepo.findByApp(sessionAppId);

  for (const file of files) {
    const fullPath = join(WORKSPACE_DIR, file.path);
    const dirPath = dirname(fullPath);

    await mkdir(dirPath, { recursive: true });

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

    if (currentSessionId) {
      const currentSession = await sessionsRepo.findById(currentSessionId);
      if (currentSession && currentSession.app_id) {
        await saveWorkspaceToDatabase(currentSession.app_id);
      }
    }

    const newSession = await sessionsRepo.findById(newSessionId);
    if (!newSession) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    if (newSession.app_id) {
      await loadWorkspaceFromDatabase(newSession.app_id);
    }

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
  }>('/api/agent', { websocket: true } as any, async (connection: any, request: any) => {
    const { sessionId } = request.query;

    const sender = createEventSender(connection.socket);

    if (!sessionId && !USE_LOCAL_FS) {
      sender.send(StreamEvents.error('sessionId query parameter is required'));
      connection.socket.close();
      return;
    }

    connection.socket.on('message', async (message: Buffer) => {
      const data = JSON.parse(message.toString());

      if (data.type === 'prompt') {
        try {
          let response: string;
          let messageId: string = randomUUID(); // Generate message ID for streaming

          // Use DatabaseAgent when in database mode
          if (!USE_LOCAL_FS && dbConnected && db && sessionId) {
            const sessionsRepo = new SessionsRepository(db);
            const fileStore = new PostgresFileStore(db);
            const session = await sessionsRepo.findById(sessionId);

            if (!session) {
              sender.send(StreamEvents.error('Session not found'));
              return;
            }

            // Rate limiting disabled for local testing
            //   const rateLimitCheck = await rateLimiter.checkMessageSending(sessionId);
            //   if (!rateLimitCheck.allowed) {
            //     sendEvent(connection.socket, {
            //       type: 'error',
            //       message: `Rate limit exceeded: You have reached your daily limit of ${rateLimitCheck.limit} messages per chat. Please try again after ${rateLimitCheck.resetsAt.toISOString()}.`
            //     });
            //     return;
            //   }
            // }

            // CRITICAL FIX: Auto-create app_id if it doesn't exist
            let appId = session.app_id;
            if (!appId) {
              console.log('[WebSocket Agent] WARNING: Session has no app_id, creating one...');

              try {
                // Import AppsRepository
                const { AppsRepository } = await import('@eitherway/database');
                const appsRepo = new AppsRepository(db);

                const appTitle = session.title || 'Generated App';
                const app = await appsRepo.create(session.user_id, appTitle, 'private');
                appId = app.id;

                await sessionsRepo.update(sessionId, { app_id: appId } as any);

                console.log('[WebSocket Agent] Success: Created app:', appId, 'for session:', sessionId);
              } catch (error: any) {
                console.error('[WebSocket Agent] Error: Failed to create app:', error);
                sender.send(StreamEvents.error(`Failed to create application workspace: ${error.message}`));
                return;
              }
            } else {
              console.log('[WebSocket Agent] Using existing app_id:', appId);
            }

            const dbAgent = new DatabaseAgent({
              db,
              sessionId,
              appId: appId,
              workingDir: WORKSPACE_DIR,
              claudeConfig,
              agentConfig,
              executors: getAllExecutors(),
              dryRun: false,
              webSearch: agentConfig.tools.webSearch
            });

            dbAgent.setDatabaseContext(fileStore, appId, sessionId);

            // Use the messageId declared above
            let accumulatedText = '';
            let tokenUsage: { inputTokens: number; outputTokens: number } | undefined;

            sender.send(StreamEvents.streamStart(messageId));

            const streamingCallbacks: StreamingCallbacks = {
              onDelta: (delta) => {
                if (delta.type === 'text') {
                  accumulatedText += delta.content;
                  sender.send(StreamEvents.delta(messageId, delta.content));
                }
              },
              onReasoning: (delta) => {
                // Stream reasoning text smoothly
                sender.send(StreamEvents.reasoning(messageId, delta.text));
              },
              onPhase: (phase) => {
                sender.send(StreamEvents.phase(messageId, phase));
              },
              onThinkingComplete: (duration) => {
                sender.send(StreamEvents.thinkingComplete(messageId, duration));
              },
              onFileOperation: (operation, filePath) => {
                sender.send(StreamEvents.fileOperation(messageId, operation, filePath));
              },
              onToolStart: (tool) => {
                sender.send(StreamEvents.toolStart(tool.name, tool.toolUseId, messageId, tool.filePath));
              },
              onToolEnd: (tool) => {
                sender.send(StreamEvents.toolEnd(tool.name, tool.toolUseId, messageId, tool.filePath));
              },
              onComplete: (usage) => {
                tokenUsage = usage;
              }
            };

            let enhancedPrompt = data.prompt;
            console.log('[Brand Kit] Checking for brand-kit.json in app:', appId);
            try {
              const brandKitFile = await fileStore.read(appId, 'brand-kit.json');
              if (brandKitFile && brandKitFile.content) {
                const contentStr = typeof brandKitFile.content === 'string'
                  ? brandKitFile.content
                  : (brandKitFile.content as any).toString('utf-8');

                const brandKit = JSON.parse(contentStr);
                console.log('[Brand Kit] Parsed brand kit:', JSON.stringify(brandKit).substring(0, 200));

                if (brandKit.brandKit) {
                  const { colors, assets } = brandKit.brandKit;

                  let brandContext = '\n\nBRAND KIT AVAILABLE:\n';

                  if (colors && colors.length > 0) {
                    brandContext += '\nColor Palette:\n';
                    colors.forEach((color: any) => {
                      brandContext += `- ${color.hex}`;
                      if (color.name) brandContext += ` (${color.name})`;
                      if (color.role) brandContext += ` - ${color.role}`;
                      if (color.prominence) brandContext += ` [${Math.round(color.prominence * 100)}% prominence]`;
                      brandContext += '\n';
                    });
                  }

                  if (assets && assets.length > 0) {
                    brandContext += '\nBrand Assets:\n';
                    assets.forEach((asset: any) => {
                      if (asset.path) {
                        brandContext += `- ${asset.fileName} (${asset.type}) at ${asset.path}\n`;
                      }
                    });
                  }

                  brandContext += '\nIMPORTANT: Use these brand colors and assets in your design. The color palette should be your primary color scheme, and brand assets should be integrated where appropriate.\n';

                  // Prepend brand context to the user's prompt
                  enhancedPrompt = brandContext + data.prompt;
                  console.log('[Brand Kit] Success: Injected brand kit context into prompt!');
                  console.log('[Brand Kit] Enhanced prompt preview:', enhancedPrompt.substring(0, 300));
                }
              } else {
                console.log('[Brand Kit] No brand-kit.json found in workspace');
              }
            } catch (error) {
              // Brand kit not found or error reading it - continue without it
              console.log('[Brand Kit] Error reading brand kit:', error instanceof Error ? error.message : 'Unknown error');
              console.error('[Brand Kit] Full error:', error);
            }

            response = await dbAgent.processRequest(enhancedPrompt, streamingCallbacks);

            sender.send(StreamEvents.streamEnd(messageId, tokenUsage));
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

            // Use the messageId declared above
            let accumulatedText = '';
            let tokenUsage: { inputTokens: number; outputTokens: number } | undefined;

            sender.send(StreamEvents.streamStart(messageId));

            const streamingCallbacks: StreamingCallbacks = {
              onDelta: (delta) => {
                if (delta.type === 'text') {
                  accumulatedText += delta.content;
                  sender.send(StreamEvents.delta(messageId, delta.content));
                }
              },
              onReasoning: (delta) => {
                // Stream reasoning text smoothly
                sender.send(StreamEvents.reasoning(messageId, delta.text));
              },
              onPhase: (phase) => {
                sender.send(StreamEvents.phase(messageId, phase));
              },
              onThinkingComplete: (duration) => {
                sender.send(StreamEvents.thinkingComplete(messageId, duration));
              },
              onFileOperation: (operation, filePath) => {
                sender.send(StreamEvents.fileOperation(messageId, operation, filePath));
              },
              onToolStart: (tool) => {
                sender.send(StreamEvents.toolStart(tool.name, tool.toolUseId, messageId, tool.filePath));
              },
              onToolEnd: (tool) => {
                sender.send(StreamEvents.toolEnd(tool.name, tool.toolUseId, messageId, tool.filePath));
              },
              onComplete: (usage) => {
                tokenUsage = usage;
              }
            };

            response = await agent.processRequest(data.prompt, streamingCallbacks);

            sender.send(StreamEvents.streamEnd(messageId, tokenUsage));
          }

          sender.send(StreamEvents.response(response, messageId));

          // Rate limiting disabled for local testing
          // if (rateLimiter && sessionId) {
          //   await rateLimiter.incrementMessageCount(sessionId);
          // }

          if (!USE_LOCAL_FS && dbConnected && db && sessionId) {
            const sessionsRepo = new SessionsRepository(db);
            const fileStore = new PostgresFileStore(db);

            const session = await sessionsRepo.findById(sessionId);

            if (session?.app_id) {
              const files = await fileStore.list(session.app_id);

              sender.send(StreamEvents.filesUpdated(files, sessionId));
            }
          } else {
            const files = await getFileTree(WORKSPACE_DIR);
            sender.send(StreamEvents.filesUpdated(files));
          }

        } catch (error: any) {
          console.error('[Agent Error]', error);

          let errorMessage = error.message || 'Unknown error occurred';

          if (error.message && error.message.includes('"type":"api_error"')) {
            try {
              // Try to parse the JSON error
              const jsonMatch = error.message.match(/\{.*\}/);
              if (jsonMatch) {
                const errorObj = JSON.parse(jsonMatch[0]);
                if (errorObj.error?.message) {
                  errorMessage = `Anthropic API Error: ${errorObj.error.message}`;
                  if (errorObj.request_id) {
                    errorMessage += ` (Request ID: ${errorObj.request_id})`;
                  }
                }
              }
            } catch (parseError) {
              // If parsing fails, use the original message
              console.error('[Error Parsing]', parseError);
            }
          }

          sender.send(StreamEvents.error(errorMessage));
        }
      }
    });

    connection.socket.on('close', () => {
      console.log('[WebSocket] Client disconnected');
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
  const protocol = useHttps ? 'https' : 'http';
  console.log(`\nEitherWay UI Server running on ${protocol}://localhost:${PORT}`);
  console.log(`Workspace: ${WORKSPACE_DIR}`);
  if (useHttps) {
    console.log(`HTTPS enabled - WebContainer previews will work without mixed content issues\n`);
  } else {
    console.log(`WARNING: Using HTTP - WebContainer previews may have mixed content issues`);
    console.log(`   Run: npm run setup:https to enable HTTPS\n`);
  }
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
