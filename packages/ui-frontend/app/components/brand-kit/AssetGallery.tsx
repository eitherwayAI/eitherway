/**
 * Asset Gallery Component
 * Pinterest-style responsive grid for brand assets
 */

import { AnimatePresence } from 'framer-motion';
import { AssetCard } from './AssetCard';
import type { AssetCategory } from './CategoryTabs';

interface Asset {
  id: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  storageKey?: string;
  metadata?: {
    kind?: string;
    aspectRatio?: string;
    familyName?: string;
    weight?: number;
    variants?: Array<{
      purpose: string;
      fileName: string;
      storageKey: string;
    }>;
    aiAnalysis?: {
      description?: string;
      recommendations?: {
        bestFor?: string[];
      };
    };
  };
}

interface AssetGalleryProps {
  assets: Asset[];
  category: AssetCategory;
  onDeleteAsset: (assetId: string, fileName: string) => void;
  deletingAssetId?: string | null;
}

export function AssetGallery({ assets, category, onDeleteAsset, deletingAssetId }: AssetGalleryProps) {
  // Filter assets by category
  const filteredAssets = assets.filter((asset) => {
    const kind = asset.metadata?.kind;

    switch (category) {
      case 'icons':
        return kind === 'icon' || asset.mimeType === 'image/x-icon' || asset.mimeType === 'image/vnd.microsoft.icon' || asset.fileName.endsWith('.ico');
      case 'logos':
        // If no kind metadata, assume image/* files are logos (fallback for old assets)
        return kind === 'logo' || (!kind && asset.mimeType.startsWith('image/') && !asset.fileName.endsWith('.ico'));
      case 'images':
        return kind === 'image';
      case 'fonts':
        return kind === 'font' || asset.mimeType.startsWith('font/') || /\.(ttf|otf|woff|woff2)$/i.test(asset.fileName);
      case 'videos':
        return kind === 'video' || asset.mimeType.startsWith('video/') || asset.fileName.endsWith('.mp4');
      default:
        return false;
    }
  });

  if (filteredAssets.length === 0) {
    return <EmptyState category={category} />;
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
      <AnimatePresence mode="popLayout">
        {filteredAssets.map((asset) => (
          <AssetCard
            key={asset.id}
            asset={asset}
            onDelete={() => onDeleteAsset(asset.id, asset.fileName)}
            isDeleting={deletingAssetId === asset.id}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

/**
 * Empty State Component
 * Shown when no assets exist in the selected category
 */
function EmptyState({ category }: { category: AssetCategory }) {
  const emptyStates: Record<AssetCategory, { icon: string; title: string; description: string; formats: string }> = {
    icons: {
      icon: 'i-ph:app-window',
      title: 'No icons uploaded',
      description: 'Icons are used for favicons and app icons',
      formats: 'Upload .ico files above'
    },
    logos: {
      icon: 'i-ph:image',
      title: 'No logos uploaded',
      description: 'Logos are used in navbars, footers, and hero sections',
      formats: 'Upload .svg or .png files above'
    },
    images: {
      icon: 'i-ph:images',
      title: 'No images uploaded',
      description: 'Images are used for content, backgrounds, and galleries',
      formats: 'Upload .png, .jpg, or .webp files above'
    },
    fonts: {
      icon: 'i-ph:text-aa',
      title: 'No fonts uploaded',
      description: 'Custom fonts define your brand typography',
      formats: 'Upload .ttf, .otf, .woff, or .woff2 files above'
    },
    videos: {
      icon: 'i-ph:video',
      title: 'No videos uploaded',
      description: 'Videos can be used for backgrounds or content sections',
      formats: 'Upload .mp4 files above'
    }
  };

  const state = emptyStates[category];

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className={`${state.icon} text-7xl text-gray-600 mb-4`} />
      <h3 className="text-lg font-semibold text-gray-300 mb-2">{state.title}</h3>
      <p className="text-sm text-gray-400 mb-1">{state.description}</p>
      <p className="text-xs text-blue-400">{state.formats}</p>
    </div>
  );
}
