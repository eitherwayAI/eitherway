// Web3 Service Template for Vanilla JS
// This template provides real wallet connection functionality

export const web3VanillaTemplate = `
// Web3 Configuration and Wallet Connection Service
// Using Reown AppKit for vanilla JavaScript

class Web3Service {
  constructor() {
    this.appKit = null;
    this.address = null;
    this.chainId = 1;
    this.provider = null;
    this.isDemo = !this.hasRequiredEnvVars();

    if (typeof window.IS_DEMO_MODE !== 'undefined') {
      this.isDemo = window.IS_DEMO_MODE;
    }

    if (this.isDemo) {
      console.log('Running in demo mode - configure .env for live data');
      this.showDemoBanner();
    }

    this.init();
  }

  hasRequiredEnvVars() {
    return window.ENV?.WALLETCONNECT_PROJECT_ID &&
           window.ENV?.WALLETCONNECT_PROJECT_ID !== 'your-project-id-here';
  }

  showDemoBanner() {
    const banner = document.createElement('div');
    banner.className = 'demo-banner';
    banner.innerHTML = \`
      <div style="background: linear-gradient(90deg, #f59e0b, #ef4444); color: white; padding: 12px; text-align: center; position: fixed; top: 0; left: 0; right: 0; z-index: 9999;">
        <strong>Demo Mode</strong> - Configure .env.local with your WalletConnect Project ID for live wallet connections
      </div>
    \`;
    document.body.prepend(banner);
    document.body.style.paddingTop = '48px';
  }

  async init() {
    if (typeof window.createAppKit === 'undefined') {
      await this.loadAppKitFromCDN();
    }

    const projectId = window.ENV?.WALLETCONNECT_PROJECT_ID || 'demo-project-id';
    const chains = this.getChainConfig();

    try {
      this.appKit = window.createAppKit({
        projectId,
        chains,
        metadata: {
          name: document.title || 'Web3 App',
          description: 'Web3 Application with Wallet Connection',
          url: window.location.origin,
          icons: ['/logo.png']
        },
        themeMode: document.documentElement.getAttribute('data-theme') || 'light',
        featuredWalletIds: [
          'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96', // MetaMask
          'e7c4d26541d0c4cc2c67c55e8a56c5e328e5bad5f8e1ca7a92ea9db546b87816', // Coinbase
          '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0'  // Trust
        ]
      });

      this.setupEventListeners();
      await this.checkConnection();
    } catch (error) {
      console.error('Failed to initialize AppKit:', error);
      if (!this.isDemo) {
        alert('Failed to initialize wallet connection. Please check your configuration.');
      }
    }
  }

  async loadAppKitFromCDN() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.type = 'module';
      script.onload = resolve;
      script.onerror = reject;
      script.textContent = \`
        import { createAppKit } from 'https://cdn.jsdelivr.net/npm/@reown/appkit@latest/+esm';
        window.createAppKit = createAppKit;
      \`;
      document.head.appendChild(script);
    });
  }

  getChainConfig() {
    const mainnetRpc = window.ENV?.RPC_URL_MAINNET || 'https://eth.llamarpc.com';
    const polygonRpc = window.ENV?.RPC_URL_POLYGON || 'https://polygon-rpc.com';
    const arbitrumRpc = window.ENV?.RPC_URL_ARBITRUM || 'https://arb1.arbitrum.io/rpc';

    return [
      {
        chainId: 1,
        name: 'Ethereum',
        currency: 'ETH',
        explorerUrl: 'https://etherscan.io',
        rpcUrl: mainnetRpc
      },
      {
        chainId: 137,
        name: 'Polygon',
        currency: 'MATIC',
        explorerUrl: 'https://polygonscan.com',
        rpcUrl: polygonRpc
      },
      {
        chainId: 42161,
        name: 'Arbitrum',
        currency: 'ETH',
        explorerUrl: 'https://arbiscan.io',
        rpcUrl: arbitrumRpc
      }
    ];
  }

  setupEventListeners() {
    if (!this.appKit) return;

    this.appKit.subscribeProvider(state => {
      if (state.isConnected) {
        this.address = state.address;
        this.chainId = state.chainId;
        this.updateUI();
        this.fetchAndDispatchPortfolio();
      } else {
        this.address = null;
        this.updateUI();
      }
    });
  }

  async checkConnection() {
    if (!this.appKit) return;

    const state = await this.appKit.getState();
    if (state.isConnected) {
      this.address = state.address;
      this.chainId = state.chainId;
      this.updateUI();
    }
  }

  async connect() {
    if (this.isDemo && !window.ethereum) {
      alert('Please install MetaMask or another Web3 wallet to connect');
      return;
    }

    if (!this.appKit) {
      console.error('AppKit not initialized');
      return;
    }

    try {
      await this.appKit.open();
    } catch (error) {
      console.error('Failed to open wallet modal:', error);
    }
  }

  async disconnect() {
    if (!this.appKit) return;

    try {
      await this.appKit.disconnect();
      this.address = null;
      this.updateUI();
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  }

  async switchNetwork(chainId) {
    if (!this.appKit) return;

    try {
      await this.appKit.switchNetwork(chainId);
      this.chainId = chainId;
      this.updateUI();
      this.fetchAndDispatchPortfolio();
    } catch (error) {
      console.error('Failed to switch network:', error);
      alert('Failed to switch network. Please try manually in your wallet.');
    }
  }

  async getBalance(address) {
    if (this.isDemo || !address) {
      return this.getDemoBalance();
    }

    try {
      const provider = await this.getProvider();
      const balance = await provider.getBalance(address);
      return this.formatEther(balance);
    } catch (error) {
      console.error('Failed to get balance:', error);
      return this.getDemoBalance();
    }
  }

  getDemoBalance() {
    return (Math.random() * 10).toFixed(4);
  }

  async getProvider() {
    if (!this.provider) {
      this.provider = await this.appKit.getProvider();
    }
    return this.provider;
  }

  formatEther(wei) {
    return (Number(wei) / 1e18).toFixed(4);
  }

  formatAddress(address) {
    if (!address) return '';
    return address.slice(0, 6) + '...' + address.slice(-4);
  }

  updateUI() {
    const connectBtn = document.getElementById('connect-wallet');
    const addressDisplay = document.getElementById('wallet-address');
    const balanceDisplay = document.getElementById('wallet-balance');
    const networkDisplay = document.getElementById('network-name');

    if (connectBtn) {
      if (this.address) {
        connectBtn.textContent = this.formatAddress(this.address);
        connectBtn.classList.add('connected');
      } else {
        connectBtn.textContent = 'Connect Wallet';
        connectBtn.classList.remove('connected');
      }
    }

    if (addressDisplay) {
      addressDisplay.textContent = this.address || 'Not connected';
    }

    if (balanceDisplay && this.address) {
      this.getBalance(this.address).then(balance => {
        balanceDisplay.textContent = balance + ' ETH';
      });
    }

    if (networkDisplay) {
      const chainName = this.getChainName(this.chainId);
      networkDisplay.textContent = chainName;
    }

    document.dispatchEvent(new CustomEvent('walletStateChanged', {
      detail: { address: this.address, chainId: this.chainId }
    }));
  }

  async fetchAndDispatchPortfolio() {
    try {
      if (!this.address || !window.portfolioService?.getPortfolio) return;
      const key = this.address + '-' + this.chainId;
      if (this._lastPortfolioKey === key) return;
      this._lastPortfolioKey = key;

      const portfolio = await window.portfolioService.getPortfolio(this.address, this.chainId);
      window.dispatchEvent(new CustomEvent('portfolio-update', {
        detail: { address: this.address, chainId: this.chainId, portfolio }
      }));
    } catch (err) {
      console.warn('Failed to load portfolio:', err);
    }
  }

  getChainName(chainId) {
    const chains = {
      1: 'Ethereum',
      137: 'Polygon',
      42161: 'Arbitrum',
      10: 'Optimism',
      56: 'BSC',
      43114: 'Avalanche'
    };
    return chains[chainId] || 'Unknown';
  }
}

// Initialize Web3 Service
const web3Service = new Web3Service();

// Export for use in other modules
window.web3Service = web3Service;

// Setup connect button if it exists
document.addEventListener('DOMContentLoaded', () => {
  const connectBtn = document.getElementById('connect-wallet');
  if (connectBtn) {
    connectBtn.addEventListener('click', () => {
      if (web3Service.address) {
        web3Service.disconnect();
      } else {
        web3Service.connect();
      }
    });
  }

  const networkSelector = document.getElementById('network-selector');
  if (networkSelector) {
    networkSelector.addEventListener('change', (e) => {
      const chainId = parseInt(e.target.value);
      web3Service.switchNetwork(chainId);
    });
  }
});
`;
