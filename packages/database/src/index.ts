export { DatabaseClient, createDatabaseClient } from './client.js';
export type { DatabaseConfig } from './client.js';

export { UsersRepository } from './repositories/users.js';
export { SessionsRepository } from './repositories/sessions.js';
export { MessagesRepository } from './repositories/messages.js';
export { AppsRepository } from './repositories/apps.js';
export { FilesRepository, FileReferencesRepository } from './repositories/files.js';
export { SessionMemoryRepository, WorkingSetRepository } from './repositories/session-memory.js';
export { ImageJobsRepository, ImageAssetsRepository } from './repositories/images.js';
export { EventsRepository } from './repositories/events.js';

export { ImageGenerationService } from './services/image-generator.js';
export type { ImageGenerationOptions } from './services/image-generator.js';

export { ImpactedFilesAnalyzer } from './services/impacted-analyzer.js';
export type { ImpactAnalysisResult } from './services/impacted-analyzer.js';

export { AtomicFileWriter } from './services/atomic-file-writer.js';
export type { AtomicWriteResult } from './services/atomic-file-writer.js';

export { MemoryPreludeService } from './services/memory-prelude.js';
export type { MemoryPrelude } from './services/memory-prelude.js';

export { DiffBuilder } from './services/diff-builder.js';
export type { FileDiff, DiffContext } from './services/diff-builder.js';

export { IntegrityChecker } from './services/integrity-checker.js';
export type { FileIntegrityResult, ImageIntegrityResult } from './services/integrity-checker.js';

export { PreparedQueries } from './services/prepared-queries.js';

export { PostgresFileStore } from './services/file-store.js';
export type { FileStore, FileNode, FileContent } from './services/file-store.js';

export type * from './types.js';
