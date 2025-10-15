import { useState, useEffect, useRef } from 'react';
import { chatStore } from '~/lib/stores/chat';
import { Header as LandingHeader } from '~/components/landing/Header';
import { Header as ChatHeader } from '~/components/header/Header';
import { Loader } from '~/components/ui/Loader';
import { createPortal } from 'react-dom';
import { toggleSidebar } from '~/lib/stores/sidebar';
import styles from '~/components/landing/Landing.module.scss';

interface HeaderWithGlowProps {
  children: React.ReactNode;
}

// Компонент для лого та кнопки сайдбару через Portal
function HeaderLogoAndSidebar() {
  if (typeof window === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="fixed top-13 min-[450px]:top-12 left-7 z-max flex items-center gap-8">
      <img src="/icons/chat/sidebar.svg" alt="Sidebar" className="w-6 h-6 cursor-pointer" onClick={toggleSidebar} />
      <a href="/chat" className="flex items-center">
        <img src="/icons/logo.svg" alt="Eitherway Logo" className="h-8 w-auto max-[450px]:h-6" />
      </a>
    </div>,
    document.body,
  );
}

export function HeaderWithGlow({ children }: HeaderWithGlowProps) {
  const [chatStarted, setChatStarted] = useState(false);
  const [glowPosition, setGlowPosition] = useState('200vh');
  const [isGlowVisible, setIsGlowVisible] = useState(false);
  const [isGlowAnimatingOut, setIsGlowAnimatingOut] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = chatStore.subscribe((value) => {
      console.log('HeaderWithGlow - chatStore changed:', value);
      setChatStarted(value.started);

      if (value.started && isGlowVisible) {
        console.log('Starting glow animation out...');
        setIsGlowAnimatingOut(true);
        setTimeout(() => {
          console.log('Glow animation completed, hiding element');
          setIsGlowVisible(false);
          setIsGlowAnimatingOut(false);
        }, 2000);
      }
    });

    // Приховуємо лоадер через 1 секунду
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1000);

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [isGlowVisible]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const updateGlowPosition = () => {
      if (chatStarted) {
        return;
      }

      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const authContainer = document.querySelector('#auth-chat');

        if (authContainer && glowRef.current) {
          const authRect = authContainer.getBoundingClientRect();

          if (authRect.width > 0 && authRect.height > 0) {
            const authTop = (authContainer as HTMLElement).offsetTop;
            const glowTop = authTop + 48;
            console.log('authTop', authTop, 'glowTop', glowTop);

            setGlowPosition(`${glowTop}px`);

            if (!isGlowVisible) {
              setTimeout(() => {
                setIsGlowVisible(true);
              }, 50);
            }
          }
        }
      }, 100);
    };

    updateGlowPosition();

    window.addEventListener('resize', updateGlowPosition);
    window.addEventListener('scroll', updateGlowPosition);

    const observer = new MutationObserver((mutations) => {
      const hasRelevantChanges = mutations.some((mutation) => {
        if (mutation.type === 'childList') {
          const addedNodes = Array.from(mutation.addedNodes);
          const removedNodes = Array.from(mutation.removedNodes);

          return [...addedNodes, ...removedNodes].some(
            (node) =>
              node.nodeType === Node.ELEMENT_NODE &&
              ((node as Element).id === 'auth-chat' || (node as Element).querySelector?.('#auth-chat')),
          );
        }

        return false;
      });

      if (hasRelevantChanges) {
        updateGlowPosition();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false,
    });

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateGlowPosition);
      window.removeEventListener('scroll', updateGlowPosition);
      observer.disconnect();
    };
  }, [chatStarted, isGlowVisible]);

  if (isLoading) {
    return <Loader />;
  }

  return (
    <div className={styles.landing}>
      <HeaderLogoAndSidebar />

      {/* Landing Header */}
      <div
        className={`fixed top-0 left-0 w-full z-[5] transition-opacity duration-500 ease-in-out ${
          chatStarted ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'
        }`}
      >
        <LandingHeader />
      </div>

      {/* Chat Header */}
      <div
        className={`fixed top-0 left-0 w-full z-[5] transition-all duration-500 ease-in-out ${
          chatStarted
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-full pointer-events-none'
        }`}
      >
        <ChatHeader />
      </div>

      <div className={`flex-1 flex flex-col relative ${chatStarted ? 'mt-[128px]' : 'mt-[128px]'}`}>
        <div
          className={`absolute top-0 left-0 w-screen h-[calc(100vh-128px)] overflow-hidden z-1 pointer-events-none transition-all duration-[2s] ease-in-out ${
            isGlowAnimatingOut ? 'opacity-0 scale-105' : isGlowVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-100'
          }`}
          style={{
            background:
              'radial-gradient(200% 70% at center 70%, rgb(13, 0, 255) 0%, rgba(13, 0, 255, 0.8) 10%, rgba(13, 0, 255, 0.6) 20%, rgba(13, 0, 255, 0.4) 35%, rgba(13, 0, 255, 0.2) 50%, transparent 70%)',
          }}
        >
          <div
            ref={glowRef}
            className={`absolute left-1/2 -translate-x-1/2 w-[200%] h-[200%] border-[16px] border-white rounded-[50%] bg-black z-[10] pointer-events-none max-[1023px]:w-[500%] max-[1023px]:h-[250%] transition-all duration-[2s] ease-in-out ${
              isGlowAnimatingOut
                ? 'translate-y-[-120vh] scale-80 opacity-0'
                : isGlowVisible
                  ? 'translate-y-0 scale-100 opacity-100'
                  : 'translate-y-full scale-100 opacity-0'
            }`}
            style={{ top: glowPosition }}
          ></div>
        </div>
        {children}
      </div>
    </div>
  );
}
