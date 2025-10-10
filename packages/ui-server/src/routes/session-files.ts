import { FastifyInstance } from 'fastify';
import {
  SessionsRepository,
  PostgresFileStore,
  DatabaseClient,
  EventsRepository
} from '@eitherway/database';
import { maybeRewriteFile } from '../cdn-rewriter.js';

export async function registerSessionFileRoutes(
  fastify: FastifyInstance,
  db: DatabaseClient
) {
  const sessionsRepo = new SessionsRepository(db);
  const fileStore = new PostgresFileStore(db);
  const eventsRepo = new EventsRepository(db);

  fastify.get<{
    Params: { sessionId: string };
    Querystring: { limit?: string };
  }>('/api/sessions/:sessionId/files/tree', async (request, reply) => {
    const { sessionId } = request.params;
    const limit = parseInt(request.query.limit || '1000', 10);

    const session = await sessionsRepo.findById(sessionId);

    if (!session) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    if (!session.app_id) {
      return reply.send({ files: [] });
    }

    const files = await fileStore.list(session.app_id, limit);

    return { files };
  });

  fastify.get<{
    Params: { sessionId: string };
    Querystring: { path: string };
  }>('/api/sessions/:sessionId/files/read', async (request, reply) => {
    const { sessionId } = request.params;
    const { path } = request.query;

    if (!path) {
      return reply.code(400).send({ error: 'path query parameter is required' });
    }

    const session = await sessionsRepo.findById(sessionId);

    if (!session) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    if (!session.app_id) {
      return reply.code(404).send({ error: 'No app associated with session' });
    }

    try {
      const fileContent = await fileStore.read(session.app_id, path);

      const protocol = request.headers['x-forwarded-proto'] || 'http';
      const host = request.headers.host || 'localhost:3001';
      const serverOrigin = `${protocol}://${host}`;

      // Detect if file is binary based on mime type
      const mimeType = fileContent.mimeType || 'text/plain';
      const isBinary = mimeType.startsWith('image/') ||
                       mimeType.startsWith('video/') ||
                       mimeType.startsWith('audio/') ||
                       mimeType.startsWith('application/octet-stream') ||
                       mimeType.startsWith('application/pdf') ||
                       mimeType.startsWith('application/zip');

      let content: string;
      if (isBinary) {
        // For binary files, return base64 encoded
        if (Buffer.isBuffer(fileContent.content)) {
          content = fileContent.content.toString('base64');
        } else if (typeof fileContent.content === 'string') {
          content = fileContent.content;
        } else {
          content = Buffer.from(fileContent.content).toString('base64');
        }
      } else {
        // For text files, return as UTF-8 string
        if (typeof fileContent.content === 'string') {
          content = fileContent.content;
        } else if (Buffer.isBuffer(fileContent.content)) {
          content = fileContent.content.toString('utf-8');
        } else {
          content = Buffer.from(fileContent.content).toString('utf-8');
        }

        // Apply URL rewriting for text files (no shim injection for WebContainer)
        content = maybeRewriteFile(path, content, {
          serverOrigin,
          injectShim: false,
          rewriteStaticUrls: true
        });
      }

      return {
        path: fileContent.path,
        content,
        mimeType,
        isBinary, // Include binary flag for frontend
        version: fileContent.version
      };
    } catch (error: any) {
      return reply.code(404).send({ error: error.message });
    }
  });

  fastify.post<{
    Params: { sessionId: string };
    Body: { path: string; content: string; mimeType?: string };
  }>('/api/sessions/:sessionId/files/write', async (request, reply) => {
    const { sessionId } = request.params;
    const { path, content, mimeType } = request.body;

    console.log('[Session Files] POST /files/write - Session:', sessionId, 'Path:', path);

    if (!path) {
      return reply.code(400).send({ error: 'path is required' });
    }

    if (content === undefined) {
      return reply.code(400).send({ error: 'content is required' });
    }

    const session = await sessionsRepo.findById(sessionId);

    if (!session) {
      console.error('[Session Files] Session not found:', sessionId);
      return reply.code(404).send({ error: 'Session not found' });
    }

    // CRITICAL FIX: Auto-create app_id if it doesn't exist
    let appId = session.app_id;
    if (!appId) {
      console.log('[Session Files] ⚠️  Session has no app_id, creating one...');

      try {
        // Import AppsRepository
        const { AppsRepository } = await import('@eitherway/database');
        const appsRepo = new AppsRepository(db);

        // Create app with session title or default
        const appTitle = session.title || 'Generated App';
        const app = await appsRepo.create(session.user_id, appTitle, 'private');
        appId = app.id;

        // Update session with app_id
        await sessionsRepo.update(sessionId, { app_id: appId } as any);

        console.log('[Session Files] ✅ Created app:', appId, 'for session:', sessionId);
      } catch (error: any) {
        console.error('[Session Files] ❌ Failed to create app:', error);
        return reply.code(500).send({ error: `Failed to create application workspace: ${error.message}` });
      }
    } else {
      console.log('[Session Files] Using existing app_id:', appId);
    }

    try {
      console.log('[Session Files] Writing file to database...', path);
      await fileStore.write(appId, path, content, mimeType);
      console.log('[Session Files] ✅ File written successfully');

      await eventsRepo.log('file.updated', { path }, {
        sessionId,
        appId,
        actor: 'user'
      });

      return {
        success: true,
        path,
        message: 'File saved successfully'
      };
    } catch (error: any) {
      console.error('[Session Files] ❌ Error writing file:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  fastify.post<{
    Params: { sessionId: string };
    Body: { oldPath: string; newPath: string };
  }>('/api/sessions/:sessionId/files/rename', async (request, reply) => {
    const { sessionId } = request.params;
    const { oldPath, newPath } = request.body;

    if (!oldPath || !newPath) {
      return reply.code(400).send({ error: 'oldPath and newPath are required' });
    }

    const session = await sessionsRepo.findById(sessionId);

    if (!session) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    if (!session.app_id) {
      return reply.code(400).send({ error: 'No app associated with session' });
    }

    try {
      await fileStore.rename(session.app_id, oldPath, newPath);

      await eventsRepo.log('file.renamed', { oldPath, newPath }, {
        sessionId,
        appId: session.app_id,
        actor: 'user'
      });

      return {
        success: true,
        oldPath,
        newPath,
        message: 'File renamed successfully'
      };
    } catch (error: any) {
      console.error('Error renaming file:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  fastify.delete<{
    Params: { sessionId: string };
    Querystring: { path: string };
  }>('/api/sessions/:sessionId/files', async (request, reply) => {
    const { sessionId } = request.params;
    const { path } = request.query;

    if (!path) {
      return reply.code(400).send({ error: 'path query parameter is required' });
    }

    const session = await sessionsRepo.findById(sessionId);

    if (!session) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    if (!session.app_id) {
      return reply.code(400).send({ error: 'No app associated with session' });
    }

    try {
      await fileStore.delete(session.app_id, path);

      await eventsRepo.log('file.deleted', { path }, {
        sessionId,
        appId: session.app_id,
        actor: 'user'
      });

      return {
        success: true,
        path,
        message: 'File deleted successfully'
      };
    } catch (error: any) {
      console.error('Error deleting file:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  fastify.get<{
    Params: { sessionId: string };
    Querystring: { path: string; limit?: string };
  }>('/api/sessions/:sessionId/files/versions', async (request, reply) => {
    const { sessionId } = request.params;
    const { path, limit = '50' } = request.query;

    if (!path) {
      return reply.code(400).send({ error: 'path query parameter is required' });
    }

    const session = await sessionsRepo.findById(sessionId);

    if (!session) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    if (!session.app_id) {
      return reply.code(404).send({ error: 'No app associated with session' });
    }

    try {
      const versions = await fileStore.getVersions(
        session.app_id,
        path,
        parseInt(limit, 10)
      );

      return { versions };
    } catch (error: any) {
      return reply.code(404).send({ error: error.message });
    }
  });
}
