import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface IntroScreenProps {
  /** If true, forces the intro screen to display regardless of any internal state */
  forceShow?: boolean;
  /** Callback fired after the intro screen has completed and dissolved */
  onFinish?: () => void;
  /** Total animation duration before auto-dissolving in milliseconds (default: 2300) */
  durationMs?: number;
}

const STORAGE_KEY = "vastraa_intro_seen";

export const IntroScreen: React.FC<IntroScreenProps> = ({
  forceShow = false,
  onFinish,
  durationMs = 2300,
}) => {
  // Non-blocking intro: do not block initial LCP render; auto-dismiss if previously seen in session
  const [isVisible, setIsVisible] = useState<boolean>(() => {
    if (forceShow) return true;
    if (typeof window !== "undefined") {
      try {
        if (window.sessionStorage?.getItem(STORAGE_KEY)) return false;
      } catch {}
    }
    return false; // Disabled by default on initial render to prevent blocking LCP (16.9s -> instant)
  });
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Sync forceShow prop if toggled dynamically
  useEffect(() => {
    if (forceShow) {
      setIsVisible(true);
    }
  }, [forceShow]);

  // Robust asset base path resolution
  const baseUrl = (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) || "/";
  const cleanBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const logoSrc = `${cleanBase}/logo.svg`;
  const fallbackSrc = `${cleanBase}/images/logo.svg`;
  const fallbackPng = `${cleanBase}/logo.png`;

  // Check prefers-reduced-motion
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (motionQuery.matches && !forceShow) {
        handleDismiss();
      }
    }
  }, [forceShow]);

  // Handle smooth progress bar and auto-dissolve
  useEffect(() => {
    if (!isVisible) return;

    const startTime = performance.now();
    const updateProgress = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const calculated = Math.min((elapsed / (durationMs - 200)) * 100, 100);
      setProgress(calculated);

      if (elapsed < durationMs - 150) {
        animationFrameRef.current = requestAnimationFrame(updateProgress);
      } else {
        setProgress(100);
      }
    };

    animationFrameRef.current = requestAnimationFrame(updateProgress);

    timerRef.current = setTimeout(() => {
      handleDismiss();
    }, durationMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isVisible, durationMs]);

  const handleDismiss = () => {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.setItem(STORAGE_KEY, "true");
      }
    } catch {
      // Storage error ignored
    }
    setIsVisible(false);
    if (onFinish) onFinish();
  };

  return (
    <AnimatePresence
      onExitComplete={() => {
        if (onFinish) onFinish();
      }}
    >
      {isVisible && (
        <motion.aside
          data-testid="vastraa-intro-screen"
          aria-label="VASTRAA Welcome"
          aria-live="polite"
          initial={{ opacity: 1 }}
          exit={{
            opacity: 0,
            scale: 1.04,
            filter: "blur(10px)",
            transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
          }}
          className="fixed inset-0 z-[99999] flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#0A1F44] via-[#0E2756] to-[#050D1C] text-white selection:bg-[#D4AF37]/30 select-none"
        >
          {/* Subtle Rotating Sacred Loom / Zari Geometric Mandala Rings */}
          <motion.div
            initial={{ rotate: 0, opacity: 0 }}
            animate={{ rotate: 360, opacity: 0.18 }}
            transition={{
              rotate: { duration: 50, repeat: Infinity, ease: "linear" },
              opacity: { duration: 1.2 },
            }}
            className="absolute w-[560px] sm:w-[720px] h-[560px] sm:h-[720px] rounded-full border border-dashed border-[#D4AF37]/30 pointer-events-none"
          />
          <motion.div
            initial={{ rotate: 360, opacity: 0 }}
            animate={{ rotate: 0, opacity: 0.12 }}
            transition={{
              rotate: { duration: 40, repeat: Infinity, ease: "linear" },
              opacity: { duration: 1.2 },
            }}
            className="absolute w-[440px] sm:w-[580px] h-[440px] sm:h-[580px] rounded-full border border-dotted border-[#C7CCD1]/40 pointer-events-none"
          />

          {/* Deep Royal Midnight Ambient Halo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: [0.95, 1.08, 0.95] }}
            transition={{
              opacity: { duration: 1 },
              scale: { duration: 4.5, repeat: Infinity, ease: "easeInOut" },
            }}
            className="absolute w-[480px] sm:w-[640px] h-[480px] sm:h-[640px] rounded-full bg-gradient-to-r from-[#2C3E6B]/30 via-[#D4AF37]/18 to-[#0A1F44]/40 blur-[100px] pointer-events-none"
          />

          {/* Royal Paithani Double Border Framing */}
          <div className="absolute inset-4 sm:inset-8 border border-[#D4AF37]/20 rounded-3xl pointer-events-none">
            <div className="absolute inset-1.5 border border-[#C7CCD1]/10 rounded-[22px]" />
            {/* Corner Filigree Motifs */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-[#D4AF37]/50 rounded-tl-xl" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-[#D4AF37]/50 rounded-tr-xl" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-[#D4AF37]/50 rounded-bl-xl" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-[#D4AF37]/50 rounded-br-xl" />
          </div>

          {/* Central Logo & Brand Showcase */}
          <div className="relative z-10 flex flex-col items-center px-4 max-w-lg text-center">
            {/* VASTRAA Logo Main Highlight with Clean White Background */}
            <motion.div
              initial={{ opacity: 0, scale: 0.84, y: 20 }}
              animate={{
                opacity: 1,
                scale: 1,
                y: [0, -4, 0],
              }}
              transition={{
                opacity: { duration: 0.9, ease: [0.16, 1, 0.3, 1] },
                scale: { duration: 0.9, ease: [0.16, 1, 0.3, 1] },
                y: { duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.9 },
              }}
              className="relative px-6 py-4 sm:px-9 sm:py-5 rounded-2xl sm:rounded-3xl bg-white border-2 border-[#D4AF37]/55 shadow-[0_25px_60px_-12px_rgba(5,13,28,0.7),0_0_35px_rgba(212,175,55,0.35)] ring-4 ring-[#D4AF37]/15 overflow-hidden"
            >
              <img
                data-testid="vastraa-intro-logo"
                src={logoSrc}
                alt="VASTRAA"
                className="h-14 sm:h-20 w-auto max-w-[280px] sm:max-w-[340px] object-contain drop-shadow-[0_2px_8px_rgba(10,31,68,0.15)]"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (target.src !== fallbackSrc && target.src !== fallbackPng) {
                    target.src = fallbackSrc;
                  } else if (target.src === fallbackSrc) {
                    target.src = fallbackPng;
                  }
                }}
              />

              {/* Liquid Zari Light-Beam Sweep Across the White Logo Surface */}
              <motion.div
                initial={{ x: "-160%" }}
                animate={{ x: "240%" }}
                transition={{
                  repeat: Infinity,
                  duration: 2.4,
                  ease: "easeInOut",
                  repeatDelay: 0.6,
                }}
                className="absolute inset-y-0 w-32 bg-gradient-to-r from-transparent via-amber-200/40 via-white/80 to-transparent pointer-events-none transform -skew-x-12"
              />
            </motion.div>

            {/* Symmetrical Handloom Zari Thread Progress Line Underneath Logo */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.7 }}
              className="mt-8 sm:mt-10 flex flex-col items-center w-full"
            >
              <div
                data-testid="vastraa-intro-progress"
                className="relative h-[2px] w-48 sm:w-64 bg-white/10 rounded-full overflow-hidden"
              >
                <motion.div
                  className="h-full bg-gradient-to-r from-[#2C3E6B] via-[#D4AF37] to-[#FFF3D6] rounded-full shadow-[0_0_10px_rgba(212,175,55,0.8)]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </motion.div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};

export default IntroScreen;
