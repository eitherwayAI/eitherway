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

  // User lookup endpoint - does NOT count against rate limits
  fastify.get<{
    Querystring: { email: string }
  }>('/api/users', async (request, reply) => {
    const { email } = request.query;

    if (!email) {
      return reply.code(400).send({ error: 'email is required' });
    }

    const user = await usersRepo.findOrCreate(email);
    return user;
  });

  fastify.post<{
    Body: { email: string; title: string; appId?: string }
  }>('/api/sessions', async (request, reply) => {
    const { email, title } = request.body;

    const user = await usersRepo.findOrCreate(email);

    // const rateLimitCheck = await rateLimiter.checkSessionCreation(user.id);
    // if (!rateLimitCheck.allowed) {
    //     error: 'Rate limit exceeded',
    //     message: `You have reached your daily limit of ${rateLimitCheck.limit} chats. Please try again after ${rateLimitCheck.resetsAt.toISOString()}.`,
    //     current: rateLimitCheck.current,
    //     limit: rateLimitCheck.limit,
    //     resetsAt: rateLimitCheck.resetsAt.toISOString()
    //   });
    // }

    const app = await appsRepo.create(user.id, title, 'private');
    const session = await sessionsRepo.create(user.id, title, app.id);

    // Rate limiting disabled for local testing
    // await rateLimiter.incrementSessionCount(user.id);

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

    // Transform messages: extract text from Claude API content blocks
    const messages = rawMessages.map(msg => {
      let content = msg.content;

      if (Array.isArray(content)) {
        content = content
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text)
          .join('\n');
      }
      else if (typeof content === 'object' && content !== null && 'text' in content) {
        content = content.text;
      }
      else if (typeof content !== 'string') {
        content = JSON.stringify(content);
      }

      return {
        ...msg,
        content
      };
    });

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

    // Rate limiting disabled for local testing
    //   const rateLimitCheck = await rateLimiter.checkMessageSending(id);
    //   if (!rateLimitCheck.allowed) {
    //       error: 'Rate limit exceeded',
    //       message: `You have reached your daily limit of ${rateLimitCheck.limit} messages per chat. Please try again after ${rateLimitCheck.resetsAt.toISOString()}.`,
    //       current: rateLimitCheck.current,
    //       limit: rateLimitCheck.limit,
    //       resetsAt: rateLimitCheck.resetsAt.toISOString()
    //     });
    //   }
    // }

    const message = await messagesRepo.create(id, role, content, model, tokenCount);

    // Rate limiting disabled for local testing
    // if (role === 'user') {
    //   await rateLimiter.incrementMessageCount(id);
    // }

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

    const session = await sessionsRepo.findById(id);

    await sessionsRepo.delete(id);

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
