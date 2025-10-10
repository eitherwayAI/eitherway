# Phase 1 Development Plan - Implementation Architecture

## Epic Overview

1. **EPIC A** - Plan Application Engine (Foundation)
2. **EPIC B** - Brand Kit Uploads (Asset Management)
3. **EPIC C** - Mobile/Web Preview + PWA (Testing UX)
4. **EPIC D** - Security Hardening (Integrated with A)
5. **EPIC E** - Deploy/Export (Delivery)
6. **EPIC F** - Telemetry & Observability (Metrics)

---

## EPIC A — Plan Application Engine

### Purpose
Safe execution of AI-generated plans with validation, logging, and idempotency.

### Database Schema Changes

```sql
-- Migration 007: Plan Execution System

-- Plan Operations Log
CREATE TABLE IF NOT EXISTS core.plan_operations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES core.sessions(id) ON DELETE CASCADE,
  app_id            UUID REFERENCES core.apps(id) ON DELETE CASCADE,
  plan_id           UUID NOT NULL,  -- Client-generated plan identifier
  operation_index   INT NOT NULL,   -- Order in plan
  operation_type    TEXT NOT NULL CHECK (operation_type IN ('write', 'patch', 'package_install', 'package_remove')),
  operation_params  JSONB NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed', 'skipped')),
  result            JSONB,          -- Success result or error details
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, operation_index)
);

CREATE INDEX IF NOT EXISTS plan_operations_plan ON core.plan_operations(plan_id, operation_index);
CREATE INDEX IF NOT EXISTS plan_operations_session ON core.plan_operations(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS plan_operations_status ON core.plan_operations(status);

-- Plan Execution Summary
CREATE TABLE IF NOT EXISTS core.plan_executions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         UUID NOT NULL UNIQUE,
  session_id      UUID NOT NULL REFERENCES core.sessions(id) ON DELETE CASCADE,
  app_id          UUID REFERENCES core.apps(id) ON DELETE CASCADE,
  total_ops       INT NOT NULL,
  succeeded_ops   INT NOT NULL DEFAULT 0,
  failed_ops      INT NOT NULL DEFAULT 0,
  skipped_ops     INT NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'partial')),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plan_executions_session ON core.plan_executions(session_id, created_at DESC);
```

### Backend Components

#### 1. Plan Validator (`/packages/database/src/services/plan-validator.ts`)

```typescript
import { z } from 'zod';

// Operation schemas
const WriteOpSchema = z.object({
  type: z.literal('write'),
  path: z.string().regex(/^[\w\-\/\.]+$/), // Alphanumeric, -, /, .
  content: z.string().max(500_000), // 500KB limit
  overwrite: z.boolean().optional()
});

const PatchOpSchema = z.object({
  type: z.literal('patch'),
  path: z.string().regex(/^[\w\-\/\.]+$/),
  search: z.string().min(1),
  replace: z.string()
});

const PackageInstallSchema = z.object({
  type: z.literal('package_install'),
  packages: z.array(z.string().regex(/^[@\w\-\/]+$/)).min(1).max(20),
  dev: z.boolean().optional()
});

const PackageRemoveSchema = z.object({
  type: z.literal('package_remove'),
  packages: z.array(z.string()).min(1).max(20)
});

const PlanOperationSchema = z.discriminatedUnion('type', [
  WriteOpSchema,
  PatchOpSchema,
  PackageInstallSchema,
  PackageRemoveSchema
]);

const PlanSchema = z.object({
  planId: z.string().uuid(),
  sessionId: z.string().uuid(),
  operations: z.array(PlanOperationSchema).min(1).max(100)
});

export type PlanOperation = z.infer<typeof PlanOperationSchema>;
export type Plan = z.infer<typeof PlanSchema>;

export class PlanValidator {
  // Allowed file paths
  private static ALLOWED_DIRS = [
    /^app\//,
    /^docs\//,
    /^public\//,
    /^components\//,
    /^lib\//,
    /^utils\//,
    /^styles\//,
    /^api\//,
    /^package\.json$/,
    /^README\.md$/,
    /^\.env\.example$/,
    /^tsconfig\.json$/,
    /^vite\.config\.(ts|js)$/,
    /^tailwind\.config\.(ts|js)$/
  ];

  // Blocked paths (security)
  private static BLOCKED_PATTERNS = [
    /\.\./,           // Parent directory traversal
    /^\/etc\//,       // System directories
    /^\/root\//,
    /^\/home\//,
    /\.env$/,         // Actual .env files (allow .env.example)
    /\.ssh\//,
    /\.git\//,
    /node_modules\//,
    /\.secret/,
    /credentials/
  ];

  validate(planData: unknown): { success: true; plan: Plan } | { success: false; errors: string[] } {
    const parsed = PlanSchema.safeParse(planData);

    if (!parsed.success) {
      return {
        success: false,
        errors: parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      };
    }

    const plan = parsed.data;
    const errors: string[] = [];

    // Validate each operation's paths
    plan.operations.forEach((op, idx) => {
      if (op.type === 'write' || op.type === 'patch') {
        if (!this.isPathSafe(op.path)) {
          errors.push(`Operation ${idx}: Path '${op.path}' is not allowed`);
        }
      }
    });

    if (errors.length > 0) {
      return { success: false, errors };
    }

    return { success: true, plan };
  }

  private isPathSafe(path: string): boolean {
    // Check blocked patterns
    for (const pattern of PlanValidator.BLOCKED_PATTERNS) {
      if (pattern.test(path)) {
        return false;
      }
    }

    // Check allowed directories
    for (const pattern of PlanValidator.ALLOWED_DIRS) {
      if (pattern.test(path)) {
        return true;
      }
    }

    return false;
  }
}
```

#### 2. Plan Executor (`/packages/database/src/services/plan-executor.ts`)

```typescript
import { DatabaseClient } from '../client.js';
import { PostgresFileStore } from './file-store.js';
import { EventsRepository } from '../repositories/events.js';
import type { Plan, PlanOperation } from './plan-validator.js';

export interface ExecutionResult {
  planId: string;
  totalOps: number;
  succeededOps: number;
  failedOps: number;
  skippedOps: number;
  status: 'completed' | 'failed' | 'partial';
  operations: Array<{
    index: number;
    type: string;
    status: 'success' | 'failed' | 'skipped';
    result?: any;
    error?: string;
  }>;
  logPath: string;
}

export class PlanExecutor {
  private fileStore: PostgresFileStore;
  private eventsRepo: EventsRepository;

  constructor(private db: DatabaseClient) {
    this.fileStore = new PostgresFileStore(db);
    this.eventsRepo = new EventsRepository(db);
  }

  async execute(plan: Plan, appId: string): Promise<ExecutionResult> {
    const { planId, sessionId, operations } = plan;

    // Create plan execution record
    await this.db.query(
      `INSERT INTO core.plan_executions (plan_id, session_id, app_id, total_ops, status, started_at)
       VALUES ($1, $2, $3, $4, 'running', now())`,
      [planId, sessionId, appId, operations.length]
    );

    const results: ExecutionResult['operations'] = [];
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    // Execute operations sequentially
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];

      try {
        // Record operation start
        await this.db.query(
          `INSERT INTO core.plan_operations
           (plan_id, session_id, app_id, operation_index, operation_type, operation_params, status, started_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'running', now())`,
          [planId, sessionId, appId, i, op.type, JSON.stringify(op)]
        );

        const result = await this.executeOperation(op, appId);

        // Record success
        await this.db.query(
          `UPDATE core.plan_operations
           SET status = 'success', result = $1, completed_at = now()
           WHERE plan_id = $2 AND operation_index = $3`,
          [JSON.stringify(result), planId, i]
        );

        results.push({ index: i, type: op.type, status: 'success', result });
        succeeded++;

        // Log event
        await this.eventsRepo.log('plan.operation.success', {
          planId,
          operationIndex: i,
          operationType: op.type
        }, { sessionId, appId, actor: 'system' });

      } catch (error: any) {
        // Record failure
        await this.db.query(
          `UPDATE core.plan_operations
           SET status = 'failed', result = $1, completed_at = now()
           WHERE plan_id = $2 AND operation_index = $3`,
          [JSON.stringify({ error: error.message }), planId, i]
        );

        results.push({
          index: i,
          type: op.type,
          status: 'failed',
          error: error.message
        });
        failed++;

        // Log event
        await this.eventsRepo.log('plan.operation.failed', {
          planId,
          operationIndex: i,
          operationType: op.type,
          error: error.message
        }, { sessionId, appId, actor: 'system' });

        // Stop on first failure (can be made configurable)
        break;
      }
    }

    // Determine final status
    let finalStatus: 'completed' | 'failed' | 'partial';
    if (failed === 0) {
      finalStatus = 'completed';
    } else if (succeeded === 0) {
      finalStatus = 'failed';
    } else {
      finalStatus = 'partial';
    }

    // Update plan execution summary
    await this.db.query(
      `UPDATE core.plan_executions
       SET succeeded_ops = $1, failed_ops = $2, skipped_ops = $3,
           status = $4, completed_at = now()
       WHERE plan_id = $5`,
      [succeeded, failed, skipped, finalStatus, planId]
    );

    // Generate apply log JSON
    const logPath = `/plan/apply-log.json`;
    const logContent = JSON.stringify({
      planId,
      executedAt: new Date().toISOString(),
      status: finalStatus,
      summary: {
        total: operations.length,
        succeeded,
        failed,
        skipped
      },
      operations: results
    }, null, 2);

    await this.fileStore.write(appId, logPath, logContent, 'application/json');

    return {
      planId,
      totalOps: operations.length,
      succeededOps: succeeded,
      failedOps: failed,
      skippedOps: skipped,
      status: finalStatus,
      operations: results,
      logPath
    };
  }

  private async executeOperation(op: PlanOperation, appId: string): Promise<any> {
    switch (op.type) {
      case 'write':
        await this.fileStore.write(appId, op.path, op.content, 'text/plain');
        return { path: op.path, size: op.content.length };

      case 'patch':
        const file = await this.fileStore.read(appId, op.path);
        let content = typeof file.content === 'string'
          ? file.content
          : Buffer.from(file.content).toString('utf-8');

        const newContent = content.replace(op.search, op.replace);

        if (newContent === content) {
          throw new Error(`Pattern '${op.search}' not found in ${op.path}`);
        }

        await this.fileStore.write(appId, op.path, newContent, file.mimeType);
        return { path: op.path, patched: true };

      case 'package_install':
        // Update package.json
        return await this.updatePackageJson(appId, 'add', op.packages, op.dev);

      case 'package_remove':
        return await this.updatePackageJson(appId, 'remove', op.packages, false);

      default:
        throw new Error(`Unknown operation type: ${(op as any).type}`);
    }
  }

  private async updatePackageJson(
    appId: string,
    action: 'add' | 'remove',
    packages: string[],
    isDev?: boolean
  ): Promise<any> {
    const pkgPath = 'package.json';
    const file = await this.fileStore.read(appId, pkgPath);
    const content = typeof file.content === 'string'
      ? file.content
      : Buffer.from(file.content).toString('utf-8');

    const pkg = JSON.parse(content);
    const depsKey = isDev ? 'devDependencies' : 'dependencies';

    if (!pkg[depsKey]) {
      pkg[depsKey] = {};
    }

    if (action === 'add') {
      packages.forEach(p => {
        pkg[depsKey][p] = 'latest';  // Could fetch actual versions from npm
      });
    } else {
      packages.forEach(p => {
        delete pkg[depsKey][p];
      });
    }

    await this.fileStore.write(appId, pkgPath, JSON.stringify(pkg, null, 2), 'application/json');

    return {
      action,
      packages,
      dev: isDev,
      updated: pkgPath
    };
  }
}
```

#### 3. API Route (`/packages/ui-server/src/routes/plans.ts`)

```typescript
import { FastifyInstance } from 'fastify';
import { DatabaseClient, SessionsRepository, EventsRepository } from '@eitherway/database';
import { PlanValidator } from '@eitherway/database';
import { PlanExecutor } from '@eitherway/database';

export async function registerPlanRoutes(
  fastify: FastifyInstance,
  db: DatabaseClient
) {
  const validator = new PlanValidator();
  const executor = new PlanExecutor(db);
  const sessionsRepo = new SessionsRepository(db);
  const eventsRepo = new EventsRepository(db);

  // POST /api/projects/apply-plan
  fastify.post<{
    Body: {
      planId: string;
      sessionId: string;
      operations: any[];
    };
  }>('/api/projects/apply-plan', async (request, reply) => {
    const { planId, sessionId, operations } = request.body;

    // Validate plan
    const validation = validator.validate({ planId, sessionId, operations });

    if (!validation.success) {
      await eventsRepo.log('plan.validation_failed', {
        planId,
        errors: validation.errors
      }, { sessionId, appId: null, actor: 'user' });

      return reply.code(400).send({
        error: 'Invalid plan',
        details: validation.errors
      });
    }

    const plan = validation.plan;

    // Get session and ensure app_id exists
    const session = await sessionsRepo.findById(sessionId);

    if (!session) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    let appId = session.app_id;

    if (!appId) {
      // Auto-create app like in session-files.ts
      const { AppsRepository } = await import('@eitherway/database');
      const appsRepo = new AppsRepository(db);
      const app = await appsRepo.create(session.user_id, session.title || 'Generated App', 'private');
      appId = app.id;
      await sessionsRepo.update(sessionId, { app_id: appId });
    }

    // Log plan start
    await eventsRepo.log('plan.started', {
      planId,
      operationCount: operations.length
    }, { sessionId, appId, actor: 'user' });

    try {
      // Execute plan
      const result = await executor.execute(plan, appId);

      // Log completion
      await eventsRepo.log('plan.completed', {
        planId,
        status: result.status,
        succeeded: result.succeededOps,
        failed: result.failedOps
      }, { sessionId, appId, actor: 'system' });

      return {
        success: true,
        result
      };
    } catch (error: any) {
      await eventsRepo.log('plan.failed', {
        planId,
        error: error.message
      }, { sessionId, appId, actor: 'system' });

      return reply.code(500).send({
        error: 'Plan execution failed',
        message: error.message
      });
    }
  });

  // GET /api/projects/plans/:planId
  fastify.get<{
    Params: { planId: string };
  }>('/api/projects/plans/:planId', async (request, reply) => {
    const { planId } = request.params;

    const execution = await db.query(
      `SELECT * FROM core.plan_executions WHERE plan_id = $1`,
      [planId]
    );

    if (execution.rows.length === 0) {
      return reply.code(404).send({ error: 'Plan not found' });
    }

    const operations = await db.query(
      `SELECT * FROM core.plan_operations
       WHERE plan_id = $1
       ORDER BY operation_index ASC`,
      [planId]
    );

    return {
      execution: execution.rows[0],
      operations: operations.rows
    };
  });
}
```

### Frontend Components

#### Plan Progress Panel (`/packages/ui-frontend/app/components/plan/PlanProgress.tsx`)

```typescript
import { useState, useEffect } from 'react';

interface PlanProgressProps {
  planId: string;
  sessionId: string;
}

export function PlanProgress({ planId, sessionId }: PlanProgressProps) {
  const [status, setStatus] = useState<any>(null);
  const [operations, setOperations] = useState<any[]>([]);

  useEffect(() => {
    // Poll for updates
    const interval = setInterval(async () => {
      const response = await fetch(`/api/projects/plans/${planId}`);
      const data = await response.json();

      setStatus(data.execution);
      setOperations(data.operations);

      if (data.execution.status !== 'running') {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [planId]);

  if (!status) {
    return <div>Loading plan execution...</div>;
  }

  return (
    <div className="plan-progress">
      <h3>Plan Execution: {status.status}</h3>
      <div>
        {status.succeeded_ops} succeeded / {status.failed_ops} failed / {status.total_ops} total
      </div>

      <div className="operations-list">
        {operations.map((op) => (
          <div key={op.id} className={`op-item op-${op.status}`}>
            <span>{op.operation_index}.</span>
            <span>{op.operation_type}</span>
            <span className={`status-${op.status}`}>{op.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Testing Strategy

1. **Unit Tests**: Validator with fuzzed inputs
2. **Integration Tests**: Executor with sample plans
3. **E2E Tests**: Full plan application through API

---

## EPIC B — Brand Kit Uploads

### Purpose
Allow users to upload brand assets (logo, color palette, typography) for AI to use in generation.

### Database Schema Changes

```sql
-- Migration 008: Brand Assets

-- Brand Kits
CREATE TABLE IF NOT EXISTS core.brand_kits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id          UUID NOT NULL REFERENCES core.apps(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES core.users(id),
  name            TEXT NOT NULL,
  logo_url        TEXT,
  logo_mime_type  TEXT,
  color_palette   JSONB,  -- {primary: '#...', secondary: '#...', accent: '#...'}
  typography      JSONB,  -- {heading: 'Font Name', body: 'Font Name'}
  assets_metadata JSONB,  -- Additional brand guidelines
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (app_id)
);

CREATE INDEX IF NOT EXISTS brand_kits_app ON core.brand_kits(app_id);
CREATE INDEX IF NOT EXISTS brand_kits_user ON core.brand_kits(user_id, created_at DESC);

-- Asset Uploads (tracking upload state)
CREATE TABLE IF NOT EXISTS core.asset_uploads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES core.users(id),
  app_id          UUID REFERENCES core.apps(id),
  upload_key      TEXT NOT NULL,  -- S3 object key
  signed_url      TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  size_bytes      INT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'completed', 'failed')),
  storage_url     TEXT,
  expires_at      TIMESTAMPTZ NOT NULL,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS asset_uploads_user ON core.asset_uploads(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS asset_uploads_status ON core.asset_uploads(status, expires_at);
```

### Backend Components

#### 1. S3/GCS Service (`/packages/database/src/services/asset-storage.ts`)

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface SignedUploadUrl {
  uploadId: string;
  uploadUrl: string;
  storageKey: string;
  expiresIn: number;
}

export class AssetStorage {
  private s3Client: S3Client;
  private bucket: string;

  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
      }
    });
    this.bucket = process.env.S3_BUCKET || 'eitherway-assets';
  }

  async generateUploadUrl(
    userId: string,
    filename: string,
    mimeType: string,
    sizeBytes: number
  ): Promise<SignedUploadUrl> {
    // Validation
    if (!this.isValidMimeType(mimeType)) {
      throw new Error(`Invalid mime type: ${mimeType}`);
    }

    if (sizeBytes > 10 * 1024 * 1024) {  // 10MB limit
      throw new Error(`File too large: ${sizeBytes} bytes (max 10MB)`);
    }

    const uploadId = crypto.randomUUID();
    const storageKey = `brands/${userId}/${uploadId}/${filename}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ContentType: mimeType,
      ContentLength: sizeBytes
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 3600  // 1 hour
    });

    return {
      uploadId,
      uploadUrl,
      storageKey,
      expiresIn: 3600
    };
  }

  getPublicUrl(storageKey: string): string {
    return `https://${this.bucket}.s3.amazonaws.com/${storageKey}`;
  }

  private isValidMimeType(mimeType: string): boolean {
    const allowed = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/svg+xml',
      'image/webp'
    ];
    return allowed.includes(mimeType);
  }
}
```

#### 2. Color Palette Extractor (`/packages/database/src/services/palette-extractor.ts`)

```typescript
import sharp from 'sharp';

export interface ColorPalette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export class PaletteExtractor {
  async extractFromImage(imageBuffer: Buffer): Promise<ColorPalette> {
    // Resize and get dominant colors
    const { dominant, data } = await sharp(imageBuffer)
      .resize(100, 100, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Simple color extraction (in production, use a library like 'node-vibrant')
    const colors = this.analyzePixels(data);

    return {
      primary: colors[0] || '#3B82F6',
      secondary: colors[1] || '#8B5CF6',
      accent: colors[2] || '#EC4899',
      background: '#FFFFFF',
      text: '#000000'
    };
  }

  private analyzePixels(buffer: Buffer): string[] {
    // Simplified color extraction
    // In production, use clustering algorithm (k-means) to find dominant colors
    const pixels: { r: number; g: number; b: number; count: number }[] = [];

    for (let i = 0; i < buffer.length; i += 3) {
      const r = buffer[i];
      const g = buffer[i + 1];
      const b = buffer[i + 2];

      // Skip near-white and near-black pixels
      if (r > 240 && g > 240 && b > 240) continue;
      if (r < 15 && g < 15 && b < 15) continue;

      pixels.push({ r, g, b, count: 1 });
    }

    // Simple frequency count (replace with proper clustering)
    const topColors = pixels
      .slice(0, 3)
      .map(p => `#${((1 << 24) + (p.r << 16) + (p.g << 8) + p.b).toString(16).slice(1)}`);

    return topColors;
  }
}
```

#### 3. API Routes (`/packages/ui-server/src/routes/assets.ts`)

```typescript
import { FastifyInstance } from 'fastify';
import { DatabaseClient, EventsRepository } from '@eitherway/database';
import { AssetStorage } from '@eitherway/database';
import { PaletteExtractor } from '@eitherway/database';

export async function registerAssetRoutes(
  fastify: FastifyInstance,
  db: DatabaseClient
) {
  const storage = new AssetStorage();
  const paletteExtractor = new PaletteExtractor();
  const eventsRepo = new EventsRepository(db);

  // POST /api/assets/upload-url
  fastify.post<{
    Body: {
      userId: string;
      appId?: string;
      filename: string;
      mimeType: string;
      sizeBytes: number;
    };
  }>('/api/assets/upload-url', async (request, reply) => {
    const { userId, appId, filename, mimeType, sizeBytes } = request.body;

    try {
      const uploadData = await storage.generateUploadUrl(userId, filename, mimeType, sizeBytes);

      // Record upload intent
      await db.query(
        `INSERT INTO core.asset_uploads
         (id, user_id, app_id, upload_key, signed_url, mime_type, size_bytes, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', now() + interval '1 hour')`,
        [
          uploadData.uploadId,
          userId,
          appId || null,
          uploadData.storageKey,
          uploadData.uploadUrl,
          mimeType,
          sizeBytes
        ]
      );

      return {
        uploadId: uploadData.uploadId,
        uploadUrl: uploadData.uploadUrl,
        expiresIn: uploadData.expiresIn
      };
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });

  // POST /api/assets/complete
  fastify.post<{
    Body: {
      uploadId: string;
      extractPalette?: boolean;
    };
  }>('/api/assets/complete', async (request, reply) => {
    const { uploadId, extractPalette = true } = request.body;

    // Get upload record
    const uploadResult = await db.query(
      `SELECT * FROM core.asset_uploads WHERE id = $1`,
      [uploadId]
    );

    if (uploadResult.rows.length === 0) {
      return reply.code(404).send({ error: 'Upload not found' });
    }

    const upload = uploadResult.rows[0];
    const storageUrl = storage.getPublicUrl(upload.upload_key);

    // Update upload status
    await db.query(
      `UPDATE core.asset_uploads
       SET status = 'completed', storage_url = $1, completed_at = now()
       WHERE id = $2`,
      [storageUrl, uploadId]
    );

    let palette = null;

    // Extract color palette if requested
    if (extractPalette && upload.mime_type.startsWith('image/')) {
      try {
        // Fetch image from S3
        const response = await fetch(storageUrl);
        const imageBuffer = Buffer.from(await response.arrayBuffer());

        palette = await paletteExtractor.extractFromImage(imageBuffer);
      } catch (error: any) {
        console.error('Palette extraction failed:', error);
      }
    }

    // Create or update brand kit
    if (upload.app_id) {
      await db.query(
        `INSERT INTO core.brand_kits (app_id, user_id, name, logo_url, logo_mime_type, color_palette)
         VALUES ($1, $2, 'Brand Kit', $3, $4, $5)
         ON CONFLICT (app_id)
         DO UPDATE SET logo_url = EXCLUDED.logo_url,
                       logo_mime_type = EXCLUDED.logo_mime_type,
                       color_palette = EXCLUDED.color_palette,
                       updated_at = now()`,
        [
          upload.app_id,
          upload.user_id,
          storageUrl,
          upload.mime_type,
          JSON.stringify(palette)
        ]
      );

      await eventsRepo.log('brand.uploaded', {
        uploadId,
        appId: upload.app_id,
        hasPalette: !!palette
      }, {
        sessionId: null,
        appId: upload.app_id,
        actor: 'user'
      });
    }

    return {
      success: true,
      uploadId,
      storageUrl,
      palette
    };
  });

  // GET /api/assets/brand-kit/:appId
  fastify.get<{
    Params: { appId: string };
  }>('/api/assets/brand-kit/:appId', async (request, reply) => {
    const { appId } = request.params;

    const result = await db.query(
      `SELECT * FROM core.brand_kits WHERE app_id = $1`,
      [appId]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Brand kit not found' });
    }

    return result.rows[0];
  });
}
```

### Frontend Components

#### Upload Component (`/packages/ui-frontend/app/components/brand/BrandKitUpload.tsx`)

```typescript
import { useState } from 'react';
import { toast } from 'react-toastify';

export function BrandKitUpload({ appId, onComplete }: { appId: string; onComplete?: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [palette, setPalette] = useState<any>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?[0];
    if (!file) return;

    // Validation
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be under 10MB');
      return;
    }

    setUploading(true);

    try {
      // 1. Get signed upload URL
      const urlResponse = await fetch('/api/assets/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'user@eitherway.app',  // Get from auth
          appId,
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size
        })
      });

      const { uploadId, uploadUrl } = await urlResponse.json();

      // 2. Upload directly to S3
      await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
          'Content-Length': file.size.toString()
        }
      });

      // 3. Complete upload and extract palette
      const completeResponse = await fetch('/api/assets/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId,
          extractPalette: true
        })
      });

      const { palette, storageUrl } = await completeResponse.json();

      setPalette(palette);
      toast.success('Brand kit uploaded successfully!');

      if (onComplete) onComplete();
    } catch (error: any) {
      toast.error(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="brand-kit-upload">
      <label className="upload-button">
        <input
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          disabled={uploading}
          style={{ display: 'none' }}
        />
        {uploading ? 'Uploading...' : 'Upload Brand Logo'}
      </label>

      {palette && (
        <div className="color-palette">
          <h3>Extracted Palette</h3>
          <div className="color-swatches">
            <div style={{ background: palette.primary }}>Primary</div>
            <div style={{ background: palette.secondary }}>Secondary</div>
            <div style={{ background: palette.accent }}>Accent</div>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## EPIC C — Mobile/Web Preview + PWA Checks

### Frontend Components Only (No DB changes needed)

#### Device Presets (`/packages/ui-frontend/app/lib/previewPresets.ts`)

```typescript
export interface DevicePreset {
  id: string;
  name: string;
  width: number;
  height: number;
  userAgent: string;
  pixelRatio: number;
}

// iPhone 17 Pro Max specifications
export const IPHONE_17_PRO_MAX: DevicePreset = {
  id: 'iphone-17-pro-max',
  name: 'iPhone 17 Pro Max',
  width: 430,  // Portrait width in logical pixels
  height: 932, // Portrait height in logical pixels
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  pixelRatio: 3  // 3x retina display
};

export type Orientation = 'portrait' | 'landscape';

export function getPresetDimensions(preset: DevicePreset, orientation: Orientation) {
  if (orientation === 'landscape') {
    return { width: preset.height, height: preset.width };
  }
  return { width: preset.width, height: preset.height };
}
```

#### Preview Toolbar Component (`/packages/ui-frontend/app/components/workbench/PreviewToolbar.tsx`)

```typescript
import { useState, useEffect } from 'react';
import { IPHONE_17_PRO_MAX, type Orientation, getPresetDimensions } from '~/lib/previewPresets';
import { workbenchStore } from '~/lib/stores/workbench';

export function PreviewToolbar() {
  const [orientation, setOrientation] = useState<Orientation>('portrait');

  // Set initial device on mount
  useEffect(() => {
    workbenchStore.setPreviewDevice(IPHONE_17_PRO_MAX, orientation);
  }, []);

  const toggleOrientation = () => {
    const newOrientation = orientation === 'portrait' ? 'landscape' : 'portrait';
    setOrientation(newOrientation);
    workbenchStore.setPreviewDevice(IPHONE_17_PRO_MAX, newOrientation);
  };

  const dimensions = getPresetDimensions(IPHONE_17_PRO_MAX, orientation);

  return (
    <div className="preview-toolbar flex items-center gap-2 px-3 py-2 border-b border-eitherway-elements-borderColor">
      {/* Device info label */}
      <div className="flex items-center gap-2 px-2 py-1 bg-black/50 border border-eitherway-elements-borderColor rounded text-sm">
        <div className="i-ph:device-mobile text-base" />
        <span className="text-eitherway-elements-textPrimary">
          {IPHONE_17_PRO_MAX.name} ({dimensions.width}×{dimensions.height})
        </span>
      </div>

      {/* Orientation toggle button */}
      <button
        onClick={toggleOrientation}
        className="px-2 py-1 bg-black border border-eitherway-elements-borderColor rounded text-sm hover:bg-eitherway-elements-item-backgroundActive transition-colors"
        title={`Switch to ${orientation === 'portrait' ? 'landscape' : 'portrait'} mode`}
      >
        <div className={`i-ph:device-rotate text-base transition-transform ${orientation === 'landscape' ? 'rotate-90' : ''}`} />
      </button>

      <PWAStatus />
    </div>
  );
}

function PWAStatus() {
  const [hasPWA, setHasPWA] = useState<boolean | null>(null);

  useEffect(() => {
    // Check for manifest.json and service worker in WebContainer
    checkPWAStatus().then(setHasPWA);
  }, []);

  async function checkPWAStatus(): Promise<boolean> {
    try {
      // Fetch manifest.json from preview
      const manifestResponse = await fetch('/manifest.json');
      const hasManifest = manifestResponse.ok;

      // Check if service worker is registered (in preview context)
      // This would need to be done via postMessage to preview iframe

      return hasManifest;
    } catch {
      return false;
    }
  }

  if (hasPWA === null) return null;

  return (
    <div className={`ml-auto flex items-center gap-2 text-sm ${hasPWA ? 'text-green-400' : 'text-gray-500'}`}>
      <div className={hasPWA ? 'i-ph:check-circle-fill' : 'i-ph:warning-circle'} />
      <span>{hasPWA ? 'PWA Ready' : 'Not PWA'}</span>
    </div>
  );
}
```

#### Enhanced Preview Component (`/packages/ui-frontend/app/components/workbench/Preview.tsx`)

```typescript
// Add to existing Preview.tsx

import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { getPresetDimensions } from '~/lib/previewPresets';
import { PreviewToolbar } from './PreviewToolbar';

export const Preview = memo(() => {
  const previewDevice = useStore(workbenchStore.previewDevice);
  const previewOrientation = useStore(workbenchStore.previewOrientation);

  const dimensions = previewDevice
    ? getPresetDimensions(previewDevice, previewOrientation)
    : { width: '100%', height: '100%' };

  const scale = calculateScale(dimensions);

  return (
    <div className="h-full flex flex-col">
      <PreviewToolbar />

      <div className="flex-1 overflow-auto bg-gray-900 p-4">
        <div
          className="preview-frame mx-auto bg-white"
          style={{
            width: dimensions.width,
            height: dimensions.height,
            transform: `scale(${scale})`,
            transformOrigin: 'top center'
          }}
        >
          <iframe
            className="w-full h-full border-0"
            src={previewUrl}
            title="Preview"
          />
        </div>
      </div>
    </div>
  );
});

function calculateScale(dimensions: { width: number | string; height: number | string }): number {
  if (typeof dimensions.width !== 'number') return 1;

  // Scale to fit container (max 90% of available space)
  const containerWidth = window.innerWidth * 0.5; // Assuming 50% width workbench
  const scale = Math.min(1, (containerWidth * 0.9) / dimensions.width);

  return scale;
}
```

#### Workbench Store Extension (`/packages/ui-frontend/app/lib/stores/workbench.ts`)

```typescript
// Add to existing workbenchStore

import { atom } from 'nanostores';
import type { DevicePreset, Orientation } from '../previewPresets';

export const previewDevice = atom<DevicePreset | null>(null);
export const previewOrientation = atom<Orientation>('portrait');

export function setPreviewDevice(device: DevicePreset, orientation: Orientation) {
  previewDevice.set(device);
  previewOrientation.set(orientation);
}
```

---

## EPIC D — Security Hardening

### Integrated into EPIC A (PlanValidator)

Additional hardening:

#### Input Sanitization Service (`/packages/database/src/services/input-sanitizer.ts`)

```typescript
import { z } from 'zod';

export class InputSanitizer {
  /**
   * Sanitize brand metadata to prevent XSS
   */
  static sanitizeBrandMetadata(data: any): any {
    const BrandMetadataSchema = z.object({
      name: z.string().max(100),
      logoUrl: z.string().url(),
      colorPalette: z.object({
        primary: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
        secondary: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
        accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      }),
      typography: z.object({
        heading: z.string().max(50).regex(/^[a-zA-Z\s]+$/),
        body: z.string().max(50).regex(/^[a-zA-Z\s]+$/),
      }).optional()
    });

    const parsed = BrandMetadataSchema.safeParse(data);

    if (!parsed.success) {
      throw new Error('Invalid brand metadata');
    }

    return parsed.data;
  }

  /**
   * Strip any script tags or event handlers from string content
   */
  static stripDangerousContent(content: string): string {
    return content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/javascript:/gi, '');
  }
}
```

#### Unit Tests (`/packages/database/src/tests/plan-validator.test.ts`)

```typescript
import { describe, it, expect } from 'vitest';
import { PlanValidator } from '../services/plan-validator.js';

describe('PlanValidator', () => {
  const validator = new PlanValidator();

  it('should reject path traversal attacks', () => {
    const plan = {
      planId: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      operations: [
        {
          type: 'write',
          path: '../../../etc/passwd',
          content: 'malicious'
        }
      ]
    };

    const result = validator.validate(plan);
    expect(result.success).toBe(false);
    expect(result.errors).toContain('Operation 0: Path \'../../../etc/passwd\' is not allowed');
  });

  it('should reject writes to system directories', () => {
    const plan = {
      planId: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      operations: [
        {
          type: 'write',
          path: '/root/.ssh/authorized_keys',
          content: 'ssh-rsa ...'
        }
      ]
    };

    const result = validator.validate(plan);
    expect(result.success).toBe(false);
  });

  it('should reject .env files', () => {
    const plan = {
      planId: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      operations: [
        {
          type: 'write',
          path: '.env',
          content: 'SECRET_KEY=...'
        }
      ]
    };

    const result = validator.validate(plan);
    expect(result.success).toBe(false);
  });

  it('should allow valid app paths', () => {
    const plan = {
      planId: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      operations: [
        {
          type: 'write',
          path: 'app/routes/index.tsx',
          content: 'export default function Index() { return <div>Hello</div>; }'
        }
      ]
    };

    const result = validator.validate(plan);
    expect(result.success).toBe(true);
  });

  it('should limit plan to 100 operations', () => {
    const plan = {
      planId: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      operations: Array(101).fill({
        type: 'write',
        path: 'app/test.txt',
        content: 'test'
      })
    };

    const result = validator.validate(plan);
    expect(result.success).toBe(false);
  });
});
```

---

## EPIC E — Deploy/Export

### Database Schema Changes

```sql
-- Migration 009: Deployment System

-- GitHub Integrations
CREATE TABLE IF NOT EXISTS core.integrations_github (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  access_token    TEXT NOT NULL,  -- Encrypted
  refresh_token   TEXT,
  token_expires   TIMESTAMPTZ,
  github_username TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

-- Deploy Targets
CREATE TABLE IF NOT EXISTS core.deploy_targets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id          UUID NOT NULL REFERENCES core.apps(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES core.users(id),
  target_type     TEXT NOT NULL CHECK (target_type IN ('github_pages', 'vercel', 'netlify', 'zip')),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'deploying', 'deployed', 'failed')),
  config          JSONB,  -- {repo: 'user/repo', branch: 'main', etc.}
  deployment_url  TEXT,
  error           TEXT,
  deployed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deploy_targets_app ON core.deploy_targets(app_id, created_at DESC);
CREATE INDEX IF NOT EXISTS deploy_targets_user ON core.deploy_targets(user_id, created_at DESC);

-- Build Artifacts
CREATE TABLE IF NOT EXISTS core.build_artifacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id          UUID NOT NULL REFERENCES core.apps(id) ON DELETE CASCADE,
  deploy_id       UUID REFERENCES core.deploy_targets(id) ON DELETE SET NULL,
  artifact_path   TEXT NOT NULL,  -- S3 path to zip file
  size_bytes      BIGINT NOT NULL,
  sha256          TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS build_artifacts_app ON core.build_artifacts(app_id, created_at DESC);
```

### Backend Components

#### GitHub Service (`/packages/database/src/services/github-deployer.ts`)

```typescript
import { Octokit } from '@octokit/rest';
import { DatabaseClient } from '../client.js';

export interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
}

export class GitHubDeployer {
  private octokit: Octokit;

  constructor(private db: DatabaseClient, accessToken: string) {
    this.octokit = new Octokit({ auth: accessToken });
  }

  async pushToRepo(appId: string, config: GitHubConfig, files: Array<{ path: string; content: string }>) {
    const { owner, repo, branch } = config;

    // Get current commit SHA
    const { data: refData } = await this.octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`
    });

    const currentCommitSha = refData.object.sha;

    // Get current tree
    const { data: commitData } = await this.octokit.git.getCommit({
      owner,
      repo,
      commit_sha: currentCommitSha
    });

    const currentTreeSha = commitData.tree.sha;

    // Create blobs for each file
    const blobs = await Promise.all(
      files.map(async (file) => {
        const { data: blobData } = await this.octokit.git.createBlob({
          owner,
          repo,
          content: Buffer.from(file.content).toString('base64'),
          encoding: 'base64'
        });

        return {
          path: file.path,
          mode: '100644' as const,
          type: 'blob' as const,
          sha: blobData.sha
        };
      })
    );

    // Create new tree
    const { data: treeData } = await this.octokit.git.createTree({
      owner,
      repo,
      base_tree: currentTreeSha,
      tree: blobs
    });

    // Create commit
    const { data: newCommit } = await this.octokit.git.createCommit({
      owner,
      repo,
      message: `Deploy from EitherWay - ${new Date().toISOString()}`,
      tree: treeData.sha,
      parents: [currentCommitSha]
    });

    // Update ref
    await this.octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommit.sha
    });

    return newCommit.sha;
  }

  async enablePages(owner: string, repo: string, branch: string) {
    try {
      await this.octokit.repos.createPagesSite({
        owner,
        repo,
        source: {
          branch,
          path: '/'
        }
      });

      return `https://${owner}.github.io/${repo}`;
    } catch (error: any) {
      // Pages might already be enabled
      if (error.status === 409) {
        return `https://${owner}.github.io/${repo}`;
      }
      throw error;
    }
  }
}
```

#### Export Service (`/packages/database/src/services/app-exporter.ts`)

```typescript
import archiver from 'archiver';
import { createWriteStream } from 'fs';
import { PostgresFileStore } from './file-store.js';
import { DatabaseClient } from '../client.js';

export class AppExporter {
  private fileStore: PostgresFileStore;

  constructor(private db: DatabaseClient) {
    this.fileStore = new PostgresFileStore(db);
  }

  async exportToZip(appId: string): Promise<{ path: string; size: number; sha256: string }> {
    const files = await this.fileStore.list(appId, 10000);
    const timestamp = Date.now();
    const zipPath = `/tmp/app-${appId}-${timestamp}.zip`;

    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);

    // Recursively add files
    await this.addFilesToArchive(archive, files, appId);

    await archive.finalize();

    // Wait for stream to finish
    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
    });

    const stats = await import('fs/promises').then(fs => fs.stat(zipPath));
    const sha256 = await this.calculateSha256(zipPath);

    return {
      path: zipPath,
      size: stats.size,
      sha256
    };
  }

  private async addFilesToArchive(archive: any, files: any[], appId: string) {
    for (const file of files) {
      if (file.type === 'file') {
        const fileContent = await this.fileStore.read(appId, file.path);
        const content = typeof fileContent.content === 'string'
          ? fileContent.content
          : Buffer.from(fileContent.content);

        archive.append(content, { name: file.path });
      } else if (file.children) {
        await this.addFilesToArchive(archive, file.children, appId);
      }
    }
  }

  private async calculateSha256(filePath: string): Promise<string> {
    const { createHash } = await import('crypto');
    const { createReadStream } = await import('fs');

    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(filePath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }
}
```

#### API Routes (`/packages/ui-server/src/routes/deploy.ts`)

```typescript
import { FastifyInstance } from 'fastify';
import { DatabaseClient, EventsRepository, SessionsRepository } from '@eitherway/database';
import { GitHubDeployer } from '@eitherway/database';
import { AppExporter } from '@eitherway/database';

export async function registerDeployRoutes(
  fastify: FastifyInstance,
  db: DatabaseClient
) {
  const eventsRepo = new EventsRepository(db);
  const exporter = new AppExporter(db);

  // POST /api/exports/package
  fastify.post<{
    Body: { appId: string; sessionId: string };
  }>('/api/exports/package', async (request, reply) => {
    const { appId, sessionId } = request.body;

    try {
      await eventsRepo.log('export.started', { appId }, {
        sessionId,
        appId,
        actor: 'user'
      });

      const artifact = await exporter.exportToZip(appId);

      // Store artifact metadata
      await db.query(
        `INSERT INTO core.build_artifacts (app_id, artifact_path, size_bytes, sha256)
         VALUES ($1, $2, $3, $4)`,
        [appId, artifact.path, artifact.size, artifact.sha256]
      );

      // Stream file to client
      reply.header('Content-Type', 'application/zip');
      reply.header('Content-Disposition', `attachment; filename="app-${appId}.zip"`);
      reply.header('Content-Length', artifact.size);

      const stream = createReadStream(artifact.path);
      return reply.send(stream);

    } catch (error: any) {
      await eventsRepo.log('export.failed', { appId, error: error.message }, {
        sessionId,
        appId,
        actor: 'system'
      });

      return reply.code(500).send({ error: error.message });
    }
  });

  // POST /api/github/push
  fastify.post<{
    Body: {
      appId: string;
      sessionId: string;
      repo: string;
      branch: string;
    };
  }>('/api/github/push', async (request, reply) => {
    const { appId, sessionId, repo, branch } = request.body;

    // Get GitHub access token for user
    // (Assumes GitHub OAuth is implemented)
    const tokenResult = await db.query(
      `SELECT access_token FROM core.integrations_github WHERE user_id = (
        SELECT user_id FROM core.sessions WHERE id = $1
      )`,
      [sessionId]
    );

    if (tokenResult.rows.length === 0) {
      return reply.code(401).send({ error: 'GitHub not connected' });
    }

    const accessToken = tokenResult.rows[0].access_token;
    const deployer = new GitHubDeployer(db, accessToken);

    try {
      // Get all files
      const fileStore = new PostgresFileStore(db);
      const fileTree = await fileStore.list(appId);

      const files = await this.flattenFileTree(fileTree, fileStore, appId);

      // Push to GitHub
      const [owner, repoName] = repo.split('/');
      const commitSha = await deployer.pushToRepo(appId, { owner, repo: repoName, branch }, files);

      await eventsRepo.log('deploy.github.pushed', {
        appId,
        repo,
        branch,
        commitSha
      }, { sessionId, appId, actor: 'user' });

      return {
        success: true,
        commitSha,
        repoUrl: `https://github.com/${repo}`
      };

    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  // POST /api/github/pages/setup
  fastify.post<{
    Body: {
      appId: string;
      sessionId: string;
      repo: string;
      branch: string;
    };
  }>('/api/github/pages/setup', async (request, reply) => {
    const { appId, sessionId, repo, branch } = request.body;

    // Similar to push endpoint, but also enables GitHub Pages

    const tokenResult = await db.query(
      `SELECT access_token FROM core.integrations_github WHERE user_id = (
        SELECT user_id FROM core.sessions WHERE id = $1
      )`,
      [sessionId]
    );

    if (tokenResult.rows.length === 0) {
      return reply.code(401).send({ error: 'GitHub not connected' });
    }

    const accessToken = tokenResult.rows[0].access_token;
    const deployer = new GitHubDeployer(db, accessToken);

    try {
      const [owner, repoName] = repo.split('/');
      const pagesUrl = await deployer.enablePages(owner, repoName, branch);

      // Create deploy target record
      await db.query(
        `INSERT INTO core.deploy_targets
         (app_id, user_id, target_type, status, config, deployment_url, deployed_at)
         VALUES ($1, (SELECT user_id FROM core.sessions WHERE id = $2), 'github_pages', 'deployed', $3, $4, now())`,
        [
          appId,
          sessionId,
          JSON.stringify({ repo, branch }),
          pagesUrl
        ]
      );

      await eventsRepo.log('deploy.github_pages.completed', {
        appId,
        pagesUrl
      }, { sessionId, appId, actor: 'system' });

      return {
        success: true,
        deploymentUrl: pagesUrl
      };

    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  async flattenFileTree(tree: any[], fileStore: any, appId: string): Promise<Array<{ path: string; content: string }>> {
    const files: Array<{ path: string; content: string }> = [];

    for (const node of tree) {
      if (node.type === 'file') {
        const fileContent = await fileStore.read(appId, node.path);
        const content = typeof fileContent.content === 'string'
          ? fileContent.content
          : Buffer.from(fileContent.content).toString('utf-8');

        files.push({ path: node.path, content });
      } else if (node.children) {
        files.push(...await this.flattenFileTree(node.children, fileStore, appId));
      }
    }

    return files;
  }
}
```

### Frontend Components

#### Deploy Button Integration (`/packages/ui-frontend/app/components/header/HeaderActionButtons.client.tsx`)

```typescript
// Update existing component

export function HeaderActionButtons({}: HeaderActionButtonsProps) {
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployUrl, setDeployUrl] = useState<string | null>(null);

  const handleDownload = async () => {
    const session = await getOrCreateSession('user@eitherway.app', 'EitherWay Chat');

    const response = await fetch('/api/exports/package', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appId: session.id,  // Adjust to use actual app ID
        sessionId: session.id
      })
    });

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `app-${session.id}.zip`;
    a.click();
  };

  const handleDeploy = async () => {
    // For GitHub Pages deployment
    setIsDeploying(true);

    try {
      const session = await getOrCreateSession('user@eitherway.app', 'EitherWay Chat');

      const response = await fetch('/api/github/pages/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: session.id,
          sessionId: session.id,
          repo: 'username/repo',  // Get from user input
          branch: 'main'
        })
      });

      const { deploymentUrl } = await response.json();
      setDeployUrl(deploymentUrl);
      toast.success('Deployed to GitHub Pages!');
    } catch (error: any) {
      toast.error(`Deployment failed: ${error.message}`);
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div className="flex gap-2">
      <div className="hidden min-[900px]:flex border border-eitherway-elements-borderColor rounded-2xl overflow-hidden">
        <Button
          disabled={false}  // Enable now
          className="rounded-l-2xl px-5!"
          onClick={handleDownload}
        >
          <img src="/icons/chat/download.svg" alt="Download" />
          <span className="ml-1.5">DOWNLOAD</span>
        </Button>
        <div className="w-[1px] bg-eitherway-elements-borderColor" />
        <Button
          className="rounded-r-2xl px-5!"
          disabled={isDeploying}
          onClick={handleDeploy}
        >
          <img src="/icons/chat/deploy.svg" alt="Deploy" />
          <span className="ml-1.5">{isDeploying ? 'DEPLOYING...' : 'DEPLOY'}</span>
        </Button>
      </div>

      {/* Rest of component */}
    </div>
  );
}
```

---

## EPIC F — Telemetry & Observability

### Database Schema (Already Exists!)

The `core.events` table from migration 001 already supports this:

```sql
-- Already exists in 001_initial_schema.sql
CREATE TABLE IF NOT EXISTS core.events (
  id         BIGSERIAL PRIMARY KEY,
  session_id UUID,
  app_id     UUID,
  actor      TEXT,
  kind       TEXT,
  payload    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Backend Components

#### Typed Event Logger (`/packages/database/src/services/typed-events.ts`)

```typescript
import { EventsRepository } from '../repositories/events.js';
import { DatabaseClient } from '../client.js';

// Event type definitions
export type TelemetryEvent =
  | { kind: 'plan_applied'; planId: string; succeeded: number; failed: number }
  | { kind: 'brand_uploaded'; uploadId: string; hasPalette: boolean }
  | { kind: 'deploy_triggered'; appId: string; targetType: string }
  | { kind: 'deploy_completed'; appId: string; deploymentUrl: string; durationMs: number }
  | { kind: 'pwa_checked'; appId: string; hasPWA: boolean }
  | { kind: 'file_operation'; operation: 'write' | 'patch' | 'delete'; path: string }
  | { kind: 'session_created'; sessionId: string; userId: string }
  | { kind: 'message_sent'; sessionId: string; role: 'user' | 'assistant'; tokenCount?: number };

export interface EventContext {
  sessionId?: string | null;
  appId?: string | null;
  actor: string;
}

export class TypedEventLogger {
  private eventsRepo: EventsRepository;

  constructor(db: DatabaseClient) {
    this.eventsRepo = new EventsRepository(db);
  }

  async log(event: TelemetryEvent, context: EventContext): Promise<void> {
    await this.eventsRepo.log(event.kind, event, context);
  }

  async getEventsByKind(kind: string, limit = 100): Promise<any[]> {
    const db = this.eventsRepo['db'];  // Access private db
    const result = await db.query(
      `SELECT * FROM core.events
       WHERE kind = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [kind, limit]
    );

    return result.rows;
  }

  async getEventMetrics(kind: string, since: Date): Promise<{ count: number; avgDuration?: number }> {
    const db = this.eventsRepo['db'];
    const result = await db.query(
      `SELECT
         COUNT(*) as count,
         AVG((payload->>'durationMs')::numeric) as avg_duration
       FROM core.events
       WHERE kind = $1 AND created_at >= $2`,
      [kind, since]
    );

    return {
      count: parseInt(result.rows[0].count, 10),
      avgDuration: result.rows[0].avg_duration ? parseFloat(result.rows[0].avg_duration) : undefined
    };
  }
}
```

### Frontend Client Telemetry (`/packages/ui-frontend/app/utils/telemetry.ts`)

```typescript
export class Telemetry {
  static async trackEvent(
    kind: string,
    payload: any,
    context: { sessionId?: string; appId?: string }
  ) {
    try {
      await fetch('/api/telemetry/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          payload,
          context: {
            ...context,
            actor: 'user',
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
          }
        })
      });
    } catch (error) {
      console.error('Telemetry error:', error);
    }
  }

  static trackPlanApplied(planId: string, succeeded: number, failed: number) {
    this.trackEvent('plan_applied', { planId, succeeded, failed }, {});
  }

  static trackBrandUploaded(uploadId: string, hasPalette: boolean) {
    this.trackEvent('brand_uploaded', { uploadId, hasPalette }, {});
  }

  static trackDeployTriggered(appId: string, targetType: string) {
    this.trackEvent('deploy_triggered', { appId, targetType }, { appId });
  }

  static trackDeployCompleted(appId: string, deploymentUrl: string, durationMs: number) {
    this.trackEvent('deploy_completed', { appId, deploymentUrl, durationMs }, { appId });
  }

  static trackPWAChecked(appId: string, hasPWA: boolean) {
    this.trackEvent('pwa_checked', { appId, hasPWA }, { appId });
  }
}
```

---

## Implementation Order & Dependencies

### Phase 1: Foundation (Week 1)
1. ✅ Database migrations (007, 008, 009)
2. ✅ Plan Validator + Executor (EPIC A + D integrated)
3. ✅ Plan API routes
4. ✅ Security hardening tests

### Phase 2: Assets & UX (Week 2)
5. ✅ Asset storage service (S3/GCS)
6. ✅ Brand kit upload API
7. ✅ Palette extractor
8. ✅ Preview toolbar + device presets (EPIC C)
9. ✅ PWA detection

### Phase 3: Delivery (Week 3)
10. ✅ GitHub integration (OAuth)
11. ✅ App exporter (ZIP)
12. ✅ Deploy API routes
13. ✅ Frontend deploy/download buttons

### Phase 4: Observability (Week 4)
14. ✅ Typed event logger
15. ✅ Client telemetry integration
16. ✅ Analytics dashboard (optional)

---

## Technology Stack Additions

### Backend Dependencies
```json
{
  "dependencies": {
    "@aws-sdk/client-s3": "^3.400.0",
    "@aws-sdk/s3-request-presigner": "^3.400.0",
    "@octokit/rest": "^20.0.0",
    "archiver": "^6.0.0"
  }
}
```

### Frontend Dependencies
```json
{
  "dependencies": {
    // All already available via existing packages
  }
}
```

---

## Acceptance Criteria Summary

### EPIC A
- ✅ Invalid plans rejected with clear errors
- ✅ Safe operations (write, patch, package) logged
- ✅ Idempotent re-runs supported
- ✅ `/plan/apply-log.json` generated

### EPIC B
- ✅ Invalid file types rejected
- ✅ Uploaded assets appear in workspace
- ✅ Color palette extracted from logo
- ✅ Brand state saved to DB

### EPIC C
- ✅ iPhone 17 Pro Max preview with correct dimensions (430×932 portrait)
- ✅ Orientation toggle works (portrait/landscape)
- ✅ PWA status visible in toolbar

### EPIC D
- ✅ Fuzzed inputs handled gracefully
- ✅ Logs show rejected unsafe paths
- ✅ Unit tests cover attack vectors

### EPIC E
- ✅ Download returns valid ZIP
- ✅ Deploy to GitHub Pages produces live URL
- ✅ Deploy status tracked in DB

### EPIC F
- ✅ Events visible in telemetry queries
- ✅ Latency metrics recorded
- ✅ All major actions tracked

---

## Notes for Implementation

1. **Environment Variables Needed**:
   ```env
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=...
   AWS_SECRET_ACCESS_KEY=...
   S3_BUCKET=eitherway-assets
   GITHUB_CLIENT_ID=...
   GITHUB_CLIENT_SECRET=...
   ```

2. **GitHub OAuth Setup**: Need to create GitHub App and implement OAuth flow

3. **S3 Bucket CORS**: Configure bucket to allow uploads from frontend

4. **Testing Strategy**: Each EPIC should have unit + integration tests

5. **Progressive Enhancement**: Each feature should work independently

