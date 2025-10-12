/**
 * Brand Kit Repositories
 *
 * Data access layer for:
 * - Brand kits
 * - Brand assets
 * - Brand colors
 */

import { DatabaseClient } from '../client.js';

// TYPES

export interface BrandKit {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: 'active' | 'archived' | 'deleted';
  version: number;
  created_at: Date;
  updated_at: Date;
}

export interface BrandAsset {
  id: string;
  brand_kit_id: string;
  user_id: string;
  asset_type: 'logo' | 'image' | 'icon' | 'pattern';
  file_name: string;
  storage_key: string;
  storage_provider: 's3' | 'gcs' | 'local';
  mime_type: string;
  file_size_bytes: number;
  width_px: number | null;
  height_px: number | null;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  processing_error: string | null;
  metadata: Record<string, any>;
  uploaded_at: Date;
  processed_at: Date | null;
  created_at: Date;
}

export interface BrandColor {
  id: string;
  brand_kit_id: string;
  asset_id: string | null;
  color_hex: string;
  color_rgb: { r: number; g: number; b: number };
  color_hsl: { h: number; s: number; l: number } | null;
  color_name: string | null;
  color_role: 'primary' | 'secondary' | 'accent' | 'neutral' | 'extracted' | null;
  prominence_score: number | null;
  pixel_percentage: number | null;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

// BRAND KITS REPOSITORY

export class BrandKitsRepository {
  constructor(private db: DatabaseClient) {}

  async create(
    userId: string,
    name: string,
    description?: string
  ): Promise<BrandKit> {
    const result = await this.db.query(
      `INSERT INTO core.brand_kits (user_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, name, description || null]
    );

    return result.rows[0];
  }

  /**
   * Find brand kit by ID
   */
  async findById(id: string): Promise<BrandKit | null> {
    const result = await this.db.query(
      `SELECT * FROM core.brand_kits WHERE id = $1 AND status != 'deleted'`,
      [id]
    );

    return result.rows[0] || null;
  }

  /**
   * Find all brand kits for a user
   */
  async findByUserId(userId: string, status: 'active' | 'archived' | 'all' = 'active'): Promise<BrandKit[]> {
    const query = status === 'all'
      ? `SELECT * FROM core.brand_kits WHERE user_id = $1 AND status != 'deleted' ORDER BY created_at DESC`
      : `SELECT * FROM core.brand_kits WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC`;

    const params = status === 'all' ? [userId] : [userId, status];

    const result = await this.db.query(query, params);

    return result.rows;
  }

  async update(
    id: string,
    updates: Partial<Pick<BrandKit, 'name' | 'description' | 'status'>>
  ): Promise<BrandKit | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }

    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }

    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);

    const result = await this.db.query(
      `UPDATE core.brand_kits
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE core.brand_kits SET status = 'deleted' WHERE id = $1`,
      [id]
    );

    return result.rowCount !== null && result.rowCount > 0;
  }
}

// BRAND ASSETS REPOSITORY

export class BrandAssetsRepository {
  constructor(private db: DatabaseClient) {}

  async create(params: {
    brandKitId: string;
    userId: string;
    assetType: BrandAsset['asset_type'];
    fileName: string;
    storageKey: string;
    storageProvider: BrandAsset['storage_provider'];
    mimeType: string;
    fileSizeBytes: number;
    widthPx?: number;
    heightPx?: number;
    metadata?: Record<string, any>;
  }): Promise<BrandAsset> {
    const result = await this.db.query(
      `INSERT INTO core.brand_assets
       (brand_kit_id, user_id, asset_type, file_name, storage_key, storage_provider,
        mime_type, file_size_bytes, width_px, height_px, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        params.brandKitId,
        params.userId,
        params.assetType,
        params.fileName,
        params.storageKey,
        params.storageProvider,
        params.mimeType,
        params.fileSizeBytes,
        params.widthPx || null,
        params.heightPx || null,
        JSON.stringify(params.metadata || {})
      ]
    );

    return result.rows[0];
  }

  /**
   * Find asset by ID
   */
  async findById(id: string): Promise<BrandAsset | null> {
    const result = await this.db.query(
      `SELECT * FROM core.brand_assets WHERE id = $1`,
      [id]
    );

    return result.rows[0] || null;
  }

  /**
   * Find all assets for a brand kit
   */
  async findByBrandKitId(brandKitId: string): Promise<BrandAsset[]> {
    const result = await this.db.query(
      `SELECT * FROM core.brand_assets WHERE brand_kit_id = $1 ORDER BY created_at DESC`,
      [brandKitId]
    );

    return result.rows;
  }

  async updateProcessingStatus(
    id: string,
    status: BrandAsset['processing_status'],
    error?: string
  ): Promise<BrandAsset | null> {
    const result = await this.db.query(
      `UPDATE core.brand_assets
       SET processing_status = $1,
           processing_error = $2,
           processed_at = CASE WHEN $1 IN ('completed', 'failed') THEN now() ELSE processed_at END
       WHERE id = $3
       RETURNING *`,
      [status, error || null, id]
    );

    return result.rows[0] || null;
  }

  async updateDimensions(
    id: string,
    width: number,
    height: number
  ): Promise<BrandAsset | null> {
    const result = await this.db.query(
      `UPDATE core.brand_assets
       SET width_px = $1, height_px = $2
       WHERE id = $3
       RETURNING *`,
      [width, height, id]
    );

    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM core.brand_assets WHERE id = $1`,
      [id]
    );

    return result.rowCount !== null && result.rowCount > 0;
  }
}

// BRAND COLORS REPOSITORY

export class BrandColorsRepository {
  constructor(private db: DatabaseClient) {}

  async create(params: {
    brandKitId: string;
    assetId?: string;
    colorHex: string;
    colorRgb: { r: number; g: number; b: number };
    colorHsl?: { h: number; s: number; l: number };
    colorName?: string;
    colorRole?: BrandColor['color_role'];
    prominenceScore?: number;
    pixelPercentage?: number;
    displayOrder?: number;
  }): Promise<BrandColor> {
    const result = await this.db.query(
      `INSERT INTO core.brand_colors
       (brand_kit_id, asset_id, color_hex, color_rgb, color_hsl, color_name,
        color_role, prominence_score, pixel_percentage, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        params.brandKitId,
        params.assetId || null,
        params.colorHex,
        JSON.stringify(params.colorRgb),
        params.colorHsl ? JSON.stringify(params.colorHsl) : null,
        params.colorName || null,
        params.colorRole || null,
        params.prominenceScore || null,
        params.pixelPercentage || null,
        params.displayOrder || 0
      ]
    );

    return result.rows[0];
  }

  /**
   * Bulk create colors
   */
  async bulkCreate(colors: Array<Parameters<typeof this.create>[0]>): Promise<BrandColor[]> {
    if (colors.length === 0) return [];

    const values: any[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    colors.forEach((color) => {
      placeholders.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
      values.push(
        color.brandKitId,
        color.assetId || null,
        color.colorHex,
        JSON.stringify(color.colorRgb),
        color.colorHsl ? JSON.stringify(color.colorHsl) : null,
        color.colorName || null,
        color.colorRole || null,
        color.prominenceScore || null,
        color.pixelPercentage || null,
        color.displayOrder || 0
      );
    });

    const result = await this.db.query(
      `INSERT INTO core.brand_colors
       (brand_kit_id, asset_id, color_hex, color_rgb, color_hsl, color_name,
        color_role, prominence_score, pixel_percentage, display_order)
       VALUES ${placeholders.join(', ')}
       RETURNING *`,
      values
    );

    return result.rows;
  }

  /**
   * Find colors by brand kit ID
   */
  async findByBrandKitId(brandKitId: string): Promise<BrandColor[]> {
    const result = await this.db.query(
      `SELECT * FROM core.brand_colors
       WHERE brand_kit_id = $1
       ORDER BY display_order ASC, prominence_score DESC NULLS LAST`,
      [brandKitId]
    );

    return result.rows;
  }

  /**
   * Find colors by asset ID
   */
  async findByAssetId(assetId: string): Promise<BrandColor[]> {
    const result = await this.db.query(
      `SELECT * FROM core.brand_colors
       WHERE asset_id = $1
       ORDER BY prominence_score DESC NULLS LAST`,
      [assetId]
    );

    return result.rows;
  }

  async update(
    id: string,
    updates: Partial<Pick<BrandColor, 'color_name' | 'color_role' | 'display_order'>>
  ): Promise<BrandColor | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.color_name !== undefined) {
      fields.push(`color_name = $${paramIndex++}`);
      values.push(updates.color_name);
    }

    if (updates.color_role !== undefined) {
      fields.push(`color_role = $${paramIndex++}`);
      values.push(updates.color_role);
    }

    if (updates.display_order !== undefined) {
      fields.push(`display_order = $${paramIndex++}`);
      values.push(updates.display_order);
    }

    if (fields.length === 0) return null;

    values.push(id);

    const result = await this.db.query(
      `UPDATE core.brand_colors
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM core.brand_colors WHERE id = $1`,
      [id]
    );

    return result.rowCount !== null && result.rowCount > 0;
  }

  async deleteByAssetId(assetId: string): Promise<number> {
    const result = await this.db.query(
      `DELETE FROM core.brand_colors WHERE asset_id = $1`,
      [assetId]
    );

    return result.rowCount || 0;
  }

  async deleteByBrandKitId(brandKitId: string): Promise<number> {
    const result = await this.db.query(
      `DELETE FROM core.brand_colors WHERE brand_kit_id = $1`,
      [brandKitId]
    );

    return result.rowCount || 0;
  }
}
