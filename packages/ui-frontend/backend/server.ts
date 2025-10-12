import { buildApp } from './app.js';

/**
 * Minimal Fastify server entry point
 * Stripped from robust backend at /tmp/eitherway-fastify/src/server/server.ts
 * Removes: @openai/agents SDK, database, complex wizard logic
 * Keeps: Server setup, SSE streaming pattern
 */

const start = async () => {
  try {
    const app = buildApp();

    const port = parseInt(process.env.FASTIFY_PORT || '4000');
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });

    app.log.info('='.repeat(60));
    app.log.info(`Minimal Fastify Server Running`);
    app.log.info('='.repeat(60));
    app.log.info(``);
    app.log.info(`Server:        http://${host}:${port}`);
    app.log.info(`Health Check:  http://${host}:${port}/health`);
    app.log.info(``);
    app.log.info(`Streaming Endpoints:`);
    app.log.info(`   GET  /api/stream-test             - Simple Lorem streaming (SSE)`);
    app.log.info(`   POST /api/stream-test             - Agent Input → Output streaming`);
    app.log.info(`   GET  /api/wizard/stream           - Wizard-style streaming`);
    app.log.info(``);
    app.log.info(`Example requests:`);
    app.log.info(`   curl -N "http://localhost:${port}/api/stream-test?chunkSize=10&delayMs=200"`);
    app.log.info(`   curl -N -X POST http://localhost:${port}/api/stream-test -H "Content-Type: application/json" -d '{"prompt": "Build a todo app"}'`);
    app.log.info(`   curl -N "http://localhost:${port}/api/wizard/stream?brief=I+need+a+blog"`);
    app.log.info(``);
    app.log.info('='.repeat(60));
  } catch (err) {
    console.error('Error: Server failed to start:', err);
    process.exit(1);
  }
};

start();
