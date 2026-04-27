'use client';

import { useTheme } from '../lib/theme';

export function DarkGradientBackground() {
  const { theme } = useTheme();

  if (theme === 'light') return null;

  return (
    <>
      <div className="dark-gradient-bg" aria-hidden="true">
        <div className="dark-gradient-overlay" />
      </div>
      <style jsx>{`
        .dark-gradient-bg {
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background: linear-gradient(135deg, #0f0f14 0%, #1a1a22 50%, #15151e 100%);
        }
        .dark-gradient-overlay {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse at 30% 20%, rgba(37, 99, 235, 0.06) 0%, transparent 60%),
            radial-gradient(ellipse at 70% 80%, rgba(139, 92, 246, 0.05) 0%, transparent 60%);
          pointer-events: none;
        }
      `}</style>
    </>
  );
}

export default DarkGradientBackground;
