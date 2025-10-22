import { useStore } from '@nanostores/react';
import type { LinksFunction } from '@remix-run/node';
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from '@remix-run/react';
import tailwindReset from '@unocss/reset/tailwind-compat.css?url';
import { themeStore } from './lib/stores/theme';
import { stripIndents } from './utils/stripIndent';
import { createHead } from 'remix-island';
import { useEffect } from 'react';
import { Web3Provider } from './lib/web3/Web3Provider';

import reactToastifyStyles from 'react-toastify/dist/ReactToastify.css?url';
import globalStyles from './styles/index.scss?url';
import xtermStyles from '@xterm/xterm/css/xterm.css?url';

import 'virtual:uno.css';

export const links: LinksFunction = () => [
  {
    rel: 'icon',
    href: '/favicon.svg',
    type: 'image/svg+xml',
  },
  { rel: 'stylesheet', href: reactToastifyStyles },
  { rel: 'stylesheet', href: tailwindReset },
  { rel: 'stylesheet', href: globalStyles },
  { rel: 'stylesheet', href: xtermStyles },
  {
    rel: 'preconnect',
    href: 'https://fonts.googleapis.com',
  },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'preload',
    href: 'https://fonts.googleapis.com/css2?family=Righteous&family=Azeret+Mono:wght@300;400;500;600;700&display=block',
    as: 'style',
    onLoad: "this.onload=null;this.rel='stylesheet'",
  },
  {
    rel: 'preload',
    href: 'https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700&display=block',
    as: 'style',
    onLoad: "this.onload=null;this.rel='stylesheet'",
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Righteous&family=Azeret+Mono:wght@300;400;500;600;700&display=block',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700&display=block',
  },
];

const inlineThemeCode = stripIndents`
  setTutorialKitTheme();
  optimizeFontLoading();

  function setTutorialKitTheme() {
    let theme = localStorage.getItem('eitherway_theme');

    if (!theme) {
      theme = 'dark';
    }

    document.querySelector('html')?.setAttribute('data-theme', theme);
  }

  function optimizeFontLoading() {
    // Hide text until fonts are loaded
    document.documentElement.classList.add('fonts-loading');

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        document.documentElement.classList.remove('fonts-loading');
        document.documentElement.classList.add('fonts-loaded');
      });
    } else {
      // Fallback for browsers without Font Loading API
      setTimeout(() => {
        document.documentElement.classList.remove('fonts-loading');
        document.documentElement.classList.add('fonts-loaded');
      }, 1000);
    }
  }
`;

export const Head = createHead(() => (
  <>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta httpEquiv="Cross-Origin-Opener-Policy" content="same-origin" />
    <meta httpEquiv="Cross-Origin-Embedder-Policy" content="credentialless" />

    <Meta />
    <Links />
    <script dangerouslySetInnerHTML={{ __html: inlineThemeCode }} />
  </>
));

export function Layout({ children }: { children: React.ReactNode }) {
  const theme = useStore(themeStore);

  useEffect(() => {
    document.querySelector('html')?.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    import('~/lib/client/preview-helpers.client').catch(() => {});
  }, []);

  return (
    <>
      {children}
      {/* <ScrollRestoration /> */}
      <Scripts />
    </>
  );
}

export default function App() {
  return (
    <Web3Provider>
      <Outlet />
    </Web3Provider>
  );
}
