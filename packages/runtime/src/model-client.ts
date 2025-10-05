/**
 * Model Client for Claude Sonnet 4.5 with streaming support
 */

import Anthropic from '@anthropic-ai/sdk';
import { ClaudeConfig, Message, ToolDefinition } from '@eitherway/tools-core';

export interface StreamDelta {
  type: 'text' | 'tool_use';
  content: string;
  toolUseId?: string;
  toolName?: string;
}

export interface ModelResponse {
  id: string;
  role: 'assistant';
  content: Array<{
    type: 'text' | 'tool_use' | 'server_tool_use' | 'web_search_tool_result';
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, any>;
    tool_use_id?: string;
    content?: any;
  }>;
  stopReason: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    serverToolUse?: {
      webSearchRequests?: number;
    };
  };
}

export class ModelClient {
  private client: Anthropic;
  private config: ClaudeConfig;

  constructor(config: ClaudeConfig) {
    this.config = config;

    if (config.provider === 'anthropic') {
      this.client = new Anthropic({
        apiKey: config.apiKey,
        baseURL: config.providerConfig?.anthropic?.baseURL
      });
    } else {
      throw new Error(`Provider ${config.provider} not yet implemented. Use 'anthropic' for Portion 1.`);
    }
  }

  /**
   * Send a message with optional streaming
   */
  async sendMessage(
    messages: Message[],
    systemPrompt: string,
    tools: ToolDefinition[],
    options?: {
      onDelta?: (delta: StreamDelta) => void;
      onComplete?: (response: ModelResponse) => void;
      webSearchConfig?: {
        enabled: boolean;
        maxUses?: number;
        allowedDomains?: string[];
        blockedDomains?: string[];
      };
    }
  ): Promise<ModelResponse> {
    const allTools: any[] = [...tools];

    if (options?.webSearchConfig?.enabled) {
      const webSearchTool: any = {
        type: 'web_search_20250305',
        name: 'web_search'
      };

      if (options.webSearchConfig.maxUses !== undefined) {
        webSearchTool.max_uses = options.webSearchConfig.maxUses;
      }

      if (options.webSearchConfig.allowedDomains && options.webSearchConfig.allowedDomains.length > 0) {
        webSearchTool.allowed_domains = options.webSearchConfig.allowedDomains;
      }

      if (options.webSearchConfig.blockedDomains && options.webSearchConfig.blockedDomains.length > 0) {
        webSearchTool.blocked_domains = options.webSearchConfig.blockedDomains;
      }

      allTools.push(webSearchTool);
    }

    const params: Anthropic.MessageCreateParams = {
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      system: systemPrompt,
      messages: this.convertMessages(messages),
      tools: allTools,
    };

    // Claude 4.5 doesn't allow both temperature and top_p - only include one
    if (this.config.topP !== undefined) {
      params.top_p = this.config.topP;
    } else {
      params.temperature = this.config.temperature;
    }

    if (this.config.streaming && options?.onDelta) {
      return this.streamMessage(params, options.onDelta, options.onComplete);
    } else {
      return this.nonStreamMessage(params);
    }
  }

  /**
   * Streaming message handling
   */
  private async streamMessage(
    params: Anthropic.MessageCreateParams,
    onDelta: (delta: StreamDelta) => void,
    onComplete?: (response: ModelResponse) => void
  ): Promise<ModelResponse> {
    const stream = await this.client.messages.create({
      ...params,
      stream: true
    });

    let messageId = '';
    let stopReason: string | null = null;
    let inputTokens = 0;
    let outputTokens = 0;
    const contentBlocks: any[] = [];
    let currentTextBlock = '';
    let currentToolUse: any = null;

    for await (const event of stream) {
      switch (event.type) {
        case 'message_start':
          messageId = event.message.id;
          inputTokens = event.message.usage.input_tokens;
          break;

        case 'content_block_start':
          if (event.content_block.type === 'text') {
            currentTextBlock = '';
          } else if (event.content_block.type === 'tool_use') {
            currentToolUse = {
              type: 'tool_use',
              id: event.content_block.id,
              name: event.content_block.name,
              inputJson: ''
            };
          } else if ((event.content_block as any).type === 'server_tool_use') {
            currentToolUse = {
              type: 'server_tool_use',
              id: (event.content_block as any).id,
              name: (event.content_block as any).name,
              inputJson: ''
            };
          } else if ((event.content_block as any).type === 'web_search_tool_result') {
            contentBlocks.push({
              type: 'web_search_tool_result',
              tool_use_id: (event.content_block as any).tool_use_id,
              content: (event.content_block as any).content
            });
          }
          break;

        case 'content_block_delta':
          if (event.delta.type === 'text_delta') {
            currentTextBlock += event.delta.text;
            onDelta({ type: 'text', content: event.delta.text });
          } else if (event.delta.type === 'input_json_delta') {
            // Accumulate tool input JSON (parse only once on content_block_stop)
            if (currentToolUse) {
              currentToolUse.inputJson += event.delta.partial_json;
            }
          }
          break;

        case 'content_block_stop':
          if (currentTextBlock) {
            contentBlocks.push({ type: 'text', text: currentTextBlock });
            currentTextBlock = '';
          } else if (currentToolUse) {
            // Parse accumulated JSON once at the end
            try {
              currentToolUse.input = JSON.parse(currentToolUse.inputJson || '{}');
            } catch (e) {
              console.error('Failed to parse tool input JSON:', e);
              currentToolUse.input = {};
            }
            delete currentToolUse.inputJson;
            contentBlocks.push(currentToolUse);
            onDelta({
              type: 'tool_use',
              content: `[Tool: ${currentToolUse.name}]`,
              toolUseId: currentToolUse.id,
              toolName: currentToolUse.name
            });
            currentToolUse = null;
          }
          break;

        case 'message_delta':
          if (event.delta.stop_reason) {
            stopReason = event.delta.stop_reason;
          }
          if (event.usage) {
            outputTokens = event.usage.output_tokens;
          }
          break;

        case 'message_stop':
          // Stream complete
          break;
      }
    }

    const response: ModelResponse = {
      id: messageId,
      role: 'assistant',
      content: contentBlocks,
      stopReason,
      usage: {
        inputTokens,
        outputTokens
      }
    };

    if (onComplete) {
      onComplete(response);
    }

    return response;
  }

  /**
   * Non-streaming message handling
   */
  private async nonStreamMessage(
    params: Anthropic.MessageCreateParams
  ): Promise<ModelResponse> {
    const response = await this.client.messages.create({
      ...params,
      stream: false
    });

    return {
      id: response.id,
      role: 'assistant',
      content: response.content.map((block: any) => {
        if (block.type === 'text') {
          return { type: 'text', text: block.text };
        } else if (block.type === 'tool_use') {
          return {
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input
          };
        }
        return block;
      }),
      stopReason: response.stop_reason,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        serverToolUse: (response.usage as any).server_tool_use
      }
    };
  }

  /**
   * Convert our Message format to Anthropic's format
   */
  private convertMessages(messages: Message[]): Anthropic.MessageParam[] {
    return messages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: typeof msg.content === 'string'
        ? msg.content
        : msg.content as any
    }));
  }

  /**
   * Get current config
   */
  getConfig(): ClaudeConfig {
    return { ...this.config };
  }
}
