import React, { useState } from 'react';

export function FaqBlock() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const faqs = [
    {
      question: 'What is Eitherway?',
      answer:
        'Eitherway is an AI-native development platform that turns plain ideas into fully working apps. From mobile and web to browser extensions and Web3 dApps, apps are created and deployed in minutes with a single prompt.',
    },
    {
      question: 'Do I need to know how to code?',
      answer:
        'No. Non-technical users can ship production-ready applications with just prompts. Developers can dive into the code at any time for full customization.',
    },
    {
      question: 'Where can I deploy my apps?',
      answer:
        'Apps built with Eitherway can be published to the App Store, Google Play, Chrome/Firefox extension stores, or deployed as web apps. Web3 apps can be deployed directly to Ethereum or other EVM-compatible networks.',
    },
    {
      question: 'How does Eitherway differ from no-code tools?',
      answer:
        'Traditional no-code platforms limit flexibility and lock you into proprietary builders. Eitherway operates in a real full-stack environment where AI installs packages, manages environments, and executes builds. You always own your code.',
    },
    {
      question: 'What about Web3 support?',
      answer:
        'Eitherway can generate smart contracts, integrate wallets, and deploy dApps with IPFS hosting. It’s designed to handle both Web2 and Web3 outputs in one workflow.',
    },
    {
      question: 'Is Eitherway secure?',
      answer:
        'Yes. Apps are built inside isolated WebContainers that sandbox execution. Dependencies are scanned for vulnerabilities, and store compliance checks are automated before publishing.',
    },
    {
      question: 'How does pricing work?',
      answer:
        'Eitherway will launch with a freemium model: free tier for basic builds, Pro subscriptions for unlimited builds and multi-platform deployments, and Enterprise plans with dedicated AI instances and on-premise options.',
    },
    {
      question: 'Will there be a marketplace?',
      answer:
        'Yes. Eitherway will feature a marketplace for templates, plugins, and UI kits. Developers, designers, and AI specialists can earn revenue by publishing their work, with transactions handled in EITHER tokens or credits.',
    },
    {
      question: 'What is the $EITHER token used for?',
      answer:
        'EITHER is the backbone of the ecosystem. It powers subscriptions, deployment credits, marketplace transactions, governance, and incentives for creators and stakers.',
    },
  ];

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="w-full bg-black py-32 max-w-[1280px] mx-auto">
      <div className="max-w-6xl mx-auto px-6 bg-black">
        <h2 className="text-[56px] font-syne font-medium leading-[67px] tracking-[-0.05em] text-white mb-16 bg-black">
          FAQ
        </h2>

        <div className="bg-black">
          {faqs.map((faq, index) => (
            <div key={index} className="border-b border-white last:border-b-0 bg-black">
              <button
                onClick={() => toggleFAQ(index)}
                className="w-full flex items-start justify-between py-12 gap-12  transition-all duration-200 group bg-black"
              >
                <div className="flex-1 text-left bg-black">
                  <h3 className="text-[32px] max-[768px]:text-[24px] font-syne font-medium leading-[38px] max-[768px]:leading-[28px] tracking-[-0.05em] text-white group-hover:text-white transition-colors duration-200 bg-black">
                    {faq.question}
                  </h3>

                  {openIndex === index && (
                    <div className="bg-black mt-6">
                      <p className="text-[16px] max-[768px]:text-[14px] font-montserrat font-medium leading-[150%] text-white/90 pb-4 bg-black">
                        {faq.answer}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-black">
                  <div className="w-8 h-8 rounded-full  flex items-center justify-center  transition-all duration-200">
                    <svg
                      className={`w-32 h-32 text-white transition-transform duration-300 ease-out ${
                        openIndex === index ? 'rotate-180' : 'rotate-0'
                      }`}
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                    </svg>
                  </div>
                </div>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
