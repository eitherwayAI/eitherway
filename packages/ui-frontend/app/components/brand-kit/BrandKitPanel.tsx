import { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { authStore } from '~/lib/stores/auth';
import { chatStore } from '~/lib/stores/chat';
import { brandKitStore } from '~/lib/stores/brandKit';
import { useWalletConnection } from '~/lib/web3/hooks';
import { createScopedLogger } from '~/utils/logger';
import { motion, AnimatePresence } from 'framer-motion';
import { CategoryTabs, type AssetCategory } from './CategoryTabs';
import { AssetCard } from './AssetCard';

const logger = createScopedLogger('BrandKitPanel');

interface BrandKitPanelProps {
  onClose: () => void;
}

interface BrandAsset {
  id: string;
  assetType: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  processingStatus: string;
  uploadedAt: string;
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

interface BrandColor {
  id: string;
  hex: string;
  rgb: { r: number; g: number; b: number };
  hsl: { h: number; s: number; l: number } | null;
  name: string | null;
  role: string | null;
  prominence: number | null;
  pixelPercentage: number | null;
}

interface BrandKitData {
  id: string;
  name: string;
  assets: BrandAsset[];
  colors: BrandColor[];
}

export function BrandKitPanel({ onClose }: BrandKitPanelProps) {
  const user = useStore(authStore.user);
  const chat = useStore(chatStore);
  const agentWorking = !!chat.currentPhase && chat.currentPhase !== 'completed';
  const { isConnected, address } = useWalletConnection();

  const [isUploading, setIsUploading] = useState(false);
  const [globalMessage, setGlobalMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [brandKitData, setBrandKitData] = useState<BrandKitData | null>(null);
  const [currentBrandKitId, setCurrentBrandKitId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<AssetCategory>('logos');
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);

  const userId = (isConnected && address ? address : user?.email) || null;

  // Load session brand kit
  useEffect(() => {
    const loadSessionBrandKit = async () => {
      const { pendingBrandKitId } = brandKitStore.get();

      if (!pendingBrandKitId) {
        logger.info('No brand kit in current session');
        return;
      }

      try {
        const kitData = await fetchBrandKitData(pendingBrandKitId);
        if (kitData) {
          setCurrentBrandKitId(pendingBrandKitId);
          logger.info('Loaded brand kit from current session:', pendingBrandKitId);
        } else {
          brandKitStore.set({ pendingBrandKitId: null, dirty: false });
        }
      } catch (err: any) {
        logger.error('Error loading session brand kit:', err);
        brandKitStore.set({ pendingBrandKitId: null, dirty: false });
      }
    };

    loadSessionBrandKit();
  }, [chat.sessionId]);

  const fetchBrandKitData = async (brandKitId: string) => {
    try {
      const response = await fetch(`/api/brand-kits/${brandKitId}`);
      if (!response.ok) throw new Error('Failed to fetch brand kit data');

      const data = await response.json();
      if (data.success && data.brandKit) {
        setBrandKitData(data.brandKit);
        return data.brandKit;
      }
      return null;
    } catch (err: any) {
      console.error('Failed to fetch brand kit data:', err);
      return null;
    }
  };

  const handleDeleteAsset = async (assetId: string, fileName: string) => {
    if (!currentBrandKitId || !confirm(`Delete ${fileName}?`)) return;

    try {
      setDeletingAssetId(assetId);
      setGlobalMessage(`Deleting ${fileName}...`);

      const deleteResponse = await fetch(`/api/brand-kits/${currentBrandKitId}/assets/${assetId}`, {
        method: 'DELETE',
      });

      if (!deleteResponse.ok) throw new Error(`Failed to delete asset`);

      // Re-aggregate colors
      await fetch(`/api/brand-kits/${currentBrandKitId}/aggregate-colors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      await fetchBrandKitData(currentBrandKitId);
      setGlobalMessage(`✓ ${fileName} deleted`);
      window.dispatchEvent(new CustomEvent('brand-kit-updated'));
      setTimeout(() => setGlobalMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete asset');
      setGlobalMessage(null);
    } finally {
      setDeletingAssetId(null);
    }
  };

  const handleFileUpload = async (files: FileList | null, category?: AssetCategory) => {
    if (!files || files.length === 0 || !userId) {
      if (!userId) setError('Please connect your wallet to upload brand assets');
      return;
    }

    setIsUploading(true);
    setError(null);
    const fileArray = Array.from(files);
    setUploadingFiles(fileArray.map(f => f.name));

    try {
      // Get or create brand kit
      let brandKitId = currentBrandKitId;
      if (!brandKitId) {
        setGlobalMessage('Creating brand kit...');
        const createResponse = await fetch('/api/brand-kits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: userId,
            name: `Brand Kit - ${new Date().toLocaleDateString()}`,
            description: 'Auto-generated brand kit',
          }),
        });

        if (!createResponse.ok) throw new Error('Failed to create brand kit');
        const { brandKit } = await createResponse.json();
        brandKitId = brandKit.id;
        setCurrentBrandKitId(brandKitId);
      }

      setGlobalMessage(`Uploading ${fileArray.length} file(s)...`);

      // Upload files
      for (const file of fileArray) {
        const formData = new FormData();
        formData.append('file', file);

        const uploadResponse = await fetch(`/api/brand-kits/${brandKitId}/assets`, {
          method: 'POST',
          body: formData,
        });

        if (!uploadResponse.ok) throw new Error(`Failed to upload ${file.name}`);
      }

      // Aggregate colors
      setGlobalMessage('Extracting brand colors...');
      await fetch(`/api/brand-kits/${brandKitId}/aggregate-colors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      await fetchBrandKitData(brandKitId);
      brandKitStore.setKey('pendingBrandKitId', brandKitId);
      brandKitStore.setKey('dirty', true);

      setGlobalMessage(`✓ ${fileArray.length} file(s) uploaded successfully`);
      window.dispatchEvent(new CustomEvent('brand-kit-updated'));
      setTimeout(() => setGlobalMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
      setUploadingFiles([]);
    }
  };

  // Filter assets by category
  const getFilteredAssets = (): BrandAsset[] => {
    if (!brandKitData) return [];

    return brandKitData.assets.filter((asset) => {
      const kind = asset.metadata?.kind;

      switch (activeCategory) {
        case 'icons':
          return kind === 'icon' || asset.mimeType === 'image/x-icon' || asset.fileName.endsWith('.ico');
        case 'logos':
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
  };

  const filteredAssets = getFilteredAssets();

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-white">Brand Kit Gallery</h2>
            <p className="text-sm text-gray-400 mt-1">Manage your logos, fonts, images & colors</p>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Close
          </button>
        </div>

        {/* Category Tabs */}
        <div className="px-6 pt-4">
          <CategoryTabs
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            counts={{
              icons: brandKitData?.assets.filter(a =>
                a.metadata?.kind === 'icon' || a.mimeType === 'image/x-icon' || a.fileName.endsWith('.ico')
              ).length || 0,
              logos: brandKitData?.assets.filter(a =>
                a.metadata?.kind === 'logo' || (!a.metadata?.kind && a.mimeType.startsWith('image/') && !a.fileName.endsWith('.ico'))
              ).length || 0,
              images: brandKitData?.assets.filter(a => a.metadata?.kind === 'image').length || 0,
              fonts: brandKitData?.assets.filter(a =>
                a.metadata?.kind === 'font' || a.mimeType.startsWith('font/') || /\.(ttf|otf|woff|woff2)$/i.test(a.fileName)
              ).length || 0,
              videos: brandKitData?.assets.filter(a =>
                a.metadata?.kind === 'video' || a.mimeType.startsWith('video/') || a.fileName.endsWith('.mp4')
              ).length || 0,
            }}
          />
        </div>

        {/* Messages */}
        <div className="px-6 pt-4">
          <AnimatePresence>
            {globalMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-blue-900/20 border border-blue-700 rounded-lg p-3 mb-2"
              >
                <p className="text-sm text-blue-300">{globalMessage}</p>
              </motion.div>
            )}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-900/20 border border-red-700 rounded-lg p-3 mb-2"
              >
                <p className="text-sm text-red-300">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Gallery Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredAssets.length === 0 ? (
            /* Empty State with centered + button */
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
              <input
                type="file"
                id="gallery-upload"
                className="hidden"
                accept={
                  activeCategory === 'fonts' ? '.ttf,.otf,.woff,.woff2' :
                  activeCategory === 'videos' ? '.mp4,video/mp4' :
                  'image/png,image/jpeg,image/jpg,image/svg+xml,image/x-icon,.ico'
                }
                multiple
                onChange={(e) => handleFileUpload(e.target.files, activeCategory)}
                disabled={isUploading || agentWorking}
              />
              <label
                htmlFor="gallery-upload"
                className={`relative group bg-gray-800/50 rounded-2xl border-2 border-dashed border-gray-600 hover:border-blue-500 transition-all cursor-pointer flex items-center justify-center w-64 h-64 mb-6 ${
                  isUploading || agentWorking ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <div className="text-center p-6">
                  <div className="i-ph:plus text-7xl text-gray-500 group-hover:text-blue-400 transition-colors mb-4" />
                  <p className="text-base font-medium text-gray-400 group-hover:text-blue-300 transition-colors">
                    {isUploading ? 'Uploading...' : `Add ${activeCategory}`}
                  </p>
                </div>
              </label>
              <div className="text-6xl text-gray-700 mb-3">
                {activeCategory === 'icons' && <div className="i-ph:app-window" />}
                {activeCategory === 'logos' && <div className="i-ph:image" />}
                {activeCategory === 'images' && <div className="i-ph:images" />}
                {activeCategory === 'fonts' && <div className="i-ph:text-aa" />}
                {activeCategory === 'videos' && <div className="i-ph:video" />}
              </div>
              <h3 className="text-xl font-semibold text-gray-300 mb-2">
                No {activeCategory} yet
              </h3>
              <p className="text-sm text-gray-400 max-w-md">
                Click the + button above to upload your {activeCategory}
              </p>
            </div>
          ) : (
            /* Horizontal gallery with + button on the left */
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4 auto-rows-[180px]">
              {/* Add Asset Card (Plus Icon) - First in grid */}
              <input
                type="file"
                id="gallery-upload"
                className="hidden"
                accept={
                  activeCategory === 'fonts' ? '.ttf,.otf,.woff,.woff2' :
                  activeCategory === 'videos' ? '.mp4,video/mp4' :
                  'image/png,image/jpeg,image/jpg,image/svg+xml,image/x-icon,.ico'
                }
                multiple
                onChange={(e) => handleFileUpload(e.target.files, activeCategory)}
                disabled={isUploading || agentWorking}
              />
              <label
                htmlFor="gallery-upload"
                className={`relative group bg-gray-800/50 rounded-2xl border-2 border-dashed border-gray-600 hover:border-blue-500 transition-all cursor-pointer ${
                  isUploading || agentWorking ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="i-ph:plus text-5xl text-gray-500 group-hover:text-blue-400 transition-colors mb-2" />
                  <p className="text-xs font-medium text-gray-400 group-hover:text-blue-300 transition-colors">
                    {isUploading ? 'Uploading...' : `Add`}
                  </p>
                </div>
              </label>

              {/* Asset Cards */}
              <AnimatePresence mode="popLayout">
                {filteredAssets.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    onDelete={() => handleDeleteAsset(asset.id, asset.fileName)}
                    isDeleting={deletingAssetId === asset.id}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Color Palette Footer */}
        {brandKitData && brandKitData.colors.length > 0 && (
          <div className="border-t border-gray-700 p-6 bg-gray-800/50">
            <h4 className="text-sm font-semibold text-gray-300 mb-3">Brand Colors</h4>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {brandKitData.colors.slice(0, 12).map((color) => (
                <div key={color.id} className="flex flex-col items-center flex-shrink-0">
                  <div
                    className="w-10 h-10 rounded-lg border-2 border-gray-600"
                    style={{ backgroundColor: color.hex }}
                    title={color.name || color.hex}
                  />
                  <p className="text-xs text-gray-400 mt-1">{color.hex}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
