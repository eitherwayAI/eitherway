/**
 * Asset Card Component
 * Displays a single brand asset in the gallery with preview and actions
 */

import { useState } from 'react';
import { motion } from 'framer-motion';

interface AssetCardProps {
  asset: {
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
  };
  onDelete: () => void;
  isDeleting?: boolean;
}

export function AssetCard({ asset, onDelete, isDeleting }: AssetCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const kind = asset.metadata?.kind || 'asset';

  // Get thumbnail variant for display
  const thumbnailVariant = asset.metadata?.variants?.find(v => v.purpose === 'thumbnail');
  const previewStorageKey = thumbnailVariant?.storageKey || asset.storageKey;

  // Get AI description if available
  const aiDescription = asset.metadata?.aiAnalysis?.description;
  const bestFor = asset.metadata?.aiAnalysis?.recommendations?.bestFor;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="relative group bg-gray-800 rounded-2xl overflow-hidden border-2 border-gray-700 hover:border-blue-500 transition-all h-full flex flex-col"
    >
      {/* Preview Area - Takes most space */}
      <div className="flex-1 bg-gray-900 flex items-center justify-center p-3">
        {asset.mimeType.startsWith('image/') && previewStorageKey ? (
          <img
            src={`/api/brand-assets/download/${encodeURIComponent(previewStorageKey)}`}
            alt={asset.fileName}
            className="max-w-full max-h-full object-contain"
            onError={(e) => {
              e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23374151" width="100" height="100"/%3E%3C/svg%3E';
            }}
          />
        ) : kind === 'font' ? (
          <div className="text-center">
            <div className="i-ph:text-aa text-4xl text-gray-500 mb-1" />
            <p className="text-xs text-gray-400 truncate max-w-full px-2">{asset.metadata?.familyName || 'Font'}</p>
          </div>
        ) : kind === 'video' ? (
          <div className="i-ph:video text-5xl text-gray-500" />
        ) : (
          <div className="i-ph:file text-5xl text-gray-500" />
        )}
      </div>

      {/* Compact Info Area */}
      <div className="p-2 bg-gray-800/50 border-t border-gray-700/50">
        <p className="text-xs font-medium text-white truncate" title={asset.fileName}>
          {asset.fileName}
        </p>
        {aiDescription ? (
          <div
            className="relative cursor-help"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <p className="text-xs text-blue-300 truncate">
              {bestFor && bestFor.length > 0 ? bestFor[0] : 'Analyzed'}
            </p>

            {/* Tooltip on hover */}
            {showTooltip && (
              <div className="absolute bottom-full left-0 right-0 mb-2 p-3 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-10 text-xs text-gray-200 whitespace-normal">
                <p className="font-semibold text-white mb-1">AI Analysis</p>
                <p>{aiDescription}</p>
                {bestFor && bestFor.length > 0 && (
                  <p className="mt-2 text-blue-300">
                    <span className="font-medium">Best for:</span> {bestFor.join(', ')}
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-400">
            {(asset.fileSizeBytes / 1024).toFixed(1)} KB
          </p>
        )}
      </div>

      {/* Delete Button (Shown on Hover) */}
      <button
        onClick={onDelete}
        disabled={isDeleting}
        className="absolute top-1.5 right-1.5 p-1.5 bg-red-600/90 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg opacity-0 group-hover:opacity-100 transition-all shadow-lg"
        title="Delete asset"
      >
        {isDeleting ? (
          <div className="i-ph:spinner text-white text-base animate-spin" />
        ) : (
          <div className="i-ph:trash text-white text-base" />
        )}
      </button>

      {/* Variants Badge */}
      {asset.metadata?.variants && asset.metadata.variants.length > 1 && (
        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-purple-600/90 rounded text-xs font-bold text-white shadow-lg">
          {asset.metadata.variants.length}×
        </div>
      )}
    </motion.div>
  );
}
