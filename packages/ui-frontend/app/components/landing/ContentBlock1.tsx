import React from 'react';

export function ContentBlock1() {
  return (
    <div className="w-full max-w-[1280px] mx-auto px-6 py-20 bg-black">
      <div className="space-y-16">
        {/* Ready in Minutes */}
        <div className="flex items-center justify-between gap-6 max-[768px]:flex-col max-[768px]:gap-8 box-border py-24 px-12 w-full  h-[336px] max-[768px]:h-auto max-[768px]:py-12 bg-white/5 border border-white/15 rounded-2xl mx-auto">
          <div className="flex flex-col items-start gap-6 flex-1 max-[768px]:order-2">
            <h2 className="text-white font-syne font-medium text-4xl leading-tight tracking-[-0.05em]">
              Ready in Minutes
            </h2>
            <p className="text-white font-montserrat font-medium text-base leading-[150%]">
              Why wait weeks for developers? With Eitherway, your app is generated in just minutes — complete with
              backend, flows, and polished UI.
            </p>
          </div>
          <div className="flex justify-center w-80 h-80 flex-shrink-0 max-[768px]:order-1 max-[768px]:w-64 max-[768px]:h-64">
            <img src="/icons/block1/readyInMinutes.svg" alt="Ready in Minutes" className="w-full h-full" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-6 max-[768px]:flex-col max-[768px]:gap-8 box-border py-24 px-12 w-full h-[336px] max-[768px]:h-auto max-[768px]:py-12 bg-white/5 border border-white/15 rounded-2xl mx-auto">
          <div className="flex justify-center w-80 h-80 flex-shrink-0 max-[768px]:order-1 max-[768px]:w-64 max-[768px]:h-64">
            <img src="/icons/block1/noCodeJustAi.svg" alt="No Code, Just AI" className="w-full h-full" />
          </div>
          <div className="flex flex-col items-start gap-6 flex-1 max-[768px]:order-2">
            <h2 className="text-white font-syne font-medium text-4xl leading-tight tracking-[-0.05em]">
              No Code, Just AI
            </h2>
            <p className="text-white font-montserrat font-medium text-base leading-[150%]">
              Type your idea, and watch our AI write production-grade code live. No coding background required — you
              focus on vision, we handle execution.
            </p>
          </div>
        </div>

        {/* Built for Web3 & Beyond */}
        <div className="flex items-center justify-between gap-6 max-[768px]:flex-col max-[768px]:gap-8 box-border py-24 px-12 w-full h-[336px] max-[768px]:h-auto max-[768px]:py-12 bg-white/5 border border-white/15 rounded-2xl mx-auto">
          <div className="flex flex-col items-start gap-6 flex-1 max-[768px]:order-2">
            <h2 className="text-white font-syne font-medium text-4xl leading-tight tracking-[-0.05em]">
              Built for Web3 & Beyond
            </h2>
            <p className="text-white font-montserrat font-medium text-base leading-[150%]">
              From Web2 apps to complex dApps, Eitherway can generate smart contracts, wallets, and tokenized features —
              making your apps Web3-ready by default.
            </p>
          </div>
          <div className="flex justify-center w-80 h-80 flex-shrink-0 max-[768px]:order-1 max-[768px]:w-64 max-[768px]:h-64">
            <img src="/icons/block1/builtForWeb3&Beyond.svg" alt="Built for Web3 & Beyond" className="w-full h-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
