import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

const API_BASE_URL = 'https://localhost:3001';

export default function App() {
  // Wallet state
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [provider, setProvider] = useState(null);

  // Token form state
  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [totalSupply, setTotalSupply] = useState('1000000');

  // Deployment state
  const [isCompiling, setIsCompiling] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [contractAddress, setContractAddress] = useState('');
  const [txHash, setTxHash] = useState('');

  // Connect to Metamask
  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        setError('Please install Metamask to use this app');
        return;
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      const network = await provider.getNetwork();

      setProvider(provider);
      setAccount(accounts[0]);
      setChainId(Number(network.chainId));
      setError('');
    } catch (err) {
      setError('Failed to connect wallet: ' + err.message);
    }
  };

  // Disconnect wallet
  const disconnectWallet = () => {
    setAccount(null);
    setChainId(null);
    setProvider(null);
  };

  // Listen for account/network changes
  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
        } else {
          disconnectWallet();
        }
      });

      window.ethereum.on('chainChanged', () => {
        window.location.reload();
      });
    }
  }, []);

  // Deploy token
  const deployToken = async (e) => {
    e.preventDefault();
    setError('');
    setStatus('');
    setContractAddress('');
    setTxHash('');

    if (!account) {
      setError('Please connect your wallet first');
      return;
    }

    if (!tokenName || !tokenSymbol || !totalSupply) {
      setError('Please fill in all fields');
      return;
    }

    try {
      // Step 1: Compile contract via backend API
      setIsCompiling(true);
      setStatus('Compiling contract...');

      const compileResponse = await fetch(`${API_BASE_URL}/api/contracts/compile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'demo-user',
          contractType: 'erc20',
          name: tokenName,
          symbol: tokenSymbol,
          totalSupply: totalSupply,
        }),
      });

      const compileData = await compileResponse.json();

      if (!compileData.success) {
        throw new Error(compileData.error || 'Compilation failed');
      }

      const { bytecode, abi } = compileData.data;
      setIsCompiling(false);

      // Step 2: Deploy using Metamask
      setIsDeploying(true);
      setStatus('Waiting for transaction confirmation...');

      const signer = await provider.getSigner();

      // Create contract factory
      const factory = new ethers.ContractFactory(abi, bytecode, signer);

      // Deploy contract with constructor arguments
      const contract = await factory.deploy(
        tokenName,
        tokenSymbol,
        totalSupply
      );

      setStatus('Deploying contract...');
      await contract.waitForDeployment();

      const deployedAddress = await contract.getAddress();
      const deploymentTx = contract.deploymentTransaction();

      setContractAddress(deployedAddress);
      setTxHash(deploymentTx.hash);
      setStatus('Token deployed successfully!');
      setIsDeploying(false);

      // Clear form
      setTokenName('');
      setTokenSymbol('');
      setTotalSupply('1000000');

    } catch (err) {
      console.error('Deployment error:', err);
      setError(err.message || 'Deployment failed');
      setStatus('');
      setIsCompiling(false);
      setIsDeploying(false);
    }
  };

  // Get network name
  const getNetworkName = (chainId) => {
    const networks = {
      1: 'Ethereum Mainnet',
      11155111: 'Sepolia Testnet',
      84532: 'Base Sepolia',
      421614: 'Arbitrum Sepolia',
      137: 'Polygon Mainnet',
      80001: 'Mumbai Testnet',
    };
    return networks[chainId] || `Chain ID: ${chainId}`;
  };

  // Add token to Metamask
  const addTokenToWallet = async () => {
    try {
      await window.ethereum.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC20',
          options: {
            address: contractAddress,
            symbol: tokenSymbol,
            decimals: 18,
          },
        },
      });
    } catch (err) {
      console.error('Failed to add token to wallet:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 p-4">
      <div className="max-w-2xl mx-auto py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            ERC-20 Token Deployer
          </h1>
          <p className="text-gray-600">
            Create and deploy your own ERC-20 token in minutes
          </p>
        </div>

        {/* Wallet Connection */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          {!account ? (
            <button
              onClick={connectWallet}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-md"
            >
              Connect Metamask
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-600">Connected Wallet</p>
                  <p className="font-mono text-sm text-gray-800">
                    {account.slice(0, 6)}...{account.slice(-4)}
                  </p>
                </div>
                <button
                  onClick={disconnectWallet}
                  className="text-red-500 hover:text-red-700 text-sm font-medium"
                >
                  Disconnect
                </button>
              </div>
              <div className="pt-2 border-t">
                <p className="text-sm text-gray-600">Network</p>
                <p className="text-sm font-medium text-gray-800">
                  {getNetworkName(chainId)}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Token Form */}
        {account && (
          <form onSubmit={deployToken} className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">
              Token Configuration
            </h2>

            <div className="space-y-4">
              {/* Token Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Token Name
                </label>
                <input
                  type="text"
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  placeholder="e.g., My Awesome Token"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  disabled={isCompiling || isDeploying}
                />
                <p className="text-xs text-gray-500 mt-1">
                  The full name of your token
                </p>
              </div>

              {/* Token Symbol */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Token Symbol
                </label>
                <input
                  type="text"
                  value={tokenSymbol}
                  onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
                  placeholder="e.g., MAT"
                  maxLength={10}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  disabled={isCompiling || isDeploying}
                />
                <p className="text-xs text-gray-500 mt-1">
                  3-5 characters recommended (e.g., BTC, ETH)
                </p>
              </div>

              {/* Total Supply */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Initial Supply
                </label>
                <input
                  type="number"
                  value={totalSupply}
                  onChange={(e) => setTotalSupply(e.target.value)}
                  placeholder="e.g., 1000000"
                  min="1"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  disabled={isCompiling || isDeploying}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Total tokens to mint (will be sent to your address)
                </p>
              </div>
            </div>

            {/* Deploy Button */}
            <button
              type="submit"
              disabled={isCompiling || isDeploying}
              className="w-full mt-6 bg-gradient-to-r from-green-500 to-teal-600 hover:from-green-600 hover:to-teal-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCompiling
                ? 'Compiling Contract...'
                : isDeploying
                ? 'Deploying Token...'
                : 'Deploy Token'}
            </button>
          </form>
        )}

        {/* Status Messages */}
        {(status || error) && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            {status && (
              <div className="flex items-start space-x-3 text-blue-700 mb-3">
                <svg className="w-5 h-5 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="text-sm font-medium">{status}</p>
              </div>
            )}

            {error && (
              <div className="flex items-start space-x-3 text-red-700">
                <svg className="w-5 h-5 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* Success Display */}
        {contractAddress && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="text-center mb-4">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                <svg
                  className="w-8 h-8 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">
                Token Deployed!
              </h3>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600 mb-1">Contract Address</p>
                <div className="flex items-center space-x-2">
                  <code className="flex-1 px-3 py-2 bg-gray-100 rounded font-mono text-sm break-all">
                    {contractAddress}
                  </code>
                  <button
                    onClick={() => navigator.clipboard.writeText(contractAddress)}
                    className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                    title="Copy address"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {txHash && (
                <div>
                  <p className="text-sm text-gray-600 mb-1">Transaction Hash</p>
                  <code className="block px-3 py-2 bg-gray-100 rounded font-mono text-sm break-all">
                    {txHash}
                  </code>
                </div>
              )}

              <button
                onClick={addTokenToWallet}
                className="w-full mt-4 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                Add Token to Metamask
              </button>
            </div>
          </div>
        )}

        {/* Info Card */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <h4 className="font-semibold text-blue-900 mb-2">How it works</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Backend API compiles your ERC-20 token contract</li>
            <li>• Metamask deploys the contract to the blockchain</li>
            <li>• All tokens are minted to your wallet address</li>
            <li>• Standard ERC-20 with transfer, approve, and allowance</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
