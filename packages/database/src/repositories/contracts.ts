/**
 * Smart Contracts Repository
 * CRUD operations for smart contracts and deployments
 */

import type { DatabaseClient } from '../client.js';

export interface SmartContract {
  id: string;
  user_id: string;
  app_id?: string;
  session_id?: string;
  contract_type: 'erc20' | 'erc721' | 'erc1155' | 'custom';
  name: string;
  symbol?: string;
  description?: string;
  source_code: string;
  compiler_version: string;
  optimization_runs: number;
  bytecode?: string;
  abi?: any;
  compilation_status: 'pending' | 'compiled' | 'failed';
  compilation_error?: string;
  constructor_args?: any[];
  deployed_address?: string;
  deployed_chain_id?: number;
  deployment_tx_hash?: string;
  deployment_status: 'pending' | 'deploying' | 'deployed' | 'failed' | 'verified';
  deployment_error?: string;
  deployed_at?: Date;
  estimated_gas?: string;
  actual_gas_used?: string;
  gas_price_gwei?: string;
  verified_on_explorer: boolean;
  explorer_url?: string;
  metadata?: Record<string, any>;
  tags?: string[];
  created_at: Date;
  updated_at: Date;
  compiled_at?: Date;
}

export interface ContractDeployment {
  id: string;
  contract_id: string;
  user_id: string;
  chain_id: number;
  chain_name: string;
  deployed_address: string;
  deployment_tx_hash: string;
  deployer_address: string;
  block_number?: string;
  block_timestamp?: Date;
  gas_used?: string;
  gas_price_gwei?: string;
  transaction_cost_eth?: string;
  status: 'pending' | 'confirmed' | 'failed';
  error_message?: string;
  explorer_url?: string;
  verified: boolean;
  created_at: Date;
  confirmed_at?: Date;
}

export interface CreateContractParams {
  user_id: string;
  app_id?: string;
  session_id?: string;
  contract_type: 'erc20' | 'erc721' | 'erc1155' | 'custom';
  name: string;
  symbol?: string;
  description?: string;
  source_code: string;
  compiler_version?: string;
  optimization_runs?: number;
  constructor_args?: any[];
  metadata?: Record<string, any>;
  tags?: string[];
}

export interface UpdateCompilationParams {
  contract_id: string;
  bytecode: string;
  abi: any;
  compilation_status: 'compiled' | 'failed';
  compilation_error?: string;
  estimated_gas?: string;
}

export interface UpdateDeploymentParams {
  contract_id: string;
  deployed_address: string;
  deployed_chain_id: number;
  deployment_tx_hash: string;
  deployment_status: 'deployed' | 'failed' | 'verified';
  deployment_error?: string;
  actual_gas_used?: string;
  gas_price_gwei?: string;
  explorer_url?: string;
  verified_on_explorer?: boolean;
}

export interface CreateDeploymentParams {
  contract_id: string;
  user_id: string;
  chain_id: number;
  chain_name: string;
  deployed_address: string;
  deployment_tx_hash: string;
  deployer_address: string;
  block_number?: string;
  gas_used?: string;
  gas_price_gwei?: string;
  transaction_cost_eth?: string;
  explorer_url?: string;
}

export class ContractsRepository {
  constructor(private db: DatabaseClient) {}

  /**
   * Create a new smart contract record
   */
  async create(params: CreateContractParams): Promise<SmartContract> {
    const result = await this.db.query<SmartContract>(
      `INSERT INTO core.smart_contracts (
        user_id, app_id, session_id, contract_type, name, symbol, description,
        source_code, compiler_version, optimization_runs, constructor_args,
        metadata, tags
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        params.user_id,
        params.app_id || null,
        params.session_id || null,
        params.contract_type,
        params.name,
        params.symbol || null,
        params.description || null,
        params.source_code,
        params.compiler_version || '0.8.20',
        params.optimization_runs || 200,
        JSON.stringify(params.constructor_args || []),
        JSON.stringify(params.metadata || {}),
        params.tags || []
      ]
    );

    return result.rows[0];
  }

  /**
   * Find contract by ID
   */
  async findById(contractId: string): Promise<SmartContract | null> {
    const result = await this.db.query<SmartContract>(
      'SELECT * FROM core.smart_contracts WHERE id = $1',
      [contractId]
    );

    return result.rows[0] || null;
  }

  /**
   * Find all contracts for a user
   */
  async findByUserId(userId: string, limit: number = 50): Promise<SmartContract[]> {
    const result = await this.db.query<SmartContract>(
      `SELECT * FROM core.smart_contracts
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows;
  }

  /**
   * Find all contracts for an app
   */
  async findByAppId(appId: string): Promise<SmartContract[]> {
    const result = await this.db.query<SmartContract>(
      `SELECT * FROM core.smart_contracts
       WHERE app_id = $1
       ORDER BY created_at DESC`,
      [appId]
    );

    return result.rows;
  }

  /**
   * Find contracts by type
   */
  async findByType(
    userId: string,
    contractType: 'erc20' | 'erc721' | 'erc1155' | 'custom'
  ): Promise<SmartContract[]> {
    const result = await this.db.query<SmartContract>(
      `SELECT * FROM core.smart_contracts
       WHERE user_id = $1 AND contract_type = $2
       ORDER BY created_at DESC`,
      [userId, contractType]
    );

    return result.rows;
  }

  /**
   * Update compilation results
   */
  async updateCompilation(params: UpdateCompilationParams): Promise<SmartContract | null> {
    const result = await this.db.query<SmartContract>(
      `UPDATE core.smart_contracts
       SET bytecode = $2,
           abi = $3,
           compilation_status = $4,
           compilation_error = $5,
           estimated_gas = $6,
           compiled_at = CASE WHEN $4 = 'compiled' THEN now() ELSE compiled_at END,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        params.contract_id,
        params.bytecode,
        JSON.stringify(params.abi),
        params.compilation_status,
        params.compilation_error || null,
        params.estimated_gas || null
      ]
    );

    return result.rows[0] || null;
  }

  /**
   * Update deployment info
   */
  async updateDeployment(params: UpdateDeploymentParams): Promise<SmartContract | null> {
    const result = await this.db.query<SmartContract>(
      `UPDATE core.smart_contracts
       SET deployed_address = $2,
           deployed_chain_id = $3,
           deployment_tx_hash = $4,
           deployment_status = $5,
           deployment_error = $6,
           actual_gas_used = $7,
           gas_price_gwei = $8,
           explorer_url = $9,
           verified_on_explorer = $10,
           deployed_at = CASE WHEN $5 = 'deployed' THEN now() ELSE deployed_at END,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        params.contract_id,
        params.deployed_address,
        params.deployed_chain_id,
        params.deployment_tx_hash,
        params.deployment_status,
        params.deployment_error || null,
        params.actual_gas_used || null,
        params.gas_price_gwei || null,
        params.explorer_url || null,
        params.verified_on_explorer || false
      ]
    );

    return result.rows[0] || null;
  }

  /**
   * Update contract status
   */
  async updateStatus(
    contractId: string,
    deploymentStatus: 'pending' | 'deploying' | 'deployed' | 'failed' | 'verified'
  ): Promise<void> {
    await this.db.query(
      'UPDATE core.smart_contracts SET deployment_status = $2, updated_at = now() WHERE id = $1',
      [contractId, deploymentStatus]
    );
  }

  /**
   * Delete contract
   */
  async delete(contractId: string): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM core.smart_contracts WHERE id = $1',
      [contractId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  // ============================================================================
  // CONTRACT DEPLOYMENTS
  // ============================================================================

  /**
   * Create a deployment record
   */
  async createDeployment(params: CreateDeploymentParams): Promise<ContractDeployment> {
    const result = await this.db.query<ContractDeployment>(
      `INSERT INTO core.contract_deployments (
        contract_id, user_id, chain_id, chain_name, deployed_address,
        deployment_tx_hash, deployer_address, block_number, gas_used,
        gas_price_gwei, transaction_cost_eth, explorer_url, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending')
      RETURNING *`,
      [
        params.contract_id,
        params.user_id,
        params.chain_id,
        params.chain_name,
        params.deployed_address,
        params.deployment_tx_hash,
        params.deployer_address,
        params.block_number || null,
        params.gas_used || null,
        params.gas_price_gwei || null,
        params.transaction_cost_eth || null,
        params.explorer_url || null
      ]
    );

    return result.rows[0];
  }

  /**
   * Get all deployments for a contract
   */
  async getDeploymentsByContractId(contractId: string): Promise<ContractDeployment[]> {
    const result = await this.db.query<ContractDeployment>(
      `SELECT * FROM core.contract_deployments
       WHERE contract_id = $1
       ORDER BY created_at DESC`,
      [contractId]
    );

    return result.rows;
  }

  /**
   * Update deployment status
   */
  async updateDeploymentStatus(
    deploymentId: string,
    status: 'confirmed' | 'failed',
    errorMessage?: string
  ): Promise<void> {
    await this.db.query(
      `UPDATE core.contract_deployments
       SET status = $2,
           error_message = $3,
           confirmed_at = CASE WHEN $2 = 'confirmed' THEN now() ELSE confirmed_at END
       WHERE id = $1`,
      [deploymentId, status, errorMessage || null]
    );
  }

  /**
   * Get deployment by transaction hash
   */
  async getDeploymentByTxHash(txHash: string): Promise<ContractDeployment | null> {
    const result = await this.db.query<ContractDeployment>(
      'SELECT * FROM core.contract_deployments WHERE deployment_tx_hash = $1',
      [txHash]
    );

    return result.rows[0] || null;
  }

  /**
   * Get contracts with stats (using view)
   */
  async getContractsWithStats(userId: string, limit: number = 50): Promise<any[]> {
    const result = await this.db.query(
      `SELECT * FROM core.smart_contracts_with_stats
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows;
  }
}
