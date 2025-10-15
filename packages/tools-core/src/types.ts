/**
 * Core type definitions for tools, messages, and configuration
 */

// Tool definition matching Anthropic's Messages API schema
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

// Tool input/output structures
export interface ToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface ToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string | Array<{ type: string; [key: string]: any }>;
  is_error?: boolean;
}

// Message types
export type MessageRole = 'user' | 'assistant';

export interface MessageContent {
  type: 'text' | 'tool_use' | 'tool_result' | 'server_tool_use' | 'web_search_tool_result';
  [key: string]: any;
}

export interface Message {
  role: MessageRole;
  content: string | MessageContent[];
}

// Claude API types
export interface ClaudeConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  topP?: number; // Optional - Claude 4.5 doesn't allow both temperature and topP
  streaming: boolean;
  provider: 'anthropic' | 'vertex' | 'bedrock';
  providerConfig?: {
    anthropic?: { baseURL: string };
    vertex?: { projectId: string; location: string; model: string };
    bedrock?: { region: string; modelId: string };
  };
  thinking?: {
    enabled: boolean;
    budget?: 'low' | 'medium' | 'high';
  };
  promptCaching?: {
    enabled: boolean;
  };
}

// Agent configuration
export interface AgentConfig {
  policy: {
    deterministic: boolean;
    singleAgent: boolean;
    parallelTools: boolean;
  };
  security: {
    allowedWorkspaces: string[];
    deniedPaths: string[];
    maxFileSize: number;
    secretPatterns: string[];
    redactSecrets: boolean;
  };
  limits: {
    maxToolPayloadSize: number;
    maxConcurrentTools: number;
    maxSearchResults: number;
    chunkSize: number;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    captureTranscripts: boolean;
    transcriptDir: string;
    logFile: string;
  };
  tools: {
    webSearch?: {
      enabled: boolean;
      maxUses?: number;
      allowedDomains?: string[];
      blockedDomains?: string[];
    };
    imagegen: {
      provider: string;
      defaultSize: string;
      supportedProviders: string[];
    };
  };
}

// Tool executor interface
export interface ToolExecutor {
  name: string;
  execute(input: Record<string, any>, context: ExecutionContext): Promise<ToolExecutorResult>;
}

export interface ExecutionContext {
  workingDir: string;
  allowedPaths: string[];
  deniedPaths: string[];
  config: AgentConfig;
  // Database integration (optional) - when present, tools should use DB instead of filesystem
  fileStore?: any; // FileStore from @eitherway/database
  appId?: string; // App ID for database file operations
  sessionId?: string; // Session ID for context
}

export interface ToolExecutorResult {
  content: string;
  isError: boolean;
  metadata?: Record<string, any>;
}

// Transcript capture
export interface TranscriptEntry {
  timestamp: string;
  role: MessageRole;
  content: string | MessageContent[];
  metadata?: {
    model?: string;
    tokenUsage?: {
      input: number;
      output: number;
    };
    stopReason?: string;
  };
}

export interface Transcript {
  id: string;
  startTime: string;
  endTime?: string;
  entries: TranscriptEntry[];
  request: string;
  result?: string;
}
