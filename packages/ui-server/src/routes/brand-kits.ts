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
  UsersRepository,
  AssetProcessor,
  AssetVisionAnalyzer
} from '@eitherway/database';
import { writeFile, mkdir, readFile, rm } from 'fs/promises';
import { join } from 'path';

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
  const assetProcessor = new AssetProcessor();
  const visionAnalyzer = process.env.ANTHROPIC_API_KEY
    ? new AssetVisionAnalyzer(process.env.ANTHROPIC_API_KEY)
    : null; // Vision analysis is optional

  // Storage configuration (local for now, can be upgraded to S3/GCS)
  const UPLOAD_DIR = process.env.BRAND_KIT_UPLOAD_DIR || '/tmp/eitherway-brand-kits';

  console.log('[Brand Kits] Upload directory:', UPLOAD_DIR);
  console.log('[Brand Kits] Repositories initialized');

  /**
   * Helper: Clean up temporary files for a brand kit
   * Called when:
   * - Brand kit is archived (Start New Chat)
   * - Brand kit is deleted
   * - Assets are successfully synced to VFS
   */
  async function cleanupBrandKitTempFiles(brandKitId: string, userId: string): Promise<void> {
    try {
      const brandKitTempDir = join(UPLOAD_DIR, `brand-kits/${userId}/${brandKitId}`);
      await rm(brandKitTempDir, { recursive: true, force: true });
      console.log(`[Brand Kits] Cleaned up temp files for brand kit: ${brandKitId}`);
    } catch (error: any) {
      console.error(`[Brand Kits] Failed to cleanup temp files for brand kit ${brandKitId}:`, error.message);
      // Don't throw - cleanup is best-effort
    }
  }

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
   * POST /api/brand-kits/:id/cleanup-temp
   * Clean up temporary files after assets have been synced to VFS
   * Called by frontend after successful VFS sync
   */
  fastify.post<{
    Params: { id: string };
  }>('/api/brand-kits/:id/cleanup-temp', async (request, reply) => {
    const { id: brandKitId } = request.params;

    try {
      const brandKit = await brandKitsRepo.findById(brandKitId);
      if (!brandKit) {
        return reply.code(404).send({ error: 'Brand kit not found' });
      }

      await cleanupBrandKitTempFiles(brandKitId, brandKit.user_id);

      return {
        success: true,
        message: 'Temp files cleaned up successfully'
      };
    } catch (error: any) {
      console.error('[Brand Kits API] Failed to cleanup temp files:', error);
      return reply.code(500).send({
        error: 'Failed to cleanup temp files',
        message: error.message
      });
    }
  });

  /**
   * POST /api/brand-kits/user/:userId/archive-active
   * Archive all active brand kits for a user (for session clearing)
   * Body is optional (can be empty)
   */
  fastify.post<{
    Params: { userId: string };
    Body?: any;
  }>('/api/brand-kits/user/:userId/archive-active', async (request, reply) => {
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

      const activeBrandKits = await brandKitsRepo.findByUserId(userRecord.id, 'active');

      // Archive each one and clean up temp files
      let archivedCount = 0;
      for (const kit of activeBrandKits) {
        await brandKitsRepo.update(kit.id, { status: 'archived' });
        // Clean up temp files (async, non-blocking)
        cleanupBrandKitTempFiles(kit.id, userRecord.id).catch(err =>
          console.error(`[Brand Kits API] Cleanup failed for ${kit.id}:`, err)
        );
        archivedCount++;
      }

      console.log(`[Brand Kits API] Archived ${archivedCount} active brand kits for user ${userId}`);

      return {
        success: true,
        archivedCount
      };

    } catch (error: any) {
      console.error('[Brand Kits API] Failed to archive active brand kits:', error);
      return reply.code(500).send({
        error: 'Failed to archive active brand kits',
        message: error.message
      });
    }
  });

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

      const brandKits = await brandKitsRepo.findByUserId(userRecord.id, 'active');

      if (brandKits.length === 0) {
        return reply.code(404).send({
          error: 'No active brand kit found',
          userId
        });
      }

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
            metadata: asset.metadata
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
            uploadedAt: asset.uploaded_at,
            metadata: asset.metadata
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

  fastify.delete<{
    Params: { id: string };
  }>('/api/brand-kits/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      const brandKit = await brandKitsRepo.findById(id);
      if (!brandKit) {
        return reply.code(404).send({ error: 'Brand kit not found' });
      }

      const deleted = await brandKitsRepo.delete(id);

      if (!deleted) {
        return reply.code(404).send({ error: 'Brand kit not found' });
      }

      // Clean up temp files (async, non-blocking)
      cleanupBrandKitTempFiles(id, brandKit.user_id).catch(err =>
        console.error(`[Brand Kits API] Cleanup failed for ${id}:`, err)
      );

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
   * Upload asset with intelligent processing and vision analysis
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

      console.log('[Brand Kits API] Brand kit found, fetching multipart data...');

      // Use parts() to read both file and form fields
      const parts = (request as any).parts();
      let buffer: Buffer | null = null;
      let fileName: string | null = null;
      let mimeType: string | null = null;
      let categoryField: string | null = null;

      // Iterate through all parts (files and fields)
      for await (const part of parts) {
        if (part.type === 'file') {
          // This is the file upload - consume it immediately
          console.log('[Brand Kits API] File part received:', part.filename, 'MIME:', part.mimetype);
          fileName = part.filename;
          mimeType = part.mimetype;
          buffer = await part.toBuffer();
          console.log('[Brand Kits API] File buffered, size:', buffer.length, 'bytes');
        } else if (part.type === 'field' && part.fieldname === 'category') {
          // This is the category field
          categoryField = part.value as string;
          console.log('[Brand Kits API] Category field received:', categoryField);
        }
      }

      if (!buffer || !fileName || !mimeType) {
        console.error('[Brand Kits API] No file data received');
        return reply.code(400).send({ error: 'No file uploaded' });
      }

      console.log('[Brand Kits API] User selected category:', categoryField);
      console.log('[Brand Kits API] Starting intelligent asset processing...');

      // Determine asset kind based on user's category selection and file validation
      // This respects user intent while validating file compatibility
      const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';

      // Map user category to asset kind
      const categoryToKind: Record<string, string> = {
        'icons': 'icon',
        'logos': 'logo',
        'images': 'image',
        'fonts': 'font',
        'videos': 'video'
      };

      // Determine intended kind from category
      let assetKind = categoryField && categoryToKind[categoryField]
        ? categoryToKind[categoryField]
        : 'logo'; // default fallback

      console.log('[Brand Kits API] Determined asset kind:', assetKind, 'from category:', categoryField);

      // Validate file type compatibility with category
      const validExtensionsByKind: Record<string, { extensions: string[]; mimeTypes: string[]; maxSize: number }> = {
        'icon': {
          extensions: ['png', 'jpg', 'jpeg', 'svg', 'ico'],
          mimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'],
          maxSize: 20 * 1024 * 1024
        },
        'logo': {
          extensions: ['png', 'jpg', 'jpeg', 'svg', 'ico'],
          mimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'],
          maxSize: 20 * 1024 * 1024
        },
        'image': {
          extensions: ['png', 'jpg', 'jpeg', 'svg'],
          mimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'],
          maxSize: 20 * 1024 * 1024
        },
        'font': {
          extensions: ['ttf', 'otf', 'woff', 'woff2'],
          mimeTypes: [
            'font/ttf', 'font/otf', 'font/woff', 'font/woff2',
            'application/x-font-ttf', 'application/x-font-otf',
            'application/font-woff', 'application/font-woff2',
            'application/octet-stream' // Fallback for fonts
          ],
          maxSize: 10 * 1024 * 1024
        },
        'video': {
          extensions: ['mp4'],
          mimeTypes: ['video/mp4', 'application/octet-stream'], // Fallback for videos
          maxSize: 100 * 1024 * 1024
        },
        'brand_zip': {
          extensions: ['zip'],
          mimeTypes: ['application/zip', 'application/x-zip-compressed'],
          maxSize: 200 * 1024 * 1024
        }
      };

      const validationRules = validExtensionsByKind[assetKind];
      if (!validationRules) {
        return reply.code(400).send({
          error: 'Invalid asset category',
          details: [`Category '${categoryField}' is not supported`]
        });
      }

      // Check file extension first (more reliable than MIME type)
      const isValidExtension = validationRules.extensions.includes(fileExtension);
      const isValidMimeType = validationRules.mimeTypes.includes(mimeType);

      if (!isValidExtension && !isValidMimeType) {
        return reply.code(400).send({
          error: 'Unsupported file type',
          details: [
            `File type not compatible with ${assetKind} category`,
            `Allowed extensions: ${validationRules.extensions.join(', ')}`,
            `Received: ${fileName} (${mimeType})`
          ]
        });
      }

      // For fonts and videos with generic MIME types, validate by extension
      if (assetKind === 'font' && mimeType === 'application/octet-stream') {
        if (!['ttf', 'otf', 'woff', 'woff2'].includes(fileExtension)) {
          return reply.code(400).send({
            error: 'Invalid font file',
            details: [`Font files must have .ttf, .otf, .woff, or .woff2 extension`]
          });
        }
      }

      if (assetKind === 'video' && mimeType === 'application/octet-stream') {
        if (fileExtension !== 'mp4') {
          return reply.code(400).send({
            error: 'Invalid video file',
            details: [`Video files must have .mp4 extension`]
          });
        }
      }

      // Check file size
      if (buffer.length > validationRules.maxSize) {
        const maxSizeMB = Math.round(validationRules.maxSize / (1024 * 1024));
        return reply.code(400).send({
          error: 'File too large',
          details: [`Maximum file size for ${assetKind} files is ${maxSizeMB}MB`]
        });
      }

      console.log(`[Brand Kits API] Processing ${assetKind} asset: ${fileName}`);

      // === STEP 1: Process Asset (Generate Variants) ===
      let processedData;
      try {
        if (['image', 'logo', 'icon'].includes(assetKind)) {
          processedData = await assetProcessor.processImage(buffer, fileName, mimeType, brandKitId, brandKit.user_id);
          console.log(`[Brand Kits API] Generated ${processedData.variants.length} image variants`);
        } else if (assetKind === 'font') {
          processedData = await assetProcessor.processFont(buffer, fileName, mimeType, brandKitId, brandKit.user_id);
          console.log(`[Brand Kits API] Processed font: ${processedData.metadata.familyName} ${processedData.metadata.styleName}`);
        } else if (assetKind === 'video') {
          processedData = await assetProcessor.processVideo(buffer, fileName, brandKitId, brandKit.user_id);
          console.log('[Brand Kits API] Processed video asset');
        } else {
          // For other types (brand_zip, etc), skip processing
          processedData = {
            variants: [{
              purpose: 'original' as const,
              fileName,
              storageKey: `brand-kits/${brandKit.user_id}/${brandKitId}/${fileName}`,
              width: 0,
              height: 0,
              fileSizeBytes: buffer.length,
              mimeType,
              buffer
            }],
            metadata: {}
          };
        }
      } catch (error: any) {
        console.error('[Brand Kits API] Asset processing failed:', error);
        return reply.code(500).send({
          error: 'Asset processing failed',
          message: error.message
        });
      }

      // === STEP 2: Vision Analysis (For Images) ===
      let aiAnalysis = null;
      if (visionAnalyzer && ['image', 'logo', 'icon'].includes(assetKind) && 'originalWidth' in processedData.metadata) {
        try {
          console.log('[Brand Kits API] Running vision analysis...');
          aiAnalysis = await visionAnalyzer.analyzeAsset(
            buffer,
            fileName,
            mimeType,
            processedData.metadata as import('@eitherway/database').ImageMetadata,
            assetKind as 'image' | 'logo' | 'icon'
          );
          console.log('[Brand Kits API] Vision analysis complete:', aiAnalysis.description.substring(0, 50) + '...');
        } catch (error: any) {
          console.warn('[Brand Kits API] Vision analysis failed (non-critical):', error.message);
          // Vision analysis is optional, continue without it
        }
      } else if (assetKind === 'font' && visionAnalyzer && 'familyName' in processedData.metadata) {
        // For fonts, use metadata-based analysis
        try {
          aiAnalysis = await visionAnalyzer.analyzeAsset(
            buffer,
            fileName,
            mimeType,
            processedData.metadata as import('@eitherway/database').FontMetadata,
            'font'
          );
        } catch (error: any) {
          console.warn('[Brand Kits API] Font analysis failed (non-critical):', error.message);
        }
      } else if (assetKind === 'video' && visionAnalyzer && 'duration' in processedData.metadata) {
        // For videos, use metadata-based analysis
        try {
          aiAnalysis = await visionAnalyzer.analyzeAsset(
            buffer,
            fileName,
            mimeType,
            processedData.metadata as import('@eitherway/database').VideoMetadata,
            'video'
          );
        } catch (error: any) {
          console.warn('[Brand Kits API] Video analysis failed (non-critical):', error.message);
        }
      }

      // === STEP 3: Save All Variants to Disk ===
      const variantPaths: Array<{ purpose: string; path: string; size: number }> = [];
      for (const variant of processedData.variants) {
        try {
          const fullPath = join(UPLOAD_DIR, variant.storageKey);
          const dirPath = join(UPLOAD_DIR, `brand-kits/${brandKit.user_id}/${brandKitId}`);
          await mkdir(dirPath, { recursive: true });
          await writeFile(fullPath, variant.buffer);

          variantPaths.push({
            purpose: variant.purpose,
            path: variant.storageKey,
            size: variant.fileSizeBytes
          });

          console.log(`[Brand Kits API] Saved variant: ${variant.purpose} → ${variant.fileName} (${variant.fileSizeBytes} bytes)`);
        } catch (error: any) {
          console.error(`[Brand Kits API] Failed to save variant ${variant.fileName}:`, error);
        }
      }

      // === STEP 4: Create Database Record with Metadata ===
      const originalVariant = processedData.variants.find(v => v.purpose === 'original');
      const metadata = {
        kind: assetKind,
        aspectRatio: (processedData.metadata as any).aspectRatio,
        hasAlpha: (processedData.metadata as any).hasAlpha,
        familyName: (processedData.metadata as any).familyName,
        weight: (processedData.metadata as any).weight,
        style: (processedData.metadata as any).style,
        variants: processedData.variants.map(v => ({
          purpose: v.purpose,
          fileName: v.fileName,
          storageKey: v.storageKey,
          width: v.width,
          height: v.height,
          fileSizeBytes: v.fileSizeBytes,
          mimeType: v.mimeType
        })),
        aiAnalysis: aiAnalysis || undefined
      };

      const asset = await assetsRepo.create({
        brandKitId,
        userId: brandKit.user_id,
        assetType: assetKind as 'logo' | 'image' | 'icon' | 'pattern' | 'font' | 'video',
        fileName,
        storageKey: originalVariant?.storageKey || `brand-kits/${brandKit.user_id}/${brandKitId}/${fileName}`,
        storageProvider: 'local',
        mimeType,
        fileSizeBytes: buffer.length,
        widthPx: originalVariant?.width,
        heightPx: originalVariant?.height,
        metadata
      });

      // Mark as completed
      await assetsRepo.updateProcessingStatus(asset.id, 'completed');

      await eventsRepo.log('brand_kit.asset_processed', {
        brandKitId,
        assetId: asset.id,
        assetKind,
        variantsGenerated: processedData.variants.length,
        hasAIAnalysis: !!aiAnalysis
      }, { sessionId: undefined, appId: undefined, actor: 'system' });

      console.log('[Brand Kits API] Asset upload complete:', asset.id);

      return {
        success: true,
        asset: {
          id: asset.id,
          assetType: asset.asset_type,
          fileName: asset.file_name,
          processingStatus: 'completed',
          uploadedAt: asset.uploaded_at,
          variantsGenerated: processedData.variants.length,
          aiAnalysis: aiAnalysis ? {
            description: aiAnalysis.description,
            bestFor: aiAnalysis.recommendations.bestFor
          } : undefined
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
   * POST /api/brand-kits/:id/aggregate-colors
   * Aggregate color palette across ALL assets in the brand kit
   * This calculates global color prominence across all uploaded images
   */
  fastify.post<{
    Params: { id: string };
  }>('/api/brand-kits/:id/aggregate-colors', async (request, reply) => {
    const { id: brandKitId } = request.params;

    console.log('[Brand Kits API] Starting color aggregation for brand kit:', brandKitId);

    try {
      // Verify brand kit exists
      const brandKit = await brandKitsRepo.findById(brandKitId);
      if (!brandKit) {
        return reply.code(404).send({ error: 'Brand kit not found' });
      }

      const assets = await assetsRepo.findByBrandKitId(brandKitId);

      // Filter for processable image assets
      const imageAssets = assets.filter(asset => {
        const kind = (asset.metadata as any)?.kind || asset.asset_type;
        return ['image', 'logo', 'icon'].includes(kind) &&
               asset.mime_type !== 'image/svg+xml' &&
               asset.processing_status === 'completed';
      });

      await colorsRepo.deleteByBrandKitId(brandKitId);

      if (imageAssets.length === 0) {
        console.log('[Brand Kits API] No image assets to process - colors cleared');
        return {
          success: true,
          message: 'No image assets available for color extraction',
          colorsExtracted: 0,
          assetsProcessed: 0,
          colors: []
        };
      }

      console.log(`[Brand Kits API] Processing ${imageAssets.length} image assets for color aggregation`);

      // Aggregate color data across all images
      const colorMap = new Map<string, { rgb: any; hsl: any; count: number }>();
      let totalPixels = 0;

      for (const asset of imageAssets) {
        try {
          const assetPath = join(UPLOAD_DIR, asset.storage_key);
          const assetBuffer = await readFile(assetPath);

          // Extract colors from this asset
          const palette = await paletteExtractor.extract(assetBuffer, {
            maxColors: 10, // Extract more colors per image for better aggregation
            minProminence: 0.01
          });

          const sharp = (await import('sharp')).default;
          const metadata = await sharp(assetBuffer).metadata();
          const imagePixels = (metadata.width || 0) * (metadata.height || 0);

          // Aggregate color counts
          for (const color of palette.colors) {
            const pixelCount = Math.round((color.pixelPercentage || 0) * imagePixels);
            totalPixels += pixelCount;

            if (colorMap.has(color.hex)) {
              const existing = colorMap.get(color.hex)!;
              existing.count += pixelCount;
            } else {
              colorMap.set(color.hex, {
                rgb: color.rgb,
                hsl: color.hsl,
                count: pixelCount
              });
            }
          }

          console.log(`[Brand Kits API] Processed asset ${asset.file_name}: ${palette.colors.length} colors`);

        } catch (error: any) {
          console.error(`[Brand Kits API] Failed to process asset ${asset.file_name}:`, error);
          // Continue with other assets
        }
      }

      const aggregatedColors = Array.from(colorMap.entries())
        .map(([hex, data]) => ({
          hex,
          rgb: data.rgb,
          hsl: data.hsl,
          prominence: data.count / totalPixels,
          pixelPercentage: (data.count / totalPixels) * 100
        }))
        .sort((a, b) => b.prominence - a.prominence)
        .slice(0, 5); // Take top 5 colors

      console.log(`[Brand Kits API] Aggregated ${aggregatedColors.length} colors from ${colorMap.size} unique colors`);

      if (aggregatedColors.length > 0) {
        const colorRecords = aggregatedColors
          .map((color, idx) => {
            try {
              // Clamp RGB values to 0-255 range to prevent database constraint violations
              const clampedRgb = {
                r: Math.min(255, Math.max(0, Math.round(color.rgb.r))),
                g: Math.min(255, Math.max(0, Math.round(color.rgb.g))),
                b: Math.min(255, Math.max(0, Math.round(color.rgb.b)))
              };

              // Clamp HSL values to valid ranges
              const clampedHsl = {
                h: Math.min(360, Math.max(0, Math.round(color.hsl.h))),
                s: Math.min(100, Math.max(0, Math.round(color.hsl.s))),
                l: Math.min(100, Math.max(0, Math.round(color.hsl.l)))
              };

              // Regenerate hex from clamped RGB to ensure validity
              // This fixes malformed hex codes from the palette extractor
              const validHex = '#' +
                clampedRgb.r.toString(16).padStart(2, '0') +
                clampedRgb.g.toString(16).padStart(2, '0') +
                clampedRgb.b.toString(16).padStart(2, '0');

              if (!/^#[0-9A-Fa-f]{6}$/.test(validHex)) {
                console.warn(`[Brand Kits API] Skipping invalid color hex: ${validHex} (original: ${color.hex})`);
                return null;
              }

              return {
                brandKitId,
                assetId: undefined, // Aggregated colors don't belong to a single asset
                colorHex: validHex.toUpperCase(),
                colorRgb: clampedRgb,
                colorHsl: clampedHsl,
                colorName: PaletteExtractor.suggestColorName(clampedHsl),
                colorRole: 'extracted' as const,
                prominenceScore: color.prominence,
                pixelPercentage: color.pixelPercentage,
                displayOrder: idx
              };
            } catch (error: any) {
              console.error(`[Brand Kits API] Failed to process color ${color.hex}:`, error.message);
              return null;
            }
          })
          .filter((record): record is NonNullable<typeof record> => record !== null);

        if (colorRecords.length > 0) {
          await colorsRepo.bulkCreate(colorRecords);
        }

        console.log(`[Brand Kits API] Saved ${colorRecords.length} aggregated colors`);
      }

      await eventsRepo.log('brand_kit.colors_aggregated', {
        brandKitId,
        assetsProcessed: imageAssets.length,
        colorsExtracted: aggregatedColors.length
      }, { sessionId: undefined, appId: undefined, actor: 'system' });

      return {
        success: true,
        colorsExtracted: aggregatedColors.length,
        assetsProcessed: imageAssets.length,
        colors: aggregatedColors.map(c => ({
          hex: c.hex,
          prominence: Math.round(c.prominence * 100) + '%'
        }))
      };

    } catch (error: any) {
      console.error('[Brand Kits API] Color aggregation failed:', error);
      return reply.code(500).send({
        error: 'Color aggregation failed',
        message: error.message
      });
    }
  });

  fastify.delete<{
    Params: { id: string; assetId: string };
  }>('/api/brand-kits/:id/assets/:assetId', async (request, reply) => {
    const { assetId } = request.params;

    try {
      await colorsRepo.deleteByAssetId(assetId);

      const deleted = await assetsRepo.delete(assetId);

      if (!deleted) {
        return reply.code(404).send({ error: 'Asset not found' });
      }

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

  fastify.get('/api/brand-assets/download/*', async (request, reply) => {
    // Extract storage key from URL path after /download/
    const fullPath = (request.url || '').split('/api/brand-assets/download/')[1];

    console.log('[Brand Assets API] GET /download/* - Full path:', fullPath);

    if (!fullPath) {
      console.error('[Brand Assets API] Missing storage key in URL');
      return reply.code(400).send({
        error: 'Missing storage key in URL'
      });
    }

    try {
      // Decode storage key from URL
      const decodedKey = decodeURIComponent(fullPath);
      console.log('[Brand Assets API] Decoded storage key:', decodedKey);

      // Read file from local storage
      const diskPath = join(UPLOAD_DIR, decodedKey);
      console.log('[Brand Assets API] Reading from disk:', diskPath);

      const { stat } = await import('fs/promises');
      try {
        const stats = await stat(diskPath);
        console.log('[Brand Assets API] File found - Size:', stats.size, 'bytes');
      } catch (statError: any) {
        console.error('[Brand Assets API] File not found on disk:', diskPath);
        console.error('[Brand Assets API] Upload directory:', UPLOAD_DIR);
        console.error('[Brand Assets API] Storage key:', decodedKey);
        throw new Error(`File not found: ${decodedKey}`);
      }

      const fileBuffer = await readFile(diskPath);
      console.log('[Brand Assets API] Success: File read successfully:', fileBuffer.length, 'bytes');

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

      reply.header('Content-Type', mimeType);
      reply.header('Content-Disposition', `inline`);
      reply.header('Content-Length', fileBuffer.length.toString());
      console.log('[Brand Assets API] Success: Sending file with Content-Type:', mimeType);
      reply.send(fileBuffer);

    } catch (error: any) {
      console.error('[Brand Assets API] Error: Asset download failed:', error);
      console.error('[Brand Assets API] Error details:', {
        message: error.message,
        code: error.code,
        path: error.path
      });
      return reply.code(404).send({
        error: 'Asset not found',
        message: error.message,
        details: `Upload directory: ${UPLOAD_DIR}`
      });
    }
  });

  console.log('[Brand Kits] Success: All brand kit routes registered successfully');
}
