import { Agent, AgentOptions, StreamingCallbacks } from './agent.js';
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

  async processRequest(prompt: string, callbacks?: StreamingCallbacks): Promise<string> {
    await this.eventsRepo.log('request.started', { prompt }, {
      sessionId: this.sessionId,
      actor: 'user'
    });

    const previousMessages = await this.messagesRepo.findRecentBySession(this.sessionId, 50);

    // Convert database messages to Agent message format (filter out system/tool messages)
    const conversationHistory = previousMessages
      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
      .map(msg => {
        let content = msg.content;

        // Ensure content is always an array (Claude API requirement)
        if (typeof content === 'string') {
          // Plain string - wrap in text block
          content = [{ type: 'text', text: content }];
        } else if (typeof content === 'object' && content !== null) {
          if (Array.isArray(content)) {
            // CRITICAL FIX: Filter out tool_use and tool_result blocks from assistant messages
            // Only keep text blocks to avoid confusing Claude about past tool executions
            if (msg.role === 'assistant') {
              content = content.filter((block: any) => block.type === 'text');
              // If no text blocks remain, add placeholder to maintain conversation flow
              if (content.length === 0) {
                content = [{ type: 'text', text: '[Tool execution completed]' }];
              }
            }
          } else if ('text' in content && content.text) {
            // Object with text property - wrap in array
            content = [{ type: 'text', text: content.text }];
          } else {
            // Other object - stringify and wrap
            content = [{ type: 'text', text: JSON.stringify(content) }];
          }
        } else {
          // Fallback for any other type
          content = [{ type: 'text', text: String(content) }];
        }

        return {
          role: msg.role as 'user' | 'assistant',
          content
        };
      });

    this.agent.loadConversationHistory(conversationHistory);

    // CRITICAL FIX: Provide file context to AI when reloading from history
    // This ensures the AI knows what files exist in the project after stripping tool_use blocks
    console.log('[DatabaseAgent] Debug - appId:', this.appId, 'historyLength:', conversationHistory.length);
    let enhancedPrompt = prompt;
    if (this.appId && conversationHistory.length > 0) {
      console.log('[DatabaseAgent] Condition met, loading file context...');
      try {
        // Import PostgresFileStore dynamically
        const { PostgresFileStore } = await import('@eitherway/database');
        console.log('[DatabaseAgent] PostgresFileStore imported successfully');
        const fileStore = new PostgresFileStore(this.db);
        console.log('[DatabaseAgent] FileStore instance created');

        const files = await fileStore.list(this.appId, 100);
        console.log('[DatabaseAgent] Got', files.length, 'files from database');

        if (files.length > 0) {
          const fileList = files.map(f => f.path).join(', ');
          console.log(`[DatabaseAgent] Providing file context to AI: ${files.length} files (${fileList})`);

          // Prepend file context to user prompt with clear instruction to use tools
          enhancedPrompt = `[SYSTEM CONTEXT: This is a continuation of an existing project. The following files currently exist: ${fileList}. To view or modify these files, you MUST use the either-view and either-line-replace tools as normal. Do not describe changes - actually execute them using tools.]\n\nUser request: ${prompt}`;
          console.log('[DatabaseAgent] Enhanced prompt created');
        } else {
          console.log('[DatabaseAgent] No files found in project yet');
        }
      } catch (error: any) {
        console.error('[DatabaseAgent] WARNING: Failed to load file context:', error);
        console.error('[DatabaseAgent] Error stack:', error.stack);
        // Continue without file context rather than failing
      }
    } else {
      console.log('[DatabaseAgent] Condition NOT met - appId:', this.appId, 'historyLength:', conversationHistory.length);
    }

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
      console.log('[DatabaseAgent] Sending to AI (first 200 chars):', enhancedPrompt.substring(0, 200));
      response = await this.agent.processRequest(enhancedPrompt, callbacks);

      const estimatedTokens = Math.ceil(response.length / 4);
      tokenCount = estimatedTokens;

      const history = this.agent.getHistory();
      const lastAssistantMessage = history[history.length - 1];

      const contentToSave = lastAssistantMessage?.role === 'assistant'
        ? lastAssistantMessage.content
        : { text: response };

      const assistantMessage = await this.messagesRepo.create(
        this.sessionId,
        'assistant' as const,
        contentToSave as any,
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

  setDatabaseContext(fileStore: any, appId: string, sessionId?: string): void {
    this.agent.setDatabaseContext(fileStore, appId, sessionId);
  }
}
