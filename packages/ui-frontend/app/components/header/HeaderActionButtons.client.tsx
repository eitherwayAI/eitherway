import { useStore } from '@nanostores/react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
import { authStore } from '~/lib/stores/auth';
import { classNames } from '~/utils/classNames';
import { DeploymentPanel } from '~/components/deployment/DeploymentPanel';
import { BrandKitPanel } from '~/components/brand-kit/BrandKitPanel';
import { useWalletConnection } from '~/lib/web3/hooks';

interface HeaderActionButtonsProps {}

export function HeaderActionButtons({}: HeaderActionButtonsProps) {
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const chat = useStore(chatStore);
  const { showChat, sessionId: chatSessionId } = chat;
  const isAppReady = useStore(workbenchStore.isAppReadyForDeploy);
  const previews = useStore(workbenchStore.previews);
  const user = useStore(authStore.user);
  const { isConnected, address } = useWalletConnection();
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  // Panel visibility state
  const [showDeployPanel, setShowDeployPanel] = useState(false);
  const [showBrandKitPanel, setShowBrandKitPanel] = useState(false);
  const [deployPanelTab, setDeployPanelTab] = useState<'deploy' | 'download'>('deploy');

  const canHideChat = showWorkbench || !showChat;

  const previewUrl = previews[0]?.baseUrl || 'http://localhost:5173';

  // Use wallet address as primary identifier (email auth is mostly mock)
  const userId = (isConnected && address ? address : user?.email) || null;
  const sessionId = chatSessionId || userId || 'demo-session';
  const appId = chatSessionId || 'demo-app-' + Date.now();

  // Відстежуємо розмір екрану
  useEffect(() => {
    const checkScreenSize = () => {
      setIsSmallScreen(window.innerWidth < 1280);
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);

    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Listen for brand kit modal open event from chat paperclip button
  useEffect(() => {
    const handleOpenBrandKit = () => {
      setShowBrandKitPanel(true);
    };

    window.addEventListener('open-brand-kit', handleOpenBrandKit);
    return () => window.removeEventListener('open-brand-kit', handleOpenBrandKit);
  }, []);

  return (
    <>
      {/* Button Groups - Wrapped in parent container */}
      <div className="flex gap-2">
        <div className="hidden min-[900px]:flex border border-eitherway-elements-borderColor rounded-2xl overflow-hidden">
          <Button
            className="rounded-l-2xl px-5!"
            onClick={() => {
              setDeployPanelTab('download');
              setShowDeployPanel(true);
            }}
          >
            <img src="/icons/chat/download.svg" alt="Download" />
            <span className="ml-1.5">DOWNLOAD</span>
          </Button>
          <div className="w-[1px] bg-eitherway-elements-borderColor" />
          <Button
            className="rounded-r-2xl px-5!"
            onClick={() => {
              setDeployPanelTab('deploy');
              setShowDeployPanel(true);
            }}
          >
            <img src="/icons/chat/deploy.svg" alt="Deploy" />
            <span className="ml-1.5">DEPLOY</span>
          </Button>
        </div>

        {/* Chat/Workbench Toggle */}
        <div className="flex border border-eitherway-elements-borderColor rounded-md overflow-hidden">
          <Button
            active={showChat}
            disabled={!canHideChat}
            className="rounded-l-md"
            onClick={() => {
              if (canHideChat) {
                if (isSmallScreen && !showChat) {
                  // На малих екранах ховаємо workbench при показі чату
                  workbenchStore.showWorkbench.set(false);
                }

                chatStore.setKey('showChat', !showChat);
              }
            }}
          >
            <div className="i-eitherway:chat h-3.5 w-3.5" />
          </Button>
          <div className="w-[1px] bg-eitherway-elements-borderColor" />
          <Button
            active={showWorkbench}
            className="i-rounded-r-md"
            onClick={() => {
              if (showWorkbench && !showChat) {
                chatStore.setKey('showChat', true);
              }

              if (isSmallScreen && !showWorkbench) {
                // На малих екранах ховаємо чат при показі workbench
                chatStore.setKey('showChat', false);
              }

              workbenchStore.showWorkbench.set(!showWorkbench);
            }}
          >
            <div className="i-ph:code-bold" />
          </Button>
        </div>
      </div>

      {/* Modals - Rendered via Portal to document.body */}
      {typeof document !== 'undefined' &&
        showDeployPanel &&
        createPortal(
          <DeploymentPanel
            appId={appId}
            sessionId={sessionId}
            userId={userId}
            initialTab={deployPanelTab}
            onClose={() => setShowDeployPanel(false)}
          />,
          document.body,
        )}

      {typeof document !== 'undefined' &&
        showBrandKitPanel &&
        createPortal(<BrandKitPanel onClose={() => setShowBrandKitPanel(false)} />, document.body)}
    </>
  );
}

interface ButtonProps {
  active?: boolean;
  disabled?: boolean;
  children?: any;
  className?: string;
  onClick?: VoidFunction;
}

function Button({ active = false, disabled = false, children, className, onClick }: ButtonProps) {
  return (
    <button
      className={classNames('flex items-center p-1.5', className, {
        'bg-black hover:bg-eitherway-elements-item-backgroundActive text-eitherway-elements-textTertiary hover:text-eitherway-elements-textPrimary':
          !active && !disabled,
        'bg-black text-eitherway-elements-item-contentAccent': active && !disabled,
        'bg-black text-alpha-gray-20 dark:text-alpha-white-20 cursor-not-allowed': disabled,
      })}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
    >
      {children}
    </button>
  );
}
