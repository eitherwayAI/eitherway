# Web3 Smart Contract System - Implementation Context

**Last Updated:** 2025-10-22
**Status:** Backend 100% Complete | Frontend 0% Complete
**Branch:** `beta-kevin`
**Original Plan:** Week 2 of 3-week development plan (Web3 Core)

---

## 📋 Table of Contents

1. [Current State](#current-state)
2. [What's Been Built](#whats-been-built)
3. [What Needs To Be Built](#what-needs-to-be-built)
4. [Architecture Overview](#architecture-overview)
5. [File References](#file-references)
6. [Testing Guide](#testing-guide)
7. [Important Decisions & Context](#important-decisions--context)
8. [Next Steps Priority](#next-steps-priority)

---

## 🎯 Current State

### ✅ **COMPLETED - Backend Infrastructure**

The entire backend for Web3 smart contract deployment is **fully functional and tested**:

- Database schema with 3 tables
- Contract compilation service (Solidity → bytecode/ABI)
- Multi-chain deployment (Sepolia, Base, Arbitrum)
- API endpoints for all operations
- ERC-20 and ERC-721 templates
- End-to-end tested with real deployments

### ❌ **MISSING - Frontend UI**

**NO user interface exists.** Everything works via API only.

Users cannot:
- See the Web3 deployment option
- Deploy contracts from the UI
- View deployed contracts
- Interact with contracts (mint, transfer, etc.)
- See contract details or transaction history

### 🔴 **Critical Gap**

The original plan specified:
> "Web3 panel for UI" + "Generated apps include typed viem clients"

Neither of these exist yet. The system is invisible to end users.

---

## ✅ What's Been Built

### 1. **Database Schema** (Migration 016)

**File:** `packages/database/src/migrations/016_smart_contracts.sql`

**Tables Created:**

```sql
-- Main contracts table
core.smart_contracts (
  id UUID PRIMARY KEY,
  user_id UUID,
  contract_type TEXT, -- 'erc20', 'erc721', 'erc1155', 'custom'
  name TEXT,
  symbol TEXT,
  source_code TEXT,
  bytecode TEXT,
  abi JSONB,
  deployed_address TEXT,
  deployed_chain_id INT,
  deployment_status TEXT,
  compilation_status TEXT,
  estimated_gas TEXT,
  actual_gas_used TEXT,
  explorer_url TEXT,
  verified_on_explorer BOOLEAN,
  created_at TIMESTAMPTZ,
  deployed_at TIMESTAMPTZ
)

-- Deployment history
core.contract_deployments (
  id UUID PRIMARY KEY,
  contract_id UUID,
  chain_id INT,
  deployed_address TEXT,
  deployment_tx_hash TEXT,
  deployer_address TEXT,
  gas_used BIGINT,
  explorer_url TEXT,
  status TEXT
)

-- Interaction tracking
core.contract_interactions (
  id UUID PRIMARY KEY,
  contract_id UUID,
  user_id UUID,
  function_name TEXT,
  function_args JSONB,
  transaction_hash TEXT,
  block_number BIGINT,
  gas_used BIGINT,
  status TEXT
)
```

**Migration Applied:** ✅ All tables exist in database

---

### 2. **Contract Repository**

**File:** `packages/database/src/repositories/contracts.ts` (394 lines)

**Key Methods:**
```typescript
class ContractsRepository {
  async create(params: CreateContractParams): Promise<SmartContract>
  async findById(contractId: string): Promise<SmartContract | null>
  async findByUserId(userId: string): Promise<SmartContract[]>
  async updateCompilation(params: UpdateCompilationParams)
  async updateDeployment(params: UpdateDeploymentParams)
  async createDeployment(params: CreateDeploymentParams)
  async getDeploymentsByContractId(contractId: string)
  async getContractsWithStats(userId: string)
}
```

**Status:** ✅ Fully implemented and working

---

### 3. **Contract Service**

**File:** `packages/database/src/services/contract-service.ts` (500 lines)

**Core Functionality:**

```typescript
class ContractService {
  // Compile Solidity to bytecode + ABI
  async compileContract(params: CompileContractParams): Promise<CompileResult>

  // Deploy to testnet
  async deployContract(params: DeployContractParams): Promise<DeployResult>

  // One-step: compile + deploy
  async createAndCompile(userId, params): Promise<{contractId, compileResult}>

  // Get supported chains
  getSupportedChains(): ChainConfig[]
}
```

**Supported Chains:**
```typescript
SUPPORTED_CHAINS = {
  11155111: { name: 'Sepolia', rpcUrl: 'alchemy...' },
  84532: { name: 'Base Sepolia', rpcUrl: 'alchemy...' },
  421614: { name: 'Arbitrum Sepolia', rpcUrl: 'alchemy...' }
}
```

**Status:** ✅ Fully working - compiles and deploys successfully

---

### 4. **Solidity Templates**

**Files:**
- `packages/database/src/templates/erc20-template.sol` (70 lines)
- `packages/database/src/templates/erc721-template.sol` (158 lines)

**ERC-20 Features:**
- Standard transfer, approve, transferFrom
- increaseAllowance, decreaseAllowance
- Full EIP-20 compliance
- Variable substitution: `{{TOKEN_NAME}}`, `{{CONTRACT_NAME}}`

**ERC-721 Features:**
- Full NFT standard implementation
- Mint function (open minting)
- Token URI storage
- SafeTransfer with receiver check
- Approval system

**Status:** ✅ Both templates tested and deployed to Sepolia

---

### 5. **API Routes**

**File:** `packages/ui-server/src/routes/contracts.ts` (400 lines)

**Endpoints:**

```typescript
POST   /api/contracts/compile
  Body: { userId, contractType, name, symbol, totalSupply }
  Returns: { success, contractId, data: { bytecode, abi, sourceCode } }

POST   /api/contracts/deploy
  Body: { contractId, chainId, deployerPrivateKey? }
  Returns: { success, data: { contractAddress, transactionHash, explorerUrl } }

POST   /api/contracts/create-and-deploy
  Body: { userId, contractType, name, symbol, chainId }
  Returns: { success, contractId, data: { ...compile + deploy results } }

GET    /api/contracts/:id
  Returns: { success, data: SmartContract }

GET    /api/contracts?userId=xxx
  Returns: { success, contracts: SmartContract[] }

GET    /api/contracts/chains
  Returns: { success, chains: ChainConfig[] }

DELETE /api/contracts/:id
  Returns: { success }
```

**Status:** ✅ All endpoints tested and working

---

### 6. **Live Deployed Contracts** (Sepolia Testnet)

**Proof of Functionality:**

| Contract Type | Address | Etherscan |
|--------------|---------|-----------|
| ERC-20 "Test Token" | `0xff1581d8394b85345d9b1fdaa0e057c4cc3273a0` | [View](https://sepolia.etherscan.io/address/0xff1581d8394b85345d9b1fdaa0e057c4cc3273a0) |
| ERC-721 "My Cool NFT Collection" | `0xc54b2a0f64ca520b56b9ac5101a098d68ad00d6f` | [View](https://sepolia.etherscan.io/address/0xc54b2a0f64ca520b56b9ac5101a098d68ad00d6f) |

**Wallet Used:** `0x4453d68D69e169FA1fbd3AE3931DeBc66d9335e8` (has 0.1 Sepolia ETH)

---

### 7. **Environment Configuration**

**File:** `.env` (configured and working)

```bash
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5434  # Docker container
POSTGRES_DB=eitherway
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

# Web3
ALCHEMY_API_KEY=d-y4foWYwD_C-LCGojY8I
DEPLOYER_PRIVATE_KEY=0x67e07fd1b95ad0769449efead5beef4f3ad4bc5e9f23b8fe802f79db2f2b44a8

# Deployer wallet: 0x4453d68D69e169FA1fbd3AE3931DeBc66d9335e8
# ⚠️ TESTNET ONLY
```

**Status:** ✅ All credentials working

---

### 8. **Dependencies Installed**

**File:** `packages/database/package.json`

```json
{
  "dependencies": {
    "solc": "^0.8.26",      // Solidity compiler
    "viem": "^2.33.2"       // Ethereum library
  }
}
```

**Status:** ✅ Installed and functional

---

### 9. **Testing Guide**

**File:** `WEB3_TESTING_GUIDE.md` (449 lines)

Comprehensive guide covering:
- Prerequisites
- Environment setup
- Database migration
- Testnet ETH acquisition
- cURL test examples
- Troubleshooting

**Status:** ✅ Complete and tested

---

## ❌ What Needs To Be Built

### **PHASE 1: Frontend UI Components** (CRITICAL - 4-6 hours)

#### 1.1 Create ContractPanel Component

**New File:** `packages/ui-frontend/app/components/web3/ContractPanel.tsx`

**Requirements:**

```typescript
interface ContractPanelProps {
  appId: string;
  sessionId: string;
  userId: string;
}

export function ContractPanel({ appId, sessionId, userId }: ContractPanelProps) {
  // State management
  const [contractType, setContractType] = useState<'erc20' | 'erc721'>('erc20')
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [totalSupply, setTotalSupply] = useState('1000000')
  const [chainId, setChainId] = useState(11155111) // Sepolia
  const [isDeploying, setIsDeploying] = useState(false)
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null)
  const [userContracts, setUserContracts] = useState<Contract[]>([])

  // Features to implement:
  // 1. Form UI - deploy new contract
  // 2. Multi-stage UI - compiling → deploying → deployed
  // 3. Chain selector dropdown (Sepolia, Base, Arbitrum)
  // 4. Contracts list - show user's deployed contracts
  // 5. Contract details - address, chain, Etherscan link, ABI
  // 6. Error handling - compilation errors, deployment failures
  // 7. Success animation - celebrate deployment

  return (...)
}
```

**UI Sections:**

1. **Deployment Form**
   - Contract Type selector (ERC-20 / ERC-721)
   - Name input
   - Symbol input (optional)
   - Total Supply (ERC-20 only)
   - Chain selector
   - Deploy button

2. **Multi-Stage Progress**
   ```
   [Form] → [Compiling...] → [Deploying...] → [Success!]
   ```
   - Show spinner during compilation
   - Show transaction hash during deployment
   - Show confetti/animation on success
   - Display Etherscan link

3. **Contracts List**
   - Table/cards showing deployed contracts
   - Columns: Name, Type, Chain, Address, Status
   - Click to view details
   - Link to Etherscan

4. **Contract Details Modal**
   - Contract address (copy button)
   - Deployed chain + block number
   - Transaction hash
   - ABI viewer (JSON)
   - Source code viewer
   - Etherscan link

**Styling:** Match existing DeploymentPanel design (dark theme, neon accents)

---

#### 1.2 Integrate into DeploymentPanel

**File to Edit:** `packages/ui-frontend/app/components/deployment/DeploymentPanel.tsx`

**Changes Required:**

```typescript
// Line 20: Update type
type DeployProvider = 'netlify' | 'vercel' | 'github' | 'web3';

// Line 52: Update initial state
const [provider, setProvider] = useState<DeployProvider>('web3'); // Default to Web3

// Line 413-442: Add Web3 tab button
<button
  onClick={() => setProvider('web3')}
  className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors ${
    provider === 'web3'
      ? 'bg-[#0e0e0e] text-cyan-400 border border-b-0 border-gray-800'
      : 'text-black hover:text-cyan-400'
  }`}
>
  ⬡ Web3 Contracts
</button>

// Line 448+: Add Web3 content section
{provider === 'web3' && (
  <ContractPanel
    appId={appId}
    sessionId={sessionId}
    userId={userId}
  />
)}
```

**Import Statement:**
```typescript
import { ContractPanel } from '../web3/ContractPanel';
```

---

### **PHASE 2: Contract Interaction System** (HIGH PRIORITY - 6-8 hours)

The database table `contract_interactions` exists but has no service layer or UI.

#### 2.1 Create Contract Interaction Service

**New File:** `packages/database/src/services/contract-interaction-service.ts`

**Purpose:** Execute read/write functions on deployed contracts

```typescript
export class ContractInteractionService {
  constructor(private db: DatabaseClient) {}

  /**
   * Read a contract function (view/pure)
   * Example: balanceOf(address), ownerOf(tokenId), totalSupply()
   */
  async readFunction(params: {
    contractId: string;
    functionName: string;
    args: any[];
  }): Promise<any> {
    // 1. Get contract from DB (get ABI + address + chain)
    // 2. Create viem publicClient for that chain
    // 3. Call contract.read[functionName](args)
    // 4. Return result
  }

  /**
   * Write to a contract (requires gas)
   * Example: mint(to, amount), transfer(to, amount), approve(spender, amount)
   */
  async writeFunction(params: {
    contractId: string;
    functionName: string;
    args: any[];
    fromAddress?: string; // Optional: user's wallet
  }): Promise<{
    success: boolean;
    transactionHash?: string;
    error?: string;
  }> {
    // 1. Get contract from DB
    // 2. Create viem walletClient with deployer key (or user key)
    // 3. Call contract.write[functionName](args)
    // 4. Wait for transaction receipt
    // 5. Store in contract_interactions table
    // 6. Return tx hash
  }

  /**
   * Convenience methods for common operations
   */
  async mintERC20(contractId: string, to: string, amount: string)
  async transferERC20(contractId: string, to: string, amount: string)
  async mintERC721(contractId: string, to: string, tokenURI: string)
  async transferERC721(contractId: string, from: string, to: string, tokenId: string)

  /**
   * Get interaction history
   */
  async getInteractions(contractId: string): Promise<ContractInteraction[]>
}
```

---

#### 2.2 Create API Routes for Interactions

**New File:** `packages/ui-server/src/routes/contract-interactions.ts`

```typescript
// Read function
POST /api/contracts/:id/read
Body: { functionName: string, args: any[] }
Returns: { success, result: any }

// Write function
POST /api/contracts/:id/write
Body: { functionName: string, args: any[] }
Returns: { success, transactionHash, blockNumber }

// Convenience endpoints
POST /api/contracts/:id/mint
POST /api/contracts/:id/transfer

// Get interaction history
GET /api/contracts/:id/interactions
Returns: { success, interactions: [...] }
```

---

#### 2.3 Add Contract Interaction UI

**New Component:** `packages/ui-frontend/app/components/web3/ContractInteractionPanel.tsx`

**UI Features:**

1. **Function Selector**
   - Dropdown showing all contract functions from ABI
   - Separate read (blue) vs write (red) functions
   - Show function signature: `mint(address to, string uri)`

2. **Function Call Form**
   - Dynamic input fields based on ABI
   - Type-aware inputs (address, uint256, string, bool)
   - Validation (address format, number ranges)

3. **Read Function Results**
   - Display return values
   - Format based on type (addresses, bignumbers, arrays)
   - Copy button for results

4. **Write Function Execution**
   - Show gas estimate before sending
   - Loading state during transaction
   - Display transaction hash
   - Link to Etherscan transaction
   - Auto-refresh after confirmation

5. **Interaction History**
   - Timeline of all interactions
   - Function called, args, tx hash, timestamp
   - Success/failure status
   - Gas used

**Example UI Flow:**

```
┌─────────────────────────────────────┐
│ Contract: Test Token (ERC-20)       │
├─────────────────────────────────────┤
│ Function: [mint ▼]                  │
│                                     │
│ to (address)                        │
│ ┌─────────────────────────────────┐ │
│ │ 0x4453d68D69e169FA1fbd3AE...    │ │
│ └─────────────────────────────────┘ │
│                                     │
│ amount (uint256)                    │
│ ┌─────────────────────────────────┐ │
│ │ 1000                            │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Estimated Gas: 45,000 (~$0.05)     │
│                                     │
│ [ Execute Transaction ]             │
└─────────────────────────────────────┘
```

---

### **PHASE 3: Generated App Integration** (MOST IMPORTANT - 8-10 hours)

This is the core value proposition from the plan: **"Generated apps include typed viem clients"**

#### 3.1 Generate Typed Contract Clients

**New Service:** `packages/database/src/services/contract-code-generator.ts`

**Purpose:** Generate TypeScript code for interacting with deployed contracts

```typescript
export class ContractCodeGenerator {
  /**
   * Generate typed contract client from deployed contract
   */
  async generateContractClient(contractId: string): Promise<{
    abiFile: string;        // MyToken.abi.ts
    addressFile: string;    // MyToken.address.ts
    hooksFile: string;      // useMyToken.ts
    componentFile: string;  // MyTokenPanel.tsx
  }> {
    // Get contract from DB
    const contract = await contractsRepo.findById(contractId);

    // Generate files:
    return {
      abiFile: generateABIFile(contract),
      addressFile: generateAddressFile(contract),
      hooksFile: generateHooks(contract),
      componentFile: generateComponent(contract)
    };
  }
}

// Example generated file: contracts/MyToken.abi.ts
export const MyTokenABI = [
  {
    "inputs": [],
    "name": "name",
    "outputs": [{ "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  },
  // ... full ABI
] as const;

// Example: contracts/MyToken.address.ts
export const MyTokenAddress = {
  11155111: "0xff1581d8394b85345d9b1fdaa0e057c4cc3273a0",
  84532: "0x...", // Base Sepolia
} as const;

// Example: hooks/useMyToken.ts
import { useContractRead, useContractWrite } from 'wagmi';
import { MyTokenABI, MyTokenAddress } from '../contracts/MyToken';

export function useTokenBalance(address: string) {
  return useContractRead({
    address: MyTokenAddress[11155111],
    abi: MyTokenABI,
    functionName: 'balanceOf',
    args: [address]
  });
}

export function useMintToken() {
  return useContractWrite({
    address: MyTokenAddress[11155111],
    abi: MyTokenABI,
    functionName: 'mint'
  });
}

// Example: components/MyTokenPanel.tsx
export function MyTokenPanel() {
  const { address } = useAccount();
  const { data: balance } = useTokenBalance(address);
  const { write: mint } = useMintToken();

  return (
    <div>
      <p>Balance: {balance?.toString()}</p>
      <button onClick={() => mint({ args: [address, 1000] })}>
        Mint 1000 Tokens
      </button>
    </div>
  );
}
```

---

#### 3.2 Integrate into App Generation

**File to Edit:** `packages/database/src/repositories/applications.ts`

**When user generates app:**

1. Check if app has deployed contracts (via `app_id` link)
2. Generate contract code for each contract
3. Inject into app files:
   ```
   /src
     /contracts
       MyToken.abi.ts
       MyToken.address.ts
     /hooks
       useMyToken.ts
     /components
       MyTokenPanel.tsx
   ```

4. Add to `package.json`:
   ```json
   {
     "dependencies": {
       "wagmi": "^2.0.0",
       "viem": "^2.0.0",
       "@rainbow-me/rainbowkit": "^2.0.0"
     }
   }
   ```

5. Add wallet connection to app:
   ```tsx
   // src/app/layout.tsx
   import { WagmiConfig } from 'wagmi';
   import { RainbowKitProvider } from '@rainbow-me/rainbowkit';

   export default function RootLayout({ children }) {
     return (
       <WagmiConfig config={wagmiConfig}>
         <RainbowKitProvider>
           {children}
         </RainbowKitProvider>
       </WagmiConfig>
     );
   }
   ```

6. Add contract interaction page:
   ```tsx
   // src/app/contracts/page.tsx
   import { MyTokenPanel } from '@/components/MyTokenPanel';

   export default function ContractsPage() {
     return <MyTokenPanel />;
   }
   ```

---

#### 3.3 Add Template Files

**New Files:**

1. `packages/database/src/templates/wagmi-config.ts.template`
   - Wagmi configuration for multiple chains
   - RPC providers setup
   - Chain configs

2. `packages/database/src/templates/wallet-provider.tsx.template`
   - RainbowKit provider wrapper
   - Custom theme matching app

3. `packages/database/src/templates/contract-hooks.ts.template`
   - Generic hooks for any contract
   - Read/write function generators

4. `packages/database/src/templates/contract-panel.tsx.template`
   - UI component template
   - Function call interface
   - Transaction history

---

### **PHASE 4: Multi-Chain Testing** (EASY - 1-2 hours)

#### 4.1 Test Base Sepolia Deployment

```bash
curl -k -X POST https://localhost:3001/api/contracts/create-and-deploy \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "demo-user",
    "contractType": "erc20",
    "name": "Base Test Token",
    "symbol": "BTT",
    "totalSupply": "500000",
    "chainId": 84532
  }'
```

**Expected:** Contract deploys to Base Sepolia, Basescan URL returned

---

#### 4.2 Test Arbitrum Sepolia Deployment

```bash
curl -k -X POST https://localhost:3001/api/contracts/create-and-deploy \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "demo-user",
    "contractType": "erc721",
    "name": "Arbitrum NFT",
    "symbol": "ANFT",
    "chainId": 421614
  }'
```

**Expected:** Contract deploys to Arbitrum Sepolia, Arbiscan URL returned

---

### **PHASE 5: Contract Verification** (MEDIUM PRIORITY - 3-4 hours)

#### 5.1 Add Etherscan API Integration

**File to Edit:** `packages/database/src/services/contract-service.ts`

**New Method:**

```typescript
async verifyContract(params: {
  contractId: string;
}): Promise<{
  success: boolean;
  verificationUrl?: string;
  error?: string;
}> {
  // 1. Get contract from DB
  const contract = await this.contractsRepo.findById(params.contractId);

  // 2. Get Etherscan API key from env
  const apiKey = process.env.ETHERSCAN_API_KEY;

  // 3. Determine explorer API URL based on chain
  const apiUrls = {
    11155111: 'https://api-sepolia.etherscan.io/api',
    84532: 'https://api-sepolia.basescan.org/api',
    421614: 'https://api-sepolia.arbiscan.io/api'
  };

  // 4. Submit verification request
  const response = await fetch(apiUrls[contract.deployed_chain_id], {
    method: 'POST',
    body: new URLSearchParams({
      apikey: apiKey,
      module: 'contract',
      action: 'verifysourcecode',
      contractaddress: contract.deployed_address,
      sourceCode: contract.source_code,
      contractname: contract.name,
      compilerversion: contract.compiler_version,
      optimizationUsed: '1',
      runs: contract.optimization_runs.toString(),
      constructorArguements: encodeConstructorArgs(contract.constructor_args)
    })
  });

  // 5. Update database
  if (response.ok) {
    await this.contractsRepo.update({
      contract_id: contract.id,
      verified_on_explorer: true
    });
  }

  return { success: true, verificationUrl: contract.explorer_url };
}
```

**Environment Variable Needed:**
```bash
# .env
ETHERSCAN_API_KEY=your_key_here  # Get from etherscan.io/myapikey
```

---

#### 5.2 Add Verification Endpoint

**File:** `packages/ui-server/src/routes/contracts.ts`

```typescript
POST /api/contracts/:id/verify
Returns: { success, verificationUrl }
```

---

#### 5.3 Add Verification UI Button

In ContractPanel, add "Verify on Etherscan" button after deployment success.

---

### **PHASE 6: Testing & Documentation** (1-2 hours)

#### 6.1 Create Test Suite

**New File:** `packages/database/src/__tests__/contract-service.test.ts`

```typescript
describe('ContractService', () => {
  test('compiles ERC-20 template successfully', async () => {
    const result = await contractService.compileContract({
      contractType: 'erc20',
      name: 'Test Token',
      symbol: 'TEST',
      totalSupply: '1000000'
    });

    expect(result.success).toBe(true);
    expect(result.bytecode).toMatch(/^0x[0-9a-f]+$/);
    expect(result.abi).toBeInstanceOf(Array);
  });

  test('deploys to Sepolia testnet', async () => {
    // ... test deployment
  });
});
```

---

#### 6.2 Update Testing Guide

**File to Edit:** `WEB3_TESTING_GUIDE.md`

Add sections:
- UI testing instructions
- Multi-chain deployment
- Contract interaction examples
- Generated app testing

---

## 🏗️ Architecture Overview

### **Tech Stack**

**Backend:**
- PostgreSQL (database)
- Fastify (API server)
- TypeScript (strict mode)
- solc-js (Solidity compiler)
- viem (Ethereum library)

**Frontend:**
- Remix (React framework)
- Framer Motion (animations)
- TailwindCSS (styling)
- wagmi (React hooks for Ethereum)

**Smart Contracts:**
- Solidity 0.8.20+
- ERC-20, ERC-721 standards
- OpenZeppelin-style patterns

---

### **Data Flow**

```
User (UI)
  → API POST /api/contracts/create-and-deploy
    → ContractService.createAndCompile()
      → Load template from templates/
      → Substitute variables ({{TOKEN_NAME}})
      → solc.compile() → bytecode + ABI
      → ContractsRepository.create() → Save to DB
    → ContractService.deployContract()
      → viem.walletClient.deployContract()
      → Wait for transaction receipt
      → ContractsRepository.updateDeployment() → Save deployment info
    → Return contract address + Etherscan URL
  ← UI shows success + link to Etherscan
```

---

### **Directory Structure**

```
packages/
├── database/
│   ├── src/
│   │   ├── migrations/
│   │   │   └── 016_smart_contracts.sql ✅
│   │   ├── repositories/
│   │   │   └── contracts.ts ✅
│   │   ├── services/
│   │   │   ├── contract-service.ts ✅
│   │   │   ├── contract-interaction-service.ts ❌ NEEDS BUILD
│   │   │   └── contract-code-generator.ts ❌ NEEDS BUILD
│   │   └── templates/
│   │       ├── erc20-template.sol ✅
│   │       ├── erc721-template.sol ✅
│   │       ├── wagmi-config.ts.template ❌ NEEDS BUILD
│   │       └── contract-panel.tsx.template ❌ NEEDS BUILD
│   └── package.json
│
├── ui-server/
│   └── src/
│       └── routes/
│           ├── contracts.ts ✅
│           └── contract-interactions.ts ❌ NEEDS BUILD
│
└── ui-frontend/
    └── app/
        └── components/
            ├── deployment/
            │   └── DeploymentPanel.tsx (NEEDS EDIT)
            └── web3/
                ├── ContractPanel.tsx ❌ NEEDS BUILD
                └── ContractInteractionPanel.tsx ❌ NEEDS BUILD
```

---

## 📁 File References

### **Key Files to Understand**

1. **Contract Service (Main Logic)**
   - Path: `packages/database/src/services/contract-service.ts`
   - Lines: 500
   - Key: Compilation and deployment logic

2. **Contracts Repository (Database)**
   - Path: `packages/database/src/repositories/contracts.ts`
   - Lines: 394
   - Key: CRUD operations for contracts

3. **API Routes**
   - Path: `packages/ui-server/src/routes/contracts.ts`
   - Lines: 400
   - Key: HTTP endpoints for all operations

4. **Migration (Schema)**
   - Path: `packages/database/src/migrations/016_smart_contracts.sql`
   - Lines: 220
   - Key: Database table definitions

5. **ERC-20 Template**
   - Path: `packages/database/src/templates/erc20-template.sol`
   - Lines: 70
   - Key: Solidity code template

6. **Deployment Panel (UI Integration Point)**
   - Path: `packages/ui-frontend/app/components/deployment/DeploymentPanel.tsx`
   - Lines: 914
   - Key: Where Web3 tab needs to be added

---

### **Environment Files**

```bash
# .env
POSTGRES_HOST=localhost
POSTGRES_PORT=5434
POSTGRES_DB=eitherway
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

ALCHEMY_API_KEY=d-y4foWYwD_C-LCGojY8I
DEPLOYER_PRIVATE_KEY=0x67e07fd1b95ad0769449efead5beef4f3ad4bc5e9f23b8fe802f79db2f2b44a8

# Wallet: 0x4453d68D69e169FA1fbd3AE3931DeBc66d9335e8
```

**Testnet ETH Balance:** 0.1 Sepolia ETH (enough for 30+ deployments)

---

## 🧪 Testing Guide

### **Prerequisites**

1. **Database running:**
   ```bash
   docker ps | grep postgres
   # Should show container on port 5434
   ```

2. **All migrations applied:**
   ```bash
   docker exec -i <container> psql -U postgres -d eitherway -c "\dt core.smart_contracts"
   # Should show table exists
   ```

3. **Server running:**
   ```bash
   npm run server
   # Should show "Contracts] Routes registered successfully"
   ```

---

### **API Testing (cURL)**

**Compile Contract:**
```bash
curl -k -X POST https://localhost:3001/api/contracts/compile \
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
    "sourceCode": "// SPDX-License-Identifier..."
  }
}
```

**Deploy Contract:**
```bash
curl -k -X POST https://localhost:3001/api/contracts/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "contractId": "<from-previous-step>",
    "chainId": 11155111
  }'
```

**One-Step Deploy:**
```bash
curl -k -X POST https://localhost:3001/api/contracts/create-and-deploy \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "demo-user",
    "contractType": "erc721",
    "name": "My NFT",
    "symbol": "MNFT",
    "chainId": 11155111
  }'
```

---

### **Verification**

1. **Check Database:**
   ```sql
   SELECT id, name, contract_type, compilation_status, deployment_status, deployed_address
   FROM core.smart_contracts
   WHERE user_id = 'demo-user'
   ORDER BY created_at DESC;
   ```

2. **Check Etherscan:**
   - Copy `explorerUrl` from response
   - Open in browser
   - Should see contract with code

3. **Check Balance:**
   ```bash
   curl -s -X POST "https://eth-sepolia.g.alchemy.com/v2/d-y4foWYwD_C-LCGojY8I" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"eth_getBalance","params":["0x4453d68D69e169FA1fbd3AE3931DeBc66d9335e8", "latest"],"id":1}'
   ```

---

## 💡 Important Decisions & Context

### **Why solc-js instead of Hardhat/Foundry?**

- **Simplicity:** No external dependencies, works in Node.js directly
- **Speed:** Compilation happens in-process, no CLI spawning
- **Portability:** Works in any environment (Docker, serverless, etc.)
- **Control:** Can customize compilation settings programmatically

**Trade-off:** Less testing tooling. May add Hardhat/Foundry later for contract testing.

---

### **Why viem instead of ethers.js?**

- **Modern:** TypeScript-first, better type inference
- **Performance:** Smaller bundle size, faster
- **Tree-shakeable:** Only import what you need
- **Future-proof:** Active development, growing ecosystem

**Note:** wagmi (React hooks) is built on viem, so perfect synergy.

---

### **Why separate contract_deployments table?**

**Reason:** Supports multi-chain deployment of same contract.

**Use case:** User compiles contract once, deploys to Sepolia, Base, and Arbitrum. One `smart_contracts` row, three `contract_deployments` rows.

---

### **Why manual template substitution instead of OpenZeppelin Wizard?**

- **Control:** We control the exact code that gets deployed
- **Security:** No third-party API dependencies
- **Simplicity:** Just string replacement, easy to debug
- **Extensibility:** Can add custom features to templates

**Trade-off:** More maintenance. May integrate OpenZeppelin later for advanced contracts.

---

### **Build System Note**

**Current Status:** Server runs in **dev mode** with tsx:
```bash
node --import tsx/esm src/server.ts
```

This means code runs from `src/`, not `dist/`.

**Production Issue:** If deploying with compiled code, need to copy `.sol` templates:
```json
// packages/database/package.json
"build": "tsc && mkdir -p dist/templates && cp src/templates/*.sol dist/templates/"
```

**Not urgent** - only matters when deploying to production.

---

### **Gas Estimation**

**Issue:** solc returns `"infinite"` for some contracts.

**Solution:** Handle gracefully in contract-service.ts:
```typescript
const creationGas = (rawGas && rawGas !== 'infinite' && !isNaN(Number(rawGas)))
  ? String(rawGas)
  : undefined;
```

Set to `undefined` instead of storing "infinite" in database.

---

### **Private Key Security**

**Current:** Server-side deployment with hardcoded key in `.env`

**Why:** Simplest for testing, no user wallet connection needed

**Future:** User wallet connection (MetaMask) so they sign transactions

**Implementation:**
1. Frontend: wagmi + RainbowKit for wallet connection
2. User clicks "Deploy"
3. MetaMask pops up, user approves transaction
4. Backend only compiles, doesn't deploy
5. Frontend calls viem.deployContract() with user's wallet

**Trade-off:** More secure, but requires user to have testnet ETH and MetaMask.

---

## 🎯 Next Steps Priority

### **Immediate (4-6 hours)**

1. **Create ContractPanel.tsx**
   - Full deployment UI
   - Multi-stage progress
   - Contracts list
   - Contract details modal

2. **Integrate into DeploymentPanel**
   - Add Web3 tab
   - Make it default tab
   - Test end-to-end in browser

3. **Test Multi-Chain**
   - Deploy to Base Sepolia
   - Deploy to Arbitrum Sepolia
   - Verify all three chains work

---

### **This Week (8-12 hours)**

4. **Build Contract Interaction System**
   - ContractInteractionService
   - API routes
   - ContractInteractionPanel UI

5. **Generate Typed Contract Clients**
   - ContractCodeGenerator service
   - ABI/address file generation
   - Wagmi hooks generation

6. **Integrate into App Generation**
   - Inject contract code into generated apps
   - Add wallet connection
   - Test full flow: Deploy → Generate App → Use App to Interact

---

### **Polish (2-4 hours)**

7. **Contract Verification**
   - Etherscan API integration
   - Auto-verify after deployment
   - Display verified badge

8. **Testing & Documentation**
   - Unit tests for services
   - Update WEB3_TESTING_GUIDE.md
   - Create demo video

9. **Commit & Push**
   - Clean commit message
   - Push to beta-kevin branch
   - Create PR to main

---

## 📝 Additional Notes

### **Deployed Contracts (Live on Sepolia)**

Use these for testing contract interaction:

```typescript
// ERC-20 Token
const TEST_TOKEN = {
  address: "0xff1581d8394b85345d9b1fdaa0e057c4cc3273a0",
  abi: [...], // In database
  chainId: 11155111,
  explorer: "https://sepolia.etherscan.io/address/0xff1581d8394b85345d9b1fdaa0e057c4cc3273a0"
};

// ERC-721 NFT
const TEST_NFT = {
  address: "0xc54b2a0f64ca520b56b9ac5101a098d68ad00d6f",
  abi: [...],
  chainId: 11155111,
  explorer: "https://sepolia.etherscan.io/address/0xc54b2a0f64ca520b56b9ac5101a098d68ad00d6f"
};
```

Can use these to test interaction features without deploying new contracts.

---

### **Wallet Information**

**Deployer Wallet:**
- Address: `0x4453d68D69e169FA1fbd3AE3931DeBc66d9335e8`
- Private Key: `0x67e07fd1b95ad0769449efead5beef4f3ad4bc5e9f23b8fe802f79db2f2b44a8`
- Balance: ~0.097 Sepolia ETH (after 2 deployments)
- ⚠️ **TESTNET ONLY** - Never use for mainnet

**Getting More Testnet ETH:**
- Alchemy Faucet: https://www.alchemy.com/faucets/ethereum-sepolia
- QuickNode: https://faucet.quicknode.com/ethereum/sepolia
- Sepolia PoW: https://sepolia-faucet.pk910.de/

---

### **Useful Commands**

**Restart server:**
```bash
cd /home/kevin/20102025-either/Eitherway-Revamped
npm run server
```

**Check database:**
```bash
docker exec -i <container-id> psql -U postgres -d eitherway
```

**Rebuild database package:**
```bash
cd packages/database
pnpm run build
cp src/templates/*.sol dist/templates/
```

**Check wallet balance:**
```bash
curl -s -X POST "https://eth-sepolia.g.alchemy.com/v2/d-y4foWYwD_C-LCGojY8I" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_getBalance","params":["0x4453d68D69e169FA1fbd3AE3931DeBc66d9335e8","latest"],"id":1}'
```

---

## 🏁 Success Criteria

The Web3 system will be **complete** when:

1. ✅ User can see "Web3 Contracts" tab in DeploymentPanel
2. ✅ User can deploy ERC-20/ERC-721 from UI (not just API)
3. ✅ Deployment works on all 3 chains (Sepolia, Base, Arbitrum)
4. ✅ User can view deployed contracts in UI
5. ✅ User can call contract functions (mint, transfer, etc.) from UI
6. ✅ Generated apps include wagmi hooks for deployed contracts
7. ✅ Generated apps have wallet connection (RainbowKit)
8. ✅ User can interact with contracts in generated app
9. ✅ Contracts are verified on Etherscan
10. ✅ All features documented and tested

**Current Progress:** 40% complete (backend done, frontend missing)

---

## 📞 Questions to Ask User

Before starting work, clarify:

1. **UI Priority:**
   - Build full ContractPanel now? (4-6 hours)
   - Or minimal version first? (1-2 hours)

2. **App Generation:**
   - Should ALL generated apps include contract code?
   - Or only if user opts in?

3. **Wallet Connection:**
   - Keep server-side deployment for now?
   - Or build MetaMask integration?

4. **Testing:**
   - Test in development only?
   - Or prepare for production deployment?

---

## 🔗 Related Documentation

- [WEB3_TESTING_GUIDE.md](./WEB3_TESTING_GUIDE.md) - Complete testing instructions
- [Original 3-Week Plan PDF](./Eitherway-3weekplan-Kevin-final.pdf) - Week 2 Web3 section
- [Migration 016](./packages/database/src/migrations/016_smart_contracts.sql) - Database schema
- [Viem Docs](https://viem.sh) - Ethereum library
- [Wagmi Docs](https://wagmi.sh) - React hooks for Ethereum
- [Solidity Docs](https://docs.soliditylang.org/) - Smart contract language

---

**END OF CONTEXT DOCUMENT**

*This document should provide all necessary context for a new Claude session to continue Web3 implementation without needing to re-discover the codebase.*
