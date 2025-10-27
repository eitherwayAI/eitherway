/**
 * Brand Asset Synchronization to WebContainer
 * Mirrors uploaded brand assets (logos, fonts, etc.) into WebContainer filesystem
 * Now with session namespacing for isolation
 */

import type { WebContainer } from '@webcontainer/api';
import { createScopedLogger } from './logger';
import { BACKEND_URL } from '~/config/api';
import { getSessionPath, validateSessionOperation } from '~/lib/stores/sessionContext';
import { getWebContainerUnsafe } from '~/lib/webcontainer';

const logger = createScopedLogger('BrandAssetSync');

interface BrandAssetVariant {
  purpose: string;
  fileName: string;
  storageKey: string;
  width: number;
  height: number;
  fileSizeBytes: number;
  mimeType: string;
}

interface BrandAsset {
  id: string;
  fileName: string;
  storageKey: string;
  mimeType: string;
  assetType: string;
  metadata?: {
    kind?: string;
    variants?: BrandAssetVariant[];
    aspectRatio?: string;
    familyName?: string;
  };
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
 * Convert ArrayBuffer to UTF-8 string (for text files like SVG)
 */
function arrayBufferToString(buffer: ArrayBuffer): string {
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(buffer);
}

/**
 * Sync brand assets to WebContainer filesystem (including all variants)
 */
export async function syncBrandAssetsToWebContainer(
  webcontainer: WebContainer,
  assets: BrandAsset[],
): Promise<{
  synced: number;
  skipped: number;
  failed: number;
  syncedAssets: Array<{ assetId: string; syncedVariants: any[]; syncedBase: boolean }>;
}> {
  try {
    validateSessionOperation('sync brand assets');

    logger.info('Syncing brand assets to WebContainer', assets.length, 'assets');

    const wc = await getWebContainerUnsafe();
    let synced = 0;
    let skipped = 0;
    let failed = 0;
    const syncedAssets: Array<{ assetId: string; syncedVariants: any[]; syncedBase: boolean }> = [];

    for (const asset of assets) {
      const syncResult = { assetId: asset.id, syncedVariants: [] as any[], syncedBase: false };
      try {
        // TEMPORARY: Disable variant processing - always use base files
        // TODO: Re-enable when variant storage is reliable and files exist
        const hasVariants = false; // asset.metadata?.variants && asset.metadata.variants.length > 0;

        if (hasVariants) {
          // Sync all variants with intelligent routing
          logger.info(`Syncing ${asset.metadata!.variants!.length} variants for ${asset.fileName}`);

          for (const variant of asset.metadata!.variants!) {
            try {
              const destPath = getVariantDestinationPath(variant, asset);

              if (!destPath) {
                logger.debug(`Skipping variant: ${variant.fileName} (no destination)`);
                continue;
              }

              // Get session-namespaced path
              const sessionPath = getSessionPath(destPath);

              // Ensure parent directory exists
              const dirPath = sessionPath.split('/').slice(0, -1).join('/');
              if (dirPath) {
                await wc.fs.mkdir(dirPath, { recursive: true });
              }

              // Fetch variant file
              const fileBuffer = await fetchBrandAssetFile(variant.storageKey);

              // Determine if file should be stored as text or binary
              const isTextFile = variant.mimeType.includes('svg') || variant.mimeType.includes('text');

              if (isTextFile) {
                const textContents = arrayBufferToString(fileBuffer);
                await wc.fs.writeFile(sessionPath, textContents);
                logger.debug(`Text variant ${variant.fileName}: stored as UTF-8`);
              } else {
                const binaryContents = new Uint8Array(fileBuffer);
                await wc.fs.writeFile(sessionPath, binaryContents);
                logger.debug(`Binary variant ${variant.fileName}: ${binaryContents.length} bytes`);
              }

              logger.info(`✓ Synced variant: ${variant.purpose} → ${sessionPath}`);
              syncResult.syncedVariants.push(variant);
              synced++;
            } catch (error) {
              logger.error(`Failed to sync variant ${variant.fileName}:`, error);
              failed++;
            }
          }

          // FALLBACK: If ALL variants failed, try syncing base file instead
          if (syncResult.syncedVariants.length === 0) {
            logger.warn(`All variants failed for ${asset.fileName}, falling back to base file`);
            try {
              const destPath = getAssetDestinationPath(asset);
              if (destPath) {
                const sessionPath = getSessionPath(destPath);
                const dirPath = sessionPath.split('/').slice(0, -1).join('/');
                if (dirPath) {
                  await wc.fs.mkdir(dirPath, { recursive: true });
                }

                const fileBuffer = await fetchBrandAssetFile(asset.storageKey);
                const isTextFile = asset.mimeType.includes('svg') || asset.mimeType.includes('text');

                if (isTextFile) {
                  const textContents = arrayBufferToString(fileBuffer);
                  await wc.fs.writeFile(sessionPath, textContents);
                } else {
                  const binaryContents = new Uint8Array(fileBuffer);
                  await wc.fs.writeFile(sessionPath, binaryContents);
                }

                logger.info(`✓ Synced base file fallback: ${sessionPath}`);
                syncResult.syncedBase = true;
                synced++;
              }
            } catch (error) {
              logger.error(`Fallback base file sync also failed for ${asset.fileName}:`, error);
              failed++;
            }
          }
        } else {
          // Legacy: No variants, sync original file
          const destPath = getAssetDestinationPath(asset);

          if (!destPath) {
            logger.debug(`Skipping asset: ${asset.fileName} (no destination)`);
            skipped++;
            continue;
          }

          // Get session-namespaced path
          const sessionPath = getSessionPath(destPath);

          const dirPath = sessionPath.split('/').slice(0, -1).join('/');
          if (dirPath) {
            await wc.fs.mkdir(dirPath, { recursive: true });
          }

          const fileBuffer = await fetchBrandAssetFile(asset.storageKey);
          const isTextFile = asset.mimeType.includes('svg') || asset.mimeType.includes('text');

          if (isTextFile) {
            const textContents = arrayBufferToString(fileBuffer);
            await wc.fs.writeFile(sessionPath, textContents);
          } else {
            const binaryContents = new Uint8Array(fileBuffer);
            await wc.fs.writeFile(sessionPath, binaryContents);
          }

          logger.info(`✓ Synced brand asset: ${sessionPath}`);
          syncResult.syncedBase = true;
          synced++;
        }
      } catch (error) {
        logger.error(`Failed to sync asset ${asset.fileName}:`, error);
        failed++;
      }

      syncedAssets.push(syncResult);
    }

    logger.info(`Brand asset sync complete: ${synced} synced, ${skipped} skipped, ${failed} failed`);
    return { synced, skipped, failed, syncedAssets };
  } catch (error) {
    logger.error('Brand asset sync failed:', error);
    throw error;
  }
}

/**
 * Get WebContainer destination path for a specific variant
 */
function getVariantDestinationPath(variant: BrandAssetVariant, asset: BrandAsset): string {
  const kind = asset.metadata?.kind || asset.assetType;

  // Favicons go to public root
  if (variant.purpose === 'favicon') {
    return `public/${variant.fileName}`;
  }

  // Navbar/hero/optimized variants
  if (variant.purpose === 'navbar' || variant.purpose === 'hero' || variant.purpose === 'optimized') {
    if (kind === 'font') {
      return `public/fonts/${variant.fileName}`;
    }
    if (kind === 'video') {
      return `public/videos/${variant.fileName}`;
    }
    // Images/logos go to public/assets
    return `public/assets/${variant.fileName}`;
  }

  // Original files
  if (variant.purpose === 'original') {
    if (kind === 'icon') {
      return `public/${variant.fileName}`;
    }
    if (kind === 'logo') {
      return `public/assets/${variant.fileName}`;
    }
    if (kind === 'image') {
      return `public/assets/${variant.fileName}`;
    }
    if (kind === 'font') {
      return `public/fonts/${variant.fileName}`;
    }
    if (kind === 'video') {
      return `public/videos/${variant.fileName}`;
    }
  }

  // Thumbnails: skip (only for UI)
  if (variant.purpose === 'thumbnail') {
    return '';
  }

  return '';
}
