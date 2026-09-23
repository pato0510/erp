'use client';

/* AUTH-002 — the shared "sw-*" stage of the (auth) pages (/login, /cambiar-clave): topbar
 * and bottombar, stage, card, fields, submit and the `›` log line. Moved VERBATIM out of the
 * login page's <style jsx global> so both pages render the same rules; the UI-004 styled-jsx
 * registry still flushes them into the server HTML. The backdrop itself is SpaceBackdrop
 * (HUB-006), not these rules. */
export function AuthStageStyles() {
  return (
    <>
      <style jsx global>{`
        .sw-root {
          --ink: #eef1f7;
          --ink-dim: rgba(238, 241, 247, 0.62);
          --ink-faint: rgba(238, 241, 247, 0.36);
          --accent: oklch(0.82 0.12 220);
          --field-bg: rgba(255, 255, 255, 0.1);
          --line: rgba(238, 241, 247, 0.12);

          position: fixed;
          inset: 0;
          color: var(--ink);
          font-family: var(--font-space-grotesk), var(--font-outfit), sans-serif;
          /* HUB-006 — transparent over the shared SpaceBackdrop (global.css). */
          overflow: hidden;
        }
        .sw-topbar,
        .sw-bottombar {
          position: fixed;
          left: 0;
          right: 0;
          padding: 30px 40px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: var(--ink-faint);
          font-family: var(--font-ibm-plex-mono), var(--font-jetbrains-mono), monospace;
          font-weight: 400;
          text-transform: uppercase;
          letter-spacing: 0.22em;
          z-index: 3;
        }
        .sw-topbar {
          top: 0;
          font-size: 11px;
        }
        .sw-bottombar {
          bottom: 0;
          font-size: 10px;
        }
        .sw-topbar__right {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .sw-theme-toggle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          background: transparent;
          border: 1px solid rgba(238, 241, 247, 0.18);
          color: var(--ink-faint);
          border-radius: 4px;
          cursor: pointer;
          transition:
            color 150ms ease,
            border-color 150ms ease,
            background-color 150ms ease;
        }
        .sw-theme-toggle:hover {
          color: var(--ink);
          border-color: rgba(238, 241, 247, 0.45);
          background: rgba(255, 255, 255, 0.06);
        }
        .sw-stage {
          position: relative;
          z-index: 2;
          height: 100vh;
          width: 100vw;
          display: grid;
          place-items: center;
          padding: 80px 24px;
        }
        @keyframes sw-rise {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .sw-card {
          width: min(440px, 100%);
          background: transparent;
          border: none;
          animation: sw-rise 450ms ease-out both;
        }
        .sw-logo {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-bottom: 18px;
        }
        .sw-tagline {
          font-family: var(--font-space-grotesk), sans-serif;
          font-weight: 300;
          font-size: 13px;
          color: var(--ink-dim);
          margin-bottom: 30px;
          letter-spacing: 0.01em;
          text-align: center;
        }
        .sw-tagline__strong {
          font-weight: 500;
          color: var(--ink);
        }
        .sw-auth-indicator {
          display: flex;
          align-items: center;
          gap: 10px;
          font-family: var(--font-ibm-plex-mono), monospace;
          font-size: 11.5px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--ink-dim);
          margin-bottom: 20px;
        }
        @keyframes sw-pulse-dot {
          0%,
          100% {
            opacity: 0.45;
            box-shadow: 0 0 0 0 rgba(120, 200, 255, 0.55);
          }
          50% {
            opacity: 1;
            box-shadow: 0 0 14px 2px rgba(120, 200, 255, 0.55);
          }
        }
        .sw-pulse {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: var(--accent);
          animation: sw-pulse-dot 1.6s ease-in-out infinite;
          flex: none;
        }
        .sw-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .sw-field {
          position: relative;
          height: 50px;
          padding: 0 16px;
          display: flex;
          align-items: center;
          gap: 14px;
          background: rgba(255, 255, 255, 0.16);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 4px;
          transition:
            background-color 200ms ease,
            border-color 200ms ease;
        }
        .sw-field:hover {
          background: rgba(255, 255, 255, 0.22);
        }
        .sw-field:focus-within {
          background: rgba(255, 255, 255, 0.26);
          border-color: rgba(255, 255, 255, 0.45);
        }
        .sw-field__label {
          font-family: var(--font-ibm-plex-mono), monospace;
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: lowercase;
          color: var(--ink-faint);
          flex: none;
          width: 56px;
        }
        .sw-field__input {
          flex: 1;
          background: transparent !important;
          border: none !important;
          outline: none;
          color: var(--ink) !important;
          font-family: var(--font-ibm-plex-mono), monospace;
          font-size: 13px;
          letter-spacing: 0.02em;
          padding: 0;
          height: 100%;
        }
        .sw-field__input::placeholder {
          color: rgba(238, 241, 247, 0.32);
        }
        .sw-field__input:-webkit-autofill,
        .sw-field__input:-webkit-autofill:hover,
        .sw-field__input:-webkit-autofill:focus {
          -webkit-text-fill-color: var(--ink);
          -webkit-box-shadow: 0 0 0 1000px transparent inset;
          transition: background-color 5000s ease-in-out 0s;
        }
        .sw-field__toggle {
          background: transparent;
          border: none;
          color: var(--ink-faint);
          cursor: pointer;
          font-family: var(--font-ibm-plex-mono), monospace;
          font-size: 10px;
          letter-spacing: 0.18em;
          padding: 4px 6px;
          text-transform: lowercase;
          transition: color 150ms ease;
        }
        .sw-field__toggle:hover {
          color: var(--ink);
        }
        .sw-field-error {
          font-family: var(--font-ibm-plex-mono), monospace;
          font-size: 11px;
          color: oklch(0.78 0.14 22);
          margin: -4px 4px 0;
        }
        .sw-row-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-top: 22px;
        }
        .sw-link {
          background: transparent;
          border: none;
          padding: 0;
          color: var(--ink-dim);
          font-family: var(--font-ibm-plex-mono), monospace;
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: lowercase;
          cursor: pointer;
          text-decoration: underline dotted;
          text-underline-offset: 4px;
          transition: color 150ms ease;
        }
        .sw-link:hover {
          color: var(--ink);
        }
        .sw-submit {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          border: 1px solid rgba(255, 255, 255, 0.7);
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          color: #ffffff;
          font-family: var(--font-space-grotesk), sans-serif;
          font-weight: 500;
          font-size: 12px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          padding: 12px 22px;
          border-radius: 4px;
          cursor: pointer;
          transition:
            background-color 200ms ease,
            border-color 200ms ease,
            transform 120ms ease;
        }
        .sw-submit:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.2);
          border-color: #ffffff;
        }
        .sw-submit:active:not(:disabled) {
          transform: scale(0.985);
        }
        .sw-submit:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }
        .sw-submit__arrow {
          transition: transform 200ms ease;
        }
        .sw-submit:hover:not(:disabled) .sw-submit__arrow {
          transform: translateX(2px);
        }
        .sw-log {
          min-height: 22px;
          margin-top: 14px;
          font-family: var(--font-ibm-plex-mono), monospace;
          font-size: 11.5px;
          letter-spacing: 0.05em;
        }
        .sw-log .err {
          color: oklch(0.78 0.14 22);
        }
        .sw-log .ok {
          color: #9be0b1;
        }

        @media (max-width: 640px) {
          .sw-topbar,
          .sw-bottombar {
            padding: 20px 22px;
          }
          .sw-stage {
            padding: 70px 18px;
          }
          .sw-tagline {
            font-size: 12.5px;
          }
        }
      `}</style>
    </>
  );
}

export default AuthStageStyles;
