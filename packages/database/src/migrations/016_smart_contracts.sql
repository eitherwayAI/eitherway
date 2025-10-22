/**
 * Migration 016: Smart Contracts and Web3 Infrastructure
 *
 * Purpose:
 * - Store smart contract source code, compilation results, and deployment info
 * - Track contract deployments across multiple chains
 * - Support ERC-20, ERC-721, and custom contracts
 *
 * Tables:
 * - core.smart_contracts: Contract source, bytecode, ABI, deployment status
 * - core.contract_deployments: Track multiple deployments per contract
 */

-- ============================================================================
-- SMART CONTRACTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.smart_contracts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  app_id              UUID REFERENCES core.apps(id) ON DELETE CASCADE,
  session_id          UUID REFERENCES core.sessions(id) ON DELETE SET NULL,

  -- Contract identification
  contract_type       TEXT NOT NULL CHECK (contract_type IN ('erc20', 'erc721', 'erc1155', 'custom')),
  name                TEXT NOT NULL,
  symbol              TEXT, -- For tokens/NFTs
  description         TEXT,

  -- Source code and compilation
  source_code         TEXT NOT NULL,
  compiler_version    TEXT NOT NULL DEFAULT '0.8.20',
  optimization_runs   INT DEFAULT 200,

  -- Compilation results
  bytecode            TEXT, -- Compiled bytecode
  abi                 JSONB, -- Contract ABI
  compilation_status  TEXT NOT NULL DEFAULT 'pending' CHECK (compilation_status IN ('pending', 'compiled', 'failed')),
  compilation_error   TEXT,

  -- Constructor arguments (JSON array)
  constructor_args    JSONB DEFAULT '[]',

  -- Deployment info (primary deployment)
  deployed_address    TEXT, -- Deployed contract address
  deployed_chain_id   INT, -- Chain ID where deployed
  deployment_tx_hash  TEXT, -- Deployment transaction hash
  deployment_status   TEXT DEFAULT 'pending' CHECK (deployment_status IN ('pending', 'deploying', 'deployed', 'failed', 'verified')),
  deployment_error    TEXT,
  deployed_at         TIMESTAMPTZ,

  -- Gas tracking
  estimated_gas       BIGINT,
  actual_gas_used     BIGINT,
  gas_price_gwei      NUMERIC(20, 9),

  -- Contract verification on block explorer
  verified_on_explorer BOOLEAN DEFAULT false,
  explorer_url        TEXT,

  -- Metadata
  metadata            JSONB DEFAULT '{}',
  tags                TEXT[] DEFAULT '{}',

  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  compiled_at         TIMESTAMPTZ
);

CREATE INDEX idx_smart_contracts_user_id ON core.smart_contracts(user_id);
CREATE INDEX idx_smart_contracts_app_id ON core.smart_contracts(app_id) WHERE app_id IS NOT NULL;
CREATE INDEX idx_smart_contracts_type ON core.smart_contracts(contract_type);
CREATE INDEX idx_smart_contracts_deployed_address ON core.smart_contracts(deployed_address) WHERE deployed_address IS NOT NULL;
CREATE INDEX idx_smart_contracts_chain_id ON core.smart_contracts(deployed_chain_id) WHERE deployed_chain_id IS NOT NULL;
CREATE INDEX idx_smart_contracts_status ON core.smart_contracts(deployment_status);

-- ============================================================================
-- CONTRACT DEPLOYMENTS TABLE (for multiple deployments)
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.contract_deployments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id         UUID NOT NULL REFERENCES core.smart_contracts(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,

  -- Deployment details
  chain_id            INT NOT NULL,
  chain_name          TEXT NOT NULL, -- 'sepolia', 'base-sepolia', 'arbitrum-sepolia', etc.
  deployed_address    TEXT NOT NULL,
  deployment_tx_hash  TEXT NOT NULL,

  -- Deployment metadata
  deployer_address    TEXT NOT NULL, -- Address that deployed the contract
  block_number        BIGINT,
  block_timestamp     TIMESTAMPTZ,

  -- Gas tracking
  gas_used            BIGINT,
  gas_price_gwei      NUMERIC(20, 9),
  transaction_cost_eth NUMERIC(30, 18),

  -- Status
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  error_message       TEXT,

  -- Explorer links
  explorer_url        TEXT,
  verified            BOOLEAN DEFAULT false,

  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at        TIMESTAMPTZ
);

CREATE INDEX idx_contract_deployments_contract_id ON core.contract_deployments(contract_id);
CREATE INDEX idx_contract_deployments_user_id ON core.contract_deployments(user_id);
CREATE INDEX idx_contract_deployments_chain_id ON core.contract_deployments(chain_id);
CREATE INDEX idx_contract_deployments_address ON core.contract_deployments(deployed_address);
CREATE INDEX idx_contract_deployments_status ON core.contract_deployments(status);

-- ============================================================================
-- CONTRACT INTERACTIONS TABLE (optional - for tracking reads/writes)
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.contract_interactions (
  id                  BIGSERIAL PRIMARY KEY,
  contract_id         UUID NOT NULL REFERENCES core.smart_contracts(id) ON DELETE CASCADE,
  user_id             UUID REFERENCES core.users(id) ON DELETE SET NULL,

  -- Interaction details
  interaction_type    TEXT NOT NULL CHECK (interaction_type IN ('read', 'write')),
  function_name       TEXT NOT NULL,
  function_args       JSONB,

  -- Transaction details (for writes)
  tx_hash             TEXT,
  from_address        TEXT,
  status              TEXT CHECK (status IN ('pending', 'success', 'failed')),

  -- Results
  return_value        JSONB,
  error_message       TEXT,

  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contract_interactions_contract_id ON core.contract_interactions(contract_id);
CREATE INDEX idx_contract_interactions_user_id ON core.contract_interactions(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_contract_interactions_type ON core.contract_interactions(interaction_type);
CREATE INDEX idx_contract_interactions_created_at ON core.contract_interactions(created_at DESC);

-- ============================================================================
-- UPDATE TRIGGERS
-- ============================================================================

-- Auto-update updated_at for smart_contracts
CREATE TRIGGER smart_contracts_updated_at
  BEFORE UPDATE ON core.smart_contracts
  FOR EACH ROW
  EXECUTE FUNCTION core.update_updated_at();

-- ============================================================================
-- VIEWS
-- ============================================================================

/**
 * View: Smart contracts with deployment statistics
 */
CREATE OR REPLACE VIEW core.smart_contracts_with_stats AS
SELECT
  sc.*,
  u.email AS user_email,
  a.name AS app_name,
  (
    SELECT COUNT(*)
    FROM core.contract_deployments cd
    WHERE cd.contract_id = sc.id
  ) AS total_deployments,
  (
    SELECT COUNT(*)
    FROM core.contract_deployments cd
    WHERE cd.contract_id = sc.id
      AND cd.status = 'confirmed'
  ) AS successful_deployments,
  (
    SELECT COUNT(*)
    FROM core.contract_interactions ci
    WHERE ci.contract_id = sc.id
  ) AS total_interactions,
  (
    SELECT MAX(cd.confirmed_at)
    FROM core.contract_deployments cd
    WHERE cd.contract_id = sc.id
      AND cd.status = 'confirmed'
  ) AS last_deployment_at
FROM core.smart_contracts sc
LEFT JOIN core.users u ON sc.user_id = u.id
LEFT JOIN core.apps a ON sc.app_id = a.id;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE core.smart_contracts IS 'Smart contract source code, compilation, and primary deployment tracking';
COMMENT ON TABLE core.contract_deployments IS 'Track multiple deployments of the same contract across chains';
COMMENT ON TABLE core.contract_interactions IS 'Log of contract function calls (reads and writes)';

COMMENT ON COLUMN core.smart_contracts.contract_type IS 'Type of contract: erc20, erc721, erc1155, custom';
COMMENT ON COLUMN core.smart_contracts.bytecode IS 'Compiled contract bytecode (hex string)';
COMMENT ON COLUMN core.smart_contracts.abi IS 'Contract ABI as JSON array';
COMMENT ON COLUMN core.smart_contracts.constructor_args IS 'Constructor arguments as JSON array';
COMMENT ON COLUMN core.smart_contracts.deployed_address IS 'Primary deployment address (can have multiple via contract_deployments)';
