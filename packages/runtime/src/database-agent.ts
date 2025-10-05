import { Agent, AgentOptions } from './agent.js';
import type {
  DatabaseClient,
  Session,
  Message
} from '@eitherway/database';
import {
  SessionsRepository,
  MessagesRepository,
  SessionMemoryRepository,
  WorkingSetRepository,
  EventsRepository
} from '@eitherway/database';

export interface DatabaseAgentOptions extends Omit<AgentOptions, 'workingDir'> {
  db: DatabaseClient;
  sessionId: string;
  userId?: string;
  appId?: string;
  workingDir?: string;
}

export class DatabaseAgent {
  private agent: Agent;
  private db: DatabaseClient;
  private sessionsRepo: SessionsRepository;
  private messagesRepo: MessagesRepository;
  private memoryRepo: SessionMemoryRepository;
  private workingSetRepo: WorkingSetRepository;
  private eventsRepo: EventsRepository;
  private sessionId: string;
  private appId?: string;

  constructor(options: DatabaseAgentOptions) {
    this.db = options.db;
    this.sessionId = options.sessionId;
    this.appId = options.appId;

    this.sessionsRepo = new SessionsRepository(this.db);
    this.messagesRepo = new MessagesRepository(this.db);
    this.memoryRepo = new SessionMemoryRepository(this.db);
    this.workingSetRepo = new WorkingSetRepository(this.db);
    this.eventsRepo = new EventsRepository(this.db);

    this.agent = new Agent({
      workingDir: options.workingDir || process.cwd(),
      claudeConfig: options.claudeConfig,
      agentConfig: options.agentConfig,
      executors: options.executors,
      dryRun: options.dryRun,
      webSearch: options.webSearch
    });
  }

  async processRequest(prompt: string): Promise<string> {
    await this.eventsRepo.log('request.started', { prompt }, {
      sessionId: this.sessionId,
      actor: 'user'
    });

    // Load previous conversation history from database
    const previousMessages = await this.messagesRepo.findRecentBySession(this.sessionId, 50);

    // Convert database messages to Agent message format (filter out system/tool messages)
    const conversationHistory = previousMessages
      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
      .map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: typeof msg.content === 'object' && msg.content.text
          ? msg.content.text
          : msg.content
      }));

    // Load conversation history into agent
    this.agent.loadConversationHistory(conversationHistory);

    const userMessage = await this.messagesRepo.create(
      this.sessionId,
      'user' as const,
      { text: prompt },
      undefined,
      undefined
    );

    await this.sessionsRepo.touchLastMessage(this.sessionId);

    let response: string;
    let tokenCount = 0;

    try {
      response = await this.agent.processRequest(prompt);

      const estimatedTokens = Math.ceil(response.length / 4);
      tokenCount = estimatedTokens;

      const assistantMessage = await this.messagesRepo.create(
        this.sessionId,
        'assistant' as const,
        { text: response },
        'claude-sonnet-4-5',
        tokenCount
      );

      await this.sessionsRepo.touchLastMessage(this.sessionId);

      await this.eventsRepo.log('request.completed', {
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        tokenCount
      }, {
        sessionId: this.sessionId,
        actor: 'assistant'
      });

      await this.updateMemoryIfNeeded();

    } catch (error: any) {
      await this.eventsRepo.log('request.failed', {
        error: error.message,
        stack: error.stack
      }, {
        sessionId: this.sessionId,
        actor: 'system'
      });
      throw error;
    }

    return response;
  }

  private async updateMemoryIfNeeded(): Promise<void> {
    const messageCount = await this.messagesRepo.countBySession(this.sessionId);

    if (messageCount % 10 === 0) {
      const recentMessages = await this.messagesRepo.findRecentBySession(this.sessionId, 20);

      const summary = this.generateSummary(recentMessages);

      await this.memoryRepo.upsert(this.sessionId, {
        rollingSummary: summary,
        lastCompactedMessageId: recentMessages[recentMessages.length - 1]?.id.toString()
      });
    }
  }

  private generateSummary(messages: Message[]): string {
    const userMessages = messages.filter(m => m.role === 'user');
    const topics = userMessages.map(m => {
      if (typeof m.content === 'object' && m.content.text) {
        return m.content.text.substring(0, 50);
      }
      return '';
    }).filter(Boolean);

    return `Recent topics: ${topics.join(', ')}`;
  }

  async saveTranscript(): Promise<void> {
    await this.agent.saveTranscript();
  }

  async addToWorkingSet(fileId: string, reason?: string): Promise<void> {
    if (!this.appId) {
      throw new Error('Cannot add to working set: no appId');
    }

    await this.workingSetRepo.add(
      this.sessionId,
      this.appId,
      fileId,
      reason,
      'agent'
    );
  }

  async getWorkingSet(): Promise<any[]> {
    return this.workingSetRepo.findBySessionWithFiles(this.sessionId);
  }

  async getSessionContext(): Promise<{
    session: Session | null;
    recentMessages: Message[];
    memory: any;
    workingSet: any[];
  }> {
    const session = await this.sessionsRepo.findById(this.sessionId);
    const recentMessages = await this.messagesRepo.findRecentBySession(this.sessionId, 10);
    const memory = await this.memoryRepo.findBySession(this.sessionId);
    const workingSet = await this.workingSetRepo.findBySessionWithFiles(this.sessionId);

    return { session, recentMessages, memory, workingSet };
  }

  /**
   * Set database context for file operations
   */
  setDatabaseContext(fileStore: any, appId: string, sessionId?: string): void {
    this.agent.setDatabaseContext(fileStore, appId, sessionId);
  }
}
