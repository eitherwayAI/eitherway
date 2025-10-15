import React, { useState } from 'react';
import { Dialog, DialogRoot } from '~/components/ui/Dialog';
import { useWalletConnection } from '~/lib/web3/hooks';
import styles from './AuthDialog.module.scss';

interface AuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: (message?: string) => void;
  pendingMessage?: string | null;
}

export const AuthDialog: React.FC<AuthDialogProps> = ({ isOpen, onClose, onAuthenticated, pendingMessage }) => {
  const { isConnected, connectWallet } = useWalletConnection();
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isCheckingPassword, setIsCheckingPassword] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        setIsInitializing(false);
      }, 1000);
      return () => clearTimeout(timer);
    }

    return undefined;
  }, [isOpen]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCheckingPassword(true);
    setPasswordError('');

    const today = new Date();
    const todayPassword =
      today.getDate().toString().padStart(2, '0') +
      (today.getMonth() + 1).toString().padStart(2, '0') +
      today.getFullYear().toString();

    if (password === todayPassword) {
      const passwordData = {
        password: todayPassword,
        timestamp: new Date().getTime(),
      };

      localStorage.setItem('daily_password_verified', JSON.stringify(passwordData));
      onAuthenticated(pendingMessage || undefined);
      onClose();
    } else {
      setPasswordError('Invalid code, try again.');
    }

    setIsCheckingPassword(false);
  };

  const handleConnectWallet = async () => {
    onClose(); // close dialog so wallet popup can appear
    await connectWallet();
  };

  const renderContent = () => {
    if (isInitializing) {
      return (
        <div className="p-8 text-center">
          <div className="text-6xl mb-6">⏳</div>
          <h2 className="text-2xl font-bold mb-4 text-white font-syne">Initializing...</h2>
          <p className="text-gray-400 font-montserrat">Please wait while we connect to your wallet.</p>
        </div>
      );
    }

    if (!isConnected) {
      return (
        <div className="flex h-fit">
          {/* Left column - Welcome text and form */}
          <div className="w-1/2 p-8 flex flex-col justify-center">
            <div className="mb-8">
              <h1 className="text-6xl font-medium leading-[130%] tracking-[-0.05em] text-white mb-4 font-syne">
                Welcome
                <br />
                to Eitherway!
              </h1>
              <p className="text-white font-montserrat mb-4">
                Eitherway is currently in <span className="font-bold text-white italic">closed beta</span>.
              </p>
              <p className="text-gray-400 font-montserrat text-sm">
                First, connect your Web3 wallet, then enter your access code.
              </p>
            </div>

            <button
              onClick={handleConnectWallet}
              className={`w-fit bg-[#0D00FF] text-white font-bold py-3 px-12 transition-colors italic rounded-full font-montserrat text-[15px] relative overflow-hidden ${styles['connect-wallet-button']}`}
            >
              <span className="relative z-10">CONNECT WALLET</span>
              <div className={styles['button-overlay']}></div>
            </button>
          </div>

          {/* Right column - Illustration */}
          <div className="w-1/2 p-8 px-13 flex flex-col justify-center items-center rounded-r-lg h-[600px]">
            <img src="/icons/block1/bgauth.svg" />
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-fit">
        {/* Left column - Welcome text and form */}
        <div className="w-1/2 p-8 flex flex-col justify-center">
          <div className="mb-8">
            <h1 className="text-6xl font-medium leading-[130%] tracking-[-0.05em] text-white mb-4 font-syne">
              Welcome
              <br />
              to Eitherway!
            </h1>
            <p className="text-white font-montserrat mb-4">
              Eitherway is currently in <span className="font-bold text-white italic">closed beta</span>.
            </p>
            <p className="text-gray-400 font-montserrat text-sm">
              Wallet connected! Now enter your access code to continue.
            </p>
          </div>
          <div className="mb-6">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter access code"
                className={`w-full px-4 py-3 bg-transparent border rounded-lg text-white placeholder-gray-500 focus:outline-none ${
                  passwordError ? 'border-red-500 focus:border-red-500' : 'border-gray-600 focus:border-blue-500'
                }`}
                disabled={isCheckingPassword}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 bg-transparent hover:text-gray-300 transition-colors"
              >
                <img src="/icons/block1/visibility.svg" alt="Toggle password visibility" />
              </button>
            </div>
            {passwordError && <p className="text-red-500 text-xs font-montserrat mt-2">{passwordError}</p>}
          </div>
          <button
            onClick={handlePasswordSubmit}
            disabled={!password || isCheckingPassword}
            className={`w-fit bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-[16px] font-bold py-3 px-16 italic bg-gray-900 rounded-full font-montserrat relative overflow-hidden ${styles['enter-button']}`}
          >
            <span className="relative z-10">{isCheckingPassword ? 'CHECKING...' : 'ENTER'}</span>
            <div className={styles['button-overlay']}></div>
          </button>
        </div>

        {/* Right column - Illustration */}
        <div className="w-1/2 p-5 px-12 flex flex-col justify-center items-center rounded-r-lg h-[600px]">
          <img src="/icons/block1/bgauth.svg" />
        </div>
      </div>
    );
  };

  return (
    <DialogRoot open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog className="max-w-4xl w-[90vw] bg-black border border-gray-800" noBorder={true} onClose={onClose}>
        {renderContent()}
      </Dialog>
    </DialogRoot>
  );
};
