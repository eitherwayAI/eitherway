/**
 * Brand Kit API Routes
 *
 * Endpoints:
 * - POST /api/brand-kits - Create new brand kit
 * - GET /api/brand-kits - List user's brand kits
 * - GET /api/brand-kits/:id - Get brand kit details with assets and colors
 * - PUT /api/brand-kits/:id - Update brand kit
 * - DELETE /api/brand-kits/:id - Delete brand kit
 * - POST /api/brand-kits/:id/assets - Upload asset and extract palette
 * - DELETE /api/brand-kits/:id/assets/:assetId - Delete asset
 * - POST /api/brand-kits/:id/colors - Manually add color
 * - PUT /api/brand-kits/:id/colors/:colorId - Update color
 * - DELETE /api/brand-kits/:id/colors/:colorId - Delete color
 */

import { FastifyInstance } from 'fastify';
import {
  DatabaseClient,
  BrandKitsRepository,
  BrandAssetsRepository,
  BrandColorsRepository,
  PaletteExtractor,
  EventsRepository,
  UsersRepository
} from '@eitherway/database';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

export async function registerBrandKitRoutes(
  fastify: FastifyInstance,
  db: DatabaseClient
) {
  console.log('[Brand Kits] Registering brand kit routes...');

  const brandKitsRepo = new BrandKitsRepository(db);
  const assetsRepo = new BrandAssetsRepository(db);
  const colorsRepo = new BrandColorsRepository(db);
  const paletteExtractor = new PaletteExtractor();
  const eventsRepo = new EventsRepository(db);
  const usersRepo = new UsersRepository(db);

  // Storage configuration (local for now, can be upgraded to S3/GCS)
  const UPLOAD_DIR = process.env.BRAND_KIT_UPLOAD_DIR || '/tmp/eitherway-brand-kits';

  console.log('[Brand Kits] Upload directory:', UPLOAD_DIR);
  console.log('[Brand Kits] Repositories initialized');

  /**
   * GET /api/brand-kits/health
   * Health check endpoint
   */
  fastify.get('/api/brand-kits/health', async (request, reply) => {
    console.log('[Brand Kits API] Health check called');
    try {
      // Test database connection
      await db.query('SELECT 1 as test');
      console.log('[Brand Kits API] Database connection OK');

      return {
        success: true,
        database: 'connected',
        uploadDir: UPLOAD_DIR
      };
    } catch (error: any) {
      console.error('[Brand Kits API] Health check failed:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/brand-kits
   * Create a new brand kit
   */
  fastify.post<{
    Body: {
      name: string;
      description?: string;
      userId: string;  // Can be email or wallet address
    };
  }>('/api/brand-kits', async (request, reply) => {
    // Top-level try-catch to ensure we always send JSON
    try {
      const { name, description, userId } = request.body;

      if (!name || !userId) {
        return reply.code(400).send({
          error: 'Missing required fields',
          details: ['name and userId are required']
        });
      }
      console.log('[Brand Kits API] Creating brand kit. UserId:', userId, 'Name:', name);

      // Ensure user exists (auto-create if wallet address)
      const emailToUse = userId.startsWith('0x') ? `${userId}@wallet.local` : userId;
      console.log('[Brand Kits API] Email to use:', emailToUse);

      let userRecord = await usersRepo.findByEmail(emailToUse);
      console.log('[Brand Kits API] Existing user found?', !!userRecord);

      if (!userRecord) {
        // Create user with wallet address or email
        console.log('[Brand Kits API] Creating new user:', emailToUse);
        const displayName = userId.startsWith('0x')
          ? `Wallet ${userId.substring(0, 8)}...`
          : userId.split('@')[0];

        try {
          userRecord = await usersRepo.create(emailToUse, displayName);
          console.log('[Brand Kits API] User created successfully:', userRecord.id);
        } catch (userCreateError: any) {
          console.error('[Brand Kits API] Failed to create user:', userCreateError);
          console.error('[Brand Kits API] User create error details:', {
            message: userCreateError.message,
            code: userCreateError.code,
            detail: userCreateError.detail,
            stack: userCreateError.stack
          });
          throw new Error(`Failed to create user: ${userCreateError.message}`);
        }
      }

      console.log('[Brand Kits API] Creating brand kit for user:', userRecord.id);
      const brandKit = await brandKitsRepo.create(userRecord.id, name, description);
      console.log('[Brand Kits API] Brand kit created:', brandKit.id);

      await eventsRepo.log('brand_kit.created', {
        brandKitId: brandKit.id,
        name: brandKit.name
      }, { sessionId: undefined, appId: undefined, actor: 'user' });

      return {
        success: true,
        brandKit: {
          id: brandKit.id,
          name: brandKit.name,
          description: brandKit.description,
          status: brandKit.status,
          createdAt: brandKit.created_at
        }
      };
    } catch (outerError: any) {
      // Outer catch to handle any errors in request parsing or validation
      console.error('[Brand Kits API] Outer error - Request handling failed:', outerError);
      console.error('[Brand Kits API] Outer error stack:', outerError.stack);
      return reply.code(500).send({
        error: 'Request handling failed',
        message: outerError.message || 'Unknown error',
        details: 'Check server logs for details'
      });
    }
  });

  /**
   * GET /api/brand-kits/user/:userId/active
   * Get user's most recent active brand kit
   */
  fastify.get<{
    Params: { userId: string };
  }>('/api/brand-kits/user/:userId/active', async (request, reply) => {
    const { userId } = request.params;

    try {
      // Convert wallet address to email format if needed
      const emailToUse = userId.startsWith('0x') ? `${userId}@wallet.local` : userId;

      // Find user
      const userRecord = await usersRepo.findByEmail(emailToUse);
      if (!userRecord) {
        return reply.code(404).send({
          error: 'User not found',
          userId
        });
      }

      // Get all active brand kits for user, sorted by creation date (newest first)
      const brandKits = await brandKitsRepo.findByUserId(userRecord.id, 'active');

      if (brandKits.length === 0) {
        return reply.code(404).send({
          error: 'No active brand kit found',
          userId
        });
      }

      // Return most recent brand kit with full details
      const latestKit = brandKits[0];
      const assets = await assetsRepo.findByBrandKitId(latestKit.id);
      const colors = await colorsRepo.findByBrandKitId(latestKit.id);

      return {
        success: true,
        brandKit: {
          id: latestKit.id,
          name: latestKit.name,
          description: latestKit.description,
          status: latestKit.status,
          createdAt: latestKit.created_at,
          updatedAt: latestKit.updated_at,
          assets: assets.map(asset => ({
            id: asset.id,
            assetType: asset.asset_type,
            fileName: asset.file_name,
            storageKey: asset.storage_key,
            mimeType: asset.mime_type,
            fileSizeBytes: asset.file_size_bytes,
            dimensions: asset.width_px && asset.height_px
              ? { width: asset.width_px, height: asset.height_px }
              : null,
            processingStatus: asset.processing_status,
            uploadedAt: asset.uploaded_at,
            metadata: { kind: (asset.metadata as any)?.kind }
          })),
          colors: colors.map(color => ({
            id: color.id,
            hex: color.color_hex,
            rgb: color.color_rgb,
            hsl: color.color_hsl,
            name: color.color_name,
            role: color.color_role,
            prominence: color.prominence_score,
            pixelPercentage: color.pixel_percentage,
            displayOrder: color.display_order
          }))
        }
      };
    } catch (error: any) {
      console.error('[Brand Kits API] Failed to get user active brand kit:', error);
      return reply.code(500).send({
        error: 'Failed to get active brand kit',
        message: error.message
      });
    }
  });

  /**
   * GET /api/brand-kits
   * List all brand kits for a user
   */
  fastify.get<{
    Querystring: {
      userId: string;
      status?: 'active' | 'archived' | 'all';
    };
  }>('/api/brand-kits', async (request, reply) => {
    const { userId, status = 'active' } = request.query;

    if (!userId) {
      return reply.code(400).send({
        error: 'Missing userId query parameter'
      });
    }

    try {
      const brandKits = await brandKitsRepo.findByUserId(userId, status);

      return {
        success: true,
        brandKits: brandKits.map(kit => ({
          id: kit.id,
          name: kit.name,
          description: kit.description,
          status: kit.status,
          createdAt: kit.created_at,
          updatedAt: kit.updated_at
        }))
      };
    } catch (error: any) {
      console.error('[Brand Kits API] Failed to list brand kits:', error);
      return reply.code(500).send({
        error: 'Failed to list brand kits',
        message: error.message
      });
    }
  });

  /**
   * GET /api/brand-kits/:id
   * Get brand kit details with assets and colors
   */
  fastify.get<{
    Params: { id: string };
  }>('/api/brand-kits/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      const brandKit = await brandKitsRepo.findById(id);

      if (!brandKit) {
        return reply.code(404).send({ error: 'Brand kit not found' });
      }

      const assets = await assetsRepo.findByBrandKitId(id);
      const colors = await colorsRepo.findByBrandKitId(id);

      return {
        success: true,
        brandKit: {
          id: brandKit.id,
          name: brandKit.name,
          description: brandKit.description,
          status: brandKit.status,
          createdAt: brandKit.created_at,
          updatedAt: brandKit.updated_at,
          assets: assets.map(asset => ({
            id: asset.id,
            assetType: asset.asset_type,
            fileName: asset.file_name,
            storageKey: asset.storage_key,
            mimeType: asset.mime_type,
            fileSizeBytes: asset.file_size_bytes,
            dimensions: asset.width_px && asset.height_px
              ? { width: asset.width_px, height: asset.height_px }
              : null,
            processingStatus: asset.processing_status,
            uploadedAt: asset.uploaded_at
          })),
          colors: colors.map(color => ({
            id: color.id,
            hex: color.color_hex,
            rgb: color.color_rgb,
            hsl: color.color_hsl,
            name: color.color_name,
            role: color.color_role,
            prominence: color.prominence_score,
            pixelPercentage: color.pixel_percentage,
            displayOrder: color.display_order
          }))
        }
      };
    } catch (error: any) {
      console.error('[Brand Kits API] Failed to get brand kit:', error);
      return reply.code(500).send({
        error: 'Failed to get brand kit',
        message: error.message
      });
    }
  });

  /**
   * PUT /api/brand-kits/:id
   * Update brand kit
   */
  fastify.put<{
    Params: { id: string };
    Body: {
      name?: string;
      description?: string;
      status?: 'active' | 'archived';
    };
  }>('/api/brand-kits/:id', async (request, reply) => {
    const { id } = request.params;
    const updates = request.body;

    try {
      const updated = await brandKitsRepo.update(id, updates);

      if (!updated) {
        return reply.code(404).send({ error: 'Brand kit not found' });
      }

      await eventsRepo.log('brand_kit.updated', {
        brandKitId: id,
        updates: Object.keys(updates)
      }, { sessionId: undefined, appId: undefined, actor: 'user' });

      return {
        success: true,
        brandKit: {
          id: updated.id,
          name: updated.name,
          description: updated.description,
          status: updated.status,
          updatedAt: updated.updated_at
        }
      };
    } catch (error: any) {
      console.error('[Brand Kits API] Failed to update brand kit:', error);
      return reply.code(500).send({
        error: 'Failed to update brand kit',
        message: error.message
      });
    }
  });

  /**
   * DELETE /api/brand-kits/:id
   * Delete brand kit (soft delete)
   */
  fastify.delete<{
    Params: { id: string };
  }>('/api/brand-kits/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      const deleted = await brandKitsRepo.delete(id);

      if (!deleted) {
        return reply.code(404).send({ error: 'Brand kit not found' });
      }

      await eventsRepo.log('brand_kit.deleted', {
        brandKitId: id
      }, { sessionId: undefined, appId: undefined, actor: 'user' });

      return { success: true };
    } catch (error: any) {
      console.error('[Brand Kits API] Failed to delete brand kit:', error);
      return reply.code(500).send({
        error: 'Failed to delete brand kit',
        message: error.message
      });
    }
  });

  /**
   * POST /api/brand-kits/:id/assets
   * Upload asset and extract color palette
   */
  fastify.post<{
    Params: { id: string };
  }>('/api/brand-kits/:id/assets', async (request, reply) => {
    const { id: brandKitId } = request.params;

    console.log('[Brand Kits API] Asset upload started for brand kit:', brandKitId);

    try {
      // Verify brand kit exists
      const brandKit = await brandKitsRepo.findById(brandKitId);
      if (!brandKit) {
        console.error('[Brand Kits API] Brand kit not found:', brandKitId);
        return reply.code(404).send({ error: 'Brand kit not found' });
      }

      console.log('[Brand Kits API] Brand kit found, fetching file...');

      // Get uploaded file
      const data = await (request as any).file();

      if (!data) {
        console.error('[Brand Kits API] No file data received');
        return reply.code(400).send({ error: 'No file uploaded' });
      }

      console.log('[Brand Kits API] File received:', data.filename, 'MIME:', data.mimetype);

      const buffer = await data.toBuffer();
      const fileName = data.filename;
      const mimeType = data.mimetype;

      console.log('[Brand Kits API] File buffered, size:', buffer.length, 'bytes');

      // Validate file type and determine asset kind
      const mimeToKind: Record<string, { kind: string; maxSize: number }> = {
        // Images (20MB)
        'image/png': { kind: 'image', maxSize: 20 * 1024 * 1024 },
        'image/jpeg': { kind: 'image', maxSize: 20 * 1024 * 1024 },
        'image/jpg': { kind: 'image', maxSize: 20 * 1024 * 1024 },
        'image/webp': { kind: 'image', maxSize: 20 * 1024 * 1024 },
        'image/svg+xml': { kind: 'logo', maxSize: 20 * 1024 * 1024 },
        'image/x-icon': { kind: 'icon', maxSize: 20 * 1024 * 1024 },
        'image/vnd.microsoft.icon': { kind: 'icon', maxSize: 20 * 1024 * 1024 },

        // Fonts (10MB)
        'font/ttf': { kind: 'font', maxSize: 10 * 1024 * 1024 },
        'font/otf': { kind: 'font', maxSize: 10 * 1024 * 1024 },
        'font/woff': { kind: 'font', maxSize: 10 * 1024 * 1024 },
        'font/woff2': { kind: 'font', maxSize: 10 * 1024 * 1024 },
        'application/x-font-ttf': { kind: 'font', maxSize: 10 * 1024 * 1024 },
        'application/x-font-otf': { kind: 'font', maxSize: 10 * 1024 * 1024 },
        'application/font-woff': { kind: 'font', maxSize: 10 * 1024 * 1024 },
        'application/font-woff2': { kind: 'font', maxSize: 10 * 1024 * 1024 },

        // Archives (200MB)
        'application/zip': { kind: 'brand_zip', maxSize: 200 * 1024 * 1024 },
        'application/x-zip-compressed': { kind: 'brand_zip', maxSize: 200 * 1024 * 1024 },

        // Videos (100MB)
        'video/mp4': { kind: 'video', maxSize: 100 * 1024 * 1024 },
      };

      const fileTypeInfo = mimeToKind[mimeType];
      if (!fileTypeInfo) {
        return reply.code(400).send({
          error: 'Invalid file type',
          details: [
            'Allowed types: PNG, JPEG, SVG, ICO (20MB max), TTF/OTF/WOFF/WOFF2 fonts (10MB max), ZIP archives (200MB max), MP4 videos (100MB max)'
          ]
        });
      }

      // Validate file size based on type
      if (buffer.length > fileTypeInfo.maxSize) {
        const maxSizeMB = Math.round(fileTypeInfo.maxSize / (1024 * 1024));
        return reply.code(400).send({
          error: 'File too large',
          details: [`Maximum file size for ${fileTypeInfo.kind} files is ${maxSizeMB}MB`]
        });
      }

      const assetKind = fileTypeInfo.kind;

      // Generate storage key
      const fileExt = fileName.split('.').pop() || 'bin';
      const storageKey = `brand-kits/${brandKit.user_id}/${brandKitId}/${randomUUID()}.${fileExt}`;

      // Save file to local storage
      const fullPath = join(UPLOAD_DIR, storageKey);
      await mkdir(join(UPLOAD_DIR, `brand-kits/${brandKit.user_id}/${brandKitId}`), { recursive: true });
      await writeFile(fullPath, buffer);

      // Create asset record with detected asset kind
      const asset = await assetsRepo.create({
        brandKitId,
        userId: brandKit.user_id,
        assetType: assetKind as 'logo' | 'image' | 'icon' | 'pattern',
        fileName,
        storageKey,
        storageProvider: 'local',
        mimeType,
        fileSizeBytes: buffer.length,
        metadata: { kind: assetKind } // Store detailed kind in metadata
      });

      // Extract color palette (async processing)
      (async () => {
        try {
          await assetsRepo.updateProcessingStatus(asset.id, 'processing');

          // Extract colors only for raster images (skip for SVG, fonts, videos, ZIPs)
          const shouldExtractColors = ['image', 'logo', 'icon'].includes(assetKind) && mimeType !== 'image/svg+xml';
          if (shouldExtractColors) {
            const sharp = (await import('sharp')).default;
            const metadata = await sharp(buffer).metadata();

            if (metadata.width && metadata.height) {
              await assetsRepo.updateDimensions(asset.id, metadata.width, metadata.height);
            }

            // Extract palette
            const palette = await paletteExtractor.extract(buffer, {
              maxColors: 5,
              minProminence: 0.05
            });

            // Save extracted colors
            const colorRecords = palette.colors.map((color, idx) => ({
              brandKitId,
              assetId: asset.id,
              colorHex: color.hex,
              colorRgb: color.rgb,
              colorHsl: color.hsl,
              colorName: PaletteExtractor.suggestColorName(color.hsl),
              colorRole: 'extracted' as const,
              prominenceScore: color.prominence,
              pixelPercentage: color.pixelPercentage,
              displayOrder: idx
            }));

            await colorsRepo.bulkCreate(colorRecords);

            console.log(`[Brand Kits API] Extracted ${palette.colors.length} colors from asset ${asset.id}`);
          }

          await assetsRepo.updateProcessingStatus(asset.id, 'completed');

          await eventsRepo.log('brand_kit.asset_processed', {
            brandKitId,
            assetId: asset.id,
            assetKind,
            colorsExtracted: shouldExtractColors
          }, { sessionId: undefined, appId: undefined, actor: 'system' });

        } catch (error: any) {
          console.error('[Brand Kits API] Palette extraction failed:', error);
          await assetsRepo.updateProcessingStatus(asset.id, 'failed', error.message);
        }
      })();

      return {
        success: true,
        asset: {
          id: asset.id,
          assetType: asset.asset_type,
          fileName: asset.file_name,
          processingStatus: asset.processing_status,
          uploadedAt: asset.uploaded_at
        }
      };

    } catch (error: any) {
      console.error('[Brand Kits API] Asset upload failed:', error);
      return reply.code(500).send({
        error: 'Asset upload failed',
        message: error.message
      });
    }
  });

  /**
   * DELETE /api/brand-kits/:id/assets/:assetId
   * Delete an asset
   */
  fastify.delete<{
    Params: { id: string; assetId: string };
  }>('/api/brand-kits/:id/assets/:assetId', async (request, reply) => {
    const { assetId } = request.params;

    try {
      // Delete associated colors first
      await colorsRepo.deleteByAssetId(assetId);

      // Delete asset
      const deleted = await assetsRepo.delete(assetId);

      if (!deleted) {
        return reply.code(404).send({ error: 'Asset not found' });
      }

      // TODO: Delete file from storage

      return { success: true };
    } catch (error: any) {
      console.error('[Brand Kits API] Asset deletion failed:', error);
      return reply.code(500).send({
        error: 'Asset deletion failed',
        message: error.message
      });
    }
  });

  /**
   * POST /api/brand-kits/:id/colors
   * Manually add a color to brand kit
   */
  fastify.post<{
    Params: { id: string };
    Body: {
      colorHex: string;
      colorName?: string;
      colorRole?: 'primary' | 'secondary' | 'accent' | 'neutral';
    };
  }>('/api/brand-kits/:id/colors', async (request, reply) => {
    const { id: brandKitId } = request.params;
    const { colorHex, colorName, colorRole } = request.body;

    // Validate hex color format
    if (!/^#[0-9A-Fa-f]{6}$/.test(colorHex)) {
      return reply.code(400).send({
        error: 'Invalid color format',
        details: ['Color must be in hexadecimal format (e.g., #FF5733)']
      });
    }

    try {
      // Convert hex to RGB
      const r = parseInt(colorHex.slice(1, 3), 16);
      const g = parseInt(colorHex.slice(3, 5), 16);
      const b = parseInt(colorHex.slice(5, 7), 16);

      const colorRgb = { r, g, b };

      // Calculate HSL
      const hslCalc = (rgb: { r: number; g: number; b: number }) => {
        const rNorm = rgb.r / 255;
        const gNorm = rgb.g / 255;
        const bNorm = rgb.b / 255;

        const max = Math.max(rNorm, gNorm, bNorm);
        const min = Math.min(rNorm, gNorm, bNorm);
        const diff = max - min;

        let h = 0;
        let s = 0;
        const l = (max + min) / 2;

        if (diff !== 0) {
          s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);

          switch (max) {
            case rNorm:
              h = ((gNorm - bNorm) / diff + (gNorm < bNorm ? 6 : 0)) / 6;
              break;
            case gNorm:
              h = ((bNorm - rNorm) / diff + 2) / 6;
              break;
            case bNorm:
              h = ((rNorm - gNorm) / diff + 4) / 6;
              break;
          }
        }

        return {
          h: Math.round(h * 360),
          s: Math.round(s * 100),
          l: Math.round(l * 100)
        };
      };

      const colorHsl = hslCalc(colorRgb);

      const color = await colorsRepo.create({
        brandKitId,
        colorHex: colorHex.toUpperCase(),
        colorRgb,
        colorHsl,
        colorName: colorName || PaletteExtractor.suggestColorName(colorHsl),
        colorRole
      });

      return {
        success: true,
        color: {
          id: color.id,
          hex: color.color_hex,
          rgb: color.color_rgb,
          hsl: color.color_hsl,
          name: color.color_name,
          role: color.color_role
        }
      };

    } catch (error: any) {
      console.error('[Brand Kits API] Color creation failed:', error);
      return reply.code(500).send({
        error: 'Color creation failed',
        message: error.message
      });
    }
  });

  /**
   * PUT /api/brand-kits/:id/colors/:colorId
   * Update color properties
   */
  fastify.put<{
    Params: { id: string; colorId: string };
    Body: {
      colorName?: string;
      colorRole?: 'primary' | 'secondary' | 'accent' | 'neutral';
      displayOrder?: number;
    };
  }>('/api/brand-kits/:id/colors/:colorId', async (request, reply) => {
    const { colorId } = request.params;
    const { colorName, colorRole, displayOrder } = request.body;

    // Map to database column names
    const updates = {
      color_name: colorName,
      color_role: colorRole,
      display_order: displayOrder
    };

    try {
      const updated = await colorsRepo.update(colorId, updates);

      if (!updated) {
        return reply.code(404).send({ error: 'Color not found' });
      }

      return {
        success: true,
        color: {
          id: updated.id,
          hex: updated.color_hex,
          name: updated.color_name,
          role: updated.color_role,
          displayOrder: updated.display_order
        }
      };

    } catch (error: any) {
      console.error('[Brand Kits API] Color update failed:', error);
      return reply.code(500).send({
        error: 'Color update failed',
        message: error.message
      });
    }
  });

  /**
   * DELETE /api/brand-kits/:id/colors/:colorId
   * Delete a color
   */
  fastify.delete<{
    Params: { id: string; colorId: string };
  }>('/api/brand-kits/:id/colors/:colorId', async (request, reply) => {
    const { colorId } = request.params;

    try {
      const deleted = await colorsRepo.delete(colorId);

      if (!deleted) {
        return reply.code(404).send({ error: 'Color not found' });
      }

      return { success: true };
    } catch (error: any) {
      console.error('[Brand Kits API] Color deletion failed:', error);
      return reply.code(500).send({
        error: 'Color deletion failed',
        message: error.message
      });
    }
  });

  /**
   * GET /api/brand-assets/download/*
   * Download brand asset file (for WebContainer mirroring)
   * Uses wildcard to capture full storage key path with slashes
   */
  fastify.get('/api/brand-assets/download/*', async (request, reply) => {
    // Extract storage key from URL path after /download/
    const fullPath = (request.url || '').split('/api/brand-assets/download/')[1];

    if (!fullPath) {
      return reply.code(400).send({
        error: 'Missing storage key in URL'
      });
    }

    try {
      // Decode storage key from URL
      const decodedKey = decodeURIComponent(fullPath);

      // Read file from local storage
      const diskPath = join(UPLOAD_DIR, decodedKey);
      const fileBuffer = await readFile(diskPath);

      // Determine MIME type from file extension
      const ext = decodedKey.split('.').pop()?.toLowerCase();
      const mimeTypes: Record<string, string> = {
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'svg': 'image/svg+xml',
        'ico': 'image/x-icon',
        'ttf': 'font/ttf',
        'otf': 'font/otf',
        'woff': 'font/woff',
        'woff2': 'font/woff2',
        'mp4': 'video/mp4',
        'zip': 'application/zip',
      };
      const mimeType = (ext && mimeTypes[ext]) || 'application/octet-stream';

      // Send file
      reply.header('Content-Type', mimeType);
      reply.header('Content-Disposition', `inline`);
      reply.send(fileBuffer);

    } catch (error: any) {
      console.error('[Brand Kits API] Asset download failed:', error);
      return reply.code(404).send({
        error: 'Asset not found',
        message: error.message
      });
    }
  });

  console.log('[Brand Kits] ✓ All brand kit routes registered successfully');
}
