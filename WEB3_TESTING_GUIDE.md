# Web3 Contract Deployment - Testing Guide

## 🎯 Overview

This guide walks you through testing the complete Web3 smart contract deployment feature, from database setup to deploying your first ERC-20 token on Sepolia testnet.

---

## ✅ Prerequisites Checklist

Before you start, make sure you have:

- [ ] Node.js 18+ installed
- [ ] PostgreSQL running
- [ ] Alchemy or Infura API key
- [ ] Test wallet with Sepolia ETH
- [ ] All dependencies installed (`pnpm install`)

---

## 📦 Step 1: Install Dependencies

```bash
cd /home/kevin/20102025-either/Eitherway-Revamped

# Install all package dependencies
pnpm install

# Specifically for database package (solc and viem)
cd packages/database
pnpm install
```

---

## 🗄️ Step 2: Database Setup

### Run Migration 016

```bash
# From project root
cd packages/database

# Option A: Run migration directly
psql -U postgres -d eitherway -f src/migrations/016_smart_contracts.sql

# Option B: Use the migration runner (if available)
pnpm run migrate
```

### Verify Tables Created

```bash
psql -U postgres -d eitherway

\dt core.smart_contracts
\dt core.contract_deployments
\dt core.contract_interactions

# Should show all 3 tables
\q
```

---

## 🔑 Step 3: Configure Environment Variables

Add the following to your `.env` file in the project root:

```bash
# Web3 RPC Endpoints
ALCHEMY_API_KEY=your_alchemy_key_here
# OR
INFURA_API_KEY=your_infura_key_here

# Deployer Wallet (TESTNET ONLY - NO REAL FUNDS!)
DEPLOYER_PRIVATE_KEY=0x_your_test_wallet_private_key

# Network Configuration
DEFAULT_CHAIN_ID=11155111  # Sepolia
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}

# Optional: Other testnets
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}
ARBITRUM_SEPOLIA_RPC_URL=https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}

# Optional: Contract Verification
ETHERSCAN_API_KEY=your_etherscan_key
```

---

## 🌐 Step 4: Get Testnet Setup

### 4.1 Create RPC Provider Account

**Alchemy (Recommended):**
1. Go to https://www.alchemy.com/
2. Sign up (free tier: 300M compute units/month)
3. Click "Create App"
4. Select "Ethereum" → "Sepolia"
5. Copy the API key
6. Add to `.env`: `ALCHEMY_API_KEY=your_key`

**Infura (Alternative):**
1. Go to https://infura.io/
2. Sign up (free tier available)
3. Create new project
4. Enable Sepolia
5. Copy API key
6. Add to `.env`: `INFURA_API_KEY=your_key`

### 4.2 Generate Test Wallet

**⚠️ IMPORTANT: This wallet is ONLY for testnets - NEVER use for real funds!**

**Option 1: Use Online Tool (Testnet Only!)**
1. Visit: https://vanity-eth.tk/
2. Click "Generate"
3. Copy the private key (starts with 0x)
4. Add to `.env`: `DEPLOYER_PRIVATE_KEY=0x...`

**Option 2: Using Foundry (if installed)**
```bash
cast wallet new

# Save the private key to .env
DEPLOYER_PRIVATE_KEY=0x...
```

### 4.3 Get Testnet ETH (Free!)

**Sepolia Faucets** - Pick any of these:

1. **Alchemy Faucet** (Easiest)
   - Go to: https://www.alchemy.com/faucets/ethereum-sepolia
   - Paste your wallet address
   - Click "Send Me ETH"
   - Wait 30 seconds

2. **QuickNode Faucet**
   - Go to: https://faucet.quicknode.com/ethereum/sepolia
   - Paste address
   - Complete CAPTCHA
   - Receive 0.1 ETH

3. **Sepolia PoW Faucet**
   - Go to: https://sepolia-faucet.pk910.de/
   - Mine testnet ETH (takes a few minutes)

**Verify Balance:**
```bash
# Check your balance on Etherscan
# Replace YOUR_ADDRESS with your wallet address
https://sepolia.etherscan.io/address/YOUR_ADDRESS
```

You need at least **0.05 ETH** for testing (enough for 50+ deployments)

---

## 🚀 Step 5: Start the Server

```bash
# From project root
cd /home/kevin/20102025-either/Eitherway-Revamped

# Terminal 1: Start backend server
npm run server

# Terminal 2: Start frontend (optional, if testing UI)
npm run ui
```

The server should start on `http://localhost:3001`

Look for this log message:
```
[Contracts] Routes registered successfully
```

---

## 🧪 Step 6: Test Contract Compilation (cURL)

### Test 1: Compile ERC-20 Token

```bash
curl -X POST http://localhost:3001/api/contracts/compile \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "demo-user",
    "contractType": "erc20",
    "name": "Test Token",
    "symbol": "TEST",
    "totalSupply": "1000000"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "contractId": "uuid-here",
  "data": {
    "bytecode": "0x608060...",
    "abi": [...],
    "sourceCode": "// SPDX-License-Identifier...",
    "estimatedGas": "750000"
  }
}
```

### Test 2: Compile ERC-721 NFT

```bash
curl -X POST http://localhost:3001/api/contracts/compile \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "demo-user",
    "contractType": "erc721",
    "name": "Test NFT",
    "symbol": "TNFT"
  }'
```

---

## 🌍 Step 7: Test Contract Deployment

### Test 3: Deploy ERC-20 to Sepolia

**Important:** Save the `contractId` from Step 6 Test 1, then run:

```bash
curl -X POST http://localhost:3001/api/contracts/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "contractId": "YOUR_CONTRACT_ID_HERE",
    "chainId": 11155111
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "contractAddress": "0x1234567890abcdef...",
    "transactionHash": "0xabcdef...",
    "blockNumber": "12345678",
    "gasUsed": "724891",
    "gasPriceGwei": "25.5",
    "explorerUrl": "https://sepolia.etherscan.io/address/0x..."
  }
}
```

### Test 4: One-Step Deploy (Compile + Deploy)

```bash
curl -X POST http://localhost:3001/api/contracts/create-and-deploy \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "demo-user",
    "contractType": "erc20",
    "name": "My Token",
    "symbol": "MTK",
    "totalSupply": "5000000",
    "chainId": 11155111
  }'
```

This will compile and deploy in a single request!

---

## 🔍 Step 8: Verify on Etherscan

1. Copy the `explorerUrl` from the deployment response
2. Open it in your browser
3. You should see your deployed contract!

**What to check:**
- ✅ Contract address is shown
- ✅ Transaction shows "Success" status
- ✅ Contract code tab exists (may show "Contract Source Code Not Verified Yet")
- ✅ Read Contract tab shows `name()`, `symbol()`, `totalSupply()` functions
- ✅ Your deployer address is shown as the creator

---

## 📋 Step 9: Test API Endpoints

### Get Contract Details

```bash
curl http://localhost:3001/api/contracts/YOUR_CONTRACT_ID
```

### List User's Contracts

```bash
curl "http://localhost:3001/api/contracts?userId=demo-user"
```

### Get Supported Chains

```bash
curl http://localhost:3001/api/contracts/chains
```

**Expected Response:**
```json
{
  "success": true,
  "chains": [
    {
      "chainId": 11155111,
      "name": "Sepolia",
      "rpcUrl": "https://eth-sepolia...",
      "explorerUrl": "https://sepolia.etherscan.io",
      "currency": "ETH"
    },
    ...
  ]
}
```

---

## 🎨 Step 10: Test Frontend UI (Optional)

If you started the frontend (`npm run ui`):

1. Open `http://localhost:3000`
2. Navigate to the Web3 section
3. You should see the **ContractPanel** component
4. Fill in the form:
   - Contract Type: ERC-20
   - Name: "My Test Token"
   - Symbol: "MTT"
   - Total Supply: 1000000
   - Chain: Sepolia
5. Click "Deploy Contract"
6. Watch the loading states:
   - "Compiling contract..."
   - "Deploying to testnet..."
   - "Contract Deployed!" ✅
7. Click "View on Explorer" to see it on Etherscan

---

## 🐛 Troubleshooting

### Error: "No deployer private key configured"
**Fix:** Add `DEPLOYER_PRIVATE_KEY` to your `.env` file

### Error: "Deployer wallet has 0 ETH"
**Fix:** Get testnet ETH from a faucet (Step 4.3)

### Error: "Invalid token: 401 Unauthorized"
**Fix:** Check your `ALCHEMY_API_KEY` or `INFURA_API_KEY` in `.env`

### Error: "Compilation failed"
**Fix:** Check the error message. Usually it's a syntax issue in the template. Review the Solidity templates in `packages/database/src/templates/`

### Error: "Database connection failed"
**Fix:**
1. Make sure PostgreSQL is running
2. Check your `POSTGRES_*` environment variables
3. Verify migration 016 was applied

### Deployment takes too long
**Normal:** Testnet transactions can take 15-30 seconds
**If > 2 minutes:** Check Sepolia network status at https://sepolia.etherscan.io/

---

## 📊 Expected Test Results

After completing all tests, you should have:

| Test | Expected Result |
|------|-----------------|
| Dependencies installed | ✅ `node_modules` populated |
| Migration applied | ✅ 3 new tables in database |
| Environment configured | ✅ `.env` has all required keys |
| Testnet ETH obtained | ✅ Balance > 0.05 ETH |
| Server started | ✅ Logs show "Routes registered" |
| Compilation works | ✅ Returns bytecode + ABI |
| Deployment works | ✅ Returns contract address |
| Etherscan shows contract | ✅ Contract visible on explorer |
| API endpoints work | ✅ All cURL commands return success |
| Frontend UI works | ✅ Can deploy via UI |

---

## 🎉 Success Criteria

You've successfully completed testing if:

1. ✅ You can compile an ERC-20 contract via API
2. ✅ You can deploy it to Sepolia testnet
3. ✅ The contract appears on Sepolia Etherscan
4. ✅ You can view the contract details via API
5. ✅ The contract is stored in your database
6. ✅ You can call read functions (name, symbol, totalSupply) on Etherscan

---

## 🔥 Next Steps

Now that Web3 contracts are working:

1. **Integrate with Agent**: Add contract deployment to the AI agent's capabilities
2. **Generated Apps**: Use `contract-interaction-template.tsx` to add contract interactions to generated apps
3. **Multi-chain**: Test deployments to Base Sepolia and Arbitrum Sepolia
4. **Contract Verification**: Implement Etherscan verification API
5. **Frontend Polish**: Integrate ContractPanel into the main DeploymentPanel
6. **User Wallet**: Let users deploy with their own MetaMask instead of server wallet

---

## 📞 Need Help?

**Common Issues:**
- Check server logs: `packages/ui-server` terminal
- Check database: `psql -U postgres -d eitherway`
- Check testnet ETH: https://sepolia.etherscan.io/address/YOUR_ADDRESS
- Check RPC status: Alchemy/Infura dashboard

**Debug Mode:**
Add to your test cURL commands: ` | jq .` to pretty-print JSON responses

---

## 🏆 Congratulations!

You now have a fully functional Web3 smart contract deployment system that can:
- ✅ Compile Solidity contracts
- ✅ Deploy to multiple testnets
- ✅ Track deployments in database
- ✅ Generate contracts from templates
- ✅ Provide a UI for contract deployment
- ✅ Support both ERC-20 tokens and ERC-721 NFTs

**You're ready to build Web3 apps with EitherWay! 🚀**
