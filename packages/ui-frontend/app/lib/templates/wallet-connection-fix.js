/**
 * Enhanced Wallet Connection Manager
 * Fixes auto-connect issues and dark mode contrast problems
 */

// Global state to prevent duplicate connection requests
window.walletConnectionState = {
  isConnecting: false,
  isConnected: false,
  account: null,
  pendingRequest: null,
  connectionTimer: null,
};

/**
 * Safely connect wallet with duplicate request prevention
 */
async function connectWalletSafely(buttonElement = null) {
  const state = window.walletConnectionState;

  // Check if already connecting
  if (state.isConnecting) {
    console.warn('Wallet connection already in progress. Please wait...');
    showToast('Connection already in progress. Please wait...', 'warning');
    return null;
  }

  // Check if already connected
  if (state.isConnected && state.account) {
    console.log('Wallet already connected:', state.account);
    showToast(`Already connected: ${state.account.slice(0, 6)}...${state.account.slice(-4)}`, 'info');
    return state.account;
  }

  // Check if MetaMask is installed
  if (typeof window.ethereum === 'undefined') {
    showToast('Please install MetaMask to connect your wallet', 'error');
    window.open('https://metamask.io/download/', '_blank');
    return null;
  }

  try {
    // Set connecting state
    state.isConnecting = true;

    // Update button if provided
    if (buttonElement) {
      buttonElement.disabled = true;
      buttonElement.textContent = 'Connecting...';
      buttonElement.style.opacity = '0.7';
    }

    // Clear any existing pending requests
    if (state.pendingRequest) {
      try {
        state.pendingRequest.abort();
      } catch (e) {
        // Ignore abort errors
      }
      state.pendingRequest = null;
    }

    // Set a timeout for the connection
    const timeoutPromise = new Promise((_, reject) => {
      state.connectionTimer = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 30000); // 30 second timeout
    });

    // Request accounts with timeout
    const accountsPromise = window.ethereum.request({
      method: 'eth_requestAccounts',
    });

    const accounts = await Promise.race([accountsPromise, timeoutPromise]);

    // Clear timeout
    if (state.connectionTimer) {
      clearTimeout(state.connectionTimer);
      state.connectionTimer = null;
    }

    if (accounts && accounts.length > 0) {
      const account = accounts[0];
      state.account = account;
      state.isConnected = true;

      showToast(`Connected: ${account.slice(0, 6)}...${account.slice(-4)}`, 'success');

      // Update button if provided
      if (buttonElement) {
        buttonElement.textContent = `${account.slice(0, 6)}...${account.slice(-4)}`;
        buttonElement.style.backgroundColor = 'var(--color-success, #10b981)';
      }

      // Listen for account changes
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      return account;
    } else {
      throw new Error('No accounts found');
    }
  } catch (error) {
    console.error('Wallet connection error:', error);

    // Clear timeout if still active
    if (state.connectionTimer) {
      clearTimeout(state.connectionTimer);
      state.connectionTimer = null;
    }

    // Handle specific errors
    if (error.code === -32002) {
      showToast('Please check MetaMask - a connection request is already pending', 'warning');
    } else if (error.message === 'Connection timeout') {
      showToast('Connection timeout. Please try again.', 'error');
    } else if (error.code === 4001) {
      showToast('Connection rejected. Please try again when ready.', 'info');
    } else {
      showToast(`Connection failed: ${error.message}`, 'error');
    }

    // Reset button if provided
    if (buttonElement) {
      buttonElement.textContent = 'Connect Wallet';
      buttonElement.style.backgroundColor = '';
    }

    return null;
  } finally {
    // Always reset connecting state
    state.isConnecting = false;

    // Re-enable button
    if (buttonElement) {
      buttonElement.disabled = false;
      buttonElement.style.opacity = '1';
    }
  }
}

/**
 * Disconnect wallet
 */
function disconnectWallet(buttonElement = null) {
  const state = window.walletConnectionState;

  state.isConnected = false;
  state.account = null;
  state.pendingRequest = null;

  // Remove listeners
  if (window.ethereum && window.ethereum.removeListener) {
    window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
    window.ethereum.removeListener('chainChanged', handleChainChanged);
  }

  // Update button if provided
  if (buttonElement) {
    buttonElement.textContent = 'Connect Wallet';
    buttonElement.style.backgroundColor = '';
  }

  showToast('Wallet disconnected', 'info');
}

/**
 * Handle account changes
 */
function handleAccountsChanged(accounts) {
  const state = window.walletConnectionState;

  if (accounts.length === 0) {
    // User disconnected wallet
    disconnectWallet();
  } else if (accounts[0] !== state.account) {
    // User switched accounts
    state.account = accounts[0];
    showToast(`Account changed: ${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`, 'info');

    // Update any connect buttons
    document.querySelectorAll('.wallet-connect-btn').forEach((btn) => {
      if (btn.textContent.includes('0x')) {
        btn.textContent = `${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`;
      }
    });
  }
}

/**
 * Handle chain changes
 */
function handleChainChanged(chainId) {
  // Reload the page as recommended by MetaMask
  window.location.reload();
}

/**
 * Check if wallet is already connected (for page refresh)
 */
async function checkExistingConnection() {
  if (typeof window.ethereum === 'undefined') {
    return null;
  }

  try {
    const accounts = await window.ethereum.request({
      method: 'eth_accounts',
    });

    if (accounts && accounts.length > 0) {
      const state = window.walletConnectionState;
      state.account = accounts[0];
      state.isConnected = true;

      // Update any connect buttons
      document.querySelectorAll('.wallet-connect-btn').forEach((btn) => {
        btn.textContent = `${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`;
        btn.style.backgroundColor = 'var(--color-success, #10b981)';
      });

      // Listen for changes
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      return accounts[0];
    }
  } catch (error) {
    console.error('Error checking existing connection:', error);
  }

  return null;
}

/**
 * Fix wallet button contrast for dark mode
 */
function fixWalletButtonContrast() {
  // Add CSS to ensure wallet buttons are always visible
  if (!document.getElementById('wallet-contrast-fix')) {
    const style = document.createElement('style');
    style.id = 'wallet-contrast-fix';
    style.textContent = `
      /* Fix wallet button contrast in dark mode */
      .wallet-connect-btn,
      button[class*="connect"],
      button[class*="wallet"],
      [class*="connect-wallet"],
      [class*="wallet-connect"],
      [class*="connect-button"] {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
        color: white !important;
        border: none !important;
        padding: 12px 24px !important;
        border-radius: 8px !important;
        font-weight: 600 !important;
        cursor: pointer !important;
        transition: all 0.3s ease !important;
        min-height: 44px !important;
      }

      .wallet-connect-btn:hover:not(:disabled),
      button[class*="connect"]:hover:not(:disabled),
      button[class*="wallet"]:hover:not(:disabled) {
        transform: translateY(-2px) !important;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4) !important;
      }

      .wallet-connect-btn:disabled,
      button[class*="connect"]:disabled,
      button[class*="wallet"]:disabled {
        cursor: not-allowed !important;
        opacity: 0.7 !important;
      }

      /* Ensure text is always white */
      .wallet-connect-btn *,
      button[class*="connect"] *,
      button[class*="wallet"] * {
        color: white !important;
      }

      /* Connected state */
      .wallet-connected,
      button[class*="connect"].connected {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
      }

      /* Dark mode specific overrides */
      [data-theme="dark"] .wallet-connect-btn,
      .dark .wallet-connect-btn,
      html.dark button[class*="connect"],
      html.dark button[class*="wallet"] {
        background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%) !important;
        color: white !important;
        box-shadow: 0 2px 8px rgba(168, 85, 247, 0.3) !important;
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * Enhanced wallet button click handler
 */
function setupWalletButtons() {
  // Find all wallet connect buttons
  const walletButtons = document.querySelectorAll(
    'button[class*="connect"], button[class*="wallet"], .wallet-connect-btn, [onclick*="ethereum"], [onclick*="wallet"]',
  );

  walletButtons.forEach((button) => {
    // Add class for styling
    if (!button.classList.contains('wallet-connect-btn')) {
      button.classList.add('wallet-connect-btn');
    }

    // Remove any existing onclick to prevent auto-connect
    button.onclick = null;
    button.removeAttribute('onclick');

    // Add safe click handler
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const state = window.walletConnectionState;

      if (state.isConnected) {
        // If connected, disconnect
        const confirmDisconnect = confirm('Disconnect wallet?');
        if (confirmDisconnect) {
          disconnectWallet(button);
        }
      } else {
        // Connect wallet
        await connectWalletSafely(button);
      }
    });
  });
}

/**
 * Initialize wallet connection manager
 */
function initializeWalletManager() {
  // Fix contrast first
  fixWalletButtonContrast();

  // Setup wallet buttons
  setupWalletButtons();

  // Check for existing connection (but don't auto-connect)
  checkExistingConnection();

  // Re-setup buttons when DOM changes
  const observer = new MutationObserver(() => {
    setupWalletButtons();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeWalletManager);
} else {
  initializeWalletManager();
}

// Also initialize after a delay to catch any late-loading elements
setTimeout(initializeWalletManager, 1000);

// Export functions for global use
window.walletManager = {
  connect: connectWalletSafely,
  disconnect: disconnectWallet,
  checkConnection: checkExistingConnection,
  getAccount: () => window.walletConnectionState.account,
  isConnected: () => window.walletConnectionState.isConnected,
};

// Helper function for toast notifications (if not already defined)
if (typeof showToast === 'undefined') {
  window.showToast = function (message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);

    // Create simple toast if no toast system exists
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : '#3b82f6'};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      z-index: 10000;
      animation: slideIn 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };
}
