import React, { useEffect } from 'react';
import { motion } from 'motion/react';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 2700); // Wait 2.4s + 300ms fade out, trigger a bit after 2400ms. We will trigger around 2500ms
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      className="fixed inset-0 bg-[#0d0a08] z-50 flex flex-col items-center justify-center overflow-hidden noise-bg"
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ delay: 2.4, duration: 0.3 }}
      onAnimationComplete={() => {
        // We'll rely on the setTimeout to actually unmount or change phase
      }}
    >
      {/* Background Orbs — warmer dusk tones */}
      <div className="absolute top-0 left-0 w-[200px] md:w-[400px] h-[200px] md:h-[400px] rounded-full opacity-[0.04] blur-[100px] md:blur-[200px] translate-x-[-20%] translate-y-[-20%]" style={{ background: '#d97757' }} />
      <div className="absolute bottom-0 right-0 w-[200px] md:w-[400px] h-[200px] md:h-[400px] rounded-full opacity-[0.04] blur-[100px] md:blur-[200px] translate-x-[20%] translate-y-[20%]" style={{ background: '#d4a55a' }} />

      <div className="relative flex flex-col items-center">
        {/* Phase 2: Dot -> Phase 3: Line */}
        <div className="relative flex items-center justify-center h-16 w-[300px]">
          {/* The dusk-terracotta dot / line */}
          <div
            className="absolute h-[2px] rounded-full"
            style={{ background: '#d97757' }}
            style={{
              animation: 'splashDot 0.5s ease 0.4s forwards, splashLine 0.5s ease 0.9s forwards',
              opacity: 0,
              width: '80px', // final width after line animation
            }}
          />
          
          {/* DINGS OS text */}
          <div
            className="absolute flex items-center gap-24"
            style={{
              opacity: 0,
              animation: 'statusIn 0.5s ease 0.9s forwards',
            }}
          >
            <span className="font-orbitron font-bold text-white text-4xl tracking-tighter">DINGS</span>
            <span className="font-orbitron font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#d97757] to-[#d4a55a] text-4xl tracking-tighter">OS</span>
          </div>
        </div>

        {/* Phase 4: Progress Bar */}
        <div className="mt-8 flex flex-col items-center">
          <div 
            className="w-[120px] h-[2px] bg-gray-800 rounded-full overflow-hidden"
            style={{ opacity: 0, animation: 'statusIn 0.3s ease 1.4s forwards' }}
          >
            <div
              className="h-full bg-gradient-to-r from-[#d97757] to-[#d4a55a]"
              style={{ animation: 'splashProgress 0.6s ease-out 1.4s forwards' }}
            />
          </div>
          <div
            className="mt-3 text-[8px] text-gray-600 uppercase tracking-[0.3em]"
            style={{ opacity: 0, animation: 'statusIn 0.3s ease 1.4s forwards' }}
          >
            GATHERING STRENGTH
          </div>
        </div>

        {/* Phase 5: Status lines — warrior-coded, serene framing */}
        <div className="mt-12 flex flex-col items-center gap-2">
          <div className="status-line text-[9px] font-mono text-gray-500" style={{ animationDelay: '1.9s' }}>
            🪶 TRAIL PREPARED
          </div>
          <div className="status-line text-[9px] font-mono text-gray-500" style={{ animationDelay: '2.05s' }}>
            ▸ STRENGTH GATHERED
          </div>
          <div className="status-line text-[9px] font-mono" style={{ animationDelay: '2.2s', color: '#d4a55a' }}>
            ▸ READY
          </div>
        </div>
      </div>
    </motion.div>
  );
};
