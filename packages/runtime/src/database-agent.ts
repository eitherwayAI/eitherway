import { Agent, AgentOptions, StreamingCallbacks } from './agent.js';
import type { DatabaseClient, Session, Message } from '@eitherway/database';
import {
  SessionsRepository,
  MessagesRepository,
  SessionMemoryRepository,
  WorkingSetRepository,
  EventsRepository,
  MemoryPreludeService, // P1.5: Import for dynamic system prompt
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
  private memoryPreludeService: MemoryPreludeService; // P1.5: Service for building dynamic context
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
    this.memoryPreludeService = new MemoryPreludeService(this.db); // P1.5: Initialize service

    this.agent = new Agent({
      workingDir: options.workingDir || process.cwd(),
      claudeConfig: options.claudeConfig,
      agentConfig: options.agentConfig,
      executors: options.executors,
      dryRun: options.dryRun,
      webSearch: options.webSearch,
    });
  }

  async processRequest(prompt: string, callbacks?: StreamingCallbacks, messageRole: 'user' | 'system' = 'user', skipConversationHistory: boolean = false): Promise<string> {
    // Debug: Log parameters
    console.log('[DatabaseAgent] processRequest called with:', {
      messageRole,
      skipConversationHistory,
      promptLength: prompt.length
    });

    await this.eventsRepo.log(
      'request.started',
      { prompt },
      {
        sessionId: this.sessionId,
        actor: 'user',
      },
    );

    // P1.5: Build Memory Prelude for dynamic context
    // Skip memory prelude for auto-fix to minimize tokens
    let memoryPreludeText = '';
    if (!skipConversationHistory) {
      try {
        const prelude = await this.memoryPreludeService.buildPrelude(this.sessionId);
        memoryPreludeText = this.memoryPreludeService.formatAsSystemMessage(prelude);

        // Set the dynamic system prompt prefix on the agent
        this.agent.setSystemPromptPrefix(memoryPreludeText);
      } catch (error) {
        // Gracefully degrade if memory prelude fails (e.g., missing session data)
        console.warn('[DatabaseAgent] Failed to build memory prelude:', error);
        this.agent.setSystemPromptPrefix('');
      }
    } else {
      // Auto-fix mode: no memory prelude needed
      this.agent.setSystemPromptPrefix('');
    }

    // P1: Load previous conversation history with smart bounded history
    // Skip conversation history for auto-fix to minimize tokens
    let conversationHistory: any[] = [];

    if (!skipConversationHistory) {
      const memory = await this.memoryRepo.findBySession(this.sessionId);
      let previousMessages: any[];

      if (memory?.last_compacted_message_id) {
        // Load messages after last compaction (with a safety cap of 10)
        previousMessages = await this.messagesRepo.findAfterMessageId(
          this.sessionId,
          memory.last_compacted_message_id,
          10
        );
      } else {
        // No compaction yet, load last 10 messages
        previousMessages = await this.messagesRepo.findRecentBySession(this.sessionId, 10);
      }

      // Convert database messages to Agent message format (filter out system/tool messages)
      // P1: Sanitize old tool results to prevent context bloat
      conversationHistory = previousMessages
        .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
        .map((msg, index) => {
          let content = msg.content;

          // P1: Determine if this is a recent message (last 5 messages keep full tool results)
          const isRecent = index >= previousMessages.length - 5;

          // Ensure content is always an array (Claude API requirement)
          if (typeof content === 'string') {
            // Plain string - wrap in text block
            content = [{ type: 'text', text: content }];
          } else if (typeof content === 'object' && content !== null) {
            if (Array.isArray(content)) {
              // P1: Strip large tool results from older messages
              if (!isRecent) {
                content = content.map((block: any) => {
                  if (block.type === 'tool_result') {
                    // Replace with lightweight placeholder
                    const toolInfo = block.tool_use_id || block.name || 'unknown';
                    const pathInfo = block.content && typeof block.content === 'string'
                      ? block.content.substring(0, 100)
                      : '';
                    return {
                      type: 'text',
                      text: `[Tool executed: ${toolInfo}${pathInfo ? ' - ' + pathInfo.split('\n')[0] : ''}]`,
                    };
                  }
                  if (block.type === 'tool_use' && block.input?.content && block.input.content.length > 500) {
                    // Truncate large tool inputs in older messages
                    return {
                      ...block,
                      input: {
                        ...block.input,
                        content: block.input.content.substring(0, 500) + '... [truncated]',
                      },
                    };
                  }
                  return block;
                });
              }
              // Already an array - use as-is (possibly sanitized)
              content = content;
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
            content,
          };
        });
    } else {
      // Auto-fix mode: no conversation history - agent starts fresh with only error context
      console.log('[DatabaseAgent] Auto-fix mode: skipping conversation history to minimize tokens');
    }

    // Load conversation history into agent (empty array for auto-fix)
    this.agent.loadConversationHistory(conversationHistory);

    const userMessage = await this.messagesRepo.create(
      this.sessionId,
      messageRole as 'user' | 'system', // Use provided role (user or system for auto-fix)
      { text: prompt },
      undefined,
      undefined,
    );

    // Create assistant message BEFORE streaming starts (with empty content)
    // This ensures we have a database ID to send in stream_start
    const assistantMessage = await this.messagesRepo.create(
      this.sessionId,
      'assistant' as const,
      { text: '' }, // Placeholder - will be updated after streaming
      'claude-sonnet-4-5',
      undefined, // Token count will be set after completion
    );

    // Notify that the message was created (so server can send stream_start with real DB ID)
    if (callbacks?.onMessageCreated) {
      callbacks.onMessageCreated(assistantMessage.id.toString());
    }

    await this.sessionsRepo.touchLastMessage(this.sessionId);

    let response: string;
    let tokenCount = 0;

    try {
      response = await this.agent.processRequest(prompt, callbacks);

      const estimatedTokens = Math.ceil(response.length / 4);
      tokenCount = estimatedTokens;

      // Get the full conversation history to update the assistant message properly
      const history = this.agent.getHistory();
      const lastAssistantMessage = history[history.length - 1];

      // Save the full content (could be text or array of content blocks)
      const contentToSave =
        lastAssistantMessage?.role === 'assistant' ? lastAssistantMessage.content : { text: response };

      // UPDATE the existing message instead of creating a new one
      await this.messagesRepo.updateContent(assistantMessage.id, contentToSave as any, tokenCount);

      await this.sessionsRepo.touchLastMessage(this.sessionId);

      await this.eventsRepo.log(
        'request.completed',
        {
          userMessageId: userMessage.id,
          assistantMessageId: assistantMessage.id,
          tokenCount,
        },
        {
          sessionId: this.sessionId,
          actor: 'assistant',
        },
      );

      await this.updateMemoryIfNeeded();
    } catch (error: any) {
      await this.eventsRepo.log(
        'request.failed',
        {
          error: error.message,
          stack: error.stack,
        },
        {
          sessionId: this.sessionId,
          actor: 'system',
        },
      );
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
        lastCompactedMessageId: recentMessages[recentMessages.length - 1]?.id.toString(),
      });
    }
  }

  /**
   * P1.5: Generate improved summary of conversation for context compaction
   * Extracts key actions, files modified, and user requests
   */
  private generateSummary(messages: Message[]): string {
    const summaryParts: string[] = [];
    const filesModified = new Set<string>();
    const keyActions: string[] = [];

    for (const msg of messages) {
      // Extract user requests
      if (msg.role === 'user') {
        let userText = '';
        if (typeof msg.content === 'string') {
          userText = msg.content;
        } else if (typeof msg.content === 'object' && msg.content !== null) {
          if (Array.isArray(msg.content)) {
            const textBlocks = msg.content.filter((b: any) => b.type === 'text');
            userText = textBlocks.map((b: any) => b.text).join(' ');
          } else if ('text' in msg.content) {
            userText = msg.content.text;
          }
        }

        if (userText) {
          // Extract first sentence or first 80 chars
          const firstSentence = userText.split(/[.!?]/)[0].substring(0, 80);
          if (firstSentence) {
            keyActions.push(firstSentence.trim());
          }
        }
      }

      // Extract files from assistant tool uses
      if (msg.role === 'assistant' && typeof msg.content === 'object' && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_use' && block.input?.path) {
            filesModified.add(block.input.path);
          }
        }
      }
    }

    // Build summary
    if (keyActions.length > 0) {
      summaryParts.push(`Recent requests: ${keyActions.slice(-3).join('; ')}`);
    }

    if (filesModified.size > 0) {
      const fileList = Array.from(filesModified).slice(-5).join(', ');
      summaryParts.push(`Modified files: ${fileList}`);
    }

    return summaryParts.length > 0
      ? summaryParts.join('. ')
      : 'Session in progress - building application.';
  }

  async saveTranscript(): Promise<void> {
    await this.agent.saveTranscript();
  }

  async addToWorkingSet(fileId: string, reason?: string): Promise<void> {
    if (!this.appId) {
      throw new Error('Cannot add to working set: no appId');
    }

    await this.workingSetRepo.add(this.sessionId, this.appId, fileId, reason, 'agent');
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
