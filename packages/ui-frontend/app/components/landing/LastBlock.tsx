import React from 'react';
import styles from './LastBlock.module.scss';

export function LastBlock() {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="w-full bg-black py-80">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h2 className="text-[64px] font-syne font-medium leading-[77px] tracking-[-0.05em] text-white mb-6">
          Build today. Launch tomorrow.
        </h2>

        <p className="text-[16px] font-montserrat font-medium leading-[150%] text-white mb-12">
          Your ideas deserve to live in the world. With Eitherway, they can — instantly.
        </p>

        <div className="relative inline-block">
          <div className="absolute -left-9 top-0 w-9 h-14"></div>
          <button
            onClick={scrollToTop}
            className={`relative bg-[#0D00FF] text-white px-12 py-4 rounded-full font-montserrat italic font-extrabold text-[16px] leading-[150%] uppercase transition-colors duration-200 cursor-pointer overflow-hidden ${styles['start-building-button']}`}
          >
            <span className="relative z-10">START BUILDING</span>
            <div className={styles['button-overlay']}></div>
          </button>
        </div>
      </div>
    </div>
  );
}
