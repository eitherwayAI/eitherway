import { FastifyInstance } from 'fastify';
import {
  UsersRepository,
  SessionsRepository,
  MessagesRepository,
  SessionMemoryRepository,
  WorkingSetRepository,
  EventsRepository,
  AppsRepository,
  DatabaseClient
} from '@eitherway/database';

export async function registerSessionRoutes(fastify: FastifyInstance, db: DatabaseClient) {
  const usersRepo = new UsersRepository(db);
  const sessionsRepo = new SessionsRepository(db);
  const messagesRepo = new MessagesRepository(db);
  const memoryRepo = new SessionMemoryRepository(db);
  const workingSetRepo = new WorkingSetRepository(db);
  const eventsRepo = new EventsRepository(db);
  const appsRepo = new AppsRepository(db);

  fastify.post<{
    Body: { email: string; title: string; appId?: string }
  }>('/api/sessions', async (request, reply) => {
    const { email, title } = request.body;

    const user = await usersRepo.findOrCreate(email);

    // Create a unique app for each session to ensure isolated workspaces
    const app = await appsRepo.create(user.id, title, 'private');
    const session = await sessionsRepo.create(user.id, title, app.id);

    await eventsRepo.log('session.created', { sessionId: session.id, title }, {
      sessionId: session.id,
      actor: 'user'
    });

    return session;
  });

  fastify.get<{
    Params: { id: string }
  }>('/api/sessions/:id', async (request, reply) => {
    const session = await sessionsRepo.findById(request.params.id);

    if (!session) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    const rawMessages = await messagesRepo.findRecentBySession(session.id, 50);
    const memory = await memoryRepo.findBySession(session.id);
    const workingSet = await workingSetRepo.findBySessionWithFiles(session.id);

    // Transform messages: if content is object with text, extract it
    const messages = rawMessages.map(msg => ({
      ...msg,
      content: typeof msg.content === 'object' && msg.content !== null && 'text' in msg.content
        ? msg.content.text
        : msg.content
    }));

    return {
      session,
      messages,
      memory,
      workingSet
    };
  });

  fastify.get<{
    Querystring: { userId: string; limit?: string; offset?: string }
  }>('/api/sessions', async (request, reply) => {
    const { userId, limit = '50', offset = '0' } = request.query;

    if (!userId) {
      return reply.code(400).send({ error: 'userId is required' });
    }

    const sessions = await sessionsRepo.findByUser(
      userId,
      parseInt(limit, 10),
      parseInt(offset, 10)
    );

    return { sessions };
  });

  fastify.post<{
    Params: { id: string }
    Body: { role: 'user' | 'assistant' | 'system' | 'tool'; content: any; model?: string; tokenCount?: number }
  }>('/api/sessions/:id/messages', async (request, reply) => {
    const { id } = request.params;
    const { role, content, model, tokenCount } = request.body;

    const session = await sessionsRepo.findById(id);
    if (!session) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    const message = await messagesRepo.create(id, role, content, model, tokenCount);

    await sessionsRepo.touchLastMessage(id);

    await eventsRepo.log('message.created', { messageId: message.id, role }, {
      sessionId: id,
      actor: role === 'user' ? 'user' : 'assistant'
    });

    return message;
  });

  fastify.patch<{
    Params: { id: string }
    Body: { title?: string; status?: 'active' | 'archived' }
  }>('/api/sessions/:id', async (request, reply) => {
    const { id } = request.params;
    const { title, status } = request.body;

    const session = await sessionsRepo.update(id, { title, status });

    return session;
  });

  fastify.delete<{
    Params: { id: string }
  }>('/api/sessions/:id', async (request, reply) => {
    const { id } = request.params;

    // Get session to find app_id before deleting
    const session = await sessionsRepo.findById(id);

    // Delete session first (due to foreign key constraints)
    await sessionsRepo.delete(id);

    // Delete associated app if it exists
    if (session?.app_id) {
      await appsRepo.delete(session.app_id);
    }

    return { success: true };
  });

  fastify.put<{
    Params: { id: string }
    Body: { rollingSummary?: string; facts?: any; lastCompactedMessageId?: string }
  }>('/api/sessions/:id/memory', async (request, reply) => {
    const { id } = request.params;
    const data = request.body;

    const memory = await memoryRepo.upsert(id, data);

    return memory;
  });

  fastify.post<{
    Params: { id: string }
    Body: { appId: string; fileId: string; reason?: string; pinnedBy?: 'agent' | 'user' }
  }>('/api/sessions/:id/working-set', async (request, reply) => {
    const { id } = request.params;
    const { appId, fileId, reason, pinnedBy } = request.body;

    const item = await workingSetRepo.add(id, appId, fileId, reason, pinnedBy);

    return item;
  });

  fastify.delete<{
    Params: { sessionId: string; fileId: string }
  }>('/api/sessions/:sessionId/working-set/:fileId', async (request, reply) => {
    const { sessionId, fileId } = request.params;

    await workingSetRepo.remove(sessionId, fileId);

    return { success: true };
  });
}
