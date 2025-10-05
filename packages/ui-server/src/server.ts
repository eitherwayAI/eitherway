#!/usr/bin/env node
/**
 * Backend server for EitherWay UI
 * Provides HTTP API and WebSocket for real-time agent interaction
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { Agent, ConfigLoader } from '@eitherway/runtime';
import { getAllExecutors } from '@eitherway/tools-impl';
import { readdir, readFile, stat } from 'fs/promises';
import { join, dirname, resolve, relative } from 'path';
import { fileURLToPath } from 'url';

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

// Working directory for agent
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || join(PROJECT_ROOT, 'workspace');

// Load configuration from project root
const loader = new ConfigLoader(join(PROJECT_ROOT, 'configs'));
const { claudeConfig, agentConfig } = await loader.loadAll();

/**
 * GET /api/health
 */
fastify.get('/api/health', async () => {
  return { status: 'ok', workspace: WORKSPACE_DIR };
});

/**
 * GET /api/files
 * List all files in workspace
 */
fastify.get('/api/files', async () => {
  const files = await getFileTree(WORKSPACE_DIR);
  return { files };
});

/**
 * GET /api/files/:path
 * Read a specific file
 */
fastify.get<{ Params: { '*': string } }>('/api/files/*', async (request, reply) => {
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
    return { path: filePath, content };
  } catch (error: any) {
    reply.code(404).send({ error: error.message });
  }
});

/**
 * WebSocket /api/agent
 * Real-time agent interaction
 */
fastify.register(async (fastify) => {
  fastify.get('/api/agent', { websocket: true }, (connection) => {
    connection.socket.on('message', async (message: Buffer) => {
      const data = JSON.parse(message.toString());

      if (data.type === 'prompt') {
        try {
          // Create agent instance
          const agent = new Agent({
            workingDir: WORKSPACE_DIR,
            claudeConfig,
            agentConfig,
            executors: getAllExecutors(),
            dryRun: false
          });

          // Send status update
          connection.socket.send(JSON.stringify({
            type: 'status',
            message: 'Processing request...'
          }));

          // Stream agent response
          let fullResponse = '';

          const response = await agent.processRequest(data.prompt);
          fullResponse = response;

          // Send final response
          connection.socket.send(JSON.stringify({
            type: 'response',
            content: fullResponse
          }));

          // Send updated file list
          const files = await getFileTree(WORKSPACE_DIR);
          connection.socket.send(JSON.stringify({
            type: 'files_updated',
            files
          }));

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
