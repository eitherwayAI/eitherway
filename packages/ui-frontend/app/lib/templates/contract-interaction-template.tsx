// Contract Interaction Template for Generated Apps
// Shows how to read/write from deployed smart contracts

export const contractInteractionTemplate = `
// ============================================================================
// CONTRACT INTERACTION EXAMPLE
// ============================================================================

// /src/hooks/useContract.ts
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import type { Address } from 'viem';

// Replace with your deployed contract details
const CONTRACT_ADDRESS = '{{CONTRACT_ADDRESS}}' as Address;
const CONTRACT_ABI = {{CONTRACT_ABI}};

export function useTokenContract() {
  // Read token name
  const { data: name } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'name'
  });

  // Read token symbol
  const { data: symbol } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'symbol'
  });

  // Read total supply
  const { data: totalSupply } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'totalSupply'
  });

  // Read user balance
  const useBalance = (userAddress?: Address) => {
    return useReadContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'balanceOf',
      args: userAddress ? [userAddress] : undefined,
      query: {
        enabled: !!userAddress
      }
    });
  };

  // Write: Transfer tokens
  const {
    writeContract,
    data: transferHash,
    isPending: isTransferPending
  } = useWriteContract();

  const transfer = (to: Address, amount: string) => {
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'transfer',
      args: [to, parseUnits(amount, 18)]
    });
  };

  // Wait for transfer confirmation
  const { isLoading: isTransferConfirming, isSuccess: isTransferConfirmed } =
    useWaitForTransactionReceipt({
      hash: transferHash
    });

  return {
    name,
    symbol,
    totalSupply: totalSupply ? formatUnits(totalSupply as bigint, 18) : '0',
    useBalance,
    transfer,
    isTransferPending,
    isTransferConfirming,
    isTransferConfirmed
  };
}

// /src/components/TokenBalance.tsx
import React from 'react';
import { useAccount } from 'wagmi';
import { useTokenContract } from '../hooks/useContract';
import { formatUnits } from 'viem';

export function TokenBalance() {
  const { address, isConnected } = useAccount();
  const { name, symbol, useBalance } = useTokenContract();
  const { data: balance } = useBalance(address);

  if (!isConnected) {
    return (
      <div className="token-balance">
        <p>Connect your wallet to view balance</p>
      </div>
    );
  }

  return (
    <div className="token-balance">
      <h3>Your Balance</h3>
      <div className="balance-amount">
        {balance ? formatUnits(balance as bigint, 18) : '0'} {symbol as string}
      </div>
      <p className="token-name">{name as string}</p>
    </div>
  );
}

// /src/components/TransferForm.tsx
import React, { useState } from 'react';
import { useTokenContract } from '../hooks/useContract';
import type { Address } from 'viem';

export function TransferForm() {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const { transfer, isTransferPending, isTransferConfirming, isTransferConfirmed } = useTokenContract();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!recipient || !amount) {
      alert('Please fill in all fields');
      return;
    }

    // Validate address
    if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
      alert('Invalid Ethereum address');
      return;
    }

    transfer(recipient as Address, amount);
  };

  return (
    <div className="transfer-form">
      <h3>Transfer Tokens</h3>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Recipient Address</label>
          <input
            type="text"
            placeholder="0x..."
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            disabled={isTransferPending || isTransferConfirming}
          />
        </div>

        <div className="form-group">
          <label>Amount</label>
          <input
            type="text"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isTransferPending || isTransferConfirming}
          />
        </div>

        <button
          type="submit"
          disabled={isTransferPending || isTransferConfirming}
          className="transfer-button"
        >
          {isTransferPending
            ? 'Confirm in wallet...'
            : isTransferConfirming
            ? 'Confirming...'
            : 'Transfer'}
        </button>

        {isTransferConfirmed && (
          <div className="success-message">
            Transfer successful! ✓
          </div>
        )}
      </form>
    </div>
  );
}

// /src/App.tsx (Integration Example)
import React from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TokenBalance } from './components/TokenBalance';
import { TransferForm } from './components/TransferForm';
import { ConnectButton } from '@reown/appkit-react';
import { wagmiAdapter } from './lib/web3'; // Your existing wagmi config

const queryClient = new QueryClient();

function App() {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <div className="app">
          <header className="app-header">
            <h1>My Token Dashboard</h1>
            <ConnectButton />
          </header>

          <main className="app-main">
            <div className="dashboard-grid">
              <TokenBalance />
              <TransferForm />
            </div>
          </main>
        </div>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;

// Styles (add to your CSS file or use Tailwind)
/*
.token-balance {
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.balance-amount {
  font-size: 32px;
  font-weight: 700;
  color: #6366f1;
  margin: 16px 0 8px;
}

.token-name {
  color: #6b7280;
  font-size: 14px;
}

.transfer-form {
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #374151;
}

.form-group input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
}

.transfer-button {
  width: 100%;
  padding: 12px 24px;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}

.transfer-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.success-message {
  margin-top: 16px;
  padding: 12px;
  background: #d1fae5;
  border-radius: 8px;
  color: #065f46;
  font-weight: 500;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 24px;
  padding: 24px;
}
*/
`;

export const nftInteractionTemplate = `
// NFT (ERC-721) Interaction Example

// /src/hooks/useNFTContract.ts
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import type { Address } from 'viem';

const NFT_CONTRACT_ADDRESS = '{{CONTRACT_ADDRESS}}' as Address;
const NFT_ABI = {{CONTRACT_ABI}};

export function useNFTContract() {
  // Read collection name
  const { data: name } = useReadContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: NFT_ABI,
    functionName: 'name'
  });

  // Read collection symbol
  const { data: symbol } = useReadContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: NFT_ABI,
    functionName: 'symbol'
  });

  // Read total supply
  const { data: totalSupply } = useReadContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: NFT_ABI,
    functionName: 'totalSupply'
  });

  // Read user's NFT balance
  const useBalance = (userAddress?: Address) => {
    return useReadContract({
      address: NFT_CONTRACT_ADDRESS,
      abi: NFT_ABI,
      functionName: 'balanceOf',
      args: userAddress ? [userAddress] : undefined,
      query: {
        enabled: !!userAddress
      }
    });
  };

  // Read owner of specific token
  const useOwnerOf = (tokenId: bigint) => {
    return useReadContract({
      address: NFT_CONTRACT_ADDRESS,
      abi: NFT_ABI,
      functionName: 'ownerOf',
      args: [tokenId]
    });
  };

  // Read token URI (metadata)
  const useTokenURI = (tokenId: bigint) => {
    return useReadContract({
      address: NFT_CONTRACT_ADDRESS,
      abi: NFT_ABI,
      functionName: 'tokenURI',
      args: [tokenId]
    });
  };

  // Write: Mint new NFT
  const {
    writeContract,
    data: mintHash,
    isPending: isMintPending
  } = useWriteContract();

  const mint = (to: Address, tokenURI: string) => {
    writeContract({
      address: NFT_CONTRACT_ADDRESS,
      abi: NFT_ABI,
      functionName: 'mint',
      args: [to, tokenURI]
    });
  };

  // Wait for mint confirmation
  const { isLoading: isMintConfirming, isSuccess: isMintConfirmed } =
    useWaitForTransactionReceipt({
      hash: mintHash
    });

  return {
    name,
    symbol,
    totalSupply: totalSupply ? (totalSupply as bigint).toString() : '0',
    useBalance,
    useOwnerOf,
    useTokenURI,
    mint,
    isMintPending,
    isMintConfirming,
    isMintConfirmed
  };
}

// /src/components/NFTGallery.tsx
import React from 'react';
import { useAccount } from 'wagmi';
import { useNFTContract } from '../hooks/useNFTContract';

export function NFTGallery() {
  const { address, isConnected } = useAccount();
  const { name, totalSupply, useBalance } = useNFTContract();
  const { data: balance } = useBalance(address);

  if (!isConnected) {
    return <div>Connect wallet to view your NFTs</div>;
  }

  return (
    <div className="nft-gallery">
      <h2>{name as string}</h2>
      <p>You own {balance ? (balance as bigint).toString() : '0'} NFTs</p>
      <p>Total minted: {totalSupply}</p>

      {/* Here you would fetch and display individual NFTs */}
      <div className="nft-grid">
        {/* Map through token IDs and display each NFT */}
      </div>
    </div>
  );
}

// /src/components/MintNFT.tsx
import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { useNFTContract } from '../hooks/useNFTContract';

export function MintNFT() {
  const { address } = useAccount();
  const [tokenURI, setTokenURI] = useState('');
  const { mint, isMintPending, isMintConfirming, isMintConfirmed } = useNFTContract();

  const handleMint = () => {
    if (!address || !tokenURI) {
      alert('Please enter token URI');
      return;
    }

    mint(address, tokenURI);
  };

  return (
    <div className="mint-nft">
      <h3>Mint New NFT</h3>

      <div className="form-group">
        <label>Token URI (metadata URL)</label>
        <input
          type="text"
          placeholder="ipfs://... or https://..."
          value={tokenURI}
          onChange={(e) => setTokenURI(e.target.value)}
          disabled={isMintPending || isMintConfirming}
        />
      </div>

      <button
        onClick={handleMint}
        disabled={isMintPending || isMintConfirming}
      >
        {isMintPending
          ? 'Confirm in wallet...'
          : isMintConfirming
          ? 'Minting...'
          : 'Mint NFT'}
      </button>

      {isMintConfirmed && (
        <div className="success-message">
          NFT minted successfully! ✓
        </div>
      )}
    </div>
  );
}
`;
