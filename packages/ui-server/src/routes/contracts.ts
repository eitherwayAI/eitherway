/**
 * Smart Contracts API Routes
 *
 * Endpoints:
 * - POST   /api/contracts/compile           - Compile a smart contract
 * - POST   /api/contracts/deploy            - Deploy a compiled contract
 * - POST   /api/contracts/create-and-deploy - Create, compile, and deploy in one step
 * - GET    /api/contracts/:id               - Get contract details
 * - GET    /api/contracts                   - List user's contracts
 * - GET    /api/contracts/chains            - Get supported chains
 * - DELETE /api/contracts/:id               - Delete a contract
 */

import type { FastifyInstance } from 'fastify';
import type { DatabaseClient } from '@eitherway/database';
import {
  ContractService,
  ContractsRepository,
  UsersRepository,
  type CompileContractParams,
  type DeployContractParams
} from '@eitherway/database';

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

async function getOrCreateDemoUser(db: DatabaseClient): Promise<string> {
  const usersRepo = new UsersRepository(db);

  // Try to find existing demo user
  const existingUser = await usersRepo.findByEmail('demo-user@eitherway.local');
  if (existingUser) {
    return existingUser.id;
  }

  const demoUser = await usersRepo.create('demo-user@eitherway.local', 'Demo User');
  return demoUser.id;
}

export async function registerContractRoutes(
  fastify: FastifyInstance,
  db: DatabaseClient
) {
  const contractService = new ContractService(db);
  const contractsRepo = new ContractsRepository(db);

  // ============================================================================
  // COMPILATION
  // ============================================================================

  /**
   * POST /api/contracts/compile
   * Compile a smart contract from template or custom source
   */
  fastify.post<{
    Body: CompileContractParams & {
      userId: string;
      appId?: string;
      sessionId?: string;
    };
  }>('/api/contracts/compile', async (request, reply) => {
    let { userId, appId, sessionId, ...compileParams } = request.body;

    if (!userId) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required field: userId'
      });
    }

    try {
      // Handle demo user
      if (userId === 'demo-user' || !isValidUUID(userId)) {
        userId = await getOrCreateDemoUser(db);
      }

      // Create and compile contract
      const result = await contractService.createAndCompile(userId, {
        ...compileParams,
        appId,
        sessionId
      });

      if (!result.compileResult.success) {
        return reply.code(400).send({
          success: false,
          error: result.compileResult.error
        });
      }

      return reply.code(200).send({
        success: true,
        contractId: result.contractId,
        data: {
          bytecode: result.compileResult.bytecode,
          abi: result.compileResult.abi,
          sourceCode: result.compileResult.sourceCode,
          estimatedGas: result.compileResult.estimatedGas
        }
      });

    } catch (error: any) {
      console.error('[Contracts] Compilation error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Compilation failed',
        message: error.message
      });
    }
  });

  // ============================================================================
  // DEPLOYMENT
  // ============================================================================

  /**
   * POST /api/contracts/deploy
   * Deploy a compiled contract to a testnet
   */
  fastify.post<{
    Body: DeployContractParams;
  }>('/api/contracts/deploy', async (request, reply) => {
    const { contractId, chainId, deployerPrivateKey } = request.body;

    if (!contractId || !chainId) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required fields: contractId, chainId'
      });
    }

    try {
      const result = await contractService.deployContract({
        contractId,
        chainId,
        deployerPrivateKey
      });

      if (!result.success) {
        return reply.code(400).send({
          success: false,
          error: result.error
        });
      }

      return reply.code(200).send({
        success: true,
        data: {
          contractAddress: result.contractAddress,
          transactionHash: result.transactionHash,
          blockNumber: result.blockNumber,
          gasUsed: result.gasUsed,
          gasPriceGwei: result.gasPriceGwei,
          explorerUrl: result.explorerUrl
        }
      });

    } catch (error: any) {
      console.error('[Contracts] Deployment error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Deployment failed',
        message: error.message
      });
    }
  });

  /**
   * POST /api/contracts/create-and-deploy
   * Create, compile, and deploy a contract in one request
   */
  fastify.post<{
    Body: CompileContractParams & {
      userId: string;
      appId?: string;
      sessionId?: string;
      chainId: number;
      deployerPrivateKey?: string;
    };
  }>('/api/contracts/create-and-deploy', async (request, reply) => {
    let { userId, appId, sessionId, chainId, deployerPrivateKey, ...compileParams } = request.body;

    if (!userId || !chainId) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required fields: userId, chainId'
      });
    }

    try {
      // Handle demo user
      if (userId === 'demo-user' || !isValidUUID(userId)) {
        userId = await getOrCreateDemoUser(db);
      }

      // Step 1: Create and compile
      const compileResult = await contractService.createAndCompile(userId, {
        ...compileParams,
        appId,
        sessionId
      });

      if (!compileResult.compileResult.success || !compileResult.contractId) {
        return reply.code(400).send({
          success: false,
          error: compileResult.compileResult.error || 'Compilation failed'
        });
      }

      // Step 2: Deploy
      const deployResult = await contractService.deployContract({
        contractId: compileResult.contractId,
        chainId,
        deployerPrivateKey
      });

      if (!deployResult.success) {
        return reply.code(400).send({
          success: false,
          error: deployResult.error,
          contractId: compileResult.contractId,
          compilationSucceeded: true,
          deploymentFailed: true
        });
      }

      return reply.code(200).send({
        success: true,
        contractId: compileResult.contractId,
        data: {
          // Compilation data
          bytecode: compileResult.compileResult.bytecode,
          abi: compileResult.compileResult.abi,
          estimatedGas: compileResult.compileResult.estimatedGas,
          // Deployment data
          contractAddress: deployResult.contractAddress,
          transactionHash: deployResult.transactionHash,
          blockNumber: deployResult.blockNumber,
          gasUsed: deployResult.gasUsed,
          gasPriceGwei: deployResult.gasPriceGwei,
          explorerUrl: deployResult.explorerUrl
        }
      });

    } catch (error: any) {
      console.error('[Contracts] Create and deploy error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Create and deploy failed',
        message: error.message
      });
    }
  });

  // ============================================================================
  // CONTRACT MANAGEMENT
  // ============================================================================

  /**
   * GET /api/contracts/:id
   * Get contract details by ID
   */
  fastify.get<{
    Params: { id: string };
  }>('/api/contracts/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      const contract = await contractsRepo.findById(id);

      if (!contract) {
        return reply.code(404).send({
          success: false,
          error: 'Contract not found'
        });
      }

      return reply.code(200).send({
        success: true,
        contract
      });

    } catch (error: any) {
      console.error('[Contracts] Get contract error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to get contract',
        message: error.message
      });
    }
  });

  /**
   * GET /api/contracts
   * List user's contracts
   */
  fastify.get<{
    Querystring: {
      userId: string;
      contractType?: 'erc20' | 'erc721' | 'erc1155' | 'custom';
      limit?: string;
    };
  }>('/api/contracts', async (request, reply) => {
    let { userId, contractType, limit } = request.query;

    if (!userId) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required field: userId'
      });
    }

    try {
      // Handle demo user
      if (userId === 'demo-user' || !isValidUUID(userId)) {
        userId = await getOrCreateDemoUser(db);
      }

      const limitNum = limit ? parseInt(limit, 10) : 50;

      let contracts;
      if (contractType) {
        contracts = await contractsRepo.findByType(userId, contractType);
      } else {
        contracts = await contractsRepo.findByUserId(userId, limitNum);
      }

      return reply.code(200).send({
        success: true,
        contracts
      });

    } catch (error: any) {
      console.error('[Contracts] List contracts error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to list contracts',
        message: error.message
      });
    }
  });

  /**
   * GET /api/contracts/chains
   * Get supported chains for deployment
   */
  fastify.get('/api/contracts/chains', async (_request, reply) => {
    const chains = contractService.getSupportedChains();

    return reply.code(200).send({
      success: true,
      chains
    });
  });

  /**
   * DELETE /api/contracts/:id
   * Delete a contract
   */
  fastify.delete<{
    Params: { id: string };
  }>('/api/contracts/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      const deleted = await contractsRepo.delete(id);

      if (!deleted) {
        return reply.code(404).send({
          success: false,
          error: 'Contract not found'
        });
      }

      return reply.code(200).send({
        success: true,
        message: 'Contract deleted successfully'
      });

    } catch (error: any) {
      console.error('[Contracts] Delete contract error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to delete contract',
        message: error.message
      });
    }
  });

  console.log('[Contracts] Routes registered successfully');
}
