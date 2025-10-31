import React from 'react';

export function Loader() {
  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-[9999]">
      <div className="text-center">
        <div className="relative w-32 h-32 mx-auto mb-4">
          {/* Circular spinner */}
          <div className="absolute inset-0 border-4 border-white/20 border-t-[#0d00ff] rounded-full animate-spin"></div>
          {/* Logo inside */}
          <div className="absolute inset-0 flex items-center justify-center">
            <img
              src="/logonobg.svg"
              alt="Eitherway"
              className="w-24 h-24"
              style={{
                animation: 'loader-logo 6s ease-in-out infinite',
              }}
            />
          </div>
        </div>
        <p className="text-white text-xl font-syne min-w-[220px] text-center">Loading Eitherway...</p>
      </div>
      <style>{`
        @keyframes loader-logo {
          /* Two smooth pulses before rotation */
          0% {
            transform: scale(1) rotate(0deg);
          }
          10% {
            transform: scale(1.1) rotate(0deg);
          }
          20% {
            transform: scale(1) rotate(0deg);
          }
          30% {
            transform: scale(1.1) rotate(0deg);
          }
          40% {
            transform: scale(1) rotate(0deg);
          }
          /* Rotate to 180deg */
          50% {
            transform: scale(1) rotate(180deg);
          }
          /* Two smooth pulses at 180deg */
          60% {
            transform: scale(1.1) rotate(180deg);
          }
          70% {
            transform: scale(1) rotate(180deg);
          }
          80% {
            transform: scale(1.1) rotate(180deg);
          }
          90% {
            transform: scale(1) rotate(180deg);
          }
          /* Rotate back to 360deg (0deg) for seamless loop */
          100% {
            transform: scale(1) rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
