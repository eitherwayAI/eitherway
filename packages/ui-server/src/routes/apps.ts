import { FastifyInstance } from 'fastify';
import {
  AppsRepository,
  FilesRepository,
  FileReferencesRepository,
  EventsRepository,
  DatabaseClient
} from '@eitherway/database';

export async function registerAppRoutes(fastify: FastifyInstance, db: DatabaseClient) {
  const appsRepo = new AppsRepository(db);
  const filesRepo = new FilesRepository(db);
  const referencesRepo = new FileReferencesRepository(db);
  const eventsRepo = new EventsRepository(db);

  fastify.post<{
    Body: { ownerId: string; name: string; visibility?: 'private' | 'team' | 'public' }
  }>('/api/apps', async (request, reply) => {
    const { ownerId, name, visibility } = request.body;

    const app = await appsRepo.create(ownerId, name, visibility);

    await eventsRepo.log('app.created', { appId: app.id, name }, {
      appId: app.id,
      actor: 'user'
    });

    return app;
  });

  fastify.get<{
    Params: { id: string }
  }>('/api/apps/:id', async (request, reply) => {
    const app = await appsRepo.findById(request.params.id);

    if (!app) {
      return reply.code(404).send({ error: 'App not found' });
    }

    return app;
  });

  fastify.get<{
    Querystring: { ownerId: string; limit?: string; offset?: string }
  }>('/api/apps', async (request, reply) => {
    const { ownerId, limit = '50', offset = '0' } = request.query;

    if (!ownerId) {
      return reply.code(400).send({ error: 'ownerId is required' });
    }

    const apps = await appsRepo.findByOwner(
      ownerId,
      parseInt(limit, 10),
      parseInt(offset, 10)
    );

    return { apps };
  });

  fastify.patch<{
    Params: { id: string }
    Body: { name?: string; visibility?: 'private' | 'team' | 'public'; default_session_id?: string | null }
  }>('/api/apps/:id', async (request, reply) => {
    const { id } = request.params;
    const data = request.body;

    const app = await appsRepo.update(id, data);

    return app;
  });

  fastify.delete<{
    Params: { id: string }
  }>('/api/apps/:id', async (request, reply) => {
    const { id } = request.params;

    await appsRepo.delete(id);

    return { success: true };
  });

  fastify.get<{
    Params: { appId: string }
    Querystring: { limit?: string }
  }>('/api/apps/:appId/files', async (request, reply) => {
    const { appId } = request.params;
    const { limit = '1000' } = request.query;

    const files = await filesRepo.findByApp(appId, parseInt(limit, 10));

    return { files };
  });

  fastify.post<{
    Params: { appId: string }
    Body: {
      path: string;
      content: string;
      userId?: string;
      mimeType?: string;
    }
  }>('/api/apps/:appId/files', async (request, reply) => {
    const { appId } = request.params;
    const { path, content, userId, mimeType } = request.body;

    const file = await filesRepo.upsertFile(appId, path, content, userId, mimeType);

    await eventsRepo.log('file.upserted', { fileId: file.id, path }, {
      appId,
      actor: userId ? 'user' : 'agent'
    });

    return file;
  });

  fastify.get<{
    Params: { appId: string; fileId: string }
  }>('/api/apps/:appId/files/:fileId', async (request, reply) => {
    const { fileId } = request.params;

    const file = await filesRepo.findById(fileId);
    if (!file) {
      return reply.code(404).send({ error: 'File not found' });
    }

    const version = await filesRepo.getHeadVersion(fileId);

    return { file, version };
  });

  fastify.get<{
    Params: { appId: string; fileId: string }
    Querystring: { limit?: string }
  }>('/api/apps/:appId/files/:fileId/versions', async (request, reply) => {
    const { fileId } = request.params;
    const { limit = '50' } = request.query;

    const versions = await filesRepo.getVersionHistory(fileId, parseInt(limit, 10));

    return { versions };
  });

  fastify.delete<{
    Params: { appId: string; fileId: string }
  }>('/api/apps/:appId/files/:fileId', async (request, reply) => {
    const { fileId } = request.params;

    await filesRepo.delete(fileId);

    return { success: true };
  });

  fastify.get<{
    Params: { appId: string }
  }>('/api/apps/:appId/references', async (request, reply) => {
    const { appId } = request.params;

    const references = await referencesRepo.findByApp(appId);

    return { references };
  });
}
