import { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { authStore } from '~/lib/stores/auth';
import { chatStore } from '~/lib/stores/chat';
import { brandKitStore } from '~/lib/stores/brandKit';
import { useWalletConnection } from '~/lib/web3/hooks';
import { webcontainer } from '~/lib/webcontainer/index';
import { syncBrandAssetsToWebContainer } from '~/utils/brandAssetSync';
import { createScopedLogger } from '~/utils/logger';
import { motion, AnimatePresence } from 'framer-motion';

const logger = createScopedLogger('BrandKitPanel');

type UploadState = 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';

interface UploadItem {
  id: string;
  file: File;
  status: UploadState;
  progress: number;
  message?: string;
  error?: string;
}

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

  // Debug logging
  console.log('[BrandKitPanel] Render - agentWorking:', agentWorking, 'currentPhase:', chat.currentPhase);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingExisting, setIsLoadingExisting] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [globalMessage, setGlobalMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [brandKitData, setBrandKitData] = useState<BrandKitData | null>(null);
  const [currentBrandKitId, setCurrentBrandKitId] = useState<string | null>(null);
  const [recentlyUploadedCount, setRecentlyUploadedCount] = useState<number>(0);
  const [showUploadSuccess, setShowUploadSuccess] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Prioritize wallet address (email auth is mostly mock)
  const userId = (isConnected && address ? address : user?.email) || null;

  // Do NOT fetch from server automatically - brand kits are per-session, not per-user
  useEffect(() => {
    const loadSessionBrandKit = async () => {
      setIsLoadingExisting(false);

      const { pendingBrandKitId } = brandKitStore.get();

      if (!pendingBrandKitId) {
        logger.info('No brand kit in current session');
        return;
      }

      try {
        // Fetch the specific brand kit by ID (not user's active brand kit)
        const kitData = await fetchBrandKitData(pendingBrandKitId);
        if (kitData) {
          setCurrentBrandKitId(pendingBrandKitId);
          logger.info('Loaded brand kit from current session:', pendingBrandKitId);
        } else {
          // Brand kit ID in localStorage is invalid/deleted, clear it
          logger.warn('Brand kit ID in localStorage not found, clearing');
          brandKitStore.set({ pendingBrandKitId: null, dirty: false });
        }
      } catch (err: any) {
        logger.error('Error loading session brand kit:', err);
        // Clear invalid brand kit ID
        brandKitStore.set({ pendingBrandKitId: null, dirty: false });
      }
    };

    loadSessionBrandKit();
  }, [chat.sessionId]);

  // Fetch brand kit data with assets and colors
  const fetchBrandKitData = async (brandKitId: string) => {
    try {
      const response = await fetch(`/api/brand-kits/${brandKitId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch brand kit data');
      }
      const data = await response.json();
      if (data.success && data.brandKit) {
        setBrandKitData(data.brandKit);
        setRefreshKey(prev => prev + 1); // Force re-render
        return data.brandKit;
      }
      return null;
    } catch (err: any) {
      console.error('Failed to fetch brand kit data:', err);
      return null;
    }
  };

  const handleDeleteAsset = async (assetId: string, fileName: string) => {
    if (!currentBrandKitId) return;

    if (!confirm(`Delete ${fileName}? This will also update your color palette.`)) {
      return;
    }

    try {
      setGlobalMessage(`Deleting ${fileName}...`);

      const deleteResponse = await fetch(`/api/brand-kits/${currentBrandKitId}/assets/${assetId}`, {
        method: 'DELETE',
      });

      if (!deleteResponse.ok) {
        throw new Error(`Failed to delete asset: ${deleteResponse.statusText}`);
      }

      // Re-aggregate colors after deletion
      setGlobalMessage('Updating color palette...');
      const aggregateResponse = await fetch(`/api/brand-kits/${currentBrandKitId}/aggregate-colors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!aggregateResponse.ok) {
        setGlobalMessage('Color update failed, but asset deleted');
      }

      // Refresh brand kit data
      await fetchBrandKitData(currentBrandKitId);

      setGlobalMessage(`✓ ${fileName} deleted successfully`);

      // Notify chat component to refresh assets
      window.dispatchEvent(new CustomEvent('brand-kit-updated'));

      // Clear message after 3 seconds
      setTimeout(() => setGlobalMessage(null), 3000);
    } catch (err: any) {
      console.error('[BrandKitPanel] Delete failed:', err);
      setError(err.message || 'Failed to delete asset');
      setGlobalMessage(null);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[BrandKitPanel] handleFileSelect called');
    const files = event.target.files;
    console.log('[BrandKitPanel] Files selected:', files?.length || 0);
    if (files && files.length > 0) {
      setSelectedFiles((prev) => [...prev, ...Array.from(files)]);
      // Reset input so the same file can be selected again
      event.target.value = '';
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const updateUploadItem = (id: string, updates: Partial<UploadItem>) => {
    setUploadItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  };

  const handleFileUpload = async (files: File[]) => {
    if (!files || files.length === 0) {
      return;
    }
    if (!userId) {
      setError('Please connect your wallet to upload brand assets');
      return;
    }

    setIsUploading(true);
    setError(null);
    setGlobalMessage(null);

    // Clear selected files
    setSelectedFiles([]);

    // Create upload items for each file
    const newUploadItems: UploadItem[] = files.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      status: 'pending' as UploadState,
      progress: 0,
    }));

    setUploadItems(newUploadItems);

    try {
      // Step 1: Get or create a brand kit
      let brandKitId = currentBrandKitId;

      // If no existing brand kit, create one
      if (!brandKitId) {
        setGlobalMessage('Creating brand kit...');
        const brandKitName = `Brand Kit - ${new Date().toLocaleDateString()}`;

        const createResponse = await fetch('/api/brand-kits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: userId,
            name: brandKitName,
            description: 'Auto-generated brand kit from upload',
          }),
        });

        if (!createResponse.ok) {
          const contentType = createResponse.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await createResponse.json();
            const errorMsg = errorData.error || 'Failed to create brand kit';
            const errorDetails = errorData.details || errorData.message || '';
            throw new Error(`${errorMsg}${errorDetails ? `: ${errorDetails}` : ''}`);
          } else {
            const text = await createResponse.text();
            throw new Error(`Failed to create brand kit: ${text || `HTTP ${createResponse.status}`}`);
          }
        }

        const { brandKit } = await createResponse.json();
        brandKitId = brandKit.id;
        setCurrentBrandKitId(brandKitId);
      }

      setGlobalMessage(null);

      // Step 2: Upload each file with progress tracking
      const uploadPromises = newUploadItems.map(async (uploadItem) => {
        try {
          updateUploadItem(uploadItem.id, { status: 'uploading', progress: 0 });

          const formData = new FormData();
          formData.append('file', uploadItem.file);

          const uploadResponse = await fetch(`/api/brand-kits/${brandKitId}/assets`, {
            method: 'POST',
            body: formData,
          });

          // Simulate progress for visual feedback (real progress would need server-sent events)
          updateUploadItem(uploadItem.id, { progress: 50 });

          if (!uploadResponse.ok) {
            const contentType = uploadResponse.headers.get('content-type');
            let errorMsg = 'Upload failed';
            if (contentType && contentType.includes('application/json')) {
              const errorData = await uploadResponse.json();
              errorMsg = errorData.error || 'Unknown error';
            }
            throw new Error(errorMsg);
          }

          const uploadContentType = uploadResponse.headers.get('content-type');
          if (!uploadContentType || !uploadContentType.includes('application/json')) {
            const text = await uploadResponse.text();
            throw new Error(`Invalid response: Expected JSON but got: ${text.substring(0, 100)}`);
          }

          updateUploadItem(uploadItem.id, { progress: 100, status: 'completed' });
          return await uploadResponse.json();
        } catch (err: any) {
          updateUploadItem(uploadItem.id, {
            status: 'failed',
            error: err.message || 'Upload failed',
          });
          throw err;
        }
      });

      await Promise.all(uploadPromises);

      // Aggregate colors across all assets
      setGlobalMessage('Extracting brand color palette...');
      const aggregateResponse = await fetch(`/api/brand-kits/${brandKitId}/aggregate-colors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!aggregateResponse.ok) {
        setGlobalMessage('Color extraction failed, but assets uploaded successfully');
      } else {
        const aggregateData = await aggregateResponse.json();
        setGlobalMessage(
          `✓ Extracted ${aggregateData.colorsExtracted || 0} colors from ${aggregateData.assetsProcessed || 0} assets`,
        );
      }

      // Fetch updated brand kit data to show assets and colors
      await fetchBrandKitData(brandKitId);

      // Mark assets pending for sync
      brandKitStore.setKey('pendingBrandKitId', brandKitId);
      brandKitStore.setKey('dirty', true);

      // Show success state
      setRecentlyUploadedCount(newUploadItems.length);
      setShowUploadSuccess(true);

      // Notify chat component to refresh assets
      window.dispatchEvent(new CustomEvent('brand-kit-updated'));

      // Clear upload items and success banner after delays
      setTimeout(() => {
        setUploadItems([]);
      }, 2000);

      setTimeout(() => {
        setGlobalMessage(null);
        setShowUploadSuccess(false);
        setRecentlyUploadedCount(0);
      }, 5000);
    } catch (err: any) {
      console.error('Brand kit upload error:', err);
      setError(err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-2xl font-bold text-white">Brand Kit</h2>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            disabled={isUploading}
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            {/* Upload Area */}
            <div className="p-6 bg-gray-800 rounded-lg border-2 border-dashed border-gray-600 text-center">
              <svg
                className="w-16 h-16 mx-auto mb-4 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <p className="text-white font-medium mb-2">Upload Your Brand Assets</p>
              <p className="text-sm text-gray-400 mb-4">Drag and drop or click to upload logos, colors, and fonts</p>
              <input
                key={`file-input-${refreshKey}`}
                type="file"
                className="hidden"
                id={`brand-kit-upload-${refreshKey}`}
                accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/x-icon,.ico,.ttf,.otf,.woff,.woff2,.zip,.mp4,video/mp4"
                multiple
                onChange={handleFileSelect}
                disabled={isUploading || agentWorking}
              />
              <label
                htmlFor={`brand-kit-upload-${refreshKey}`}
                title={agentWorking ? 'Wait for the agent to finish before uploading' : 'Choose files'}
                className={`inline-block px-6 py-3 rounded-lg cursor-pointer transition-colors ${
                  isUploading || agentWorking ? 'bg-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                } text-white`}
              >
                {isUploading ? 'Uploading...' : 'Choose Files'}
              </label>
            </div>

            {/* File Preview - Slack Style */}
            <AnimatePresence>
              {selectedFiles.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-gray-800 rounded-lg p-4 overflow-hidden"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-gray-300">
                      {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
                    </h4>
                    <button
                      onClick={() => handleFileUpload(selectedFiles)}
                      disabled={isUploading}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm font-medium"
                    >
                      {isUploading ? 'Uploading...' : 'Upload Files'}
                    </button>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {selectedFiles.map((file, index) => {
                      const isImage = file.type.startsWith('image/');
                      const imageUrl = isImage ? URL.createObjectURL(file) : null;

                      return (
                        <motion.div
                          key={`${file.name}-${index}`}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          className="flex items-center gap-3 p-3 bg-gray-700/50 rounded-lg group"
                        >
                          {/* File thumbnail/icon */}
                          <div className="w-12 h-12 flex-shrink-0 bg-gray-600 rounded overflow-hidden flex items-center justify-center">
                            {imageUrl ? (
                              <img src={imageUrl} alt={file.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="text-gray-300">
                                {file.type.startsWith('video/') && <div className="i-ph:video text-2xl" />}
                                {(file.type.includes('font') || file.name.match(/\.(ttf|otf|woff|woff2)$/i)) && (
                                  <div className="i-ph:text-aa text-2xl" />
                                )}
                                {file.type.includes('zip') && <div className="i-ph:file-zip text-2xl" />}
                                {!file.type.startsWith('video/') &&
                                  !file.type.includes('font') &&
                                  !file.name.match(/\.(ttf|otf|woff|woff2)$/i) &&
                                  !file.type.includes('zip') && <div className="i-ph:file text-2xl" />}
                              </div>
                            )}
                          </div>

                          {/* File info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate font-medium">{file.name}</p>
                            <p className="text-xs text-gray-400">
                              {(file.size / 1024).toFixed(1)} KB
                              {file.type && ` • ${file.type.split('/')[1].toUpperCase()}`}
                            </p>
                          </div>

                          {/* Remove button */}
                          <button
                            onClick={() => handleRemoveFile(index)}
                            disabled={isUploading}
                            className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors opacity-0 group-hover:opacity-100 disabled:cursor-not-allowed"
                            title="Remove file"
                          >
                            <div className="i-ph:x text-lg" />
                          </button>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Upload Progress - Slack Style */}
            <AnimatePresence>
              {uploadItems.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-gray-800 rounded-lg p-4 overflow-hidden"
                >
                  <h4 className="text-sm font-semibold text-gray-300 mb-3">Uploading Files</h4>
                  <div className="space-y-3">
                    {uploadItems.map((item) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="bg-gray-700/50 rounded-lg p-3"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className="text-gray-400">
                              {item.file.type.startsWith('image/') && <div className="i-ph:image text-lg" />}
                              {item.file.type.startsWith('font/') && <div className="i-ph:text-aa text-lg" />}
                              {item.file.type.startsWith('video/') && <div className="i-ph:video text-lg" />}
                              {item.file.type.includes('zip') && <div className="i-ph:file-zip text-lg" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-white truncate">{item.file.name}</p>
                              <p className="text-xs text-gray-400">{(item.file.size / 1024).toFixed(1)} KB</p>
                            </div>
                          </div>
                          <div className="ml-2">
                            {item.status === 'pending' && (
                              <div className="i-ph:clock text-gray-400 text-lg animate-pulse" />
                            )}
                            {item.status === 'uploading' && (
                              <div className="i-ph:spinner text-blue-400 text-lg animate-spin" />
                            )}
                            {item.status === 'completed' && <div className="i-ph:check-circle text-green-400 text-lg" />}
                            {item.status === 'failed' && <div className="i-ph:x-circle text-red-400 text-lg" />}
                          </div>
                        </div>
                        {/* Progress Bar */}
                        {(item.status === 'uploading' || item.status === 'completed') && (
                          <div className="w-full bg-gray-600 rounded-full h-1.5 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${item.progress}%` }}
                              transition={{ duration: 0.3 }}
                              className={`h-full rounded-full ${
                                item.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'
                              }`}
                            />
                          </div>
                        )}
                        {/* Error Message */}
                        {item.error && <p className="text-xs text-red-400 mt-1">{item.error}</p>}
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Upload Success Banner */}
            <AnimatePresence>
              {showUploadSuccess && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  className="bg-green-900/30 border-2 border-green-500/50 rounded-lg p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="i-ph:check-circle text-green-400 text-2xl flex-shrink-0" />
                    <div>
                      <h4 className="text-sm font-bold text-green-300">Upload Complete!</h4>
                      <p className="text-xs text-green-200">
                        Successfully uploaded {recentlyUploadedCount} file{recentlyUploadedCount > 1 ? 's' : ''} to your
                        brand kit
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Global Message */}
            {globalMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-blue-900/20 border border-blue-700 rounded-lg p-3"
              >
                <p className="text-xs text-blue-300">{globalMessage}</p>
              </motion.div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-red-400 mb-1">Error</h4>
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}

            {/* Info Box */}
            {!isUploading && uploadItems.length === 0 && !brandKitData && (
              <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-blue-400 mb-2">Supported file types:</h4>
                <ul className="text-xs text-blue-300 space-y-1">
                  <li>
                    • <strong>Images:</strong> PNG, JPEG, SVG, ICO (up to 20MB)
                  </li>
                  <li>
                    • <strong>Fonts:</strong> TTF, OTF, WOFF, WOFF2 (up to 10MB)
                  </li>
                  <li>
                    • <strong>Archives:</strong> ZIP brand packages (up to 200MB)
                  </li>
                  <li>
                    • <strong>Videos:</strong> MP4 promo clips (up to 100MB)
                  </li>
                </ul>
                <p className="text-xs text-blue-400 mt-3">Colors are automatically extracted from logos and images!</p>
              </div>
            )}

            {/* Uploaded Assets - Always show section */}
            <div key={`assets-${refreshKey}`} className="bg-gray-800 rounded-lg p-4 border-2 border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-base font-bold text-white">Your Brand Assets</h4>
                {brandKitData && brandKitData.assets.length > 0 && (
                  <span className="text-xs px-2 py-1 bg-blue-600 text-white rounded-full font-medium">
                    {brandKitData.assets.length} file{brandKitData.assets.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {!brandKitData || brandKitData.assets.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  No assets uploaded yet. Upload files above to get started!
                </p>
              ) : (
                  <div className="space-y-2">
                    {brandKitData.assets.map((asset) => (
                      <div key={asset.id} className="flex items-center justify-between p-2 bg-gray-700 rounded group">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="text-gray-400">
                            {asset.mimeType.startsWith('image/') && <div className="i-ph:image text-lg" />}
                            {asset.mimeType.startsWith('font/') && <div className="i-ph:text-aa text-lg" />}
                            {asset.mimeType.startsWith('video/') && <div className="i-ph:video text-lg" />}
                            {asset.mimeType.includes('zip') && <div className="i-ph:file-zip text-lg" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-white truncate">{asset.fileName}</p>
                            <p className="text-xs text-gray-400">
                              {(asset.fileSizeBytes / 1024).toFixed(1)} KB • {asset.assetType}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-xs">
                            {asset.processingStatus === 'completed' && <span className="text-green-400">✓</span>}
                            {asset.processingStatus === 'processing' && <span className="text-yellow-400">...</span>}
                            {asset.processingStatus === 'failed' && <span className="text-red-400">✗</span>}
                          </div>
                          <button
                            onClick={() => handleDeleteAsset(asset.id, asset.fileName)}
                            disabled={isUploading}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-600 rounded text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Delete asset"
                          >
                            <div className="i-ph:x text-sm" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>

            {/* Extracted Colors */}
            {brandKitData && brandKitData.colors.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-300 mb-3">Extracted Color Palette</h4>
                <div className="grid grid-cols-5 gap-2">
                  {brandKitData.colors.map((color) => (
                    <div key={color.id} className="flex flex-col items-center">
                      <div
                        className="w-12 h-12 rounded-lg border-2 border-gray-600"
                        style={{ backgroundColor: color.hex }}
                        title={`${color.name || color.hex}\n${color.prominence ? `${(color.prominence * 100).toFixed(0)}% prominence` : ''}`}
                      />
                      <p className="text-xs text-gray-400 mt-1 text-center">{color.hex}</p>
                      {color.name && <p className="text-xs text-gray-500 truncate max-w-full">{color.name}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
