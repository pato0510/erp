'use client';

import { useEffect, useState } from 'react';

const fallbackTokens = {
  textSecondary: 'var(--text-secondary)',
  border: 'var(--border-color)',
  cardSolid: 'var(--bg-card-solid)',
  textPrimary: 'var(--text-primary)',
};

/** Resolved colors for chart libraries; CSS variables remain the SSR fallback. */
export function useThemeTokens() {
  const [tokens, setTokens] = useState(fallbackTokens);

  useEffect(() => {
    const root = document.documentElement;
    const readTokens = () => {
      const style = getComputedStyle(root);
      const next = {
        textSecondary: style.getPropertyValue('--text-secondary').trim(),
        border: style.getPropertyValue('--border-color').trim(),
        cardSolid: style.getPropertyValue('--bg-card-solid').trim(),
        textPrimary: style.getPropertyValue('--text-primary').trim(),
      };
      setTokens((previous) =>
        Object.keys(next).every(
          (key) => next[key as keyof typeof next] === previous[key as keyof typeof next],
        )
          ? previous
          : next,
      );
    };
    readTokens();
    const observer = new MutationObserver(readTokens);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return tokens;
}
