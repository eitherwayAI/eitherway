import { usePrivyAuth } from '~/lib/privy/hooks';
import { useState, useEffect } from 'react';
import { Menu } from '~/components/sidebar/Menu.client';
import { ClientOnly } from 'remix-utils/client-only';
import { useStore } from '@nanostores/react';
import { chatStore } from '~/lib/stores/chat';
import styles from './Landing.module.scss';

function HeaderContent() {
  const { authenticated, login, logout, getDisplayName, ready } = usePrivyAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const chatState = useStore(chatStore);
  const chatStarted = chatState?.started || false;

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const handleAuthClick = () => {
    if (authenticated) {
      logout();
    } else {
      login();
    }
  };

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 1024 && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, [isMobileMenuOpen]);

  return (
    <div className={`${styles['landing-header']} ${chatStarted ? styles['chat-mode'] : ''}`}>
      <div className={styles['header-container']}>
        <div className={styles.navbar}>
          {!chatStarted && (
            <div className={styles['right-side']}>
              <nav className={styles['navbar-links']}>
                <a href="#pricing" className={styles['navbar-link']}>
                  Pricing
                </a>
                <a
                  href="http://docs.eitherway.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles['navbar-link']}
                >
                  Documentation
                </a>
                {authenticated ? (
                  <button onClick={handleAuthClick} className={styles['navbar-link']}>
                    {getDisplayName()}
                  </button>
                ) : (
                  <button onClick={handleAuthClick} className={styles['navbar-link']}>
                    Sign In
                  </button>
                )}
              </nav>

              <button className={styles['primary-button']} onClick={login}>
                <span className={styles['button-text']}>BUY $EITHER</span>
                <div className={styles['button-overlay']}></div>
              </button>
            </div>
          )}

          <button className={styles['burger-menu']} onClick={toggleMobileMenu}>
            <div className={styles['burger-line']}></div>
            <div className={styles['burger-line']}></div>
            <div className={styles['burger-line']}></div>
          </button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className={styles['mobile-menu']}>
          <nav className={styles['mobile-nav']}>
            <a href="#pricing" className={styles['mobile-nav-item']}>
              Pricing
            </a>
            <a
              href="http://docs.eitherway.ai"
              target="_blank"
              rel="noopener noreferrer"
              className={styles['mobile-nav-item']}
            >
              Documentation
            </a>
            {authenticated ? (
              <button onClick={handleAuthClick} className={styles['mobile-nav-item']}>
                {getDisplayName()} (Sign Out)
              </button>
            ) : (
              <button onClick={handleAuthClick} className={styles['mobile-nav-item']}>
                Sign In
              </button>
            )}
          </nav>
          <div className={styles['mobile-wallet-section']}>
            <button className={styles['mobile-buy-button']} onClick={login}>
              BUY $EITHER
              <div className={styles['button-overlay']}></div>
            </button>
          </div>
        </div>
      )}

      <ClientOnly>{() => <Menu />}</ClientOnly>
    </div>
  );
}

function StaticHeader() {
  return (
    <div className={styles['landing-header']}>
      <div className={styles['header-container']}>
        <div className={styles.navbar}>
          <div className={styles['right-side']}>
            <nav className={styles['navbar-links']}>
              <a href="#pricing" className={styles['navbar-link']}>
                Pricing
              </a>
              <a
                href="http://docs.eitherway.ai"
                target="_blank"
                rel="noopener noreferrer"
                className={styles['navbar-link']}
              >
                Documentation
              </a>
            </nav>

            <button className={styles['primary-button']}>
              <span className={styles['button-text']}>BUY $EITHER</span>
              <div className={styles['button-overlay']}></div>
            </button>
          </div>

          <button className={styles['burger-menu']}>
            <div className={styles['burger-line']}></div>
            <div className={styles['burger-line']}></div>
            <div className={styles['burger-line']}></div>
          </button>
        </div>
      </div>
    </div>
  );
}

export function Header() {
  useEffect(() => {
    const staticHeader = document.querySelector('.static-header') as HTMLElement;
    const interactiveHeader = document.querySelector('.interactive-header') as HTMLElement;

    if (staticHeader && interactiveHeader) {
      setTimeout(() => {
        staticHeader.style.display = 'none';
        interactiveHeader.style.display = 'block';
      }, 100);
    }
  }, []);

  return (
    <>
      <div className="static-header">
        <StaticHeader />
      </div>
      <div className="interactive-header" style={{ display: 'none' }}>
        <ClientOnly>{() => <HeaderContent />}</ClientOnly>
      </div>
    </>
  );
}
