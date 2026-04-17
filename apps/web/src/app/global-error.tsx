'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    import('@sentry/nextjs').then((Sentry) => {
      Sentry.captureException(error);
    });
  }, [error]);

  return (
    <html lang="es">
      <body>
        <h1>Something went wrong</h1>
        <button onClick={() => reset()}>Try again</button>
      </body>
    </html>
  );
}
