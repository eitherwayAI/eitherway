export interface User {
  id: string;
  email: string;
  display_name: string | null;
  created_at: Date;
}

export interface Session {
  id: string;
  user_id: string;
  title: string;
  app_id: string | null;
  status: 'active' | 'archived';
  last_message_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface Message {
  id: string;
  session_id: string;
  role: MessageRole;
  content: any;
  model: string | null;
  token_count: number | null;
  created_at: Date;
}

export interface App {
  id: string;
  owner_id: string;
  name: string;
  visibility: 'private' | 'team' | 'public';
  default_session_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface File {
  id: string;
  app_id: string;
  path: string;
  is_binary: boolean;
  mime_type: string | null;
  size_bytes: number | null;
  sha256: Buffer | null;
  head_version_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface FileVersion {
  id: string;
  file_id: string;
  version: number;
  parent_version_id: string | null;
  content_text: string | null;
  content_bytes: Buffer | null;
  diff_from_parent: any | null;
  created_by: string | null;
  created_at: Date;
}

export type ReferenceType = 'import' | 'style' | 'asset' | 'link' | 'test' | 'build' | 'env' | 'other';

export interface FileReference {
  id: string;
  app_id: string;
  src_file_id: string;
  dest_file_id: string | null;
  raw_target: string | null;
  symbol: string | null;
  ref_type: ReferenceType;
  created_at: Date;
}

export interface SessionMemory {
  session_id: string;
  rolling_summary: string | null;
  facts: any | null;
  last_compacted_message_id: string | null;
  updated_at: Date;
}

export interface WorkingSetItem {
  session_id: string;
  app_id: string;
  file_id: string;
  reason: string | null;
  pinned_by: string | null;
  created_at: Date;
}

export type ImageJobState = 'queued' | 'generating' | 'succeeded' | 'failed' | 'canceled';

export interface ImageJob {
  id: string;
  session_id: string | null;
  app_id: string | null;
  prompt: string;
  model: string;
  size: string | null;
  n: number;
  state: ImageJobState;
  requested_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  error: any | null;
}

export interface ImageAsset {
  id: string;
  job_id: string;
  position: number;
  mime_type: string;
  bytes: Buffer | null;
  storage_url: string | null;
  checksum: Buffer | null;
  width: number | null;
  height: number | null;
  created_at: Date;
}

export interface Event {
  id: string;
  session_id: string | null;
  app_id: string | null;
  actor: string | null;
  kind: string | null;
  payload: any | null;
  created_at: Date;
}

export type EmbeddingScope = 'file' | 'symbol' | 'session' | 'chunk';

export interface DocEmbedding {
  id: string;
  app_id: string;
  scope: EmbeddingScope;
  ref_id: string | null;
  chunk_idx: number | null;
  vector: number[];
  content_preview: string | null;
  metadata: any | null;
  created_at: Date;
  updated_at: Date;
}

export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'const'
  | 'variable'
  | 'component'
  | 'hook'
  | 'endpoint'
  | 'model'
  | 'other';

export interface SymbolIndex {
  id: string;
  app_id: string;
  file_id: string;
  symbol_name: string;
  symbol_kind: SymbolKind;
  is_exported: boolean;
  line_start: number | null;
  line_end: number | null;
  signature: string | null;
  doc_comment: string | null;
  metadata: any | null;
  created_at: Date;
  updated_at: Date;
}

export type UsageKind = 'import' | 'call' | 'reference' | 'extend' | 'implement';

export interface SymbolUsage {
  id: string;
  app_id: string;
  symbol_id: string;
  usage_file_id: string;
  usage_line: number | null;
  usage_kind: UsageKind | null;
  created_at: Date;
}

export interface ProjectMetadata {
  app_id: string;
  framework: string | null;
  language: string | null;
  package_manager: string | null;
  entry_points: any | null;
  routes_map: any | null;
  dependencies: any | null;
  dev_dependencies: any | null;
  scripts: any | null;
  readme_summary: string | null;
  last_analyzed: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ContextCache {
  id: string;
  session_id: string;
  app_id: string | null;
  cache_key: string;
  context_data: any;
  token_count: number | null;
  expires_at: Date;
  created_at: Date;
}

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'canceled';

export interface BackgroundJob {
  id: string;
  job_type: string;
  target_id: string | null;
  payload: any | null;
  status: JobStatus;
  scheduled_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  error: any | null;
  retries: number;
  max_retries: number;
  created_at: Date;
}

export interface UserDailyLimit {
  user_id: string;
  limit_date: Date;
  sessions_created: number;
}

export interface SessionDailyLimit {
  session_id: string;
  limit_date: Date;
  messages_sent: number;
}
