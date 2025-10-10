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

export { RateLimiter } from './services/rate-limiter.js';
export type { RateLimitResult } from './services/rate-limiter.js';

export { PlanValidator } from './services/plan-validator.js';
export type { Plan, PlanOperation, WriteOp, PatchOp, PackageInstallOp, PackageRemoveOp } from './services/plan-validator.js';

export { PlanExecutor } from './services/plan-executor.js';
export type { ExecutionResult, OperationResult } from './services/plan-executor.js';

export { PaletteExtractor } from './services/palette-extractor.js';
export type { RGB, HSL, ExtractedColor, PaletteExtractionOptions, PaletteExtractionResult } from './services/palette-extractor.js';

export { BrandKitsRepository, BrandAssetsRepository, BrandColorsRepository } from './repositories/brand-kits.js';
export type { BrandKit, BrandAsset, BrandColor } from './repositories/brand-kits.js';

export { PreviewConfigsRepository, PWAValidationsRepository, PreviewSessionsRepository } from './repositories/preview.js';
export type { PreviewConfig, PWAValidation, PreviewSession, CreatePreviewConfigInput, CreatePWAValidationInput, CreatePreviewSessionInput } from './repositories/preview.js';

export { PWAValidator } from './services/pwa-validator.js';
export type { PWAValidationResult, ManifestData, IconInfo } from './services/pwa-validator.js';

export { DeploymentsRepository, ExportsRepository } from './repositories/deployments.js';
export type { Deployment, Export, DeploymentLog } from './repositories/deployments.js';

export { UserIntegrationsRepository, NetlifySitesRepository } from './repositories/netlify.js';
export type { UserIntegration, NetlifySite, CreateIntegrationData, CreateNetlifySiteData } from './repositories/netlify.js';

export { DeploymentService } from './services/deployment-service.js';
export type { DeploymentConfig, DeploymentResult, DeploymentLogEntry, DeploymentStatus } from './services/deployment-service.js';

export { ExportService } from './services/export-service.js';
export type { ExportConfig, ExportResult, ExportStats } from './services/export-service.js';

export { NetlifyService } from './services/netlify-service.js';
export type { NetlifyDeployConfig, NetlifyDeployResult, NetlifyTokenValidationResult, NetlifyLogsAccessToken } from './services/netlify-service.js';

export { TelemetryService } from './services/telemetry-service.js';
export type {
  EventCategory,
  TelemetryEvent,
  MetricAggregates,
  TimeSeriesDataPoint,
  EventCounts,
  DailyEventSummary,
  HourlyPerformanceMetrics
} from './services/telemetry-service.js';

export { SecurityAuditor } from './services/security-auditor.js';
export type { SecurityEventType, EventSeverity, RateLimitType, SecurityEventContext, SecurityEvent, RateLimitViolation, RiskAssessment } from './services/security-auditor.js';

export { InputSanitizer } from './services/input-sanitizer.js';
export type { SanitizationResult, ValidationResult } from './services/input-sanitizer.js';

export { EnhancedRateLimiter } from './services/enhanced-rate-limiter.js';
export type { RateLimitConfig, RateLimitConfigs } from './services/enhanced-rate-limiter.js';

export type * from './types.js';
