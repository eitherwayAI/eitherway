import { useStore } from '@nanostores/react';
import { useEffect, useState } from 'react';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';

interface HeaderActionButtonsProps {}

export function HeaderActionButtons({}: HeaderActionButtonsProps) {
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const { showChat } = useStore(chatStore);
  const isAppReady = useStore(workbenchStore.isAppReadyForDeploy);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  const canHideChat = showWorkbench || !showChat;

  // Відстежуємо розмір екрану
  useEffect(() => {
    const checkScreenSize = () => {
      setIsSmallScreen(window.innerWidth < 1280);
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);

    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  return (
    <div className="flex gap-2">
      <div className="hidden min-[900px]:flex border border-eitherway-elements-borderColor rounded-2xl overflow-hidden">
        <Button disabled={true} className="rounded-l-2xl px-5!">
          <img src="/icons/chat/download.svg" alt="Download" className="opacity-50" />
          <span className="ml-1.5">DOWNLOAD</span>
        </Button>
        <div className="w-[1px] bg-eitherway-elements-borderColor" />
        <Button
          className="rounded-r-2xl px-5!"
          disabled={true}
        >
          <img src="/icons/chat/deploy.svg" alt="Deploy" className="opacity-50" />
          <span className="ml-1.5">DEPLOY</span>
        </Button>
      </div>

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
