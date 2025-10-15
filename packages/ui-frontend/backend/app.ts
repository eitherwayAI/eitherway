import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { streamAgentResponse, streamLoremChunks, formatSSE, type StreamOptions } from './streaming.js';

/**
 * Minimal Fastify app - stripped from robust backend
 * Removes: DB, telemetry, wizard complexity, @openai/agents
 * Keeps: Server setup, CORS, SSE streaming pattern
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // Register CORS
  app.register(cors, {
    origin: true, // Allow all origins in development
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    exposedHeaders: ['Content-Type', 'Cache-Control', 'Connection', 'X-Accel-Buffering'],
  });

  // Health check
  app.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      message: 'Minimal Fastify server running',
    };
  });

  app.get('/api/stream-test', async (request, reply) => {
    const { chunkSize, delayMs, text } = request.query as {
      chunkSize?: string;
      delayMs?: string;
      text?: string;
    };

    const options: StreamOptions = {
      chunkSize: chunkSize ? parseInt(chunkSize, 10) : 20,
      delayMs: delayMs ? parseInt(delayMs, 10) : 300,
      text,
    };

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });

    try {
      // Stream chunks as SSE
      for await (const chunk of streamLoremChunks(options)) {
        const event = {
          type: 'chunk',
          data: chunk,
          timestamp: new Date().toISOString(),
        };
        reply.raw.write(formatSSE(event));
      }

      reply.raw.write(
        formatSSE({
          type: 'complete',
          timestamp: new Date().toISOString(),
        }),
      );

      app.log.info('Stream completed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      app.log.error(`Stream error: ${errorMessage}`);

      reply.raw.write(
        formatSSE({
          type: 'error',
          error: errorMessage,
          timestamp: new Date().toISOString(),
        }),
      );
    } finally {
      reply.raw.end();
    }
  });

  // POST /api/stream-test - Agent-style Input → Output streaming (SSE)
  app.post('/api/stream-test', async (request, reply) => {
    const { prompt, chunkSize, delayMs, text } = request.body as {
      prompt?: string;
      chunkSize?: number;
      delayMs?: number;
      text?: string;
    };

    if (!prompt) {
      return reply.status(400).send({
        error: 'Missing required field: prompt',
      });
    }

    const options: StreamOptions = {
      chunkSize: chunkSize || 20,
      delayMs: delayMs || 300,
      text,
    };

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });

    try {
      // Stream agent response
      for await (const event of streamAgentResponse(prompt, options)) {
        reply.raw.write(formatSSE(event));
      }

      app.log.info(`Agent stream completed for prompt: ${prompt}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      app.log.error(`Agent stream error: ${errorMessage}`);

      reply.raw.write(
        formatSSE({
          type: 'error',
          error: errorMessage,
          timestamp: new Date().toISOString(),
        }),
      );
    } finally {
      reply.raw.end();
    }
  });

  // Stripped from robust /api/wizard/requirements/preview
  app.get('/api/wizard/stream', async (request, reply) => {
    const { brief, chunkSize, delayMs } = request.query as {
      brief?: string;
      chunkSize?: string;
      delayMs?: string;
    };

    if (!brief || brief.length < 10) {
      return reply.status(400).send({
        error: 'Brief must be at least 10 characters',
      });
    }

    const options: StreamOptions = {
      chunkSize: chunkSize ? parseInt(chunkSize, 10) : 20,
      delayMs: delayMs ? parseInt(delayMs, 10) : 300,
      text: `Processing brief: "${brief}"\n\nSuggestions: ${LOREM_TEXT}`,
    };

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });

    const startTime = Date.now();

    try {
      app.log.info(
        {
          briefLength: brief.length,
          briefPreview: brief.substring(0, 50),
        },
        'Starting wizard stream',
      );

      // Stream suggestions (mimics RequirementsExtractor.streamSuggestions)
      for await (const chunk of streamLoremChunks(options)) {
        const event = {
          type: 'suggestion',
          data: chunk,
          timestamp: new Date().toISOString(),
        };
        reply.raw.write(formatSSE(event));
      }

      const completionEvent = {
        type: 'complete',
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
      reply.raw.write(formatSSE(completionEvent));

      app.log.info(
        {
          duration: Date.now() - startTime,
        },
        'Wizard stream completed',
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      app.log.error(`Wizard stream error: ${errorMessage}`);

      const errorEvent = {
        type: 'error',
        error: errorMessage,
        timestamp: new Date().toISOString(),
      };
      reply.raw.write(formatSSE(errorEvent));
    } finally {
      reply.raw.end();
    }
  });

  return app;
}

// Lorem text for wizard endpoint
const LOREM_TEXT = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.`;
