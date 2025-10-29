// NFT Contract Deployment Template
// Deploys an ERC-721 NFT collection contract

export const nftDeploymentTemplate = `
// NFT CONTRACT DEPLOYMENT APP
// Backend compiles ERC-721 contract → Frontend deploys with user's wallet

const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  return 'https://localhost:3001';
};

const API_BASE_URL = getApiBaseUrl();

// /src/services/contractService.ts
import { type Hex, createWalletClient, custom, createPublicClient, http } from 'viem';
import { sepolia, baseSepolia, arbitrumSepolia } from 'viem/chains';

export interface CompileNFTRequest {
  contractType: 'erc721';
  name: string;
  symbol: string;
  userId: string;
}

export interface CompileNFTResponse {
  success: boolean;
  contractId?: string;
  data?: {
    bytecode: string;
    abi: any[];
    sourceCode: string;
  };
  error?: string;
}

export interface DeploymentResult {
  contractAddress: string;
  transactionHash: string;
  blockNumber: bigint;
  chainId: number;
  chainName: string;
  explorerUrl: string;
}

export class NFTContractService {
  private apiBaseUrl: string;

  constructor(apiBaseUrl: string = API_BASE_URL) {
    this.apiBaseUrl = apiBaseUrl;
  }

  async compileNFTContract(request: CompileNFTRequest): Promise<CompileNFTResponse> {
    try {
      const requestId = \`compile-nft-\${Date.now()}-\${Math.random().toString(36).substr(2, 9)}\`;

      console.log('[NFTContractService] Compiling NFT contract via postMessage');

      window.parent.postMessage({
        type: 'api-proxy',
        id: requestId,
        payload: {
          endpoint: '/api/contracts/compile',
          method: 'POST',
          body: request
        }
      }, '*');

      const result = await new Promise<CompileNFTResponse>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Request timeout'));
        }, 30000);

        const handleMessage = (event: MessageEvent) => {
          const { type, id, success, data, error } = event.data;

          if (type === 'api-proxy-response' && id === requestId) {
            cleanup();
            if (success) {
              resolve(data);
            } else {
              reject(new Error(error || 'Compilation failed'));
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
      console.error('[NFTContractService] Compilation error:', error);
      return {
        success: false,
        error: \`Failed to compile NFT contract: \${error.message}\`
      };
    }
  }

  async deployNFTContract(
    bytecode: Hex,
    abi: any[],
    name: string,
    symbol: string,
    chainId: number,
    walletAddress: Hex
  ): Promise<DeploymentResult> {
    try {
      const chain = this.getChainById(chainId);
      if (!chain) {
        throw new Error(\`Unsupported chain ID: \${chainId}\`);
      }

      const walletClient = createWalletClient({
        chain,
        transport: custom(window.ethereum!)
      });

      const publicClient = createPublicClient({
        chain,
        transport: http()
      });

      console.log('Deploying NFT contract:', name, symbol);

      const hash = await walletClient.deployContract({
        abi,
        bytecode,
        args: [name, symbol],
        account: walletAddress
      });

      console.log('Transaction hash:', hash);

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1
      });

      if (!receipt.contractAddress) {
        throw new Error('NFT contract deployment failed');
      }

      const explorerUrl = this.getExplorerUrl(chainId, receipt.contractAddress);

      return {
        contractAddress: receipt.contractAddress,
        transactionHash: hash,
        blockNumber: receipt.blockNumber,
        chainId,
        chainName: chain.name,
        explorerUrl
      };
    } catch (error: any) {
      console.error('Deployment error:', error);
      throw error;
    }
  }

  private getChainById(chainId: number) {
    const chains = {
      [sepolia.id]: sepolia,
      [baseSepolia.id]: baseSepolia,
      [arbitrumSepolia.id]: arbitrumSepolia
    };
    return chains[chainId];
  }

  private getExplorerUrl(chainId: number, address: string): string {
    const explorers: Record<number, string> = {
      [sepolia.id]: 'https://sepolia.etherscan.io',
      [baseSepolia.id]: 'https://sepolia.basescan.org',
      [arbitrumSepolia.id]: 'https://sepolia.arbiscan.io'
    };
    const baseUrl = explorers[chainId] || 'https://etherscan.io';
    return \`\${baseUrl}/address/\${address}\`;
  }
}

// /src/hooks/useNFTDeployment.ts
import { useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { type Hex } from 'viem';
import { NFTContractService } from '../services/contractService';

interface NFTDeploymentState {
  isCompiling: boolean;
  isDeploying: boolean;
  compilationError: string | null;
  deploymentError: string | null;
  deploymentResult: DeploymentResult | null;
  contractId: string | null;
  bytecode: Hex | null;
  abi: any[] | null;
}

export function useNFTDeployment() {
  const { address, isConnected } = useAccount();
  const currentChainId = useChainId();

  const [state, setState] = useState<NFTDeploymentState>({
    isCompiling: false,
    isDeploying: false,
    compilationError: null,
    deploymentError: null,
    deploymentResult: null,
    contractId: null,
    bytecode: null,
    abi: null
  });

  const contractService = new NFTContractService();

  const deployNFTCollection = async (
    name: string,
    symbol: string,
    targetChainId: number
  ) => {
    if (!isConnected || !address) {
      throw new Error('Wallet not connected');
    }

    setState(prev => ({
      ...prev,
      isCompiling: true,
      compilationError: null,
      deploymentError: null
    }));

    try {
      // Step 1: Compile NFT contract
      const compileResult = await contractService.compileNFTContract({
        contractType: 'erc721',
        name,
        symbol,
        userId: 'demo-user'
      });

      if (!compileResult.success || !compileResult.data) {
        throw new Error(compileResult.error || 'Compilation failed');
      }

      const { bytecode, abi, sourceCode } = compileResult.data;

      setState(prev => ({
        ...prev,
        isCompiling: false,
        isDeploying: true,
        contractId: compileResult.contractId || null,
        bytecode: bytecode as Hex,
        abi
      }));

      // Step 2: Deploy NFT contract
      const deployResult = await contractService.deployNFTContract(
        bytecode as Hex,
        abi,
        name,
        symbol,
        targetChainId,
        address as Hex
      );

      setState(prev => ({
        ...prev,
        isDeploying: false,
        deploymentResult: deployResult
      }));

    } catch (error: any) {
      console.error('NFT deployment error:', error);
      setState(prev => ({
        ...prev,
        isCompiling: false,
        isDeploying: false,
        deploymentError: error.message || 'Deployment failed'
      }));
    }
  };

  const reset = () => {
    setState({
      isCompiling: false,
      isDeploying: false,
      compilationError: null,
      deploymentError: null,
      deploymentResult: null,
      contractId: null,
      bytecode: null,
      abi: null
    });
  };

  return {
    ...state,
    deployNFTCollection,
    reset,
    isConnected,
    userAddress: address
  };
}

// /src/components/NFTDeployer.tsx
import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { useNFTDeployment } from '../hooks/useNFTDeployment';

export function NFTDeployer() {
  const { isConnected, address } = useAccount();
  const { open } = useAppKit();
  const {
    isCompiling,
    isDeploying,
    deploymentError,
    deploymentResult,
    deployNFTCollection,
    reset
  } = useNFTDeployment();

  const [collectionName, setCollectionName] = useState('');
  const [collectionSymbol, setCollectionSymbol] = useState('');
  const [selectedChain, setSelectedChain] = useState(11155111);

  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!collectionName || !collectionSymbol) {
      alert('Please fill in all fields');
      return;
    }

    await deployNFTCollection(collectionName, collectionSymbol, selectedChain);
  };

  const formatAddress = (addr: string) => {
    return \`\${addr.slice(0, 6)}...\${addr.slice(-4)}\`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                NFT Collection Deployer
              </h1>
              <p className="text-gray-600 mt-2">Deploy your own ERC-721 NFT collection</p>
            </div>

            {isConnected && address ? (
              <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm font-medium text-gray-700">{formatAddress(address)}</span>
              </div>
            ) : (
              <button
                onClick={() => open()}
                className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity shadow-lg"
              >
                Connect Wallet
              </button>
            )}
          </div>

          {!isConnected ? (
            <div className="text-center py-16 bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl">
              <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Connect Your Wallet</h3>
              <p className="text-gray-600 mb-8 max-w-md mx-auto">Connect MetaMask to deploy your NFT collection on the blockchain</p>
              <button
                onClick={() => open()}
                className="px-10 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity shadow-lg"
              >
                Connect Wallet
              </button>
            </div>
          ) : deploymentResult ? (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-2xl p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg">
                    <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-green-900">NFT Collection Deployed!</h3>
                    <p className="text-green-700 text-lg">Your collection is live on {deploymentResult.chainName}</p>
                  </div>
                </div>

                <div className="space-y-4 bg-white rounded-xl p-6 shadow-inner">
                  <div>
                    <label className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Contract Address</label>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="flex-1 px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm font-mono font-semibold">
                        {deploymentResult.contractAddress}
                      </code>
                      <button
                        onClick={() => navigator.clipboard.writeText(deploymentResult.contractAddress)}
                        className="px-4 py-3 bg-purple-100 hover:bg-purple-200 rounded-xl transition-colors font-semibold text-purple-700"
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Transaction Hash</label>
                    <div className="mt-2">
                      <code className="block px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl text-sm font-mono break-all">
                        {deploymentResult.transactionHash}
                      </code>
                    </div>
                  </div>

                  <a
                    href={deploymentResult.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-center px-6 py-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold rounded-xl transition-all shadow-lg text-lg"
                  >
                    View on Block Explorer →
                  </a>
                </div>
              </div>

              <button
                onClick={reset}
                className="w-full px-6 py-4 bg-gray-100 hover:bg-gray-200 text-gray-900 font-bold rounded-xl transition-colors text-lg"
              >
                Deploy Another Collection
              </button>
            </div>
          ) : (
            <form onSubmit={handleDeploy} className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">
                  Collection Name
                </label>
                <input
                  type="text"
                  value={collectionName}
                  onChange={(e) => setCollectionName(e.target.value)}
                  placeholder="e.g., Cool Cats NFT"
                  className="w-full px-4 py-4 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all text-lg"
                  disabled={isCompiling || isDeploying}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">
                  Collection Symbol
                </label>
                <input
                  type="text"
                  value={collectionSymbol}
                  onChange={(e) => setCollectionSymbol(e.target.value.toUpperCase())}
                  placeholder="e.g., COOLCAT"
                  className="w-full px-4 py-4 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all text-lg uppercase"
                  disabled={isCompiling || isDeploying}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">
                  Network
                </label>
                <select
                  value={selectedChain}
                  onChange={(e) => setSelectedChain(Number(e.target.value))}
                  className="w-full px-4 py-4 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all text-lg"
                  disabled={isCompiling || isDeploying}
                >
                  <option value={11155111}>Ethereum Sepolia (Testnet)</option>
                  <option value={84532}>Base Sepolia (Testnet)</option>
                  <option value={421614}>Arbitrum Sepolia (Testnet)</option>
                </select>
              </div>

              {deploymentError && (
                <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
                  <p className="text-red-800 font-semibold">❌ {deploymentError}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isCompiling || isDeploying || !collectionName || !collectionSymbol}
                className="w-full px-8 py-5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg text-xl"
              >
                {isCompiling ? (
                  <span className="flex items-center justify-center gap-3">
                    <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Compiling Contract...
                  </span>
                ) : isDeploying ? (
                  <span className="flex items-center justify-center gap-3">
                    <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Deploying to Blockchain...
                  </span>
                ) : (
                  '🚀 Deploy NFT Collection'
                )}
              </button>

              <p className="text-sm text-gray-500 text-center">
                Make sure you have testnet ETH in your wallet for gas fees
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
import { NFTDeployer } from './components/NFTDeployer';
import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { sepolia, baseSepolia, arbitrumSepolia } from '@reown/appkit/networks';

const queryClient = new QueryClient();

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '0ab3f2c9a30c1add3cff35eadf12cfc7';

const metadata = {
  name: 'NFT Collection Deployer',
  description: 'Deploy your own ERC-721 NFT collection',
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
        <NFTDeployer />
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
