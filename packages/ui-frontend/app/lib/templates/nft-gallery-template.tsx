// NFT Gallery Viewer Template
// Display all minted NFTs from a collection

export const nftGalleryTemplate = `
// NFT GALLERY VIEWER
// Fetches and displays all NFTs from an ERC-721 contract

// CONTRACT ADDRESS - UPDATE THIS
const NFT_CONTRACT_ADDRESS = 'YOUR_CONTRACT_ADDRESS_HERE';

// /src/types/nft.ts
export interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  external_url?: string;
  attributes?: Array<{
    trait_type: string;
    value: string | number;
    display_type?: string;
  }>;
}

export interface NFT {
  tokenId: number;
  owner: string;
  tokenURI: string;
  metadata: NFTMetadata | null;
  loading: boolean;
  error: string | null;
}

// /src/hooks/useNFTCollection.ts
import { useState, useEffect } from 'react';
import { usePublicClient, useReadContract } from 'wagmi';
import { type Hex } from 'viem';
import type { NFT, NFTMetadata } from '../types/nft';

const NFT_ABI = [
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  }
];

export function useNFTCollection(contractAddress: string) {
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const publicClient = usePublicClient();

  const { data: totalSupply, isError: supplyError } = useReadContract({
    address: contractAddress as Hex,
    abi: NFT_ABI,
    functionName: 'totalSupply'
  });

  useEffect(() => {
    if (supplyError) {
      setError('Failed to load NFT collection');
      setIsLoading(false);
      return;
    }

    if (totalSupply === undefined) return;

    const loadNFTs = async () => {
      setIsLoading(true);
      const supply = Number(totalSupply);

      if (supply === 0) {
        setNfts([]);
        setIsLoading(false);
        return;
      }

      // Create placeholder NFT objects
      const nftArray: NFT[] = Array.from({ length: supply }, (_, i) => ({
        tokenId: i,
        owner: '',
        tokenURI: '',
        metadata: null,
        loading: true,
        error: null
      }));

      setNfts(nftArray);

      // Load each NFT's data
      for (let tokenId = 0; tokenId < supply; tokenId++) {
        try {
          // Fetch token URI and owner
          const [tokenURI, owner] = await Promise.all([
            publicClient?.readContract({
              address: contractAddress as Hex,
              abi: NFT_ABI,
              functionName: 'tokenURI',
              args: [BigInt(tokenId)]
            }) as Promise<string>,
            publicClient?.readContract({
              address: contractAddress as Hex,
              abi: NFT_ABI,
              functionName: 'ownerOf',
              args: [BigInt(tokenId)]
            }) as Promise<string>
          ]);

          // Fetch metadata from IPFS
          let metadata: NFTMetadata | null = null;
          if (tokenURI) {
            try {
              const metadataUrl = tokenURI.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/');
              const response = await fetch(metadataUrl);
              metadata = await response.json();

              // Convert IPFS image URLs to gateway URLs
              if (metadata && metadata.image.startsWith('ipfs://')) {
                metadata.image = metadata.image.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/');
              }
            } catch (err) {
              console.error(\`Failed to fetch metadata for token \${tokenId}:\`, err);
            }
          }

          setNfts(prev => {
            const updated = [...prev];
            updated[tokenId] = {
              tokenId,
              owner: owner as string,
              tokenURI,
              metadata,
              loading: false,
              error: null
            };
            return updated;
          });
        } catch (err) {
          console.error(\`Error loading NFT \${tokenId}:\`, err);
          setNfts(prev => {
            const updated = [...prev];
            updated[tokenId] = {
              ...updated[tokenId],
              loading: false,
              error: 'Failed to load NFT'
            };
            return updated;
          });
        }
      }

      setIsLoading(false);
    };

    loadNFTs();
  }, [totalSupply, supplyError, contractAddress, publicClient]);

  return {
    nfts,
    totalSupply: totalSupply ? Number(totalSupply) : 0,
    isLoading,
    error
  };
}

// /src/components/NFTCard.tsx
import React from 'react';
import type { NFT } from '../types/nft';

interface NFTCardProps {
  nft: NFT;
  onClick?: () => void;
}

export function NFTCard({ nft, onClick }: NFTCardProps) {
  const formatAddress = (addr: string) => {
    return \`\${addr.slice(0, 6)}...\${addr.slice(-4)}\`;
  };

  if (nft.loading) {
    return (
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden border-2 border-gray-100 animate-pulse">
        <div className="aspect-square bg-gray-200"></div>
        <div className="p-4 space-y-2">
          <div className="h-5 bg-gray-200 rounded"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  if (nft.error || !nft.metadata) {
    return (
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden border-2 border-red-100">
        <div className="aspect-square bg-gray-100 flex items-center justify-center">
          <p className="text-red-500 font-semibold">Failed to load</p>
        </div>
        <div className="p-4">
          <p className="text-sm text-gray-500">Token #{nft.tokenId}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl shadow-lg overflow-hidden border-2 border-gray-100 hover:border-purple-300 hover:shadow-2xl transition-all cursor-pointer group"
    >
      <div className="aspect-square overflow-hidden bg-gray-50">
        <img
          src={nft.metadata.image}
          alt={nft.metadata.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
      </div>
      <div className="p-4">
        <h3 className="text-lg font-bold text-gray-900 mb-1 truncate">
          {nft.metadata.name}
        </h3>
        <p className="text-sm text-gray-500 mb-2">Token #{nft.tokenId}</p>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>Owner:</span>
          <code className="font-mono">{formatAddress(nft.owner)}</code>
        </div>
      </div>
    </div>
  );
}

// /src/components/NFTDetail.tsx
import React from 'react';
import type { NFT } from '../types/nft';

interface NFTDetailProps {
  nft: NFT;
  onClose: () => void;
  explorerUrl?: string;
}

export function NFTDetail({ nft, onClose, explorerUrl }: NFTDetailProps) {
  if (!nft.metadata) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div
        className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-2">{nft.metadata.name}</h2>
              <p className="text-gray-600">Token #{nft.tokenId}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <img
                src={nft.metadata.image}
                alt={nft.metadata.name}
                className="w-full rounded-2xl shadow-lg"
              />
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2">Description</h3>
                <p className="text-gray-700 leading-relaxed">{nft.metadata.description}</p>
              </div>

              {nft.metadata.attributes && nft.metadata.attributes.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Attributes</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {nft.metadata.attributes.map((attr, idx) => (
                      <div key={idx} className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl p-3 border border-purple-100">
                        <p className="text-xs text-purple-600 font-semibold uppercase tracking-wide mb-1">
                          {attr.trait_type}
                        </p>
                        <p className="text-lg font-bold text-gray-900">{attr.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2">Owner</h3>
                <code className="block px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono break-all">
                  {nft.owner}
                </code>
              </div>

              <div>
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2">Token URI</h3>
                <a
                  href={nft.tokenURI.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm font-mono break-all hover:bg-blue-100 transition-colors text-blue-700"
                >
                  {nft.tokenURI}
                </a>
              </div>

              {explorerUrl && (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold rounded-xl hover:opacity-90 transition-opacity"
                >
                  View on Block Explorer →
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// /src/components/NFTGallery.tsx
import React, { useState } from 'react';
import { useChainId } from 'wagmi';
import { useNFTCollection } from '../hooks/useNFTCollection';
import { NFTCard } from './NFTCard';
import { NFTDetail } from './NFTDetail';
import type { NFT } from '../types/nft';

export function NFTGallery() {
  const chainId = useChainId();
  const { nfts, totalSupply, isLoading, error } = useNFTCollection(NFT_CONTRACT_ADDRESS);
  const [selectedNFT, setSelectedNFT] = useState<NFT | null>(null);

  const getExplorerUrl = (tokenId: number): string => {
    const explorers: Record<number, string> = {
      11155111: 'https://sepolia.etherscan.io',
      84532: 'https://sepolia.basescan.org',
      421614: 'https://sepolia.arbiscan.io'
    };
    const baseUrl = explorers[chainId] || 'https://etherscan.io';
    return \`\${baseUrl}/token/\${NFT_CONTRACT_ADDRESS}?a=\${tokenId}\`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-12">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-4">
            🖼️ NFT Gallery
          </h1>
          <p className="text-xl text-gray-600 mb-2">
            Explore the collection
          </p>
          <p className="text-sm text-gray-400 font-mono">
            Contract: {NFT_CONTRACT_ADDRESS}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-6 mb-8">
            <p className="text-red-800 font-semibold text-center">❌ {error}</p>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-purple-200 border-t-purple-600 mb-4"></div>
            <p className="text-lg text-gray-600 font-semibold">Loading NFTs...</p>
          </div>
        ) : totalSupply === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl shadow-xl">
            <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-r from-purple-100 to-blue-100 rounded-full flex items-center justify-center">
              <svg className="w-12 h-12 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">No NFTs Yet</h3>
            <p className="text-gray-600">This collection is empty. Start minting to see NFTs here!</p>
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-center justify-between">
              <p className="text-lg text-gray-700">
                <span className="font-bold text-2xl text-purple-600">{totalSupply}</span>
                <span className="ml-2 text-gray-500">
                  {totalSupply === 1 ? 'NFT' : 'NFTs'} in collection
                </span>
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {nfts.map((nft) => (
                <NFTCard
                  key={nft.tokenId}
                  nft={nft}
                  onClick={() => setSelectedNFT(nft)}
                />
              ))}
            </div>
          </>
        )}

        {selectedNFT && (
          <NFTDetail
            nft={selectedNFT}
            onClose={() => setSelectedNFT(null)}
            explorerUrl={getExplorerUrl(selectedNFT.tokenId)}
          />
        )}
      </div>
    </div>
  );
}

// /src/App.tsx
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NFTGallery } from './components/NFTGallery';
import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { sepolia, baseSepolia, arbitrumSepolia } from '@reown/appkit/networks';

const queryClient = new QueryClient();

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '0ab3f2c9a30c1add3cff35eadf12cfc7';

const metadata = {
  name: 'NFT Gallery',
  description: 'View NFT collection',
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
        <NFTGallery />
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
