import { useStore } from '@nanostores/react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
import { authStore } from '~/lib/stores/auth';
import { classNames } from '~/utils/classNames';
import { DeploymentPanel } from '~/components/deployment/DeploymentPanel';
import { BrandKitPanel } from '~/components/brand-kit/BrandKitPanel';

interface HeaderActionButtonsProps {}

export function HeaderActionButtons({}: HeaderActionButtonsProps) {
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const chat = useStore(chatStore);
  const { showChat, sessionId: chatSessionId } = chat;
  const isAppReady = useStore(workbenchStore.isAppReadyForDeploy);
  const previews = useStore(workbenchStore.previews);
  const user = useStore(authStore.user);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  // Panel visibility state
  const [showDeployPanel, setShowDeployPanel] = useState(false);
  const [showBrandKitPanel, setShowBrandKitPanel] = useState(false);
  const [deployPanelTab, setDeployPanelTab] = useState<'deploy' | 'export' | 'history'>('deploy');

  const canHideChat = showWorkbench || !showChat;

  // Get preview URL from first available preview
  const previewUrl = previews[0]?.baseUrl || 'http://localhost:5173';

  // Use actual session ID from chat store (fallback to demo for compatibility)
  const sessionId = chatSessionId || user?.email || 'demo-session';
  const userId = user?.email || 'demo-user';
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

  // Listen for brand kit upload event from chat clip button
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
              setDeployPanelTab('export');
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

        {/* Brand Kit Button */}
        <Button
          className="hidden min-[900px]:flex rounded-2xl px-5! border border-eitherway-elements-borderColor"
          onClick={() => setShowBrandKitPanel(true)}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
          <span className="ml-1.5">BRAND KIT</span>
        </Button>

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

      {typeof document !== 'undefined' && showBrandKitPanel && createPortal(
        <BrandKitPanel onClose={() => setShowBrandKitPanel(false)} />,
        document.body
      )}
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
