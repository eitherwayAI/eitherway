/**
 * Contract Service
 *
 * Handles smart contract compilation and deployment
 * - Compiles Solidity code using solc-js
 * - Deploys to EVM chains using viem
 * - Stores contracts in database
 */

import solc from 'solc';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  createWalletClient,
  createPublicClient,
  http,
  type Address,
  type Hex,
  parseEther,
  formatEther
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia, baseSepolia, arbitrumSepolia } from 'viem/chains';
import type { DatabaseClient } from '../client.js';
import { ContractsRepository } from '../repositories/contracts.js';
import type { CreateContractParams } from '../repositories/contracts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// TYPES
// ============================================================================

export interface CompileContractParams {
  contractType: 'erc20' | 'erc721' | 'custom';
  name: string;
  symbol?: string;
  totalSupply?: string;
  sourceCode?: string; // For custom contracts
  compilerVersion?: string;
  optimizationRuns?: number;
}

export interface CompileResult {
  success: boolean;
  bytecode?: string;
  abi?: any;
  sourceCode?: string;
  error?: string;
  estimatedGas?: string;
}

export interface DeployContractParams {
  contractId: string;
  chainId: number;
  deployerPrivateKey?: string; // Optional, falls back to env
}

export interface DeployResult {
  success: boolean;
  contractAddress?: string;
  transactionHash?: string;
  blockNumber?: string;
  gasUsed?: string;
  gasPriceGwei?: string;
  explorerUrl?: string;
  error?: string;
}

export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  currency: string;
}

// ============================================================================
// SUPPORTED CHAINS
// ============================================================================

export const SUPPORTED_CHAINS: Record<number, ChainConfig> = {
  // Sepolia (Ethereum Testnet)
  11155111: {
    chainId: 11155111,
    name: 'Sepolia',
    rpcUrl: process.env.SEPOLIA_RPC_URL || `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    explorerUrl: 'https://sepolia.etherscan.io',
    currency: 'ETH'
  },
  // Base Sepolia (Base Testnet)
  84532: {
    chainId: 84532,
    name: 'Base Sepolia',
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    explorerUrl: 'https://sepolia.basescan.org',
    currency: 'ETH'
  },
  // Arbitrum Sepolia (Arbitrum Testnet)
  421614: {
    chainId: 421614,
    name: 'Arbitrum Sepolia',
    rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL || `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    explorerUrl: 'https://sepolia.arbiscan.io',
    currency: 'ETH'
  }
};

// ============================================================================
// CONTRACT SERVICE
// ============================================================================

export class ContractService {
  private contractsRepo: ContractsRepository;

  constructor(private db: DatabaseClient) {
    this.contractsRepo = new ContractsRepository(db);
  }

  /**
   * Compile a smart contract from template or custom source
   */
  async compileContract(params: CompileContractParams): Promise<CompileResult> {
    try {
      console.log('[ContractService] Compiling contract:', params);

      let sourceCode: string;

      // Load template or use custom source
      if (params.contractType === 'custom' && params.sourceCode) {
        sourceCode = params.sourceCode;
      } else {
        sourceCode = await this.loadTemplate(params);
      }

      // Compile with solc
      const compilerVersion = params.compilerVersion || '0.8.20';
      const optimizationRuns = params.optimizationRuns || 200;

      const input = {
        language: 'Solidity',
        sources: {
          'contract.sol': {
            content: sourceCode
          }
        },
        settings: {
          optimizer: {
            enabled: true,
            runs: optimizationRuns
          },
          outputSelection: {
            '*': {
              '*': ['abi', 'evm.bytecode', 'evm.gasEstimates']
            }
          }
        }
      };

      const output = JSON.parse(solc.compile(JSON.stringify(input)));

      // Check for errors
      if (output.errors) {
        const errors = output.errors.filter((e: any) => e.severity === 'error');
        if (errors.length > 0) {
          const errorMsg = errors.map((e: any) => e.formattedMessage).join('\n');
          return {
            success: false,
            error: `Compilation failed:\n${errorMsg}`,
            sourceCode
          };
        }
      }

      // Extract compiled contract
      const contractFile = output.contracts['contract.sol'];
      const contractName = Object.keys(contractFile)[0];
      const contract = contractFile[contractName];

      const bytecode = '0x' + contract.evm.bytecode.object;
      const abi = contract.abi;

      // Estimate gas
      const gasEstimates = contract.evm.gasEstimates;
      const creationGas = gasEstimates?.creation?.totalCost || '0';

      console.log('[ContractService] Compilation successful:', {
        contractName,
        bytecodeLength: bytecode.length,
        abiLength: abi.length,
        estimatedGas: creationGas
      });

      return {
        success: true,
        bytecode,
        abi,
        sourceCode,
        estimatedGas: creationGas
      };

    } catch (error: any) {
      console.error('[ContractService] Compilation error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Deploy a compiled contract to a testnet
   */
  async deployContract(params: DeployContractParams): Promise<DeployResult> {
    try {
      console.log('[ContractService] Deploying contract:', params);

      // Get contract from database
      const contract = await this.contractsRepo.findById(params.contractId);
      if (!contract) {
        return {
          success: false,
          error: 'Contract not found in database'
        };
      }

      if (!contract.bytecode || !contract.abi) {
        return {
          success: false,
          error: 'Contract not compiled yet. Please compile first.'
        };
      }

      // Get chain config
      const chainConfig = SUPPORTED_CHAINS[params.chainId];
      if (!chainConfig) {
        return {
          success: false,
          error: `Unsupported chain ID: ${params.chainId}`
        };
      }

      // Get deployer private key
      const privateKey = (params.deployerPrivateKey || process.env.DEPLOYER_PRIVATE_KEY) as Hex;
      if (!privateKey) {
        return {
          success: false,
          error: 'No deployer private key configured. Set DEPLOYER_PRIVATE_KEY in .env'
        };
      }

      // Setup viem clients
      const account = privateKeyToAccount(privateKey);

      const chain = params.chainId === 11155111 ? sepolia :
                    params.chainId === 84532 ? baseSepolia :
                    params.chainId === 421614 ? arbitrumSepolia :
                    sepolia; // default

      const publicClient = createPublicClient({
        chain,
        transport: http(chainConfig.rpcUrl)
      });

      const walletClient = createWalletClient({
        account,
        chain,
        transport: http(chainConfig.rpcUrl)
      });

      // Check deployer balance
      const balance = await publicClient.getBalance({ address: account.address });
      const balanceEth = formatEther(balance);

      console.log('[ContractService] Deployer balance:', balanceEth, chainConfig.currency);

      if (balance === 0n) {
        return {
          success: false,
          error: `Deployer wallet has 0 ${chainConfig.currency}. Get testnet tokens from a faucet.`
        };
      }

      // Parse constructor arguments from contract
      const constructorArgs = contract.constructor_args || [];

      // Update status to deploying
      await this.contractsRepo.updateStatus(params.contractId, 'deploying');

      // Deploy contract
      console.log('[ContractService] Deploying to chain:', chainConfig.name);
      console.log('[ContractService] From address:', account.address);
      console.log('[ContractService] Constructor args:', constructorArgs);

      const hash = await walletClient.deployContract({
        abi: contract.abi,
        bytecode: contract.bytecode as Hex,
        args: constructorArgs
      });

      console.log('[ContractService] Transaction hash:', hash);

      // Wait for transaction receipt
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1
      });

      console.log('[ContractService] Deployment confirmed:', receipt);

      const contractAddress = receipt.contractAddress;
      if (!contractAddress) {
        return {
          success: false,
          error: 'Contract deployment failed: no contract address in receipt'
        };
      }

      // Get transaction details
      const transaction = await publicClient.getTransaction({ hash });
      const gasPriceGwei = transaction.gasPrice ? (Number(transaction.gasPrice) / 1e9).toFixed(2) : '0';
      const gasUsed = receipt.gasUsed.toString();

      const explorerUrl = `${chainConfig.explorerUrl}/address/${contractAddress}`;

      // Update database
      await this.contractsRepo.updateDeployment({
        contract_id: params.contractId,
        deployed_address: contractAddress,
        deployed_chain_id: params.chainId,
        deployment_tx_hash: hash,
        deployment_status: 'deployed',
        actual_gas_used: gasUsed,
        gas_price_gwei: gasPriceGwei,
        explorer_url: explorerUrl,
        verified_on_explorer: false
      });

      // Create deployment record
      await this.contractsRepo.createDeployment({
        contract_id: params.contractId,
        user_id: contract.user_id,
        chain_id: params.chainId,
        chain_name: chainConfig.name,
        deployed_address: contractAddress,
        deployment_tx_hash: hash,
        deployer_address: account.address,
        block_number: receipt.blockNumber.toString(),
        gas_used: gasUsed,
        gas_price_gwei: gasPriceGwei,
        explorer_url: explorerUrl
      });

      console.log('[ContractService] Contract deployed successfully:', contractAddress);

      return {
        success: true,
        contractAddress,
        transactionHash: hash,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed,
        gasPriceGwei,
        explorerUrl
      };

    } catch (error: any) {
      console.error('[ContractService] Deployment error:', error);

      // Update database with error
      await this.contractsRepo.updateDeployment({
        contract_id: params.contractId,
        deployed_address: '0x0000000000000000000000000000000000000000',
        deployed_chain_id: params.chainId,
        deployment_tx_hash: '0x',
        deployment_status: 'failed',
        deployment_error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create and compile a contract in one step
   */
  async createAndCompile(
    userId: string,
    params: CompileContractParams & { appId?: string; sessionId?: string }
  ): Promise<{ contractId?: string; compileResult: CompileResult }> {
    try {
      // Create contract record
      const createParams: CreateContractParams = {
        user_id: userId,
        app_id: params.appId,
        session_id: params.sessionId,
        contract_type: params.contractType,
        name: params.name,
        symbol: params.symbol,
        source_code: params.sourceCode || '',
        compiler_version: params.compilerVersion || '0.8.20',
        optimization_runs: params.optimizationRuns || 200,
        constructor_args: this.getConstructorArgs(params)
      };

      const contract = await this.contractsRepo.create(createParams);

      // Compile
      const compileResult = await this.compileContract(params);

      // Update database with compilation results
      if (compileResult.success && compileResult.bytecode && compileResult.abi) {
        await this.contractsRepo.updateCompilation({
          contract_id: contract.id,
          bytecode: compileResult.bytecode,
          abi: compileResult.abi,
          compilation_status: 'compiled',
          estimated_gas: compileResult.estimatedGas
        });

        // Update source code
        if (compileResult.sourceCode && !createParams.source_code) {
          await this.db.query(
            'UPDATE core.smart_contracts SET source_code = $1 WHERE id = $2',
            [compileResult.sourceCode, contract.id]
          );
        }
      } else {
        await this.contractsRepo.updateCompilation({
          contract_id: contract.id,
          bytecode: '',
          abi: [],
          compilation_status: 'failed',
          compilation_error: compileResult.error
        });
      }

      return {
        contractId: contract.id,
        compileResult
      };
    } catch (error: any) {
      return {
        compileResult: {
          success: false,
          error: error.message
        }
      };
    }
  }

  /**
   * Load contract template and substitute variables
   */
  private async loadTemplate(params: CompileContractParams): Promise<string> {
    const templatePath = params.contractType === 'erc20'
      ? join(__dirname, '../templates/erc20-template.sol')
      : join(__dirname, '../templates/erc721-template.sol');

    let template = await readFile(templatePath, 'utf-8');

    // Substitute variables
    const contractName = params.name.replace(/[^a-zA-Z0-9]/g, '');

    template = template.replace(/\{\{TOKEN_NAME\}\}/g, params.name);
    template = template.replace(/\{\{CONTRACT_NAME\}\}/g, contractName);

    return template;
  }

  /**
   * Get constructor arguments based on contract type
   */
  private getConstructorArgs(params: CompileContractParams): any[] {
    switch (params.contractType) {
      case 'erc20':
        return [
          params.name,
          params.symbol || params.name.substring(0, 4).toUpperCase(),
          params.totalSupply || '1000000'
        ];
      case 'erc721':
        return [
          params.name,
          params.symbol || params.name.substring(0, 4).toUpperCase()
        ];
      default:
        return [];
    }
  }

  /**
   * Get supported chains
   */
  getSupportedChains(): ChainConfig[] {
    return Object.values(SUPPORTED_CHAINS);
  }
}
