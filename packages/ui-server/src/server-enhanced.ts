#!/usr/bin/env node
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { Agent, ConfigLoader } from '@eitherway/runtime';
import { getAllExecutors } from '@eitherway/tools-impl';
import { createDatabaseClient, FilesRepository } from '@eitherway/database';
import { readdir, readFile, stat, writeFile } from 'fs/promises';
import { join, dirname, resolve, relative } from 'path';
import { fileURLToPath } from 'url';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerAppRoutes } from './routes/apps.js';
import { registerImageRoutes } from './routes/images.js';

const fastify = Fastify({ logger: true });

await fastify.register(cors as any, { origin: true });
await fastify.register(websocket as any);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../../..');
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || join(PROJECT_ROOT, 'workspace');

const loader = new ConfigLoader(join(PROJECT_ROOT, 'configs'));
const { claudeConfig, agentConfig } = await loader.loadAll();

const db = createDatabaseClient();

console.log('Checking database connection...');
const healthy = await db.healthCheck();
if (!healthy) {
  console.error('Failed to connect to database');
  process.exit(1);
}
console.log('✓ Database connected\n');

await registerSessionRoutes(fastify, db);
await registerAppRoutes(fastify, db);
await registerImageRoutes(fastify, db);

fastify.get('/api/health', async () => {
  const dbHealthy = await db.healthCheck();
  return {
    status: 'ok',
    workspace: WORKSPACE_DIR,
    database: dbHealthy ? 'connected' : 'disconnected'
  };
});

fastify.get('/api/files', async () => {
  const files = await getFileTree(WORKSPACE_DIR);
  return { files };
});

fastify.get<{ Params: { '*': string } }>('/api/files/*', async (request, reply) => {
  const filePath = request.params['*'];
  const fullPath = resolve(WORKSPACE_DIR, filePath);

  const normalizedWorkspace = resolve(WORKSPACE_DIR);
  const normalizedPath = resolve(fullPath);
  const relativePath = relative(normalizedWorkspace, normalizedPath);

  if (relativePath.startsWith('..') || resolve(normalizedWorkspace, relativePath) !== normalizedPath) {
    return reply.code(403).send({ error: 'Access denied: path traversal detected' });
  }

  try {
    const content = await readFile(fullPath, 'utf-8');
    return { path: filePath, content };
  } catch (error: any) {
    reply.code(404).send({ error: error.message });
  }
});

/**
 * POST /api/files/:path
 * Save a file to both filesystem and database
 */
fastify.post<{
  Params: { '*': string };
  Body: { content: string };
}>('/api/files/*', async (request, reply) => {
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

    // Save to database
    const filesRepo = new FilesRepository(db);
    const appId = process.env.APP_ID || 'default-app';
    await filesRepo.upsertFile(appId, filePath, content);

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

fastify.register(async (fastify) => {
  fastify.get('/api/agent', { websocket: true } as any, (connection: any) => {
    connection.socket.on('message', async (message: Buffer) => {
      const data = JSON.parse(message.toString());

      if (data.type === 'prompt') {
        try {
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

          const response = await agent.processRequest(data.prompt);

          connection.socket.send(JSON.stringify({
            type: 'response',
            content: response
          }));

          const files = await getFileTree(WORKSPACE_DIR);
          connection.socket.send(JSON.stringify({
            type: 'files_updated',
            files
          }));

          await agent.saveTranscript();

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

          connection.socket.send(JSON.stringify({
            type: 'error',
            message: errorMessage
          }));
        }
      }
    });

    connection.socket.on('close', () => {
      console.log('Client disconnected');
    });
  });
});

async function getFileTree(dir: string, basePath: string = ''): Promise<FileNode[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nodes: FileNode[] = [];

  for (const entry of entries) {
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

const PORT = process.env.PORT || 3001;

try {
  await fastify.listen({ port: Number(PORT), host: '0.0.0.0' });
  console.log(`\n🚀 EitherWay UI Server running on http://localhost:${PORT}`);
  console.log(`📁 Workspace: ${WORKSPACE_DIR}`);
  console.log(`💾 Database: Connected\n`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

process.on('SIGTERM', async () => {
  await db.close();
  await fastify.close();
});
