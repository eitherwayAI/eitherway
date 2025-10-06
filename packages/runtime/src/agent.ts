/**
 * Agent Orchestrator with Stage 1-5 workflow
 * Portion 1: Implements Stages 1-2 (Analyze, Plan)
 */

import { ModelClient } from './model-client.js';
import { ToolRunner } from './tool-runner.js';
import { TranscriptRecorder } from './transcript.js';
import { VerifierRunner } from './verifier.js';
import { getAllToolDefinitions } from '@eitherway/tools-core';
import type {
  Message,
  ToolUse,
  ToolResult,
  ClaudeConfig,
  AgentConfig,
  ToolExecutor
} from '@eitherway/tools-core';

const SYSTEM_PROMPT = `You are a single agent that builds and edits apps end-to-end FOR END USERS.
Use ONLY the tools listed below. Prefer either-line-replace for small, targeted edits.

CRITICAL BUILD RULES:
  - You are building apps for END USERS, not developers
  - NEVER create README.md, QUICKSTART.md, or ANY .md/.txt documentation files
  - NO separate documentation files of any kind (guides, summaries, tech docs, etc.)
  - All help, instructions, and guidance must be built INTO the app's UI
  - Create only executable code files that make up the actual application
  - Focus on user experience, not developer experience

YOUTUBE EMBED REQUIREMENTS (CRITICAL):
  - ALWAYS use /embed/VIDEO_ID URL, NEVER /watch?v=VIDEO_ID
  - Use youtube-nocookie.com for privacy (not youtube.com)
  - MUST include ALL these attributes or video will fail in WebContainer:

  Correct YouTube embed template:
  <iframe
    width="560"
    height="315"
    src="https://www.youtube-nocookie.com/embed/VIDEO_ID"
    title="YouTube video player"
    frameborder="0"
    credentialless
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowfullscreen
  ></iframe>

  Replace VIDEO_ID with actual video ID (from youtube.com/watch?v=VIDEO_ID)
  The credentialless attribute is REQUIRED for WebContainer COEP policy
  The allow attribute is REQUIRED - without these the video will be blocked

READ-BEFORE-WRITE DISCIPLINE (CRITICAL):
  - ALWAYS use either-view or either-search-files BEFORE any write or edit operation
  - Verify file contents, line numbers, and context before modifying
  - Use the needle parameter in either-line-replace to ensure you're editing the right lines
  - Check sha256 hashes to verify file integrity

For execution:
  Stage 1: Analyze request (intent, scope, constraints).
  Stage 2: Plan architecture (design system, components, files).
  Stage 3: Select tools (name each planned call, READ first for edits).
  Stage 4: Execute in parallel (emit multiple tool_use blocks that do not conflict).
  Stage 5: Verify & Respond (self-check diff & tests; concise summary).

Determinism:
  - Default temperature low (0.2); fix seeds where supported.
  - Use the smallest change that works; avoid rewrites.
  - Always prefer either-line-replace over either-write for existing files.

Safety:
  - File operations restricted to allowed workspaces and globs.
  - Web search is server-side with automatic rate limiting and citations.
  - All tool calls are logged with metrics (latency, sizes, file counts).

External API & CORS Handling:
  - WebContainer environment automatically proxies ALL external API requests
  - NO need to worry about CORS - the proxy handles it transparently
  - Simply use standard fetch() calls to any external API
  - The runtime automatically intercepts and routes through /api/proxy-api endpoint
  - CDN resources (images, fonts, scripts) are proxied through /api/proxy-cdn
  - This system works seamlessly - write code as if CORS doesn't exist
  - Example: fetch('https://api.example.com/data') just works, no configuration needed

API Best Practices:
  - Choose reliable, well-documented public APIs for your use case
  - Always implement client-side caching (30-60 seconds minimum) to respect rate limits
  - Handle API errors gracefully with try/catch and user-friendly error messages
  - Display loading states while fetching data
  - Consider fallback data or cached responses when APIs are unavailable
  - For crypto data: CoinGecko, CoinCap, or similar reputable sources
  - For weather: OpenWeather, WeatherAPI, or government APIs
  - For images: Use CDNs that allow hotlinking and work with our proxy
  - Avoid services that block external embedding or require authentication

Output contract:
  - When executing, emit parallel tool_use blocks grouped by task.
  - After tools, review diffs and summarize what changed and why.

Tools available:
  - either-view: Read files (returns sha256, line_count, encoding)
  - either-search-files: Search code (supports regex, context lines)
  - either-line-replace: Edit lines (returns unified diff, verifies with sha256)
  - either-write: Create files (returns diff summary)
  - web_search: Search the web for up-to-date information (server-side, automatic citations)
  - eithergen--generate_image: Generate images (OpenAI/custom provider, saves to disk)`;


export interface AgentOptions {
  workingDir: string;
  claudeConfig: ClaudeConfig;
  agentConfig: AgentConfig;
  executors: ToolExecutor[];
  dryRun?: boolean;
  webSearch?: {
    enabled: boolean;
    maxUses?: number;
    allowedDomains?: string[];
    blockedDomains?: string[];
  };
}

export class Agent {
  private modelClient: ModelClient;
  private toolRunner: ToolRunner;
  private recorder: TranscriptRecorder;
  private conversationHistory: Message[];
  private options: AgentOptions;

  constructor(options: AgentOptions) {
    this.options = options;
    this.modelClient = new ModelClient(options.claudeConfig);
    this.toolRunner = new ToolRunner(
      options.executors,
      options.workingDir,
      options.agentConfig
    );
    this.recorder = new TranscriptRecorder(options.agentConfig);
    this.conversationHistory = [];
  }

  /**
   * Load conversation history (for restoring state)
   */
  loadConversationHistory(messages: Message[]): void {
    this.conversationHistory = messages;
  }

  /**
   * Process a user request through the agent workflow
   */
  async processRequest(userMessage: string): Promise<string> {
    // Start transcript
    const transcriptId = this.recorder.startTranscript(userMessage);

    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage
    });

    this.recorder.addEntry({
      timestamp: new Date().toISOString(),
      role: 'user',
      content: userMessage
    });

    let finalResponse = '';
    let turnCount = 0;
    const maxTurns = 20; // Safety limit
    const changedFiles = new Set<string>();
    let hasExecutedTools = false;

    while (turnCount < maxTurns) {
      turnCount++;

      // Validate conversation history before sending to Claude
      this.validateConversationHistory();

      // Send message to Claude
      const response = await this.modelClient.sendMessage(
        this.conversationHistory,
        SYSTEM_PROMPT,
        getAllToolDefinitions(),
        {
          onDelta: (delta) => {
            if (delta.type === 'text') {
              process.stdout.write(delta.content);
            }
          },
          webSearchConfig: this.options.webSearch
        }
      );

      // Record assistant response
      this.recorder.addEntry({
        timestamp: new Date().toISOString(),
        role: 'assistant',
        content: response.content,
        metadata: {
          model: this.options.claudeConfig.model,
          tokenUsage: {
            input: response.usage.inputTokens,
            output: response.usage.outputTokens
          },
          stopReason: response.stopReason || undefined
        }
      });

      // Extract text and tool uses from response
      const textBlocks = response.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n');

      const toolUses = response.content
        .filter((c: any) => c.type === 'tool_use')
        .map((c: any) => ({
          type: 'tool_use' as const,
          id: c.id!,
          name: c.name!,
          input: c.input!
        }));

      // Add assistant message to history
      this.conversationHistory.push({
        role: 'assistant',
        content: response.content as any
      });

      // If no tool uses (client-side tools), we're done - run verification if we executed tools
      // Server-side tools (web search) are already executed and don't need processing
      if (toolUses.length === 0) {
        finalResponse = textBlocks;

        // Run verification if tools were executed this session
        if (hasExecutedTools && !this.options.dryRun) {
          const verificationSummary = await this.runVerification(changedFiles);
          finalResponse += verificationSummary;
        }

        break;
      }

      // Execute tools (dry run if specified)
      let toolResults: ToolResult[];
      if (this.options.dryRun) {
        toolResults = toolUses.map((tu: ToolUse) => ({
          type: 'tool_result' as const,
          tool_use_id: tu.id,
          content: `[DRY RUN] Would execute: ${tu.name} with input: ${JSON.stringify(tu.input, null, 2)}`
        }));
      } else {
        toolResults = await this.toolRunner.executeTools(toolUses);
        hasExecutedTools = true;

        // Track changed files
        for (const result of toolResults) {
          const metadata = (result as any).metadata;
          if (metadata?.path && !result.is_error) {
            changedFiles.add(metadata.path);
          }
        }
      }

      // Record tool results
      this.recorder.addEntry({
        timestamp: new Date().toISOString(),
        role: 'user',
        content: toolResults
      });

      // Add tool results to conversation
      this.conversationHistory.push({
        role: 'user',
        content: toolResults
      });

      // If stop reason was end_turn, continue conversation
      if (response.stopReason === 'end_turn') {
        continue;
      }
    }

    // End transcript
    this.recorder.endTranscript(transcriptId, finalResponse);

    return finalResponse;
  }

  /**
   * Get conversation history
   */
  getHistory(): Message[] {
    return [...this.conversationHistory];
  }

  /**
   * Reset conversation
   */
  reset(): void {
    this.conversationHistory = [];
    this.toolRunner.clearCache();
  }

  /**
   * Save transcript to disk
   */
  async saveTranscript(): Promise<void> {
    await this.recorder.saveCurrentTranscript();
  }

  /**
   * Set database context for file operations
   */
  setDatabaseContext(fileStore: any, appId: string, sessionId?: string): void {
    this.toolRunner.setDatabaseContext(fileStore, appId, sessionId);
  }

  /**
   * Run verification and create summary
   */
  private async runVerification(changedFiles: Set<string>): Promise<string> {
    const verifier = new VerifierRunner(this.options.workingDir);

    // Create change summary
    const changeSummary = this.createChangeSummary(changedFiles);

    // Run verification
    const verifyResult = await verifier.run();
    const verifySummary = VerifierRunner.formatSummary(verifyResult);

    // Get metrics summary
    const metrics = this.toolRunner.getMetrics();
    const metricsSummary = metrics.getSummaryString();

    return `\n\n---\n${changeSummary}${verifySummary}\n\n**Metrics:**\n${metricsSummary}`;
  }

  /**
   * Create a summary of changed files
   */
  private createChangeSummary(changedFiles: Set<string>): string {
    if (changedFiles.size === 0) {
      return '';
    }

    const files = Array.from(changedFiles).sort();
    const summary = files.length === 1
      ? `**Changed:** ${files[0]}\n`
      : `**Changed (${files.length} files):**\n${files.map(f => `  - ${f}`).join('\n')}\n`;

    return summary;
  }

  /**
   * Validate that server_tool_use blocks are properly paired with web_search_tool_result
   * This prevents the error: "web_search tool use without corresponding web_search_tool_result"
   */
  private validateConversationHistory(): void {
    this.conversationHistory.forEach((msg, idx) => {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        const serverToolUses = msg.content.filter((b: any) => b.type === 'server_tool_use');
        const webSearchResults = msg.content.filter((b: any) => b.type === 'web_search_tool_result');

        if (serverToolUses.length > 0) {
          // Verify each server_tool_use has a corresponding web_search_tool_result
          serverToolUses.forEach((stu: any) => {
            const hasMatchingResult = webSearchResults.some((wsr: any) => wsr.tool_use_id === stu.id);

            if (!hasMatchingResult) {
              console.error(`\n❌ CONVERSATION HISTORY VALIDATION ERROR:`);
              console.error(`   Message [${idx}] has server_tool_use (${stu.id}) without web_search_tool_result`);
              console.error(`   This will cause Claude API to reject the request.`);
              console.error(`\n   Message content blocks:`);
              if (Array.isArray(msg.content)) {
                msg.content.forEach((block: any, blockIdx: number) => {
                  console.error(`     [${blockIdx}] ${block.type}`);
                });
              }
              console.error('');

              throw new Error(
                `Conversation history validation failed: ` +
                `Message ${idx} has server_tool_use "${stu.name}" (${stu.id}) ` +
                `without corresponding web_search_tool_result. ` +
                `This indicates a bug in the streaming or content block handling.`
              );
            }
          });
        }
      }
    });
  }
}
