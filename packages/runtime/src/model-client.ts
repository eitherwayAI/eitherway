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
    type: 'text' | 'tool_use';
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, any>;
  }>;
  stopReason: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
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
    }
  ): Promise<ModelResponse> {
    const params: Anthropic.MessageCreateParams = {
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      system: systemPrompt,
      messages: this.convertMessages(messages),
      tools: tools as any[], // Anthropic SDK types match our ToolDefinition
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
        outputTokens: response.usage.output_tokens
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
