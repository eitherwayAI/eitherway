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
import { registerImageRoutes } from './routes/images.js';
import { registerNetlifyRoutes } from './routes/netlify.js';
import { registerDeploymentRoutes } from './routes/deployments.js';
import { registerAppRoutes } from './routes/apps.js';
import { registerBrandKitRoutes } from './routes/brand-kits.js';
import { constants } from 'fs';
import { randomUUID } from 'crypto';
import { StreamEvents, createEventSender } from './events/index.js';
import { API_CACHE_TTL_MS, CDN_CACHE_MAX_AGE_SECONDS, DEFAULT_SERVER_PORT } from './constants.js';
import { isSecureUrl } from './security/ssrf-guard.js';

// Resolve project root (go up from packages/ui-server/src to project root)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../../..');

// Check for HTTPS certificates
const CERTS_DIR = join(PROJECT_ROOT, '.certs');
const CERT_PATH = join(CERTS_DIR, 'localhost-cert.pem');
const KEY_PATH = join(CERTS_DIR, 'localhost-key.pem');

let useHttps = false;
let httpsOptions = {};

try {
  await access(CERT_PATH, constants.R_OK);
  await access(KEY_PATH, constants.R_OK);

  const [cert, key] = await Promise.all([readFile(CERT_PATH, 'utf-8'), readFile(KEY_PATH, 'utf-8')]);

  httpsOptions = { https: { cert, key } };
  useHttps = true;
  console.log('✓ HTTPS certificates found - server will use HTTPS');
} catch (error) {
  console.log('⚠ No HTTPS certificates found - server will use HTTP');
  console.log('  Run: npm run setup:https to enable HTTPS for WebContainer preview compatibility');
}

const fastify = Fastify({
  logger: true,
  bodyLimit: 250 * 1024 * 1024, // 250MB to accommodate brand packages (200MB) + overhead
  ...httpsOptions,
});

// Enable CORS
// @ts-expect-error Fastify plugin type compatibility issue with current version
await fastify.register(cors, {
  origin: true,
});

// Enable WebSocket
// @ts-expect-error Fastify plugin type compatibility issue with current version
await fastify.register(websocket);

// Enable multipart for file uploads
// @ts-expect-error Fastify plugin type compatibility issue with current version
await fastify.register(multipart, {
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB max file size
  },
});

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
    await registerImageRoutes(fastify, db);
    await registerAppRoutes(fastify, db);
    await registerNetlifyRoutes(fastify, db, WORKSPACE_DIR);
    await registerDeploymentRoutes(fastify, db, WORKSPACE_DIR);
    await registerBrandKitRoutes(fastify, db);
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
    database: dbConnected ? 'connected' : 'disconnected',
  };
});

/**
 * GET /api/proxy-cdn
 * Universal proxy for external CDN resources with CORS/COEP headers
 */
fastify.get<{ Querystring: { url: string } }>('/api/proxy-cdn', async (request, reply) => {
  const { url } = request.query;

  if (!url) {
    return reply.code(400).header('Content-Type', 'application/json').send({ error: 'Missing url parameter' });
  }

  try {
    const targetUrl = new URL(url);
    const securityCheck = isSecureUrl(targetUrl);

    if (!securityCheck.valid) {
      return reply.code(403).header('Content-Type', 'application/json').send({
        error: securityCheck.errorMessage,
        code: securityCheck.errorCode,
      });
    }

    console.log('[Proxy CDN] Fetching:', url);
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: targetUrl.origin + '/',
        Origin: targetUrl.origin,
      },
    });

    if (!response.ok) {
      console.error('[Proxy CDN] Upstream error:', url, response.status);
      return reply
        .code(response.status)
        .header('Content-Type', 'application/json')
        .send({ error: `Upstream returned ${response.status}` });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const buffer = await response.arrayBuffer();

    console.log('[Proxy CDN] Success:', url, 'Type:', contentType, 'Size:', buffer.byteLength);

    return reply
      .header('Content-Type', contentType)
      .header('Cross-Origin-Resource-Policy', 'cross-origin')
      .header('Access-Control-Allow-Origin', '*')
      .header('Cache-Control', `public, max-age=${CDN_CACHE_MAX_AGE_SECONDS}`)
      .send(Buffer.from(buffer));
  } catch (error: any) {
    console.error('[Proxy CDN] Error:', url, error.message);
    return reply
      .code(500)
      .header('Content-Type', 'application/json')
      .send({ error: `Proxy error: ${error.message}` });
  }
});

const COINGECKO_DEMO_KEY = process.env.COINGECKO_DEMO_API_KEY || '';
const COINGECKO_PRO_KEY = process.env.COINGECKO_PRO_API_KEY || '';

const apiCache = new Map<string, { t: number; body: Buffer; headers: Record<string, string>; status: number }>();

/**
 * GET /api/proxy-api
 * Universal proxy for external APIs with auth injection and caching
 */
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
    return reply.code(403).send({
      error: securityCheck.errorMessage,
      code: securityCheck.errorCode,
    });
  }

  const cacheKey = `GET:${targetUrl.toString()}`;
  const hit = apiCache.get(cacheKey);
  if (hit && Date.now() - hit.t < API_CACHE_TTL_MS) {
    return reply
      .headers({
        ...hit.headers,
        'Access-Control-Allow-Origin': '*',
        Vary: 'Origin',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'X-Cache': 'HIT',
      })
      .code(hit.status)
      .send(hit.body);
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'EitherWay-Proxy/1.0',
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
      credentials: 'omit',
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
        Vary: 'Origin',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Cache-Control': passthrough['cache-control'] || 'public, max-age=30',
      })
      .code(status)
      .send(body);
  } catch (error: any) {
    return reply.code(500).send({ error: `API proxy error: ${error.message}` });
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
    return reply.code(404).send({ error: error.message });
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
      message: 'File saved successfully',
    };
  } catch (error: any) {
    console.error('Error saving file:', error);
    return reply.code(500).send({ error: error.message });
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
      files,
    };
  } catch (error: any) {
    console.error('Error switching workspace:', error);
    return reply.code(500).send({ error: error.message });
  }
});

await fastify.register(async (fastify) => {
  fastify.get<{
    Querystring: { sessionId?: string };
    // @ts-expect-error Fastify WebSocket type compatibility issue
  }>('/api/agent', { websocket: true }, async (connection, request) => {
    // @ts-expect-error Fastify WebSocket request type issue
    const { sessionId } = request.query;

    // Create event sender for this connection
    // @ts-expect-error Fastify WebSocket socket type issue
    const sender = createEventSender(connection.socket);

    if (!sessionId && !USE_LOCAL_FS) {
      sender.send(StreamEvents.error('sessionId query parameter is required'));
      // @ts-expect-error Fastify WebSocket socket type issue
      connection.socket.close();
      return;
    }

    connection.socket.on('message', async (message: Buffer) => {
      const data = JSON.parse(message.toString());

      if (data.type === 'prompt') {
        try {
          let response: string;
          const messageId: string = randomUUID(); // Generate message ID for streaming

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
            // if (rateLimiter) {
            //   const rateLimitCheck = await rateLimiter.checkMessageSending(sessionId);
            //   if (!rateLimitCheck.allowed) {
            //     sendEvent(connection.socket, {
            //       type: 'error',
            //       message: `Rate limit exceeded: You have reached your daily limit of ${rateLimitCheck.limit} messages per chat. Please try again after ${rateLimitCheck.resetsAt.toISOString()}.`
            //     });
            //     return;
            //   }
            // }

            const dbAgent = new DatabaseAgent({
              db,
              sessionId,
              appId: session.app_id || undefined,
              workingDir: WORKSPACE_DIR,
              claudeConfig,
              agentConfig,
              executors: getAllExecutors(),
              dryRun: false,
              webSearch: agentConfig.tools.webSearch,
            });

            // Set database context for file operations
            if (session.app_id) {
              dbAgent.setDatabaseContext(fileStore, session.app_id, sessionId);
            }

            // Use the messageId declared above
            let accumulatedText = '';
            let tokenUsage: { inputTokens: number; outputTokens: number } | undefined;

            // Send stream_start event
            sender.send(StreamEvents.streamStart(messageId));

            // Create streaming callbacks
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
                // Emit thinking complete with duration
                sender.send(StreamEvents.thinkingComplete(messageId, duration));
              },
              onFileOperation: (operation, filePath) => {
                // Emit deduplicated file operations
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
              },
            };

            // Enrich prompt with brand kit context if available
            const enrichedPrompt = await enrichPromptWithBrandKit(data.prompt, session, fileStore);

            // Process request with streaming
            response = await dbAgent.processRequest(enrichedPrompt, streamingCallbacks);

            // Send stream_end event with token usage
            sender.send(StreamEvents.streamEnd(messageId, tokenUsage));
          } else {
            // Use regular Agent for local filesystem mode
            const agent = new Agent({
              workingDir: WORKSPACE_DIR,
              claudeConfig,
              agentConfig,
              executors: getAllExecutors(),
              dryRun: false,
              webSearch: agentConfig.tools.webSearch,
            });

            // Use the messageId declared above
            let accumulatedText = '';
            let tokenUsage: { inputTokens: number; outputTokens: number } | undefined;

            // Send stream_start event
            sender.send(StreamEvents.streamStart(messageId));

            // Create streaming callbacks
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
                // Emit thinking complete with duration
                sender.send(StreamEvents.thinkingComplete(messageId, duration));
              },
              onFileOperation: (operation, filePath) => {
                // Emit deduplicated file operations
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
              },
            };

            response = await agent.processRequest(data.prompt, streamingCallbacks);

            // Send stream_end event with token usage
            sender.send(StreamEvents.streamEnd(messageId, tokenUsage));
          }

          // Send final response for backward compatibility
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
          // Log the full error for debugging
          console.error('[Agent Error]', error);

          // Parse error message for better display
          let errorMessage = error.message || 'Unknown error occurred';

          // Check if it's an Anthropic API error
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
      console.log('Client disconnected');
    });
  });
});

/**
 * Helper: Build brand kit context for prompt injection
 * Returns enriched prompt with brand kit assets and colors if available
 * Reads brand-kit.json manifest from workspace (written by frontend after sync)
 */
async function enrichPromptWithBrandKit(
  originalPrompt: string,
  session: any,
  fileStore: PostgresFileStore
): Promise<string> {
  try {
    if (!session?.app_id) {
      return originalPrompt;
    }

    // Read brand-kit.json manifest from workspace
    console.log('[Brand Kit] Checking for brand-kit.json in workspace...');
    console.log('[Brand Kit] Session app_id:', session.app_id);

    let manifestContent: any;
    try {
      const manifestFile = await fileStore.read(session.app_id, 'brand-kit.json');
      console.log('[Brand Kit] Manifest file retrieved, content type:', typeof manifestFile.content);

      const contentString = manifestFile.content.toString();
      console.log('[Brand Kit] Manifest content (first 500 chars):', contentString.substring(0, 500));

      manifestContent = JSON.parse(contentString);
      console.log('[Brand Kit] Manifest parsed successfully');
      console.log('[Brand Kit] Manifest structure:', JSON.stringify(manifestContent, null, 2).substring(0, 1000));
    } catch (error: any) {
      console.log('[Brand Kit] Failed to read brand-kit.json:', error.message);
      console.log('[Brand Kit] Error stack:', error.stack);
      return originalPrompt;
    }

    const { colors, assets } = manifestContent.brandKit || {};
    console.log('[Brand Kit] Extracted from manifest - colors:', colors?.length || 0, 'assets:', assets?.length || 0);

    if ((!colors || colors.length === 0) && (!assets || assets.length === 0)) {
      console.log('[Brand Kit] Brand kit manifest is empty - skipping enrichment');
      return originalPrompt;
    }

    // Build brand context string (matching beta-deployment format)
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
          // Convert file path to web-accessible path
          const webPath = asset.path.replace(/^public\//, '/');
          brandContext += `- ${asset.fileName} (${asset.type}) at ${webPath}\n`;
        }
      });
    }

    brandContext += '\nIMPORTANT: Use these brand colors and assets in your design. The color palette should be your primary color scheme, and brand assets should be integrated where appropriate.\n';

    const enrichedPrompt = brandContext + originalPrompt;

    console.log('[Brand Kit] ✅ SUCCESS: Injected brand kit context into prompt!');
    console.log('[Brand Kit] Colors:', colors?.length || 0, '| Assets:', assets?.length || 0);
    console.log('[Brand Kit] Brand context preview:', brandContext.substring(0, 300));
    console.log('[Brand Kit] Original prompt (first 100 chars):', originalPrompt.substring(0, 100));
    console.log('[Brand Kit] Enriched prompt total length:', enrichedPrompt.length);
    console.log('[Brand Kit] Full enriched prompt (first 500 chars):', enrichedPrompt.substring(0, 500));

    // Prepend brand context to the user's prompt
    return enrichedPrompt;

  } catch (error: any) {
    console.error('[Brand Kit] Failed to enrich prompt:', error.message);
    console.error('[Brand Kit] Full error:', error);
    return originalPrompt; // Fall back to original on error
  }
}

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
        children,
      });
    } else {
      const stats = await stat(fullPath);
      nodes.push({
        name: entry.name,
        path: relativePath,
        type: 'file',
        size: stats.size,
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
const PORT = process.env.PORT || DEFAULT_SERVER_PORT;

try {
  await fastify.listen({ port: Number(PORT), host: '0.0.0.0' });
  const protocol = useHttps ? 'https' : 'http';
  console.log(`\n🚀 EitherWay UI Server running on ${protocol}://localhost:${PORT}`);
  console.log(`📁 Workspace: ${WORKSPACE_DIR}`);
  if (useHttps) {
    console.log(`🔐 HTTPS enabled - WebContainer previews will work without mixed content issues\n`);
  } else {
    console.log(`⚠️  Using HTTP - WebContainer previews may have mixed content issues`);
    console.log(`   Run: npm run setup:https to enable HTTPS\n`);
  }
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
