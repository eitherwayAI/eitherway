// Contract Deployment Template for Token/NFT Deployer Apps
// Uses Backend API for compilation + User's MetaMask wallet for deployment

export const contractDeploymentTemplate = `
// ============================================================================
// SMART CONTRACT DEPLOYMENT APP TEMPLATE
// Backend compiles → Frontend deploys with user's wallet
// ============================================================================

// BACKEND API ENDPOINTS (EITHERWAY SERVER):
// - POST /api/contracts/compile - Compile contract and get bytecode/ABI
// - POST /api/contracts/deploy - Optional: Track deployment in database
// - GET /api/contracts/chains - Get supported chains

// SERVER CONFIGURATION:
// The EitherWay backend runs on localhost:3001
// We try HTTPS first, fallback to HTTP if needed

// Auto-detect the correct protocol and URL
const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  // Default: Use localhost for local development
  return 'https://localhost:3001';
};

const API_BASE_URL = getApiBaseUrl();

// ============================================================================
// STEP 1: SERVICE - Contract Compilation & Deployment
// ============================================================================

// /src/services/contractService.ts
import { type Hex, parseEther, createWalletClient, custom, createPublicClient, http } from 'viem';
import { sepolia, baseSepolia, arbitrumSepolia } from 'viem/chains';

export interface CompileContractRequest {
  contractType: 'erc20' | 'erc721' | 'custom';
  name: string;
  symbol?: string;
  totalSupply?: string;
  sourceCode?: string;
  userId: string;
  appId?: string;
  sessionId?: string;
}

export interface CompileContractResponse {
  success: boolean;
  contractId?: string;
  data?: {
    bytecode: string;
    abi: any[];
    sourceCode: string;
    estimatedGas?: string;
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

export class ContractService {
  private apiBaseUrl: string;

  constructor(apiBaseUrl: string = API_BASE_URL) {
    this.apiBaseUrl = apiBaseUrl;
  }

  /**
   * Compile a smart contract using the backend API via postMessage proxy
   * WebContainer apps cannot access localhost directly, so we send a message to the parent window
   * which proxies the request to the backend API
   */
  async compileContract(request: CompileContractRequest): Promise<CompileContractResponse> {
    try {
      // Generate unique request ID
      const requestId = \`compile-\${Date.now()}-\${Math.random().toString(36).substr(2, 9)}\`;

      console.log('[ContractService] Sending compilation request via postMessage:', requestId);

      // Send request to parent window (main app) via postMessage
      window.parent.postMessage({
        type: 'api-proxy',
        id: requestId,
        payload: {
          endpoint: '/api/contracts/compile',
          method: 'POST',
          body: request
        }
      }, '*');

      // Wait for response from parent window
      const result = await new Promise<CompileContractResponse>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Request timeout - parent window did not respond'));
        }, 30000); // 30 second timeout

        const handleMessage = (event: MessageEvent) => {
          const { type, id, success, data, error } = event.data;

          // Only handle responses for our request
          if (type === 'api-proxy-response' && id === requestId) {
            cleanup();

            if (success) {
              console.log('[ContractService] Compilation successful via postMessage');
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
      console.error('[ContractService] Compilation error:', error);
      return {
        success: false,
        error: \`Failed to compile contract: \${error.message}\`
      };
    }
  }

  /**
   * Deploy a compiled contract using the user's MetaMask wallet
   * This does NOT use the backend's private key - it uses the connected wallet
   */
  async deployContract(
    bytecode: Hex,
    abi: any[],
    constructorArgs: any[],
    chainId: number,
    walletAddress: Hex
  ): Promise<DeploymentResult> {
    try {
      // Get the chain configuration
      const chain = this.getChainById(chainId);
      if (!chain) {
        throw new Error(\`Unsupported chain ID: \${chainId}\`);
      }

      // Create wallet client with MetaMask
      const walletClient = createWalletClient({
        chain,
        transport: custom(window.ethereum!)
      });

      // Create public client for reading
      const publicClient = createPublicClient({
        chain,
        transport: http()
      });

      // Deploy the contract using the connected wallet
      console.log('Deploying contract with args:', constructorArgs);
      const hash = await walletClient.deployContract({
        abi,
        bytecode,
        args: constructorArgs,
        account: walletAddress
      });

      console.log('Transaction hash:', hash);

      // Wait for the transaction to be confirmed
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1
      });

      console.log('Deployment receipt:', receipt);

      if (!receipt.contractAddress) {
        throw new Error('Contract deployment failed: no contract address');
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
      console.error('Contract deployment error:', error);
      throw new Error(error.message || 'Failed to deploy contract');
    }
  }

  /**
   * Optional: Report deployment to backend for tracking
   */
  async reportDeployment(contractId: string, deploymentResult: DeploymentResult): Promise<void> {
    try {
      await fetch(\`\${this.apiBaseUrl}/api/contracts/\${contractId}/deployment\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          deployed_address: deploymentResult.contractAddress,
          deployment_tx_hash: deploymentResult.transactionHash,
          deployed_chain_id: deploymentResult.chainId,
          block_number: deploymentResult.blockNumber.toString(),
          explorer_url: deploymentResult.explorerUrl
        })
      });
    } catch (error) {
      console.warn('Failed to report deployment to backend:', error);
      // Don't throw - this is optional
    }
  }

  /**
   * Get chain configuration by ID
   */
  private getChainById(chainId: number) {
    const chains: Record<number, any> = {
      11155111: sepolia,
      84532: baseSepolia,
      421614: arbitrumSepolia
    };
    return chains[chainId];
  }

  /**
   * Get explorer URL for a deployed contract
   */
  private getExplorerUrl(chainId: number, contractAddress: string): string {
    const explorers: Record<number, string> = {
      11155111: 'https://sepolia.etherscan.io',
      84532: 'https://sepolia.basescan.org',
      421614: 'https://sepolia.arbiscan.io'
    };
    const baseUrl = explorers[chainId] || explorers[11155111];
    return \`\${baseUrl}/address/\${contractAddress}\`;
  }

  /**
   * Get supported chains from backend
   */
  async getSupportedChains() {
    try {
      const response = await fetch(\`\${this.apiBaseUrl}/api/contracts/chains\`);
      const result = await response.json();
      return result.chains || [];
    } catch (error) {
      console.error('Failed to fetch supported chains:', error);
      return [
        { chainId: 11155111, name: 'Sepolia', currency: 'ETH' },
        { chainId: 84532, name: 'Base Sepolia', currency: 'ETH' },
        { chainId: 421614, name: 'Arbitrum Sepolia', currency: 'ETH' }
      ];
    }
  }
}

// ============================================================================
// STEP 2: HOOKS - Contract Deployment Hook
// ============================================================================

// /src/hooks/useContractDeployment.ts
import { useState } from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { ContractService, type CompileContractRequest, type DeploymentResult } from '../services/contractService';
import type { Hex } from 'viem';

interface DeploymentState {
  isCompiling: boolean;
  isDeploying: boolean;
  compilationError: string | null;
  deploymentError: string | null;
  deploymentResult: DeploymentResult | null;
  contractId: string | null;
  bytecode: Hex | null;
  abi: any[] | null;
}

export function useContractDeployment() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [state, setState] = useState<DeploymentState>({
    isCompiling: false,
    isDeploying: false,
    compilationError: null,
    deploymentError: null,
    deploymentResult: null,
    contractId: null,
    bytecode: null,
    abi: null
  });

  const contractService = new ContractService();

  /**
   * Compile and deploy in one flow
   */
  const deployToken = async (
    tokenName: string,
    tokenSymbol: string,
    totalSupply: string,
    targetChainId: number
  ) => {
    if (!address || !isConnected) {
      setState(prev => ({
        ...prev,
        deploymentError: 'Please connect your wallet first'
      }));
      return;
    }

    try {
      // Reset state
      setState({
        isCompiling: true,
        isDeploying: false,
        compilationError: null,
        deploymentError: null,
        deploymentResult: null,
        contractId: null,
        bytecode: null,
        abi: null
      });

      // Step 1: Compile the contract using backend API
      console.log('Compiling contract...');
      const compileRequest: CompileContractRequest = {
        contractType: 'erc20',
        name: tokenName,
        symbol: tokenSymbol,
        totalSupply: totalSupply,
        userId: 'demo-user' // Use actual user ID in production
      };

      const compileResult = await contractService.compileContract(compileRequest);

      if (!compileResult.success || !compileResult.data) {
        setState(prev => ({
          ...prev,
          isCompiling: false,
          compilationError: compileResult.error || 'Compilation failed'
        }));
        return;
      }

      const { bytecode, abi } = compileResult.data;
      const contractId = compileResult.contractId;

      console.log('Contract compiled successfully:', { contractId, bytecode: bytecode.slice(0, 20) + '...' });

      setState(prev => ({
        ...prev,
        isCompiling: false,
        contractId,
        bytecode: bytecode as Hex,
        abi
      }));

      // Step 2: Switch to target chain if needed
      if (chainId !== targetChainId) {
        console.log(\`Switching to chain \${targetChainId}...\`);
        await switchChain({ chainId: targetChainId });
        // Wait a bit for chain switch to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Step 3: Deploy using user's wallet
      setState(prev => ({
        ...prev,
        isDeploying: true
      }));

      console.log('Deploying contract with user wallet...');
      const constructorArgs = [tokenName, tokenSymbol, totalSupply];
      const deployResult = await contractService.deployContract(
        bytecode as Hex,
        abi,
        constructorArgs,
        targetChainId,
        address as Hex
      );

      console.log('Contract deployed successfully:', deployResult);

      setState(prev => ({
        ...prev,
        isDeploying: false,
        deploymentResult: deployResult
      }));

      // Step 4: Optional - Report deployment to backend
      if (contractId) {
        await contractService.reportDeployment(contractId, deployResult);
      }

    } catch (error: any) {
      console.error('Deployment error:', error);
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
    deployToken,
    reset,
    isConnected,
    userAddress: address
  };
}

// ============================================================================
// STEP 3: COMPONENT - Token Deployment Form
// ============================================================================

// /src/components/TokenDeployer.tsx
import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { useContractDeployment } from '../hooks/useContractDeployment';

export function TokenDeployer() {
  const { isConnected, address } = useAccount();
  const { open } = useAppKit();
  const {
    isCompiling,
    isDeploying,
    compilationError,
    deploymentError,
    deploymentResult,
    deployToken,
    reset
  } = useContractDeployment();

  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [totalSupply, setTotalSupply] = useState('');
  const [selectedChain, setSelectedChain] = useState(11155111); // Sepolia default

  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tokenName || !tokenSymbol || !totalSupply) {
      alert('Please fill in all fields');
      return;
    }

    await deployToken(tokenName, tokenSymbol, totalSupply, selectedChain);
  };

  const formatAddress = (addr: string) => {
    return \`\${addr.slice(0, 6)}...\${addr.slice(-4)}\`;
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Token Deployer</h1>

          {isConnected && address ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm font-medium text-gray-700">{formatAddress(address)}</span>
            </div>
          ) : (
            <button
              onClick={() => open()}
              className="px-6 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity"
            >
              Connect Wallet
            </button>
          )}
        </div>

        {!isConnected ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Connect Your Wallet</h3>
            <p className="text-gray-600 mb-6">Connect MetaMask to deploy your ERC-20 token</p>
            <button
              onClick={() => open()}
              className="px-8 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity"
            >
              Connect Wallet
            </button>
          </div>
        ) : deploymentResult ? (
          <div className="space-y-6">
            <div className="bg-green-50 border border-green-200 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-green-900">Token Deployed Successfully!</h3>
                  <p className="text-green-700">Your token is now live on {deploymentResult.chainName}</p>
                </div>
              </div>

              <div className="space-y-3 bg-white rounded-lg p-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">Contract Address</label>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono">
                      {deploymentResult.contractAddress}
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText(deploymentResult.contractAddress)}
                      className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-600">Transaction Hash</label>
                  <div className="mt-1">
                    <code className="block px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono break-all">
                      {deploymentResult.transactionHash}
                    </code>
                  </div>
                </div>

                <a
                  href={deploymentResult.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-lg transition-colors"
                >
                  View on Block Explorer →
                </a>
              </div>
            </div>

            <button
              onClick={reset}
              className="w-full px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold rounded-lg transition-colors"
            >
              Deploy Another Token
            </button>
          </div>
        ) : (
          <form onSubmit={handleDeploy} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Token Name
              </label>
              <input
                type="text"
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                placeholder="e.g., My Amazing Token"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                disabled={isCompiling || isDeploying}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Token Symbol
              </label>
              <input
                type="text"
                value={tokenSymbol}
                onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
                placeholder="e.g., MAT"
                maxLength={10}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                disabled={isCompiling || isDeploying}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Total Supply
              </label>
              <input
                type="text"
                value={totalSupply}
                onChange={(e) => setTotalSupply(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="e.g., 1000000"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                disabled={isCompiling || isDeploying}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Network
              </label>
              <select
                value={selectedChain}
                onChange={(e) => setSelectedChain(Number(e.target.value))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                disabled={isCompiling || isDeploying}
              >
                <option value={11155111}>Sepolia Testnet</option>
                <option value={84532}>Base Sepolia</option>
                <option value={421614}>Arbitrum Sepolia</option>
              </select>
            </div>

            {(compilationError || deploymentError) && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <h4 className="font-semibold text-red-900">Error</h4>
                    <p className="text-sm text-red-700 mt-1">{compilationError || deploymentError}</p>
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isCompiling || isDeploying}
              className="w-full px-6 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {isCompiling ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Compiling Contract...
                </span>
              ) : isDeploying ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Deploying to Blockchain...
                </span>
              ) : (
                'Deploy Token'
              )}
            </button>

            <p className="text-xs text-gray-500 text-center">
              Make sure you have testnet ETH in your wallet for gas fees
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// STEP 4: APP - Main Application
// ============================================================================

// /src/App.tsx
import React from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TokenDeployer } from './components/TokenDeployer';
import { wagmiAdapter } from './lib/web3';

const queryClient = new QueryClient();

function App() {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-12">
          <TokenDeployer />
        </div>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;

// ============================================================================
// STEP 5: WEB3 CONFIGURATION (REQUIRED)
// ============================================================================

// /src/lib/web3.ts
import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { sepolia, baseSepolia, arbitrumSepolia } from 'viem/chains';
import { http } from 'wagmi';

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'demo-project-id';

const metadata = {
  name: 'Token Deployer',
  description: 'Deploy ERC-20 tokens to Ethereum testnets',
  url: window.location.origin,
  icons: []
};

// IMPORTANT: Only testnet chains for deployment
const chains = [sepolia, baseSepolia, arbitrumSepolia] as const;

export const wagmiAdapter = new WagmiAdapter({
  chains,
  transports: {
    [sepolia.id]: http(),
    [baseSepolia.id]: http(),
    [arbitrumSepolia.id]: http()
  },
  projectId
});

createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  chains,
  metadata,
  features: {
    analytics: false,
    email: false,
    socials: false
  }
});

// ============================================================================
// STEP 6: VITE CONFIGURATION (CRITICAL FOR WEB3)
// ============================================================================

// /vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  // CRITICAL: Permissive headers for Web3 wallet compatibility
  server: {
    headers: {
      // Allow Coinbase Wallet and other wallets to open popups
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',

      // Allow cross-origin embedding
      'Cross-Origin-Embedder-Policy': 'credentialless',

      // Allow all resources
      'Cross-Origin-Resource-Policy': 'cross-origin'
    },

    // Allow connections from any origin
    cors: true,

    // Bind to all interfaces for WebContainer compatibility
    host: true,

    // Allow localhost API calls
    proxy: {
      // Optional: If direct localhost:3001 fails, uncomment this proxy:
      // '/api/contracts': {
      //   target: 'https://localhost:3001',
      //   changeOrigin: true,
      //   secure: false
      // }
    }
  },

  // Optimize build
  build: {
    target: 'esnext',
    sourcemap: true
  }
});

// ============================================================================
// STEP 7: ENVIRONMENT VARIABLES (.env file)
// ============================================================================

// CRITICAL: Create a .env file in your project root with this exact content:
/*
# EitherWay Backend API (for contract compilation)
VITE_API_BASE_URL=https://localhost:3001

# WalletConnect Project ID (for MetaMask connection)
# Using EitherWay's demo project ID - works immediately, no signup needed!
# You can replace with your own from https://cloud.reown.com/ if desired
VITE_WALLETCONNECT_PROJECT_ID=0ab3f2c9a30c1add3cff35eadf12cfc7
*/

// This .env file is MANDATORY for the app to work:
// - VITE_API_BASE_URL: Connects to EitherWay backend for Solidity compilation
// - VITE_WALLETCONNECT_PROJECT_ID: Enables MetaMask wallet connection

// The demo WalletConnect project ID is fully functional and production-ready.
// No need to get your own unless you want custom analytics/branding.
`;

export const contractDeploymentInstructions = \`
# Smart Contract Deployment App Architecture

This template uses a HYBRID approach that combines:
1. Backend API for contract compilation (CPU-intensive)
2. User's MetaMask wallet for deployment (secure, user controls private keys)

## Flow:
1. User fills out token details (name, symbol, supply)
2. Frontend calls /api/contracts/compile
3. Backend compiles and returns bytecode + ABI
4. Frontend uses user's connected wallet to deploy
5. Deployment happens directly from user's browser
6. Optional: Report deployment back to backend for tracking

## Security Benefits:
- User's private key NEVER leaves their browser
- Backend never handles deployment (can't steal funds)
- User approves transaction in MetaMask
- Fully transparent and auditable

## Required Dependencies:
- wagmi ^2.16.1
- viem ^2.33.2
- @reown/appkit ^1.2.0
- @tanstack/react-query ^5.0.0

## Setup:
1. Create .env file with provided configuration (includes demo WalletConnect ID)
2. Ensure EitherWay backend is running on https://localhost:3001
3. Get testnet ETH in your wallet from faucets:
   - Sepolia: https://sepoliafaucet.com/
   - Base Sepolia: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet
   - Arbitrum Sepolia: https://faucet.quicknode.com/arbitrum/sepolia

Optional: Get your own WalletConnect project ID from https://cloud.reown.com/ for custom branding
\`;
