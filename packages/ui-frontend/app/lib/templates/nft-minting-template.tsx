// NFT Minting Interface Template
// Upload images to IPFS + Mint NFTs with metadata

export const nftMintingTemplate = `
// NFT MINTING APP WITH IPFS UPLOAD
// Upload images → Create metadata → Mint NFTs

const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  return 'https://localhost:3001';
};

const API_BASE_URL = getApiBaseUrl();

// CONTRACT ADDRESS - UPDATE THIS AFTER DEPLOYMENT
const NFT_CONTRACT_ADDRESS = 'YOUR_CONTRACT_ADDRESS_HERE';

// /src/services/ipfsService.ts
export interface UploadImageResponse {
  success: boolean;
  ipfsCID?: string;
  ipfsUrl?: string;
  gatewayUrl?: string;
  error?: string;
}

export interface NFTAttribute {
  trait_type: string;
  value: string | number;
}

export interface CreateNFTAssetResponse {
  success: boolean;
  imageCID?: string;
  imageUrl?: string;
  metadataCID?: string;
  tokenURI?: string;
  error?: string;
}

export class IPFSService {
  private apiBaseUrl: string;

  constructor(apiBaseUrl: string = API_BASE_URL) {
    this.apiBaseUrl = apiBaseUrl;
  }

  async uploadImage(file: File): Promise<UploadImageResponse> {
    try {
      const requestId = \`upload-image-\${Date.now()}-\${Math.random().toString(36).substr(2, 9)}\`;

      console.log('[IPFSService] Uploading image via postMessage');

      // Convert file to base64 for postMessage
      const base64 = await this.fileToBase64(file);

      window.parent.postMessage({
        type: 'api-proxy',
        id: requestId,
        payload: {
          endpoint: '/api/ipfs/upload-image',
          method: 'POST',
          body: {
            file: base64,
            filename: file.name
          },
          contentType: 'multipart/form-data'
        }
      }, '*');

      const result = await new Promise<UploadImageResponse>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Upload timeout'));
        }, 60000); // 60 second timeout for image upload

        const handleMessage = (event: MessageEvent) => {
          const { type, id, success, data, error } = event.data;

          if (type === 'api-proxy-response' && id === requestId) {
            cleanup();
            if (success) {
              resolve(data);
            } else {
              reject(new Error(error || 'Upload failed'));
            }
          }
        };

        const cleanup = () => {
          clearTimeout(timeout);
          window.removeEventListener('message', handleMessage);
        };

        window.addEventListener('message', handleMessage);
      });

      return result;
    } catch (error: any) {
      console.error('[IPFSService] Upload error:', error);
      return {
        success: false,
        error: \`Failed to upload image: \${error.message}\`
      };
    }
  }

  async createNFTAsset(
    file: File,
    nftName: string,
    nftDescription: string,
    attributes: NFTAttribute[]
  ): Promise<CreateNFTAssetResponse> {
    try {
      const requestId = \`create-asset-\${Date.now()}-\${Math.random().toString(36).substr(2, 9)}\`;

      console.log('[IPFSService] Creating NFT asset via postMessage');

      const base64 = await this.fileToBase64(file);

      window.parent.postMessage({
        type: 'api-proxy',
        id: requestId,
        payload: {
          endpoint: '/api/ipfs/create-nft-asset',
          method: 'POST',
          body: {
            file: base64,
            filename: file.name,
            nftName,
            nftDescription,
            attributes: JSON.stringify(attributes)
          },
          contentType: 'multipart/form-data'
        }
      }, '*');

      const result = await new Promise<CreateNFTAssetResponse>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Asset creation timeout'));
        }, 90000); // 90 second timeout

        const handleMessage = (event: MessageEvent) => {
          const { type, id, success, data, error } = event.data;

          if (type === 'api-proxy-response' && id === requestId) {
            cleanup();
            if (success) {
              resolve(data);
            } else {
              reject(new Error(error || 'Asset creation failed'));
            }
          }
        };

        const cleanup = () => {
          clearTimeout(timeout);
          window.removeEventListener('message', handleMessage);
        };

        window.addEventListener('message', handleMessage);
      });

      return result;
    } catch (error: any) {
      console.error('[IPFSService] Asset creation error:', error);
      return {
        success: false,
        error: \`Failed to create NFT asset: \${error.message}\`
      };
    }
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}

// /src/hooks/useNFTMinting.ts
import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { type Hex } from 'viem';
import { IPFSService, type NFTAttribute, type CreateNFTAssetResponse } from '../services/ipfsService';

const NFT_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'uri', type: 'string' }
    ],
    name: 'mint',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  }
];

interface NFTMintingState {
  isUploading: boolean;
  isMinting: boolean;
  uploadError: string | null;
  mintError: string | null;
  assetData: CreateNFTAssetResponse | null;
  mintedTokenId: string | null;
  transactionHash: string | null;
}

export function useNFTMinting(contractAddress: string) {
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [state, setState] = useState<NFTMintingState>({
    isUploading: false,
    isMinting: false,
    uploadError: null,
    mintError: null,
    assetData: null,
    mintedTokenId: null,
    transactionHash: null
  });

  const ipfsService = new IPFSService();

  const uploadAndMint = async (
    file: File,
    nftName: string,
    nftDescription: string,
    attributes: NFTAttribute[]
  ) => {
    if (!isConnected || !address) {
      throw new Error('Wallet not connected');
    }

    setState(prev => ({
      ...prev,
      isUploading: true,
      uploadError: null,
      mintError: null
    }));

    try {
      // Step 1: Upload image and create metadata on IPFS
      const assetResult = await ipfsService.createNFTAsset(
        file,
        nftName,
        nftDescription,
        attributes
      );

      if (!assetResult.success || !assetResult.tokenURI) {
        throw new Error(assetResult.error || 'Failed to create NFT asset');
      }

      setState(prev => ({
        ...prev,
        isUploading: false,
        isMinting: true,
        assetData: assetResult
      }));

      // Step 2: Mint NFT on blockchain
      const hash = await writeContractAsync({
        address: contractAddress as Hex,
        abi: NFT_ABI,
        functionName: 'mint',
        args: [address, assetResult.tokenURI]
      });

      console.log('Mint transaction hash:', hash);

      setState(prev => ({
        ...prev,
        isMinting: false,
        transactionHash: hash
      }));

      return { success: true, hash, tokenURI: assetResult.tokenURI };
    } catch (error: any) {
      console.error('NFT minting error:', error);
      setState(prev => ({
        ...prev,
        isUploading: false,
        isMinting: false,
        mintError: error.message || 'Minting failed'
      }));
      throw error;
    }
  };

  const reset = () => {
    setState({
      isUploading: false,
      isMinting: false,
      uploadError: null,
      mintError: null,
      assetData: null,
      mintedTokenId: null,
      transactionHash: null
    });
  };

  return {
    ...state,
    uploadAndMint,
    reset,
    isConnected,
    userAddress: address
  };
}

// /src/components/ImageUpload.tsx
import React, { useCallback, useState } from 'react';

interface ImageUploadProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

export function ImageUpload({ onFileSelect, disabled }: ImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    onFileSelect(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (disabled) return;

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  }, [disabled]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleClick = () => {
    if (!disabled) {
      document.getElementById('file-input')?.click();
    }
  };

  return (
    <div>
      <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">
        NFT Image
      </label>
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={\`relative border-3 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all \${
          isDragging
            ? 'border-purple-500 bg-purple-50'
            : preview
            ? 'border-green-300 bg-green-50'
            : 'border-gray-300 hover:border-purple-400 hover:bg-purple-50'
        } \${disabled ? 'opacity-50 cursor-not-allowed' : ''}\`}
      >
        <input
          id="file-input"
          type="file"
          accept="image/*"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="hidden"
          disabled={disabled}
        />

        {preview ? (
          <div className="space-y-4">
            <img
              src={preview}
              alt="Preview"
              className="max-w-full max-h-64 mx-auto rounded-xl shadow-lg"
            />
            <p className="text-sm font-semibold text-green-700">✓ Image selected</p>
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreview(null);
                }}
                className="text-sm text-purple-600 hover:text-purple-800 font-semibold"
              >
                Change Image
              </button>
            )}
          </div>
        ) : (
          <div>
            <svg
              className="w-16 h-16 mx-auto mb-4 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-lg font-semibold text-gray-700 mb-2">
              Drag & drop your NFT image
            </p>
            <p className="text-sm text-gray-500">or click to browse</p>
            <p className="text-xs text-gray-400 mt-2">
              Supports: JPG, PNG, GIF, SVG, WEBP
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// /src/components/AttributeEditor.tsx
import React from 'react';

interface Attribute {
  trait_type: string;
  value: string;
}

interface AttributeEditorProps {
  attributes: Attribute[];
  onChange: (attributes: Attribute[]) => void;
  disabled?: boolean;
}

export function AttributeEditor({ attributes, onChange, disabled }: AttributeEditorProps) {
  const addAttribute = () => {
    onChange([...attributes, { trait_type: '', value: '' }]);
  };

  const removeAttribute = (index: number) => {
    onChange(attributes.filter((_, i) => i !== index));
  };

  const updateAttribute = (index: number, field: 'trait_type' | 'value', value: string) => {
    const updated = [...attributes];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="block text-sm font-bold text-gray-700 uppercase tracking-wide">
          Attributes (Optional)
        </label>
        <button
          type="button"
          onClick={addAttribute}
          disabled={disabled}
          className="px-3 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 font-semibold rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          + Add Trait
        </button>
      </div>

      <div className="space-y-2">
        {attributes.map((attr, index) => (
          <div key={index} className="flex gap-2">
            <input
              type="text"
              value={attr.trait_type}
              onChange={(e) => updateAttribute(index, 'trait_type', e.target.value)}
              placeholder="Trait (e.g., Background)"
              className="flex-1 px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
              disabled={disabled}
            />
            <input
              type="text"
              value={attr.value}
              onChange={(e) => updateAttribute(index, 'value', e.target.value)}
              placeholder="Value (e.g., Blue)"
              className="flex-1 px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
              disabled={disabled}
            />
            <button
              type="button"
              onClick={() => removeAttribute(index)}
              disabled={disabled}
              className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded-lg transition-colors disabled:opacity-50"
            >
              ✕
            </button>
          </div>
        ))}

        {attributes.length === 0 && (
          <p className="text-sm text-gray-500 italic text-center py-4">
            No attributes added. Click "+ Add Trait" to add custom properties.
          </p>
        )}
      </div>
    </div>
  );
}

// /src/components/NFTMinter.tsx
import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { useNFTMinting } from '../hooks/useNFTMinting';
import { ImageUpload } from './ImageUpload';
import { AttributeEditor } from './AttributeEditor';

export function NFTMinter() {
  const { isConnected, address } = useAccount();
  const { open } = useAppKit();
  const {
    isUploading,
    isMinting,
    mintError,
    assetData,
    transactionHash,
    uploadAndMint,
    reset
  } = useNFTMinting(NFT_CONTRACT_ADDRESS);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [nftName, setNftName] = useState('');
  const [nftDescription, setNftDescription] = useState('');
  const [attributes, setAttributes] = useState<Array<{trait_type: string; value: string}>>([]);

  const handleMint = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedFile || !nftName || !nftDescription) {
      alert('Please fill in all required fields and select an image');
      return;
    }

    await uploadAndMint(
      selectedFile,
      nftName,
      nftDescription,
      attributes.filter(a => a.trait_type && a.value)
    );
  };

  const formatAddress = (addr: string) => {
    return \`\${addr.slice(0, 6)}...\${addr.slice(-4)}\`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                🎨 NFT Minter
              </h1>
              <p className="text-gray-600 mt-2">Upload your art and mint it as an NFT</p>
              <p className="text-xs text-gray-400 mt-1 font-mono">
                Contract: {NFT_CONTRACT_ADDRESS}
              </p>
            </div>

            {isConnected && address ? (
              <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm font-medium text-gray-700">{formatAddress(address)}</span>
              </div>
            ) : (
              <button
                onClick={() => open()}
                className="px-6 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity shadow-lg"
              >
                Connect Wallet
              </button>
            )}
          </div>

          {!isConnected ? (
            <div className="text-center py-20 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl">
              <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full flex items-center justify-center">
                <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Connect Your Wallet</h3>
              <p className="text-gray-600 mb-8 max-w-md mx-auto">Connect MetaMask to start minting NFTs</p>
              <button
                onClick={() => open()}
                className="px-10 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity shadow-lg"
              >
                Connect Wallet
              </button>
            </div>
          ) : transactionHash ? (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-2xl p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg">
                    <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-green-900">NFT Minted Successfully! 🎉</h3>
                    <p className="text-green-700 text-lg">Your NFT is now on the blockchain</p>
                  </div>
                </div>

                <div className="space-y-4 bg-white rounded-xl p-6 shadow-inner">
                  {assetData?.imageUrl && (
                    <div>
                      <img
                        src={assetData.imageUrl}
                        alt="Minted NFT"
                        className="max-w-xs mx-auto rounded-xl shadow-lg mb-4"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Transaction Hash</label>
                    <div className="mt-2">
                      <code className="block px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm font-mono break-all">
                        {transactionHash}
                      </code>
                    </div>
                  </div>

                  {assetData?.tokenURI && (
                    <div>
                      <label className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Token URI (Metadata)</label>
                      <div className="mt-2">
                        <code className="block px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm font-mono break-all">
                          {assetData.tokenURI}
                        </code>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => {
                  reset();
                  setSelectedFile(null);
                  setNftName('');
                  setNftDescription('');
                  setAttributes([]);
                }}
                className="w-full px-6 py-4 bg-gray-100 hover:bg-gray-200 text-gray-900 font-bold rounded-xl transition-colors text-lg"
              >
                Mint Another NFT
              </button>
            </div>
          ) : (
            <form onSubmit={handleMint} className="space-y-6">
              <ImageUpload
                onFileSelect={setSelectedFile}
                disabled={isUploading || isMinting}
              />

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">
                  NFT Name *
                </label>
                <input
                  type="text"
                  value={nftName}
                  onChange={(e) => setNftName(e.target.value)}
                  placeholder="e.g., Cool Cat #1"
                  className="w-full px-4 py-4 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all text-lg"
                  disabled={isUploading || isMinting}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">
                  Description *
                </label>
                <textarea
                  value={nftDescription}
                  onChange={(e) => setNftDescription(e.target.value)}
                  placeholder="Describe your NFT..."
                  rows={3}
                  className="w-full px-4 py-4 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all resize-none text-lg"
                  disabled={isUploading || isMinting}
                  required
                />
              </div>

              <AttributeEditor
                attributes={attributes}
                onChange={setAttributes}
                disabled={isUploading || isMinting}
              />

              {mintError && (
                <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
                  <p className="text-red-800 font-semibold">❌ {mintError}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isUploading || isMinting || !selectedFile || !nftName || !nftDescription}
                className="w-full px-8 py-5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg text-xl"
              >
                {isUploading ? (
                  <span className="flex items-center justify-center gap-3">
                    <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Uploading to IPFS...
                  </span>
                ) : isMinting ? (
                  <span className="flex items-center justify-center gap-3">
                    <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Minting NFT...
                  </span>
                ) : (
                  '🚀 Mint NFT'
                )}
              </button>

              <p className="text-sm text-gray-500 text-center">
                Your image will be uploaded to IPFS and minted as an NFT
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// /src/App.tsx
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NFTMinter } from './components/NFTMinter';
import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { sepolia, baseSepolia, arbitrumSepolia } from '@reown/appkit/networks';

const queryClient = new QueryClient();

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '0ab3f2c9a30c1add3cff35eadf12cfc7';

const metadata = {
  name: 'NFT Minter',
  description: 'Upload images and mint NFTs with IPFS',
  url: window.location.origin,
  icons: ['https://avatars.githubusercontent.com/u/37784886']
};

const chains = [sepolia, baseSepolia, arbitrumSepolia] as const;

const wagmiAdapter = new WagmiAdapter({
  networks: chains,
  projectId
});

createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks: chains,
  metadata,
  features: {
    analytics: false,
    email: false,
    socials: false
  }
});

export default function App() {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <NFTMinter />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

// /vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Resource-Policy': 'cross-origin'
    },
    cors: true,
    host: true
  }
});
`;
