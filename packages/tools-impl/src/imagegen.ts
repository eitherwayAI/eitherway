/**
 * eithergen--generate_image: Database-backed image generation
 *
 * CRITICAL: This tool uses the ImageGenerationService which:
 * - Uses response_format: 'b64_json' to avoid TTL expiration
 * - Stores images in PostgreSQL (compatible with VFS)
 * - Validates images with sharp
 * - Polls until completion
 */

import type { ToolExecutor, ExecutionContext, ToolExecutorResult } from '@eitherway/tools-core';
import { SecurityGuard } from './security.js';
import { ImageGenerationService, createDatabaseClient, PostgresFileStore } from '@eitherway/database';

export class ImageGenExecutor implements ToolExecutor {
  name = 'eithergen--generate_image';

  async execute(input: Record<string, any>, context: ExecutionContext): Promise<ToolExecutorResult> {
    const { prompt, path, size = '1024x1024', quality = 'standard' } = input;

    // Security check
    const guard = new SecurityGuard(context.config.security);
    if (!guard.isPathAllowed(path)) {
      return {
        content: `Error: Access denied to path '${path}'. Path is not in allowed workspaces.`,
        isError: true,
      };
    }

    // Validate OPENAI_API_KEY
    if (!process.env.OPENAI_API_KEY) {
      return {
        content: `Error: OpenAI API key not configured.\n\nTo enable:\n1. Get API key from https://platform.openai.com/api-keys\n2. Set environment variable: export OPENAI_API_KEY=your_key`,
        isError: true,
      };
    }

    try {
      // Get database client and services
      const db = createDatabaseClient();
      const imageService = new ImageGenerationService(db);

      // Extract sessionId and appId from context if available
      const sessionId = context.sessionId;
      const appId = context.appId;

      if (!appId) {
        // DO NOT close db - it's a singleton shared by all tools
        return {
          content: `Error: No app context found. Image generation requires an active app/session.`,
          isError: true,
        };
      }

      // Map size to DALL-E 3 supported sizes
      const dalleSize = this.mapSize(size);

      // Start image generation job
      const jobId = await imageService.generateImage({
        prompt,
        model: 'dall-e-3',
        size: dalleSize,
        quality: quality as 'standard' | 'hd',
        n: 1,
        sessionId,
        appId,
      });

      // Poll until complete (60 second timeout)
      const result = await imageService.pollJobUntilComplete(jobId, 60000, 500);

      if (result.job.state !== 'succeeded') {
        // DO NOT close db - it's a singleton shared by all tools
        return {
          content: `Error: Image generation failed.\nJob ID: ${jobId}\nState: ${result.job.state}\nError: ${JSON.stringify(result.job.error)}`,
          isError: true,
        };
      }

      if (!result.assets || result.assets.length === 0) {
        // DO NOT close db - it's a singleton shared by all tools
        return {
          content: `Error: No image assets generated.\nJob ID: ${jobId}`,
          isError: true,
        };
      }

      // Get the actual image bytes
      const assetId = result.assets[0].id;
      const asset = await imageService.getAsset(assetId);

      if (!asset) {
        // DO NOT close db - it's a singleton shared by all tools
        return {
          content: `Error: Failed to retrieve generated image.\nAsset ID: ${assetId}`,
          isError: true,
        };
      }

      // Save to VFS (database-backed file system)
      const fileStore = new PostgresFileStore(db);
      const mimeType = asset.mimeType;
      const extension = mimeType === 'image/png' ? '.png' : '.jpg';

      // Ensure path has correct extension
      let finalPath = path;
      if (!finalPath.endsWith('.png') && !finalPath.endsWith('.jpg') && !finalPath.endsWith('.jpeg')) {
        finalPath = path + extension;
      }

      await fileStore.write(appId, finalPath, asset.bytes, mimeType);

      // DO NOT close db - it's a singleton shared by all tools
      // The server manages database lifecycle, not individual tools

      // Build public URL for the image
      const serverOrigin = process.env.SERVER_ORIGIN || 'http://localhost:3001';
      const assetUrl = `${serverOrigin}/api/images/assets/${assetId}`;

      // Determine the correct path for HTML/code usage
      // Vite serves files from public/ directory at the root path
      // So public/image.png should be referenced as /image.png
      let htmlPath = finalPath;
      if (finalPath.startsWith('public/') || finalPath.startsWith('/public/')) {
        // Remove the public/ prefix for Vite
        htmlPath = '/' + finalPath.replace(/^\/?public\//, '');
      } else if (!finalPath.startsWith('/')) {
        // Ensure absolute path
        htmlPath = '/' + finalPath;
      }

      return {
        content: `✅ Image generated and saved successfully!

📁 Saved to: ${finalPath}
⚠️  IMPORTANT: Use this path in your HTML/code: ${htmlPath}

Example usage:
<img src="${htmlPath}" alt="${prompt.substring(0, 50)}...">

Details:
- Prompt: "${prompt}"
- Size: ${dalleSize}
- Quality: ${quality}
- Format: ${mimeType}
- File size: ${(asset.bytes.length / 1024).toFixed(2)} KB
- Job ID: ${jobId}
- Asset ID: ${assetId}

The image is now available in the file system and will display in the preview.`,
        isError: false,
        metadata: {
          path: finalPath,
          prompt,
          size: dalleSize,
          quality,
          jobId,
          assetId,
          assetUrl,
          mimeType,
          fileSize: asset.bytes.length,
          width: result.assets[0].width,
          height: result.assets[0].height,
        },
      };
    } catch (error: any) {
      return {
        content: `Image generation error: ${error.message}\n\nStack trace:\n${error.stack}`,
        isError: true,
      };
    }
  }

  private mapSize(size: string): '1024x1024' | '1792x1024' | '1024x1792' {
    // DALL-E 3 supports: 1024x1024, 1024x1792, 1792x1024
    const [w, h] = size.split('x').map(Number);
    if (w >= 1024 && h >= 1024) {
      if (w > h) return '1792x1024';
      if (h > w) return '1024x1792';
      return '1024x1024';
    }
    return '1024x1024'; // Default
  }
}
