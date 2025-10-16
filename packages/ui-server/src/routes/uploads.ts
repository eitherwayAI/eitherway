/**
 * Upload routes for user image uploads
 * Handles multipart file uploads, converts to WebP, creates responsive variants
 */

import type { FastifyInstance } from 'fastify';
import { DatabaseClient, PostgresFileStore, SessionsRepository } from '@eitherway/database';
import sharp from 'sharp';

export async function registerUploadRoutes(fastify: FastifyInstance, db: DatabaseClient) {
  const fileStore = new PostgresFileStore(db);
  const sessions = new SessionsRepository(db);

  /**
   * POST /api/sessions/:sessionId/uploads/image
   * Upload an image file, convert to WebP, create responsive variants
   */
  fastify.post<{
    Params: { sessionId: string };
  }>('/api/sessions/:sessionId/uploads/image', async (req, reply) => {
    const { sessionId } = req.params;

    // Verify session exists and has an app
    const session = await sessions.findById(sessionId);
    if (!session?.app_id) {
      return reply.code(400).send({ error: 'No app found for session' });
    }

    // Get uploaded file
    const data = await (req as any).file();
    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }

    try {
      // Convert file to buffer
      const buf = await data.toBuffer();

      // Validate it's an image and get metadata
      const meta = await sharp(buf).metadata();
      if (!meta.width || !meta.height) {
        return reply.code(400).send({ error: 'Invalid image file' });
      }

      // Resize to max dimensions (preserve aspect ratio)
      const maxW = 1920;
      const maxH = 1080;
      const base = sharp(buf).resize({
        width: maxW,
        height: maxH,
        fit: 'inside',
        withoutEnlargement: true,
      });

      // Create responsive variants
      const variants = [
        { suffix: '640w', width: 640 },
        { suffix: '1280w', width: 1280 },
        { suffix: '1920w', width: 1920 },
      ];

      // Generate unique filename
      const nameBase = Date.now().toString(36);
      const publicDir = '/public/uploads';
      const htmlDir = '/uploads';

      // Convert original to WebP and save
      const originalBytes = await base.webp({ quality: 85 }).toBuffer();
      const originalPath = `${publicDir}/${nameBase}.webp`;
      await fileStore.write(session.app_id, originalPath, originalBytes, 'image/webp');

      // Track all generated files with their sizes
      const output: { size: number; htmlPath: string; fsPath: string }[] = [
        {
          size: meta.width || 0,
          htmlPath: `${htmlDir}/${nameBase}.webp`,
          fsPath: originalPath,
        },
      ];

      // Create and save responsive variants
      for (const v of variants) {
        if (v.width >= (meta.width || 0)) continue; // Skip if variant is larger than original

        const bytes = await sharp(originalBytes)
          .resize({ width: v.width, withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer();

        const fsPath = `${publicDir}/${nameBase}-${v.suffix}.webp`;
        await fileStore.write(session.app_id, fsPath, bytes, 'image/webp');

        output.push({
          size: v.width,
          htmlPath: `${htmlDir}/${nameBase}-${v.suffix}.webp`,
          fsPath,
        });
      }

      // Sort by size (largest first) for srcset
      output.sort((a, b) => b.size - a.size);

      // Build srcset string
      const srcset = output.map((o) => `${o.htmlPath} ${o.size}w`).join(', ');

      // Build responsive <picture> element
      const picture = `<picture>
  <source srcset="${srcset}" type="image/webp" />
  <img src="${htmlDir}/${nameBase}.webp" alt="User uploaded image" loading="lazy" style="max-width:100%;height:auto" />
</picture>`;

      return {
        ok: true,
        files: output,
        html: picture.trim(),
        message: `Image uploaded successfully. ${output.length} variant(s) created.`,
      };
    } catch (error: any) {
      console.error('[Upload Error]', error);
      return reply.code(500).send({
        error: `Failed to process image: ${error.message}`,
      });
    }
  });
}
