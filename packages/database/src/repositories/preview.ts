/**
 * Preview Repositories
 *
 * Manages:
 * - Device preview configurations (iPhone 17 Pro Max)
 * - PWA validation results
 * - Preview sessions with expiring tokens
 */

import type { DatabaseClient } from '../client.js';
import type { PWAValidationResult } from '../services/pwa-validator.js';

// TYPES

export interface PreviewConfig {
  id: string;
  app_id: string;
  user_id: string;
  device_name: string;
  viewport_width: number;
  viewport_height: number;
  pixel_ratio: number;
  user_agent: string;
  is_default: boolean;
  orientation: 'portrait' | 'landscape';
  created_at: Date;
  updated_at: Date;
}

export interface CreatePreviewConfigInput {
  app_id: string;
  user_id: string;
  device_name?: string;
  viewport_width?: number;
  viewport_height?: number;
  pixel_ratio?: number;
  user_agent?: string;
  is_default?: boolean;
  orientation?: 'portrait' | 'landscape';
}

export interface PWAValidation {
  id: string;
  app_id: string;
  user_id: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'warning';
  manifest_score: number | null;
  service_worker_score: number | null;
  icons_score: number | null;
  overall_score: number | null;
  manifest_valid: boolean;
  manifest_url: string | null;
  manifest_errors: string[];
  manifest_warnings: string[];
  manifest_data: any;
  service_worker_registered: boolean;
  service_worker_url: string | null;
  service_worker_scope: string | null;
  service_worker_errors: string[];
  icons_valid: boolean;
  icons_found: any[];
  icons_missing: string[];
  has_name: boolean;
  has_short_name: boolean;
  has_start_url: boolean;
  has_display: boolean;
  has_theme_color: boolean;
  has_background_color: boolean;
  has_icons: boolean;
  is_https: boolean;
  has_viewport_meta: boolean;
  offline_ready: boolean;
  validation_url: string;
  validation_errors: string[];
  validated_at: Date;
  created_at: Date;
}

export interface CreatePWAValidationInput {
  app_id: string;
  user_id: string;
  validation_url: string;
  result: PWAValidationResult;
}

export interface PreviewSession {
  id: string;
  app_id: string;
  user_id: string;
  preview_config_id: string | null;
  preview_url: string;
  preview_token: string;
  is_active: boolean;
  expires_at: Date;
  last_accessed_at: Date | null;
  access_count: number;
  created_at: Date;
}

export interface CreatePreviewSessionInput {
  app_id: string;
  user_id: string;
  preview_config_id?: string;
  preview_url: string;
  expires_in_hours?: number;
}

// PREVIEW CONFIGS REPOSITORY

export class PreviewConfigsRepository {
  constructor(private db: DatabaseClient) {}

  async create(input: CreatePreviewConfigInput): Promise<PreviewConfig> {
    const result = await this.db.query<PreviewConfig>(
      `INSERT INTO core.preview_configs (
        app_id, user_id, device_name, viewport_width, viewport_height,
        pixel_ratio, user_agent, is_default, orientation
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        input.app_id,
        input.user_id,
        input.device_name || 'iPhone 17 Pro Max',
        input.viewport_width || 430,
        input.viewport_height || 932,
        input.pixel_ratio || 3.0,
        input.user_agent || 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
        input.is_default || false,
        input.orientation || 'portrait'
      ]
    );

    return result.rows[0];
  }

  async getById(id: string): Promise<PreviewConfig | null> {
    const result = await this.db.query<PreviewConfig>(
      'SELECT * FROM core.preview_configs WHERE id = $1',
      [id]
    );

    return result.rows[0] || null;
  }

  async getByAppId(appId: string): Promise<PreviewConfig[]> {
    const result = await this.db.query<PreviewConfig>(
      `SELECT * FROM core.preview_configs
       WHERE app_id = $1
       ORDER BY is_default DESC, created_at DESC`,
      [appId]
    );

    return result.rows;
  }

  async getOrCreateDefault(appId: string, userId: string): Promise<PreviewConfig> {
    const result = await this.db.query<{ id: string }>(
      'SELECT get_or_create_default_preview_config($1, $2) as id',
      [appId, userId]
    );

    const configId = result.rows[0].id;
    return (await this.getById(configId))!;
  }

  async update(
    id: string,
    updates: Partial<Omit<CreatePreviewConfigInput, 'app_id' | 'user_id'>>
  ): Promise<PreviewConfig | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.device_name !== undefined) {
      fields.push(`device_name = $${paramIndex++}`);
      values.push(updates.device_name);
    }
    if (updates.viewport_width !== undefined) {
      fields.push(`viewport_width = $${paramIndex++}`);
      values.push(updates.viewport_width);
    }
    if (updates.viewport_height !== undefined) {
      fields.push(`viewport_height = $${paramIndex++}`);
      values.push(updates.viewport_height);
    }
    if (updates.pixel_ratio !== undefined) {
      fields.push(`pixel_ratio = $${paramIndex++}`);
      values.push(updates.pixel_ratio);
    }
    if (updates.user_agent !== undefined) {
      fields.push(`user_agent = $${paramIndex++}`);
      values.push(updates.user_agent);
    }
    if (updates.is_default !== undefined) {
      fields.push(`is_default = $${paramIndex++}`);
      values.push(updates.is_default);
    }
    if (updates.orientation !== undefined) {
      fields.push(`orientation = $${paramIndex++}`);
      values.push(updates.orientation);
    }

    if (fields.length === 0) {
      return this.getById(id);
    }

    values.push(id);
    const result = await this.db.query<PreviewConfig>(
      `UPDATE core.preview_configs
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM core.preview_configs WHERE id = $1',
      [id]
    );

    return (result.rowCount || 0) > 0;
  }
}

// PWA VALIDATIONS REPOSITORY

export class PWAValidationsRepository {
  constructor(private db: DatabaseClient) {}

  async create(input: CreatePWAValidationInput): Promise<PWAValidation> {
    const { result } = input;

    const dbResult = await this.db.query<PWAValidation>(
      `INSERT INTO core.pwa_validations (
        app_id, user_id, status, manifest_score, service_worker_score,
        icons_score, overall_score, manifest_valid, manifest_url,
        manifest_errors, manifest_warnings, manifest_data,
        service_worker_registered, service_worker_url, service_worker_scope,
        service_worker_errors, icons_valid, icons_found, icons_missing,
        has_name, has_short_name, has_start_url, has_display,
        has_theme_color, has_background_color, has_icons,
        is_https, has_viewport_meta, offline_ready,
        validation_url, validation_errors
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
        $29, $30, $31
      )
      RETURNING *`,
      [
        input.app_id,
        input.user_id,
        result.status,
        result.manifest_score,
        result.service_worker_score,
        result.icons_score,
        result.overall_score,
        result.manifest_valid,
        result.manifest_url || null,
        JSON.stringify(result.manifest_errors),
        JSON.stringify(result.manifest_warnings),
        result.manifest_data ? JSON.stringify(result.manifest_data) : null,
        result.service_worker_registered,
        result.service_worker_url || null,
        result.service_worker_scope || null,
        JSON.stringify(result.service_worker_errors),
        result.icons_valid,
        JSON.stringify(result.icons_found),
        JSON.stringify(result.icons_missing),
        result.has_name,
        result.has_short_name,
        result.has_start_url,
        result.has_display,
        result.has_theme_color,
        result.has_background_color,
        result.has_icons,
        result.is_https,
        result.has_viewport_meta,
        result.offline_ready,
        input.validation_url,
        JSON.stringify(result.validation_errors)
      ]
    );

    return dbResult.rows[0];
  }

  async getById(id: string): Promise<PWAValidation | null> {
    const result = await this.db.query<PWAValidation>(
      'SELECT * FROM core.pwa_validations WHERE id = $1',
      [id]
    );

    return result.rows[0] || null;
  }

  async getByAppId(appId: string, limit: number = 10): Promise<PWAValidation[]> {
    const result = await this.db.query<PWAValidation>(
      `SELECT * FROM core.pwa_validations
       WHERE app_id = $1
       ORDER BY validated_at DESC
       LIMIT $2`,
      [appId, limit]
    );

    return result.rows;
  }

  async getLatestByAppId(appId: string): Promise<PWAValidation | null> {
    const result = await this.db.query<PWAValidation>(
      `SELECT * FROM core.pwa_validations
       WHERE app_id = $1
       ORDER BY validated_at DESC
       LIMIT 1`,
      [appId]
    );

    return result.rows[0] || null;
  }

  async getSummary(appId: string): Promise<{
    total_validations: number;
    passed_count: number;
    failed_count: number;
    warning_count: number;
    avg_score: number;
    last_validated_at: Date;
    has_valid_manifest: boolean;
    has_service_worker: boolean;
    has_valid_icons: boolean;
  } | null> {
    const result = await this.db.query(
      `SELECT * FROM core.pwa_validation_summary WHERE app_id = $1`,
      [appId]
    );

    return result.rows[0] || null;
  }

  async cleanupOldValidations(appId: string, keepCount: number = 50): Promise<number> {
    const result = await this.db.query(
      `DELETE FROM core.pwa_validations
       WHERE id IN (
         SELECT id FROM core.pwa_validations
         WHERE app_id = $1
         ORDER BY validated_at DESC
         OFFSET $2
       )`,
      [appId, keepCount]
    );

    return result.rowCount || 0;
  }
}

// PREVIEW SESSIONS REPOSITORY

export class PreviewSessionsRepository {
  constructor(private db: DatabaseClient) {}

  async create(input: CreatePreviewSessionInput): Promise<PreviewSession> {
    const expiresInHours = input.expires_in_hours || 24;
    const previewToken = this.generatePreviewToken();

    const result = await this.db.query<PreviewSession>(
      `INSERT INTO core.preview_sessions (
        app_id, user_id, preview_config_id, preview_url,
        preview_token, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, now() + interval '1 hour' * $6)
      RETURNING *`,
      [
        input.app_id,
        input.user_id,
        input.preview_config_id || null,
        input.preview_url,
        previewToken,
        expiresInHours
      ]
    );

    return result.rows[0];
  }

  async getById(id: string): Promise<PreviewSession | null> {
    const result = await this.db.query<PreviewSession>(
      'SELECT * FROM core.preview_sessions WHERE id = $1',
      [id]
    );

    return result.rows[0] || null;
  }

  async getByToken(token: string): Promise<PreviewSession | null> {
    const result = await this.db.query<PreviewSession>(
      `SELECT * FROM core.preview_sessions
       WHERE preview_token = $1 AND is_active = true AND expires_at > now()`,
      [token]
    );

    return result.rows[0] || null;
  }

  async getActiveByAppId(appId: string): Promise<PreviewSession[]> {
    const result = await this.db.query<PreviewSession>(
      `SELECT * FROM core.preview_sessions
       WHERE app_id = $1 AND is_active = true AND expires_at > now()
       ORDER BY created_at DESC`,
      [appId]
    );

    return result.rows;
  }

  /**
   * Track session access (increment counter, update timestamp)
   */
  async trackAccess(token: string): Promise<void> {
    await this.db.query(
      `UPDATE core.preview_sessions
       SET access_count = access_count + 1,
           last_accessed_at = now()
       WHERE preview_token = $1`,
      [token]
    );
  }

  /**
   * Deactivate a preview session
   */
  async deactivate(id: string): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE core.preview_sessions
       SET is_active = false
       WHERE id = $1`,
      [id]
    );

    return (result.rowCount || 0) > 0;
  }

  /**
   * Extend session expiration
   */
  async extend(id: string, additionalHours: number = 24): Promise<PreviewSession | null> {
    const result = await this.db.query<PreviewSession>(
      `UPDATE core.preview_sessions
       SET expires_at = expires_at + interval '1 hour' * $2
       WHERE id = $1
       RETURNING *`,
      [id, additionalHours]
    );

    return result.rows[0] || null;
  }

  /**
   * Cleanup expired preview sessions
   */
  async cleanupExpired(): Promise<number> {
    const result = await this.db.query<{ deleted_count: number }>(
      'SELECT cleanup_expired_preview_sessions() as deleted_count'
    );

    return result.rows[0].deleted_count;
  }

  /**
   * Generate a secure preview token
   */
  private generatePreviewToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';

    // Generate 32-character random token
    for (let i = 0; i < 32; i++) {
      const randomIndex = Math.floor(Math.random() * chars.length);
      token += chars[randomIndex];
    }

    return `pvw_${token}`;
  }
}
