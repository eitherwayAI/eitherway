/**
 * Contract Deployment Panel
 *
 * UI for deploying smart contracts (ERC-20, ERC-721) to testnets
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// TYPES

interface ContractPanelProps {
  userId: string;
  appId?: string;
  sessionId?: string;
  onClose?: () => void;
  onContractDeployed?: (contract: DeployedContract) => void;
}

interface DeployedContract {
  contractId: string;
  contractAddress: string;
  transactionHash: string;
  explorerUrl: string;
  chainName: string;
  contractType: 'erc20' | 'erc721';
  name: string;
  symbol?: string;
}

interface Chain {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  currency: string;
}

type ContractType = 'erc20' | 'erc721';
type DeploymentStage = 'form' | 'compiling' | 'deploying' | 'success' | 'error';

// MAIN COMPONENT

export function ContractPanel({ userId, appId, sessionId, onClose, onContractDeployed }: ContractPanelProps) {
  // Form state
  const [contractType, setContractType] = useState<ContractType>('erc20');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [totalSupply, setTotalSupply] = useState('1000000');
  const [selectedChainId, setSelectedChainId] = useState(11155111); // Sepolia default

  // Deployment state
  const [stage, setStage] = useState<DeploymentStage>('form');
  const [error, setError] = useState<string | null>(null);
  const [deployedContract, setDeployedContract] = useState<DeployedContract | null>(null);

  // Chains
  const [chains, setChains] = useState<Chain[]>([]);

  // Load supported chains on mount
  useEffect(() => {
    loadChains();
  }, []);

  const loadChains = async () => {
    try {
      const response = await fetch('/api/contracts/chains');
      const data = await response.json();

      if (data.success) {
        setChains(data.chains);
      }
    } catch (error) {
      console.error('Failed to load chains:', error);
    }
  };

  const handleDeploy = async () => {
    if (!name.trim()) {
      setError('Contract name is required');
      return;
    }

    if (contractType === 'erc20' && !symbol.trim()) {
      setError('Token symbol is required for ERC-20');
      return;
    }

    setError(null);
    setStage('compiling');

    try {
      // Deploy contract (compile + deploy in one API call)
      const response = await fetch('/api/contracts/create-and-deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          appId,
          sessionId,
          contractType,
          name,
          symbol: symbol || undefined,
          totalSupply: contractType === 'erc20' ? totalSupply : undefined,
          chainId: selectedChainId
        })
      });

      const data = await response.json();

      if (!data.success) {
        setStage('error');
        setError(data.error || 'Deployment failed');
        return;
      }

      // Success!
      const selectedChain = chains.find(c => c.chainId === selectedChainId);

      const deployedContractData: DeployedContract = {
        contractId: data.contractId,
        contractAddress: data.data.contractAddress,
        transactionHash: data.data.transactionHash,
        explorerUrl: data.data.explorerUrl,
        chainName: selectedChain?.name || 'Unknown',
        contractType,
        name,
        symbol
      };

      setDeployedContract(deployedContractData);
      setStage('success');

      if (onContractDeployed) {
        onContractDeployed(deployedContractData);
      }

    } catch (error: any) {
      console.error('Deployment error:', error);
      setStage('error');
      setError(error.message || 'Deployment failed');
    }
  };

  const handleReset = () => {
    setStage('form');
    setError(null);
    setDeployedContract(null);
    setName('');
    setSymbol('');
    setTotalSupply('1000000');
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="contract-panel-overlay"
    >
      <div className="contract-panel-backdrop" onClick={onClose} />

      <motion.div
        className="contract-panel"
        initial={{ y: 50 }}
        animate={{ y: 0 }}
      >
        {/* Header */}
        <div className="contract-panel-header">
          <h2>Deploy Smart Contract</h2>
          {onClose && (
            <button className="contract-panel-close" onClick={onClose}>
              ✕
            </button>
          )}
        </div>

        {/* Content */}
        <div className="contract-panel-content">
          <AnimatePresence mode="wait">
            {stage === 'form' && (
              <FormStage
                key="form"
                contractType={contractType}
                setContractType={setContractType}
                name={name}
                setName={setName}
                symbol={symbol}
                setSymbol={setSymbol}
                totalSupply={totalSupply}
                setTotalSupply={setTotalSupply}
                selectedChainId={selectedChainId}
                setSelectedChainId={setSelectedChainId}
                chains={chains}
                error={error}
                onDeploy={handleDeploy}
              />
            )}

            {stage === 'compiling' && (
              <LoadingStage
                key="compiling"
                message="Compiling contract..."
                subtitle="This may take a few seconds"
              />
            )}

            {stage === 'deploying' && (
              <LoadingStage
                key="deploying"
                message="Deploying to testnet..."
                subtitle="Waiting for blockchain confirmation"
              />
            )}

            {stage === 'success' && deployedContract && (
              <SuccessStage
                key="success"
                contract={deployedContract}
                onReset={handleReset}
                onClose={onClose}
              />
            )}

            {stage === 'error' && (
              <ErrorStage
                key="error"
                error={error || 'Unknown error occurred'}
                onRetry={handleReset}
                onClose={onClose}
              />
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <style>{`
        .contract-panel-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .contract-panel-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
        }

        .contract-panel {
          position: relative;
          background: white;
          border-radius: 16px;
          box-shadow: 0 24px 48px rgba(0, 0, 0, 0.2);
          max-width: 560px;
          width: 90%;
          max-height: 90vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .contract-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 24px;
          border-bottom: 1px solid #e5e7eb;
        }

        .contract-panel-header h2 {
          margin: 0;
          font-size: 20px;
          font-weight: 600;
          color: #111827;
        }

        .contract-panel-close {
          background: none;
          border: none;
          font-size: 24px;
          color: #6b7280;
          cursor: pointer;
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          transition: all 0.2s;
        }

        .contract-panel-close:hover {
          background: #f3f4f6;
          color: #111827;
        }

        .contract-panel-content {
          padding: 24px;
          overflow-y: auto;
          flex: 1;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-label {
          display: block;
          margin-bottom: 8px;
          font-size: 14px;
          font-weight: 500;
          color: #374151;
        }

        .form-input, .form-select {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 14px;
          transition: all 0.2s;
        }

        .form-input:focus, .form-select:focus {
          outline: none;
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }

        .form-hint {
          margin-top: 6px;
          font-size: 12px;
          color: #6b7280;
        }

        .contract-type-selector {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 24px;
        }

        .contract-type-option {
          padding: 16px;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: center;
        }

        .contract-type-option:hover {
          border-color: #6366f1;
        }

        .contract-type-option.active {
          border-color: #6366f1;
          background: #eef2ff;
        }

        .contract-type-option h3 {
          margin: 0 0 4px 0;
          font-size: 16px;
          font-weight: 600;
          color: #111827;
        }

        .contract-type-option p {
          margin: 0;
          font-size: 13px;
          color: #6b7280;
        }

        .error-message {
          padding: 12px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          color: #991b1b;
          font-size: 14px;
          margin-bottom: 16px;
        }

        .deploy-button {
          width: 100%;
          padding: 12px 24px;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .deploy-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
        }

        .deploy-button:active {
          transform: translateY(0);
        }

        .loading-container {
          text-align: center;
          padding: 40px 20px;
        }

        .loading-spinner {
          width: 64px;
          height: 64px;
          border: 4px solid #e5e7eb;
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 24px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .loading-message {
          font-size: 18px;
          font-weight: 600;
          color: #111827;
          margin-bottom: 8px;
        }

        .loading-subtitle {
          font-size: 14px;
          color: #6b7280;
        }

        .success-container {
          text-align: center;
          padding: 20px;
        }

        .success-icon {
          width: 80px;
          height: 80px;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
          font-size: 40px;
        }

        .success-title {
          font-size: 22px;
          font-weight: 700;
          color: #111827;
          margin-bottom: 8px;
        }

        .success-subtitle {
          font-size: 14px;
          color: #6b7280;
          margin-bottom: 24px;
        }

        .contract-details {
          background: #f9fafb;
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 24px;
          text-align: left;
        }

        .contract-detail-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid #e5e7eb;
        }

        .contract-detail-item:last-child {
          border-bottom: none;
        }

        .contract-detail-label {
          font-size: 13px;
          color: #6b7280;
          font-weight: 500;
        }

        .contract-detail-value {
          font-size: 13px;
          color: #111827;
          font-weight: 600;
          font-family: monospace;
        }

        .button-group {
          display: flex;
          gap: 12px;
        }

        .btn {
          flex: 1;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }

        .btn-primary {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: white;
        }

        .btn-secondary {
          background: white;
          color: #374151;
          border: 1px solid #d1d5db;
        }

        .btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .explorer-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #6366f1;
          text-decoration: none;
          font-weight: 600;
          font-size: 14px;
          padding: 8px 16px;
          border-radius: 8px;
          transition: all 0.2s;
        }

        .explorer-link:hover {
          background: #eef2ff;
        }
      `}</style>
    </motion.div>
  );
}

// SUB-COMPONENTS

function FormStage({
  contractType,
  setContractType,
  name,
  setName,
  symbol,
  setSymbol,
  totalSupply,
  setTotalSupply,
  selectedChainId,
  setSelectedChainId,
  chains,
  error,
  onDeploy
}: any) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      {/* Contract Type Selector */}
      <div className="contract-type-selector">
        <div
          className={`contract-type-option ${contractType === 'erc20' ? 'active' : ''}`}
          onClick={() => setContractType('erc20')}
        >
          <h3>ERC-20 Token</h3>
          <p>Fungible token</p>
        </div>
        <div
          className={`contract-type-option ${contractType === 'erc721' ? 'active' : ''}`}
          onClick={() => setContractType('erc721')}
        >
          <h3>ERC-721 NFT</h3>
          <p>Non-fungible token</p>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Form Fields */}
      <div className="form-group">
        <label className="form-label">Contract Name</label>
        <input
          type="text"
          className="form-input"
          placeholder={contractType === 'erc20' ? 'My Token' : 'My NFT Collection'}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="form-hint">The full name of your {contractType === 'erc20' ? 'token' : 'NFT collection'}</p>
      </div>

      <div className="form-group">
        <label className="form-label">Symbol</label>
        <input
          type="text"
          className="form-input"
          placeholder={contractType === 'erc20' ? 'MTK' : 'MNFT'}
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          maxLength={10}
        />
        <p className="form-hint">2-5 character ticker symbol</p>
      </div>

      {contractType === 'erc20' && (
        <div className="form-group">
          <label className="form-label">Total Supply</label>
          <input
            type="text"
            className="form-input"
            placeholder="1000000"
            value={totalSupply}
            onChange={(e) => setTotalSupply(e.target.value.replace(/[^0-9]/g, ''))}
          />
          <p className="form-hint">Total number of tokens to mint</p>
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Deploy to Chain</label>
        <select
          className="form-select"
          value={selectedChainId}
          onChange={(e) => setSelectedChainId(parseInt(e.target.value))}
        >
          {chains.map((chain: Chain) => (
            <option key={chain.chainId} value={chain.chainId}>
              {chain.name} ({chain.currency})
            </option>
          ))}
        </select>
        <p className="form-hint">Testnet deployment (free - get testnet tokens from faucets)</p>
      </div>

      <button className="deploy-button" onClick={onDeploy}>
        Deploy Contract
      </button>
    </motion.div>
  );
}

function LoadingStage({ message, subtitle }: { message: string; subtitle: string }) {
  return (
    <motion.div
      className="loading-container"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="loading-spinner" />
      <div className="loading-message">{message}</div>
      <div className="loading-subtitle">{subtitle}</div>
    </motion.div>
  );
}

function SuccessStage({ contract, onReset, onClose }: any) {
  const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <motion.div
      className="success-container"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="success-icon">✓</div>
      <div className="success-title">Contract Deployed!</div>
      <div className="success-subtitle">Your {contract.contractType === 'erc20' ? 'token' : 'NFT'} is now live on {contract.chainName}</div>

      <div className="contract-details">
        <div className="contract-detail-item">
          <span className="contract-detail-label">Name:</span>
          <span className="contract-detail-value">{contract.name}</span>
        </div>
        {contract.symbol && (
          <div className="contract-detail-item">
            <span className="contract-detail-label">Symbol:</span>
            <span className="contract-detail-value">{contract.symbol}</span>
          </div>
        )}
        <div className="contract-detail-item">
          <span className="contract-detail-label">Address:</span>
          <span className="contract-detail-value">{truncateAddress(contract.contractAddress)}</span>
        </div>
        <div className="contract-detail-item">
          <span className="contract-detail-label">Chain:</span>
          <span className="contract-detail-value">{contract.chainName}</span>
        </div>
      </div>

      <a
        href={contract.explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="explorer-link"
      >
        View on Explorer →
      </a>

      <div className="button-group" style={{ marginTop: '24px' }}>
        <button className="btn btn-secondary" onClick={onReset}>
          Deploy Another
        </button>
        <button className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </motion.div>
  );
}

function ErrorStage({ error, onRetry, onClose }: any) {
  return (
    <motion.div
      className="success-container"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="success-icon" style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }}>
        ✕
      </div>
      <div className="success-title">Deployment Failed</div>
      <div className="success-subtitle">Something went wrong</div>

      <div className="error-message" style={{ textAlign: 'left', marginTop: '24px' }}>
        {error}
      </div>

      <div className="button-group" style={{ marginTop: '24px' }}>
        <button className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={onRetry}>
          Try Again
        </button>
      </div>
    </motion.div>
  );
}
