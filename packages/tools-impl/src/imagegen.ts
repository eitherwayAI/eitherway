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

// Constants for image path normalization
const DEFAULT_DIR = '/public/generated';

/**
 * Normalize path to be under /public/generated/ with correct extension
 */
function toPublicPath(p: string, ext: string): string {
  const hasExt = p.endsWith('.png') || p.endsWith('.jpg') || p.endsWith('.jpeg') || p.endsWith('.webp');
  const withExt = hasExt ? p : `${p}${ext}`;
  return withExt.startsWith('/public/') ? withExt : `${DEFAULT_DIR}/${withExt.replace(/^\/+/, '')}`;
}

/**
 * Convert /public/foo.png to /foo.png for WebContainer static serving
 */
function toHtmlPath(publicPath: string): string {
  // '/public/foo.png' -> '/foo.png' (WebContainer static root)
  return publicPath.replace(/^\/public/, '');
}

/**
 * Find any HTML file in the file tree
 */
function findAnyHtml(files: any[]): any | null {
  for (const file of files) {
    if (file.path && file.path.toLowerCase().endsWith('.html')) {
      return file;
    }
  }
  return null;
}

/**
 * Check if an image path is already referenced in any file
 * Searches through text files (HTML, JS, TS, JSX, TSX, etc.) for the image path
 */
async function isImageReferenced(
  fileStore: PostgresFileStore,
  appId: string,
  imagePath: string,
  limit: number = 100
): Promise<boolean> {
  try {
    const files = await fileStore.list(appId, limit);

    // Build regex pattern for various ways the image might be referenced
    // Matches: src="/path", src='/path', src={"/path"}, import from "/path", etc.
    const patterns = [
      // Exact matches with quotes
      new RegExp(`["'\`]${imagePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'\`]`, 'i'),
      // Without leading slash (for relative paths)
      new RegExp(`["'\`]${imagePath.replace(/^\//, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'\`]`, 'i'),
      // WebContainer public path (e.g., /public/generated/image.png referenced as /generated/image.png)
      imagePath.startsWith('/public/')
        ? new RegExp(`["'\`]${imagePath.replace('/public/', '/').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'\`]`, 'i')
        : null,
    ].filter(Boolean);

    // Only check text files
    const textExtensions = ['.html', '.htm', '.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.css', '.md'];

    for (const file of files) {
      if (!file.path) continue;

      const ext = file.path.toLowerCase().match(/\.[^.]+$/)?.[0];
      if (!ext || !textExtensions.includes(ext)) continue;

      try {
        const content = await fileStore.read(appId, file.path);
        const text = typeof content.content === 'string'
          ? content.content
          : Buffer.from(content.content).toString('utf-8');

        // Check all patterns
        for (const pattern of patterns) {
          if (pattern && pattern.test(text)) {
            console.log(`[Image Reference] Found reference to ${imagePath} in ${file.path}`);
            return true;
          }
        }
      } catch {
        // File read failed, skip
        continue;
      }
    }

    return false;
  } catch (error) {
    console.warn('[Image Reference] Error checking references:', error);
    return false; // On error, assume not referenced
  }
}

/**
 * Inject <img> tag into HTML content with data attribute for idempotency
 */
function injectIntoHtml(src: string, imgPath: string, alt: string, assetId?: string): string {
  const dataAttr = assetId ? ` data-eitherway-asset="${assetId}"` : '';
  const img = `\n  <img src="${imgPath}" alt="${alt}"${dataAttr} loading="lazy" decoding="async" style="max-width:100%;height:auto;display:block" />\n`;

  // Check if already injected (by data attribute or src)
  if (assetId && src.includes(`data-eitherway-asset="${assetId}"`)) {
    console.log('[Image Injection] Image already injected (found data attribute), skipping');
    return src;
  }
  if (src.includes(`src="${imgPath}"`)) {
    console.log('[Image Injection] Image already injected (found src), skipping');
    return src;
  }

  // Prefer to place inside <main> if present
  if (src.includes('</main>')) {
    return src.replace('</main>', `${img}</main>`);
  }

  // else append before </body>
  if (src.includes('</body>')) {
    return src.replace('</body>', `${img}</body>`);
  }

  return src + img;
}

/**
 * Inject <img> tag into React/JSX content with data attribute for idempotency
 */
function injectIntoReact(src: string, imgPath: string, alt: string, assetId?: string): string {
  const dataAttr = assetId ? ` data-eitherway-asset="${assetId}"` : '';
  const img = `<img src="${imgPath}" alt="${alt}"${dataAttr} loading="lazy" decoding="async" style={{maxWidth:'100%',height:'auto',display:'block'}} />`;

  // Check if already injected (by data attribute or src)
  if (assetId && src.includes(`data-eitherway-asset="${assetId}"`)) {
    console.log('[Image Injection] Image already injected in React (found data attribute), skipping');
    return src;
  }
  if (src.includes(`src="${imgPath}"`) || src.includes(`src='${imgPath}'`) || src.includes(`src={\`${imgPath}\`}`)) {
    console.log('[Image Injection] Image already injected in React (found src), skipping');
    return src;
  }

  // naive heuristic: insert just before the first closing </main> or </div>
  const mainCloseIdx = src.indexOf('</main>');
  if (mainCloseIdx !== -1) {
    return src.slice(0, mainCloseIdx) + '\n      ' + img + '\n      ' + src.slice(mainCloseIdx);
  }

  // Try to find the return statement and inject before closing tag
  const returnIdx = src.lastIndexOf('return (');
  if (returnIdx !== -1) {
    const closeIdx = src.indexOf('</', returnIdx);
    if (closeIdx !== -1) {
      return src.slice(0, closeIdx) + '\n      ' + img + '\n      ' + src.slice(closeIdx);
    }
  }

  return src + `\n// injected image\n${img}\n`;
}

/**
 * Auto-inject image reference into HTML or React files
 * Priority: React components > other HTML > index.html (last resort)
 */
async function injectImageReference(
  fileStore: PostgresFileStore,
  appId: string,
  htmlPath: string,
  alt = 'Generated image',
  assetId?: string
): Promise<string | null> {
  // STEP 0: Check if image is already referenced anywhere
  const alreadyReferenced = await isImageReferenced(fileStore, appId, htmlPath);
  if (alreadyReferenced) {
    console.log(`[Image Injection] Image ${htmlPath} already referenced in project, skipping auto-injection`);
    return null; // Return null to indicate no injection was needed
  }

  // PRIORITY 1: Try React components first (src/App.*sx?)
  for (const p of ['src/App.tsx', 'src/App.jsx', 'src/App.ts', 'src/App.js']) {
    try {
      const f = await fileStore.read(appId, p);
      if (f.content) {
        const content = typeof f.content === 'string' ? f.content : new TextDecoder().decode(f.content);
        const injected = injectIntoReact(content, htmlPath, alt, assetId);

        // Only write if content actually changed
        if (injected !== content) {
          await fileStore.write(appId, p, injected, f.mimeType);
          console.log(`[Image Injection] Injected into React component: ${p}`);
          return p;
        }
      }
    } catch {
      // File doesn't exist, continue
    }
  }

  // PRIORITY 2: Try other HTML files (NOT index.html yet)
  try {
    const files = await fileStore.list(appId, 1000);
    const anyHtml = findAnyHtml(files);

    // Only use non-index HTML files here
    if (anyHtml && !anyHtml.path.endsWith('/index.html') && anyHtml.path !== 'index.html') {
      const f = await fileStore.read(appId, anyHtml.path);
      if (f.content) {
        const content = typeof f.content === 'string' ? f.content : new TextDecoder().decode(f.content);
        const injected = injectIntoHtml(content, htmlPath, alt, assetId);

        if (injected !== content) {
          await fileStore.write(appId, anyHtml.path, injected, f.mimeType);
          console.log(`[Image Injection] Injected into HTML file: ${anyHtml.path}`);
          return anyHtml.path;
        }
      }
    }
  } catch {
    // No HTML files found, continue
  }

  // PRIORITY 3 (LAST RESORT): Try index.html
  const indexCandidates = ['/index.html', 'index.html'];
  for (const candidate of indexCandidates) {
    try {
      const f = await fileStore.read(appId, candidate);
      if (f.content) {
        const content = typeof f.content === 'string' ? f.content : new TextDecoder().decode(f.content);
        const injected = injectIntoHtml(content, htmlPath, alt, assetId);

        if (injected !== content) {
          await fileStore.write(appId, candidate, injected, f.mimeType);
          console.log(`[Image Injection] Injected into index.html (last resort): ${candidate}`);
          return candidate;
        }
      }
    } catch {
      // File doesn't exist, continue
    }
  }

  console.log('[Image Injection] No suitable injection target found');
  return null;
}

export class ImageGenExecutor implements ToolExecutor {
  name = 'eithergen--generate_image';

  async execute(input: Record<string, any>, context: ExecutionContext): Promise<ToolExecutorResult> {
    const { prompt, path, size = '1792x1024', quality = 'hd' } = input;

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

      // Map size to gpt-image-1 supported sizes
      const dalleSize = this.mapSize(size);

      // Start image generation job
      const jobId = await imageService.generateImage({
        prompt,
        model: 'gpt-image-1',
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

      // Normalize path to /public/generated/ directory
      const finalPath = toPublicPath(path, extension);
      const htmlPath = toHtmlPath(finalPath);

      // Write image to database-backed VFS
      await fileStore.write(appId, finalPath, asset.bytes, mimeType);

      // Auto-inject image reference into HTML or React files
      const altText = prompt.substring(0, 100); // Use first 100 chars of prompt as alt
      const injectedFile = await injectImageReference(fileStore, appId, htmlPath, altText, assetId);

      // DO NOT close db - it's a singleton shared by all tools
      // The server manages database lifecycle, not individual tools

      // Build public URL for the image
      const serverOrigin = process.env.SERVER_ORIGIN || 'https://localhost:3001';
      const assetUrl = `${serverOrigin}/api/images/assets/${assetId}`;

      // Build success message with auto-injection status
      let injectionStatus = '';
      if (injectedFile) {
        injectionStatus = `\n✨ Auto-injected into: ${injectedFile}\n   The image will now appear in your app preview!\n`;
      } else if (injectedFile === null) {
        // null means already referenced or no suitable target
        injectionStatus = `\n💡 Image ready to use at path: ${htmlPath}\n   (Skipped auto-injection - image already referenced or use manually)\n`;
      } else {
        injectionStatus = `\n⚠️  No suitable injection target found.\n   Use manually with: <img src="${htmlPath}" alt="${altText}" />\n`;
      }

      return {
        content: `✅ Image generated and saved successfully!

📁 Saved to: ${finalPath}
🌐 HTML path: ${htmlPath}${injectionStatus}
Details:
- Prompt: "${prompt}"
- Size: ${dalleSize}
- Quality: ${quality}
- Format: ${mimeType}
- File size: ${(asset.bytes.length / 1024).toFixed(2)} KB
- Dimensions: ${result.assets[0].width}x${result.assets[0].height}
- Job ID: ${jobId}
- Asset ID: ${assetId}

Example usage (if manual placement needed):
<img src="${htmlPath}" alt="${altText}" loading="lazy" style="max-width:100%;height:auto">`,
        isError: false,
        metadata: {
          path: finalPath,
          htmlPath,
          injectedFile,
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
    // gpt-image-1 supports: 1024x1024, 1024x1792, 1792x1024 (same as DALL-E 3)
    const [w, h] = size.split('x').map(Number);
    if (w >= 1024 && h >= 1024) {
      if (w > h) return '1792x1024';
      if (h > w) return '1024x1792';
      return '1024x1024';
    }
    return '1024x1024'; // Default
  }
}
