import { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { useAuth } from '../AuthContext';
import './LoginScreen.css';

type AuthStep = 'wallet' | 'password';

export default function LoginScreen() {
  const [step, setStep] = useState<AuthStep>('wallet');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const { login } = useAuth();
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  // Generate today's password in DDMMYYYY format
  const getTodayPassword = () => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    return `${day}${month}${year}`;
  };

  // Move to password step when wallet is connected
  useEffect(() => {
    if (isConnected && address && step === 'wallet') {
      setStep('password');
      setError('');
    }
  }, [isConnected, address, step]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const correctPassword = getTodayPassword();

    if (password === correctPassword) {
      // Login with wallet address as user ID
      if (address) {
        login('wallet', address);
        setError('');
      }
    } else {
      setError('Incorrect password.');
    }
  };

  const handleWalletConnect = (connector: any) => {
    try {
      setError('');
      connect({ connector });
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet');
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setStep('wallet');
    setPassword('');
    setError('');
  };

  return (
    <div className="login-screen">
      <div className="login-container">
        <h1>EitherWay Agent</h1>
        <p className="login-subtitle">Authenticate to continue</p>

        {step === 'wallet' && (
          <>
            <div className="step-indicator">
              <span className="current-step">Step 1 of 2:</span> Connect Wallet
            </div>
            <div className="wallet-section">
              {isConnected && address ? (
                <div className="wallet-connected">
                  <p>Connected</p>
                  <p className="wallet-address">
                    {address.slice(0, 6)}...{address.slice(-4)}
                  </p>
                  <button onClick={handleDisconnect} className="disconnect-button">
                    Disconnect
                  </button>
                </div>
              ) : (
                <div className="wallet-connectors">
                  <p>Connect your wallet to continue</p>
                  {connectors.map((connector) => (
                    <button
                      key={connector.id}
                      onClick={() => handleWalletConnect(connector)}
                      className="wallet-button"
                    >
                      Connect {connector.name}
                    </button>
                  ))}
                </div>
              )}
              {error && <div className="error-message">{error}</div>}
            </div>
          </>
        )}

        {step === 'password' && address && (
          <>
            <div className="step-indicator">
              <span className="current-step">Step 2 of 2:</span> Enter Password
            </div>
            <div className="wallet-connected">
              <p>Wallet Connected</p>
              <p className="wallet-address">
                {address.slice(0, 6)}...{address.slice(-4)}
              </p>
              <button onClick={handleDisconnect} className="disconnect-button">
                Change Wallet
              </button>
            </div>

            <form onSubmit={handlePasswordSubmit} className="login-form">
              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoFocus
                />
              </div>
              {error && <div className="error-message">{error}</div>}
              <button type="submit" className="login-button">
                Complete Login
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
