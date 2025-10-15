import React, { useState } from 'react';

export function PricingBlock() {
  const [copied, setCopied] = useState(false);

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText('inquiries@eitherway.ai');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy email:', err);
    }
  };

  return (
    <div id="pricing" className="w-full h-[512px] bg-[#0D00FF] flex items-center justify-center scroll-mt-32">
      <div className="text-center text-white max-w-[592px] mx-auto px-6">
        <h2 className="min-[600px]:text-[56px] text-[40px] font-bold mb-8 font-syne">Pricing plans</h2>

        <div className="space-y-4 mb-12">
          <p className="text-lg font-montserrat">This section is coming soon.</p>
          <p className="text-lg font-montserrat">
            Eitherway is currently in <span className="font-bold italic">closed beta</span>. For more information,
            please contact us.
          </p>
        </div>

        <div className="flex flex-col items-center gap-4">
          <div
            onClick={handleCopyEmail}
            className="flex cursor-pointer w-[360px]  items-center gap-2 opacity-75 hover:opacity-100 px-12 py-4 border-2 border-dashed border-white rounded-2xl bg-transparent"
          >
            <button
              onClick={handleCopyEmail}
              className="flex items-center group justify-center bg-transparent rounded transition-colors"
            >
              {copied ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  height="24px"
                  viewBox="0 -960 960 960"
                  width="24px"
                  fill="#e3e3e3"
                >
                  <path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z" />
                </svg>
              ) : (
                <svg width="24" height="22" viewBox="0 0 24 25" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <g clipPath="url(#clip0_257_9)">
                    <path d="M16 1.5H2V17.5H4V3.5H16V1.5ZM21 5.5H6V23.5H21V5.5ZM19 21.5H8V7.5H19V21.5Z" fill="white" />
                  </g>
                  <defs>
                    <clipPath id="clip0_257_9">
                      <rect width="24" height="24" fill="white" transform="translate(0 0.5)" />
                    </clipPath>
                  </defs>
                </svg>
              )}
            </button>
            {copied ? (
              <span className="font-syne text-center w-full text-2xl tracking-tighter leading-none font-medium hover:underline cursor-pointer">
                Copied!
              </span>
            ) : (
              <a
                href="mailto:inquiries@eitherway.ai"
                className="font-syne text-2xl tracking-tighter leading-none font-medium hover:underline cursor-pointer"
              >
                inquiries@eitherway.ai
              </a>
            )}
          </div>
          <span className="font-montserrat text-white w-full text-center">click to copy</span>
        </div>
      </div>
    </div>
  );
}
