/**
 * Brand Asset Synchronization to WebContainer
 * Mirrors uploaded brand assets (logos, fonts, etc.) into WebContainer filesystem
 */

import type { WebContainer } from '@webcontainer/api';
import { createScopedLogger } from './logger';
import { BACKEND_URL } from '~/config/api';

const logger = createScopedLogger('BrandAssetSync');

interface BrandAsset {
  id: string;
  fileName: string;
  storageKey: string;
  mimeType: string;
  assetType: string;
  metadata?: { kind?: string };
}

/**
 * Determine WebContainer path based on asset type
 */
function getAssetDestinationPath(asset: BrandAsset): string {
  const kind = asset.metadata?.kind || asset.assetType;
  const fileName = asset.fileName;

  // Map asset kinds to WebContainer paths
  switch (kind) {
    case 'icon':
      // Favicons go to public root
      return `public/${fileName}`;

    case 'logo':
    case 'image':
      // Logos and images go to public/assets
      return `public/assets/${fileName}`;

    case 'font':
      // Fonts go to public/fonts
      return `public/fonts/${fileName}`;

    case 'video':
      // Videos go to public/videos
      return `public/videos/${fileName}`;

    case 'brand_zip':
      // Skip ZIPs - they should be extracted separately
      return '';

    default:
      return `public/brand/${fileName}`;
  }
}

async function fetchBrandAssetFile(storageKey: string): Promise<ArrayBuffer> {
  const response = await fetch(`${BACKEND_URL}/api/brand-assets/download/${encodeURIComponent(storageKey)}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch brand asset: ${response.statusText}`);
  }

  return await response.arrayBuffer();
}

/**
 * Ensure directory exists in WebContainer
 */
async function ensureDirectory(webcontainer: WebContainer, dirPath: string): Promise<void> {
  const parts = dirPath.split('/').filter(Boolean);

  let currentPath = '';
  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;

    try {
      await webcontainer.fs.mkdir(currentPath, { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore error
    }
  }
}

/**
 * Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert ArrayBuffer to UTF-8 string (for text files like SVG)
 */
function arrayBufferToString(buffer: ArrayBuffer): string {
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(buffer);
}

/**
 * Sync brand assets to WebContainer filesystem
 */
export async function syncBrandAssetsToWebContainer(
  webcontainer: WebContainer,
  assets: BrandAsset[],
): Promise<{ synced: number; skipped: number; failed: number }> {
  logger.info('Syncing brand assets to WebContainer', assets.length, 'assets');

  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (const asset of assets) {
    try {
      const destPath = getAssetDestinationPath(asset);

      if (!destPath) {
        logger.debug(`Skipping asset: ${asset.fileName} (no destination)`);
        skipped++;
        continue;
      }

      // Ensure parent directory exists
      const dirPath = destPath.split('/').slice(0, -1).join('/');
      if (dirPath) {
        await ensureDirectory(webcontainer, dirPath);
      }

      // Fetch asset file
      logger.debug(`Fetching brand asset: ${asset.fileName}`);
      const fileBuffer = await fetchBrandAssetFile(asset.storageKey);

      // Determine if file should be stored as text or binary
      const isTextFile = asset.mimeType.includes('svg') || asset.mimeType.includes('text');

      let fileContents: string;
      if (isTextFile) {
        // Text file (SVG): store as UTF-8 string
        fileContents = arrayBufferToString(fileBuffer);
        logger.debug(`Text asset ${asset.fileName}: stored as UTF-8, length: ${fileContents.length}`);
      } else {
        // Binary file (PNG, JPEG, fonts, etc.): store as base64 with marker
        const base64 = arrayBufferToBase64(fileBuffer);
        fileContents = '__BASE64__' + base64;
        logger.debug(`Binary asset ${asset.fileName}: stored as base64, length: ${base64.length}`);
      }

      // Write file to WebContainer
      await webcontainer.fs.writeFile(destPath, fileContents);
      logger.info(`✓ Synced brand asset: ${destPath}`);
      synced++;
    } catch (error) {
      logger.error(`Failed to sync asset ${asset.fileName}:`, error);
      failed++;
    }
  }

  logger.info(`Brand asset sync complete: ${synced} synced, ${skipped} skipped, ${failed} failed`);
  return { synced, skipped, failed };
}
