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

COMPLETENESS REQUIREMENT (HIGHEST PRIORITY):
  - EVERY app you create must be 100% COMPLETE and FUNCTIONAL from the start
  - If HTML references a .js file → YOU MUST CREATE that .js file in the SAME turn
  - If HTML references a .css file → YOU MUST CREATE that .css file in the SAME turn
  - If you create HTML with buttons/forms → YOU MUST CREATE the JavaScript that makes them work
  - If you mention a feature → YOU MUST IMPLEMENT that feature completely
  - NEVER stop until ALL referenced files exist and ALL functionality works
  - Check: Does the user's request require JavaScript? If YES, create it in the same response
  - Check: Are there ANY <script src="..."> tags? If YES, create those files NOW
  - Check: Will buttons/inputs work without JavaScript? If NO, create the JavaScript NOW
  - DO NOT create partial apps - users expect working applications, not templates

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

SVG USAGE IN WEBCONTAINER (CRITICAL):
  - WebContainer uses COEP credentialless which can block improperly formatted SVGs
  - ALWAYS prefer inline SVG over data URIs for reliability
  - Data URIs (data:image/svg+xml,...) may be blocked by CSP or COEP policies
  - Use one of these reliable approaches:

  Option 1 - Inline SVG (PREFERRED):
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <path d="..."/>
  </svg>

  Option 2 - External SVG file:
  Create icon.svg as a separate file, then reference it:
  <img src="icon.svg" alt="Icon">

  AVOID these patterns in WebContainer:
  ❌ <img src="data:image/svg+xml,..."> (may be blocked by COEP/CSP)
  ❌ background: url('data:image/svg+xml,...') (may be blocked)
  ❌ <use xlink:href="data:..."> (explicitly blocked since Dec 2023)

  Always include xmlns="http://www.w3.org/2000/svg" in SVG elements
  For icon libraries, create individual .svg files rather than data URI sprites

ICONS AND VISUAL ELEMENTS (CRITICAL):
  - NEVER use emojis (🚀 ❌ ✅ 💰 📊 etc.) in user-facing applications
  - NEVER use Unicode symbols (•, ◆, ★, →, ✓, etc.) as icons - they're too simple
  - Emojis and Unicode symbols appear unprofessional and inconsistent
  - ALWAYS use proper SVG icons instead

  How to create SVG icons:

  1. Inline SVG icons (BEST - most reliable for WebContainer):
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
  </svg>

  2. Find SVG icons online using web_search:
  Use web_search to find "free SVG icons [icon name]" or "open source SVG icons"
  Popular sources: Heroicons, Feather Icons, Material Icons, Bootstrap Icons
  Copy the SVG code and paste it inline or create a separate .svg file

  3. External SVG files (for reusable icons):
  Create separate .svg files for icons and reference them:
  <img src="icons/rocket.svg" alt="Rocket icon" width="24" height="24">

  Example: For a cryptocurrency app needing a rocket icon
  - Use web_search: "free SVG rocket icon"
  - Find a clean, professional SVG from Heroicons or similar
  - Copy the SVG <path> data and create inline SVG or .svg file
  - NEVER substitute with emoji 🚀 or Unicode ▲

  Examples of what NOT to do:
  ❌ <span>🚀</span> (emoji)
  ❌ <span>▲</span> (Unicode symbol)
  ❌ <span>★</span> (Unicode symbol)
  ✓ <svg>...rocket path...</svg> (proper SVG icon)

  The only exception: emojis in user-generated content or chat messages
  Always use professional SVG icons for all UI elements

READ-BEFORE-WRITE DISCIPLINE (CRITICAL):
  - When EDITING existing files: ALWAYS use either-view BEFORE either-line-replace
  - When CREATING new files: NO need to check if file exists - just use either-write
  - either-write will fail if file exists (safe), so don't pre-check with either-view
  - Use the needle parameter in either-line-replace to ensure you're editing the right lines
  - Performance: Avoid unnecessary reads - only read files you're about to modify

For execution:
  Stage 1: Analyze request (intent, scope, constraints).
  Stage 2: Plan architecture (design system, components, files).
           CRITICAL: List ALL files needed (HTML, CSS, JS, etc.) - create them ALL in one turn.
  Stage 3: Select tools (name each planned call, READ first for edits).
           CRITICAL: If HTML references script.js → add either-write for script.js to your plan.
  Stage 4: Execute in parallel (emit multiple tool_use blocks that do not conflict).
           CRITICAL: Create ALL files in this single turn - don't leave any for later.
  Stage 5: Verify & Respond (self-check: did I create ALL referenced files? Are all features working?)
           CRITICAL: Before responding, confirm every <script src="..."> file was created.

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

  // --- READ-before-WRITE enforcement constants ---
  private static readonly WRITE_TOOLS = new Set(['either-line-replace', 'either-write']);
  private static readonly READ_TOOL = 'either-view';

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

    // Add user message to history (content must be array for Claude API)
    this.conversationHistory.push({
      role: 'user',
      content: [{ type: 'text', text: userMessage }]
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

      // Extract text for final summary
      const textBlocks = response.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n');

      // --- Enforce READ-before-WRITE by injecting either-view blocks if missing ---
      const { contentBlocks: enforcedAssistantBlocks, toolUses } =
        this.injectReadBeforeWriteBlocks(response.content);

      // Only add assistant message if it has content (Anthropic API requirement)
      if (enforcedAssistantBlocks.length > 0) {
        this.conversationHistory.push({
          role: 'assistant',
          content: enforcedAssistantBlocks as any
        });
      } else {
        // Edge case: empty response - add placeholder to maintain conversation flow
        console.warn('[Agent] Warning: Assistant response had no content blocks, adding placeholder');
        this.conversationHistory.push({
          role: 'assistant',
          content: [{ type: 'text', text: '...' }]
        });
      }

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

        // Track changed files and collect created file paths
        const createdFilesThisTurn = new Set<string>();
        for (const result of toolResults) {
          const metadata = (result as any).metadata;
          if (metadata?.path && !result.is_error) {
            changedFiles.add(metadata.path);
            createdFilesThisTurn.add(metadata.path);
          }
        }

        // Check for missing file references in newly created HTML files
        const missingRefs = await this.checkMissingFileReferences(toolUses, createdFilesThisTurn, toolResults);
        if (missingRefs.length > 0) {
          // Add warning to the last tool result to inform the agent
          const warningMessage = `\n\n⚠️ WARNING: Missing file references detected:\n${missingRefs.map(ref => `  - ${ref.htmlFile} references <${ref.tag} ${ref.attr}="${ref.file}"> but ${ref.file} was not created`).join('\n')}\n\nYou MUST create these files in your next response to make the app functional.`;

          // Append warning to the last tool result
          if (toolResults.length > 0) {
            const lastResult = toolResults[toolResults.length - 1];
            lastResult.content = (lastResult.content || '') + warningMessage;
            console.warn('[Agent]' + warningMessage);
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
   * Validate conversation history format and content
   * Prevents API errors by ensuring all messages follow Claude API requirements
   */
  private validateConversationHistory(): void {
    this.conversationHistory.forEach((msg, idx) => {
      // Validate that content is always an array (Claude API requirement)
      if (!Array.isArray(msg.content)) {
        console.error(`\n❌ CONVERSATION HISTORY VALIDATION ERROR:`);
        console.error(`   Message [${idx}] (role: ${msg.role}) has non-array content`);
        console.error(`   Content type: ${typeof msg.content}`);
        console.error(`   Content value:`, msg.content);
        console.error(`\n   Claude API requires content to be an array of content blocks.`);
        console.error('');

        throw new Error(
          `Conversation history validation failed: ` +
          `Message ${idx} has invalid content format (expected array, got ${typeof msg.content}). ` +
          `This will cause Claude API to reject the request with "Input should be a valid list" error.`
        );
      }

      // Validate that content array is not empty (except for optional final assistant message)
      if (msg.content.length === 0) {
        const isFinalAssistant = idx === this.conversationHistory.length - 1 && msg.role === 'assistant';
        if (!isFinalAssistant) {
          console.error(`\n❌ CONVERSATION HISTORY VALIDATION ERROR:`);
          console.error(`   Message [${idx}] (role: ${msg.role}) has empty content array`);
          console.error(`\n   Claude API requires all messages to have non-empty content,`);
          console.error(`   except for the optional final assistant message.`);
          console.error('');

          throw new Error(
            `Conversation history validation failed: ` +
            `Message ${idx} has empty content array. ` +
            `This will cause Claude API to reject the request with "all messages must have non-empty content" error.`
          );
        }
      }

      // Validate server_tool_use blocks are properly paired with web_search_tool_result
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

  /**
   * Injects `either-view` reads before any write/edit tool calls that lack a
   * preceding read for the same `path` within the same assistant turn.
   * Also returns the final list of tool_uses to execute (in order).
   */
  private injectReadBeforeWriteBlocks(contentBlocks: any[]): { contentBlocks: any[]; toolUses: ToolUse[] } {
    const out: any[] = [];
    const toolUsesCollected: ToolUse[] = [];
    const seenReadForPath = new Set<string>();

    const pushAndCollect = (blk: any) => {
      out.push(blk);
      if (blk && blk.type === 'tool_use') {
        toolUsesCollected.push({
          type: 'tool_use',
          id: blk.id,
          name: blk.name,
          input: blk.input
        });
      }
    };

    for (const blk of contentBlocks) {
      // Track explicit reads
      if (blk?.type === 'tool_use' && blk.name === Agent.READ_TOOL) {
        const path = blk.input?.path;
        if (typeof path === 'string' && path.length > 0) {
          seenReadForPath.add(path);
        }
        pushAndCollect(blk);
        continue;
      }

      // Before either-line-replace (EDIT), ensure we've read the target file
      // NO injection for either-write (CREATE) - it handles file existence checks internally
      if (blk?.type === 'tool_use' && blk.name === 'either-line-replace') {
        const path = blk.input?.path;

        if (typeof path === 'string' && path.length > 0 && !seenReadForPath.has(path)) {
          // Inject a synthetic read tool_use directly before the edit
          const injectedId = `enforcer-view-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          const injected = {
            type: 'tool_use',
            id: injectedId,
            name: Agent.READ_TOOL,
            input: { path }
          };
          pushAndCollect(injected);
          seenReadForPath.add(path);
        }

        // Optionally annotate missing needle (soft warning)
        if (!blk.input?.needle) {
          blk.input = {
            ...blk.input,
            _enforcerWarning: 'No `needle` provided; injected a read to reduce risk.'
          };
        }

        pushAndCollect(blk);
        continue;
      }

      // For eithergen--generate_image or other WRITE tools, no read injection needed
      if (blk?.type === 'tool_use' && Agent.WRITE_TOOLS.has(blk.name)) {
        pushAndCollect(blk);
        continue;
      }

      // passthrough others
      pushAndCollect(blk);
    }

    // Only return *tool_use* blocks as executable tool uses, in order
    const executableToolUses = toolUsesCollected.filter((b: any) => b.type === 'tool_use') as ToolUse[];
    return { contentBlocks: out, toolUses: executableToolUses };
  }

  /**
   * Check for missing file references in newly created HTML files
   * Detects <script src="..."> and <link href="..."> that reference non-existent files
   */
  private async checkMissingFileReferences(
    toolUses: ToolUse[],
    createdFiles: Set<string>,
    toolResults: ToolResult[]
  ): Promise<Array<{ htmlFile: string; tag: string; attr: string; file: string }>> {
    const missing: Array<{ htmlFile: string; tag: string; attr: string; file: string }> = [];

    // Find all HTML files that were created this turn
    const htmlWrites = toolUses.filter(tu =>
      (tu.name === 'either-write' || tu.name === 'either-line-replace') &&
      tu.input?.path?.toLowerCase().endsWith('.html')
    );

    for (const htmlWrite of htmlWrites) {
      const htmlPath = htmlWrite.input?.path;
      if (!htmlPath) continue;

      // Get the HTML content from the tool result
      const resultIdx = toolUses.indexOf(htmlWrite);
      const result = toolResults[resultIdx];
      if (!result || result.is_error) continue;

      // For either-write, the content is in the input
      const htmlContent = htmlWrite.name === 'either-write'
        ? htmlWrite.input?.content
        : null;

      if (!htmlContent || typeof htmlContent !== 'string') continue;

      // Extract script and link references using simple regex
      // <script src="...">
      const scriptMatches = htmlContent.matchAll(/<script[^>]+src=["']([^"']+)["']/gi);
      for (const match of scriptMatches) {
        const scriptPath = match[1];
        // Normalize path (remove leading ./ or /)
        const normalizedPath = scriptPath.replace(/^\.?\//, '');
        if (!createdFiles.has(normalizedPath) && !createdFiles.has(scriptPath)) {
          missing.push({
            htmlFile: htmlPath,
            tag: 'script',
            attr: 'src',
            file: scriptPath
          });
        }
      }

      // <link href="..." rel="stylesheet">
      const linkMatches = htmlContent.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]*>/gi);
      for (const match of linkMatches) {
        const fullTag = match[0];
        // Only check stylesheets, not other links
        if (fullTag.includes('stylesheet')) {
          const linkPath = match[1];
          const normalizedPath = linkPath.replace(/^\.?\//, '');
          if (!createdFiles.has(normalizedPath) && !createdFiles.has(linkPath)) {
            missing.push({
              htmlFile: htmlPath,
              tag: 'link',
              attr: 'href',
              file: linkPath
            });
          }
        }
      }
    }

    return missing;
  }
}
