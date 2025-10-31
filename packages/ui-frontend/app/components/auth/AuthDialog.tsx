import React, { useEffect } from 'react';
import { Dialog, DialogRoot } from '~/components/ui/Dialog';
import { usePrivyAuth } from '~/lib/privy/hooks';
import styles from './AuthDialog.module.scss';

interface AuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: (message?: string) => void;
  pendingMessage?: string | null;
}

export const AuthDialog: React.FC<AuthDialogProps> = ({ isOpen, onClose, onAuthenticated, pendingMessage }) => {
  const { authenticated, ready, login } = usePrivyAuth();

  // Auto-close dialog and trigger callback when user authenticates
  useEffect(() => {
    if (authenticated && isOpen) {
      onAuthenticated(pendingMessage || undefined);
      onClose();
    }
  }, [authenticated, isOpen, onAuthenticated, onClose, pendingMessage]);

  const handleLogin = async () => {
    try {
      // Open Privy login modal
      // Privy will handle the entire authentication flow (email, wallet, OAuth)
      login();
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  if (!ready) {
    return (
      <DialogRoot open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <Dialog className="max-w-4xl w-[90vw] bg-black border border-gray-800" noBorder={true} onClose={onClose}>
          <div className="p-8 text-center">
            <div className="text-6xl mb-6">⏳</div>
            <h2 className="text-2xl font-bold mb-4 text-white font-syne">Initializing...</h2>
            <p className="text-gray-400 font-montserrat">Setting up authentication...</p>
          </div>
        </Dialog>
      </DialogRoot>
    );
  }

  return (
    <DialogRoot open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog className="max-w-4xl w-[90vw] bg-black border border-gray-800" noBorder={true} onClose={onClose}>
        <div className="flex h-fit">
          {/* Left column - Welcome text and login button */}
          <div className="w-1/2 p-8 flex flex-col justify-center">
            <div className="mb-8">
              <h1 className="text-6xl font-medium leading-[130%] tracking-[-0.05em] text-white mb-4 font-syne">
                Welcome
                <br />
                to Eitherway!
              </h1>
              <p className="text-white font-montserrat mb-4">
                Create powerful applications with AI assistance.
              </p>
              <p className="text-gray-400 font-montserrat text-sm mb-6">
                Sign in with your email, Google account, or Web3 wallet to get started.
              </p>

              {/* Feature highlights */}
              <div className="space-y-3 mb-6">
                <div className="flex items-start gap-3">
                  <div className="text-blue-500 text-xl">✓</div>
                  <div className="text-sm text-gray-300 font-montserrat">
                    <span className="font-semibold">Email & OAuth:</span> Sign in with email or Google
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="text-blue-500 text-xl">✓</div>
                  <div className="text-sm text-gray-300 font-montserrat">
                    <span className="font-semibold">Web3 Wallet:</span> Connect MetaMask or other wallets
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="text-blue-500 text-xl">✓</div>
                  <div className="text-sm text-gray-300 font-montserrat">
                    <span className="font-semibold">Secure:</span> Your credentials are encrypted and protected
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleLogin}
              className={`w-fit bg-[#0D00FF] text-white font-bold py-3 px-12 transition-colors italic rounded-full font-montserrat text-[15px] relative overflow-hidden ${styles['connect-wallet-button']}`}
            >
              <span className="relative z-10">SIGN IN</span>
              <div className={styles['button-overlay']}></div>
            </button>

            <p className="text-xs text-gray-500 font-montserrat mt-4">
              Powered by Privy - Secure authentication for Web2 & Web3
            </p>
          </div>

          {/* Right column - Illustration */}
          <div className="w-1/2 p-8 px-13 flex flex-col justify-center items-center rounded-r-lg h-[600px]">
            <img src="/icons/block1/bgauth.svg" alt="Authentication illustration" />
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
};
