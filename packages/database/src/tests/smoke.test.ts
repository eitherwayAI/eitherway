import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import {
  createDatabaseClient,
  DatabaseClient,
  UsersRepository,
  SessionsRepository,
  MessagesRepository,
  AppsRepository,
  FilesRepository,
  SessionMemoryRepository,
  WorkingSetRepository,
  EventsRepository
} from '../index.js';

describe('Database Smoke Tests', () => {
  let db: DatabaseClient;
  let usersRepo: UsersRepository;
  let sessionsRepo: SessionsRepository;
  let messagesRepo: MessagesRepository;
  let appsRepo: AppsRepository;
  let filesRepo: FilesRepository;
  let memoryRepo: SessionMemoryRepository;
  let workingSetRepo: WorkingSetRepository;
  let eventsRepo: EventsRepository;

  beforeAll(async () => {
    db = createDatabaseClient();
    usersRepo = new UsersRepository(db);
    sessionsRepo = new SessionsRepository(db);
    messagesRepo = new MessagesRepository(db);
    appsRepo = new AppsRepository(db);
    filesRepo = new FilesRepository(db);
    memoryRepo = new SessionMemoryRepository(db);
    workingSetRepo = new WorkingSetRepository(db);
    eventsRepo = new EventsRepository(db);

    const healthy = await db.healthCheck();
    expect(healthy).toBe(true);
  });

  afterAll(async () => {
    await db.close();
  });

  it('should create and retrieve a user', async () => {
    const email = `test-${Date.now()}@example.com`;
    const user = await usersRepo.create(email, 'Test User');

    expect(user.email).toBe(email);
    expect(user.display_name).toBe('Test User');

    const retrieved = await usersRepo.findById(user.id);
    expect(retrieved?.email).toBe(email);

    await usersRepo.delete(user.id);
  });

  it('should create session and add messages', async () => {
    const user = await usersRepo.create(`session-test-${Date.now()}@example.com`, 'Session Test');
    const session = await sessionsRepo.create(user.id, 'Test Session');

    expect(session.title).toBe('Test Session');
    expect(session.user_id).toBe(user.id);

    const message1 = await messagesRepo.create(
      session.id,
      'user',
      { text: 'Hello' },
      'claude-sonnet-4-5',
      10
    );

    expect(message1.role).toBe('user');

    await messagesRepo.create(
      session.id,
      'assistant',
      { text: 'Hi there!' },
      'claude-sonnet-4-5',
      5
    );

    const messages = await messagesRepo.findBySession(session.id);
    expect(messages).toHaveLength(2);

    await sessionsRepo.delete(session.id);
    await usersRepo.delete(user.id);
  });

  it('should create app and upsert files', async () => {
    const user = await usersRepo.create(`app-test-${Date.now()}@example.com`, 'App Test');
    const app = await appsRepo.create(user.id, 'Test App', 'private');

    expect(app.name).toBe('Test App');
    expect(app.owner_id).toBe(user.id);

    const file1 = await filesRepo.upsertFile(
      app.id,
      'index.js',
      'console.log("Hello");',
      user.id,
      'text/javascript'
    );

    expect(file1.path).toBe('index.js');
    expect(file1.app_id).toBe(app.id);

    const file2 = await filesRepo.upsertFile(
      app.id,
      'index.js',
      'console.log("Updated");',
      user.id,
      'text/javascript'
    );

    expect(file2.id).toBe(file1.id);

    const versions = await filesRepo.getVersionHistory(file1.id);
    expect(versions).toHaveLength(2);

    const files = await filesRepo.findByApp(app.id);
    expect(files).toHaveLength(1);

    await appsRepo.delete(app.id);
    await usersRepo.delete(user.id);
  });

  it('should manage session memory', async () => {
    const user = await usersRepo.create(`memory-test-${Date.now()}@example.com`, 'Memory Test');
    const session = await sessionsRepo.create(user.id, 'Memory Test Session');

    const memory1 = await memoryRepo.upsert(session.id, {
      rollingSummary: 'User asked about weather',
      facts: { location: 'San Francisco' }
    });

    expect(memory1.rolling_summary).toBe('User asked about weather');

    await memoryRepo.addFact(session.id, 'temperature', '72F');

    const retrieved = await memoryRepo.findBySession(session.id);
    expect(retrieved?.facts).toHaveProperty('location', 'San Francisco');
    expect(retrieved?.facts).toHaveProperty('temperature', '72F');

    await sessionsRepo.delete(session.id);
    await usersRepo.delete(user.id);
  });

  it('should manage working set', async () => {
    const user = await usersRepo.create(`ws-test-${Date.now()}@example.com`, 'WS Test');
    const session = await sessionsRepo.create(user.id, 'WS Test Session');
    const app = await appsRepo.create(user.id, 'WS Test App');
    const file = await filesRepo.upsertFile(app.id, 'test.js', 'code', user.id);

    const item = await workingSetRepo.add(
      session.id,
      app.id,
      file.id,
      'Currently editing',
      'user'
    );

    expect(item.session_id).toBe(session.id);
    expect(item.file_id).toBe(file.id);

    const items = await workingSetRepo.findBySession(session.id);
    expect(items).toHaveLength(1);

    await workingSetRepo.remove(session.id, file.id);

    const afterRemove = await workingSetRepo.findBySession(session.id);
    expect(afterRemove).toHaveLength(0);

    await appsRepo.delete(app.id);
    await sessionsRepo.delete(session.id);
    await usersRepo.delete(user.id);
  });

  it('should log events', async () => {
    const event = await eventsRepo.log(
      'test.event',
      { message: 'Test event' },
      { actor: 'system' }
    );

    expect(event.kind).toBe('test.event');
    expect(event.actor).toBe('system');

    const events = await eventsRepo.findByKind('test.event', 1);
    expect(events.length).toBeGreaterThan(0);
  });
});
