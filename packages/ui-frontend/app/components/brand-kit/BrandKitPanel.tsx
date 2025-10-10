import { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { authStore } from '~/lib/stores/auth';
import { useWalletConnection } from '~/lib/web3/hooks';
import { webcontainer } from '~/lib/webcontainer/index';
import { syncBrandAssetsToWebContainer } from '~/utils/brandAssetSync';
import { createScopedLogger } from '~/utils/logger';

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
  const { isConnected, address } = useWalletConnection();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [brandKitData, setBrandKitData] = useState<BrandKitData | null>(null);
  const [currentBrandKitId, setCurrentBrandKitId] = useState<string | null>(null);

  // Use email if authenticated, otherwise use wallet address
  const userId = user?.email || (isConnected && address ? address : null);

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
        return data.brandKit;
      }
      return null;
    } catch (err: any) {
      console.error('Failed to fetch brand kit data:', err);
      return null;
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!userId) {
      setError('Please connect your wallet to upload brand assets');
      return;
    }

    setIsUploading(true);
    setError(null);
    setUploadProgress([]);

    try {
      // Step 1: Create or get a brand kit
      const brandKitName = `Brand Kit - ${new Date().toLocaleDateString()}`;
      console.log('[BrandKitPanel] Creating brand kit with userId:', userId);

      const createResponse = await fetch('/api/brand-kits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          name: brandKitName,
          description: 'Auto-generated brand kit from upload'
        })
      });

      console.log('[BrandKitPanel] Create response status:', createResponse.status);

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
      const brandKitId = brandKit.id;
      setCurrentBrandKitId(brandKitId);

      // Step 2: Upload each file
      const uploadPromises = Array.from(files).map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);

        setUploadProgress(prev => [...prev, `Uploading ${file.name}...`]);

        const uploadResponse = await fetch(`/api/brand-kits/${brandKitId}/assets`, {
          method: 'POST',
          body: formData
        });

        if (!uploadResponse.ok) {
          const contentType = uploadResponse.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await uploadResponse.json();
            throw new Error(`Failed to upload ${file.name}: ${errorData.error || 'Unknown error'}`);
          } else {
            const text = await uploadResponse.text();
            throw new Error(`Failed to upload ${file.name}: ${text || `HTTP ${uploadResponse.status}`}`);
          }
        }

        const uploadContentType = uploadResponse.headers.get('content-type');
        if (!uploadContentType || !uploadContentType.includes('application/json')) {
          const text = await uploadResponse.text();
          throw new Error(`Invalid response for ${file.name}: Expected JSON but got: ${text.substring(0, 100)}`);
        }

        const result = await uploadResponse.json();
        setUploadProgress(prev => [...prev, `✓ ${file.name} uploaded successfully`]);
        return result;
      });

      await Promise.all(uploadPromises);

      setUploadProgress(prev => [...prev, '✓ All files uploaded! Extracting color palettes...']);

      // Fetch brand kit data to show assets and colors
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for async processing
      const kitData = await fetchBrandKitData(brandKitId);

      setUploadProgress(prev => [...prev, '✓ Brand kit created successfully!']);

      // Sync assets to WebContainer
      if (kitData && kitData.assets && kitData.assets.length > 0) {
        try {
          setUploadProgress(prev => [...prev, 'Syncing assets to WebContainer...']);
          const wc = await webcontainer;
          const result = await syncBrandAssetsToWebContainer(wc, kitData.assets as any);
          setUploadProgress(prev => [...prev, `✓ Synced ${result.synced} assets to WebContainer`]);
          logger.info('Brand assets synced to WebContainer:', result);
        } catch (err: any) {
          logger.error('Failed to sync assets to WebContainer:', err);
          setUploadProgress(prev => [...prev, `⚠ Warning: Could not sync assets to WebContainer`]);
        }
      }

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
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-white font-medium mb-2">Upload Your Brand Assets</p>
              <p className="text-sm text-gray-400 mb-4">Drag and drop or click to upload logos, colors, and fonts</p>
              <input
                type="file"
                className="hidden"
                id="brand-kit-upload"
                accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/x-icon,.ico,.ttf,.otf,.woff,.woff2,.zip,.mp4,video/mp4"
                multiple
                onChange={(e) => handleFileUpload(e.target.files)}
                disabled={isUploading}
              />
              <label
                htmlFor="brand-kit-upload"
                className={`inline-block px-6 py-3 rounded-lg cursor-pointer transition-colors ${
                  isUploading
                    ? 'bg-gray-600 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                } text-white`}
              >
                {isUploading ? 'Uploading...' : 'Choose Files'}
              </label>
            </div>

            {/* Upload Progress */}
            {uploadProgress.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-4 max-h-60 overflow-y-auto">
                <h4 className="text-sm font-semibold text-gray-300 mb-2">Upload Progress</h4>
                <div className="space-y-1">
                  {uploadProgress.map((msg, idx) => (
                    <p key={idx} className="text-xs text-gray-400">{msg}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-red-400 mb-1">Error</h4>
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}

            {/* Info Box */}
            {!isUploading && uploadProgress.length === 0 && !brandKitData && (
              <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-blue-400 mb-2">Supported file types:</h4>
                <ul className="text-xs text-blue-300 space-y-1">
                  <li>• <strong>Images:</strong> PNG, JPEG, SVG, ICO (up to 20MB)</li>
                  <li>• <strong>Fonts:</strong> TTF, OTF, WOFF, WOFF2 (up to 10MB)</li>
                  <li>• <strong>Archives:</strong> ZIP brand packages (up to 200MB)</li>
                  <li>• <strong>Videos:</strong> MP4 promo clips (up to 100MB)</li>
                </ul>
                <p className="text-xs text-blue-400 mt-3">
                  Colors are automatically extracted from logos and images!
                </p>
              </div>
            )}

            {/* Uploaded Assets */}
            {brandKitData && brandKitData.assets.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-300 mb-3">Uploaded Assets</h4>
                <div className="space-y-2">
                  {brandKitData.assets.map((asset) => (
                    <div key={asset.id} className="flex items-center justify-between p-2 bg-gray-700 rounded">
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
                      <div className="text-xs">
                        {asset.processingStatus === 'completed' && (
                          <span className="text-green-400">✓</span>
                        )}
                        {asset.processingStatus === 'processing' && (
                          <span className="text-yellow-400">...</span>
                        )}
                        {asset.processingStatus === 'failed' && (
                          <span className="text-red-400">✗</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                      {color.name && (
                        <p className="text-xs text-gray-500 truncate max-w-full">{color.name}</p>
                      )}
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
