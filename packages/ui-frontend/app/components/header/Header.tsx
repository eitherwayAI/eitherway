import { useStore } from '@nanostores/react';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
import { authStore } from '~/lib/stores/auth';
import { classNames } from '~/utils/classNames';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { useWalletConnection } from '~/lib/web3/hooks';
import { Dialog, DialogRoot } from '~/components/ui/Dialog';
import { DeploymentPanel } from '~/components/deployment/DeploymentPanel';
import { BrandKitPanel } from '~/components/brand-kit/BrandKitPanel';

export function Header() {
  const chat = useStore(chatStore);
  const { connectWallet, isConnected, address, formatAddress, disconnectWallet } = useWalletConnection();
  const isAppReady = useStore(workbenchStore.isAppReadyForDeploy);
  const previews = useStore(workbenchStore.previews);
  const user = useStore(authStore.user);
  const [isBurgerOpen, setIsBurgerOpen] = useState(false);
  const [showDeployPanel, setShowDeployPanel] = useState(false);
  const [showBrandKitPanel, setShowBrandKitPanel] = useState(false);
  const [deployPanelTab, setDeployPanelTab] = useState<'deploy' | 'export' | 'history'>('deploy');

  // Use actual session ID from chat store (fallback to demo for compatibility)
  const sessionId = chat.sessionId || user?.email || 'demo-session';
  const userId = user?.email || 'demo-user';
  const appId = chat.sessionId || 'demo-app-' + Date.now();

  console.log('Header - chat.started:', chat.started);

  // Listen for brand kit upload event from chat clip button
  useEffect(() => {
    const handleOpenBrandKit = () => {
      setShowBrandKitPanel(true);
    };

    window.addEventListener('open-brand-kit', handleOpenBrandKit);
    return () => window.removeEventListener('open-brand-kit', handleOpenBrandKit);
  }, []);

  return (
    <header
      className={classNames(
        'relative flex items-center justify-between bg-eitherway-elements-background-depth-1 p-5 h-[var(--header-height)]',
        {
          'border-transparent': !chat.started,
          'border-eitherway-elements-borderColor': chat.started,
        },
        'justify-end',
      )}
    >
      <div className="flex items-center gap-2 justify-end w-full">
        {chat.started && (
          <ClientOnly>
            {() => (
              <div>
                <HeaderActionButtons />
              </div>
            )}
          </ClientOnly>
        )}

        <div className="hidden min-[900px]:flex">
          <ClientOnly>
            {() => (
              <button
                className="px-6 py-2 rounded-2xl text-sm border bg-eitherway-elements-background-depth-1 text-eitherway-elements-textPrimary border-eitherway-elements-borderColor"
                onClick={isConnected ? disconnectWallet : connectWallet}
              >
                {isConnected && address ? formatAddress(address) : 'CONNECT WALLET'}
              </button>
            )}
          </ClientOnly>
        </div>
        {chat.started && (
          <button
            className="flex bg-black p-2 relative z-[2000]"
            onClick={() => {
              console.log('Burger button clicked!');
              setIsBurgerOpen(!isBurgerOpen);
            }}
          >
            <div className="w-6 h-6 flex items-center bg-black justify-center">
              {isBurgerOpen ? (
                <div className="i-ph:x text-xl text-white" />
              ) : (
                <div className="i-ph:list text-xl text-white" />
              )}
            </div>
          </button>
        )}
      </div>

      <DialogRoot open={isBurgerOpen} onOpenChange={setIsBurgerOpen}>
        <Dialog
          className="!fixed !top-[var(--header-height)] !left-4 !right-4  !translate-x-0 !translate-y-0 !max-w-none !w-auto !max-h-[calc(100vh-var(--header-height))] !overflow-y-auto"
          onBackdrop={() => setIsBurgerOpen(false)}
          noBorder={true}
        >
          <div className="bg-eitherway-elements-background-depth-1 pt-16 border border-eitherway-elements-borderColor rounded-2xl shadow-lg p-6">
            <div className="flex flex-col gap-6">
              <nav className="flex flex-col gap-3">
                <a
                  href="#pricing"
                  className="w-full px-6 py-3 rounded-2xl text-sm font-medium border border-eitherway-elements-borderColor text-center bg-black text-white hover:bg-[#0B00E6] transition-colors"
                  onClick={() => setIsBurgerOpen(false)}
                >
                  Pricing
                </a>
                <a
                  href="http://docs.eitherway.ai"
                  className="w-full px-6 py-3 rounded-2xl text-sm font-medium border border-eitherway-elements-borderColor text-center bg-black text-white hover:bg-[#0B00E6] transition-colors"
                  onClick={() => setIsBurgerOpen(false)}
                >
                  Documentation
                </a>

                <div className="flex flex-col gap-3 min-[900px]:hidden">
                  <ClientOnly>
                    {() => (
                      <button
                        className="w-full px-6 py-3 rounded-2xl text-sm font-medium border bg-eitherway-elements-background-depth-1 text-eitherway-elements-textPrimary border-eitherway-elements-borderColor hover:bg-eitherway-elements-item-backgroundActive transition-colors"
                        onClick={() => {
                          if (isConnected) {
                            disconnectWallet();
                          } else {
                            connectWallet();
                          }

                          setIsBurgerOpen(false);
                        }}
                      >
                        {isConnected && address ? formatAddress(address) : 'CONNECT WALLET'}
                      </button>
                    )}
                  </ClientOnly>
                  <button
                    onClick={() => {
                      setDeployPanelTab('export');
                      setShowDeployPanel(true);
                      setIsBurgerOpen(false);
                    }}
                    className="w-full flex items-center justify-center gap-3 px-6 py-3 rounded-2xl text-sm border bg-black border-eitherway-elements-borderColor text-white hover:bg-eitherway-elements-item-backgroundActive transition-colors"
                  >
                    <img src="/icons/chat/download.svg" alt="Download" className="w-4 h-4" />
                    <span>DOWNLOAD</span>
                  </button>

                  <button
                    onClick={() => {
                      setDeployPanelTab('deploy');
                      setShowDeployPanel(true);
                      setIsBurgerOpen(false);
                    }}
                    className="w-full flex items-center justify-center gap-3 px-6 py-3 rounded-2xl text-sm border bg-eitherway-elements-background-depth-1 border-eitherway-elements-borderColor text-white hover:bg-eitherway-elements-item-backgroundActive transition-colors"
                  >
                    <img src="/icons/chat/deploy.svg" alt="Deploy" className="w-4 h-4" />
                    <span>DEPLOY</span>
                  </button>
                </div>
                <button
                  className="w-full px-6 py-3 rounded-2xl text-sm font-medium bg-[#0D00FF] text-white transition-colors relative overflow-hidden"
                  onClick={() => {
                    connectWallet();
                    setIsBurgerOpen(false);
                  }}
                >
                  <span className="relative z-10">BUY $EITHER</span>
                  <div className="absolute w-10 h-full -left-16 top-0 bg-[#FFFFFF40] skew-x-[-20deg] hover:left-[calc(100%+20px)] transition-all duration-400 ease-out"></div>
                </button>
              </nav>
            </div>
          </div>
        </Dialog>
      </DialogRoot>

      {/* Deployment Panel Modal - Rendered via Portal to document.body */}
      {typeof document !== 'undefined' && showDeployPanel && createPortal(
        <DeploymentPanel
          appId={appId}
          sessionId={sessionId}
          userId={userId}
          initialTab={deployPanelTab}
          onClose={() => setShowDeployPanel(false)}
        />,
        document.body
      )}

      {/* Brand Kit Panel Modal - Rendered via Portal to document.body */}
      {typeof document !== 'undefined' && showBrandKitPanel && createPortal(
        <BrandKitPanel onClose={() => setShowBrandKitPanel(false)} />,
        document.body
      )}
    </header>
  );
}
