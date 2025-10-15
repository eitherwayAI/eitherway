import React from 'react';

export function Footer() {
  return (
    <div className="w-full bg-black py-8">
      <div className="max-w-6xl mx-auto px-6 flex justify-between items-center">
        <div className="text-white text-sm font-montserrat">Copyright © 2025 Eitherway. All rights reserved.</div>

        <div className="flex items-center gap-4">
          <a href="http://t.me/eitherway_ai" className="p-0">
            <img src="/icons/links/tg.svg" alt="Telegram" className="w-7" />
          </a>
          <a href="http://x.com/eitherwayai" target="_blank" rel="noopener noreferrer">
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
