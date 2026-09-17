'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/* HUB-004 — the hub footer's centred indicators: current time · latency · connection.
 *  - Clock: HH:mm:ss, 24 h, America/Santiago via Intl (es-CL, hour12 false). The app has
 *    no consumed timezone setting (CompanySettings.timezone exists in the schema and the
 *    settings form, but nothing formats with it), so the Chilean zone is the platform
 *    constant here as everywhere else (CAL-008b doctrine). Ticks every second ONLY while
 *    the tab is visible; the digits are aria-hidden (never announced), the container
 *    carries a static aria-label.
 *  - Latency: APPLICATION round-trip (fetch → NestJS → response) of GET /api/health —
 *    public, unauthenticated, @SkipThrottle, no DB — measured with performance.now(),
 *    cache: 'no-store', a 4000 ms AbortController timeout and a ref guard so requests
 *    never overlap. This is HTTP RTT through the browser's stack, NOT ICMP ping.
 *    On mount, then every 30 s while visible; re-run when the tab becomes visible and on
 *    `online`. Until the first valid sample: "— ms" + «verificando»; after a failure:
 *    "— ms" + the failure label (no stale greyed value).
 *  - Connection: «online» when the last health call succeeded; «servicio no disponible»
 *    on failure/timeout; «sin conexión» when navigator.onLine is false — an auxiliary
 *    signal, never proof that the backend is up. Only the label lives in a polite
 *    aria-live region, so a STATE change is announced once; the ticking clock and the
 *    latency number are not. The dot pulses only while confirmed online AND visible;
 *    static under prefers-reduced-motion.
 *  - Cleanup: interval cleared, in-flight request aborted, listeners removed on unmount. */

type ConnState = 'verificando' | 'online' | 'servicio' | 'offline';

const LABELS: Record<ConnState, string> = {
  verificando: 'verificando',
  online: 'online',
  servicio: 'servicio no disponible',
  offline: 'sin conexión',
};

// Mirrors lib/api.ts:1 — apiClient does not export its base URL nor a raw fetch with
// `cache`/`signal` control, and the health probe must not carry auth/company headers.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const HEALTH_URL = `${API_BASE}/api/health`;
const POLL_MS = 30_000;
const TIMEOUT_MS = 4_000;

export function HubIndicators() {
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat('es-CL', {
        timeZone: 'America/Santiago',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }),
    [],
  );
  const [time, setTime] = useState('--:--:--');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [conn, setConn] = useState<ConnState>('verificando');
  const [visible, setVisible] = useState(true);
  const inFlight = useRef<AbortController | null>(null);

  /* ── clock: one interval while visible ─────────────────────────────────── */
  useEffect(() => {
    const isVisible = () =>
      typeof document === 'undefined' || document.visibilityState === 'visible';
    let id: number | null = null;
    const tick = () => setTime(formatter.format(new Date()));
    const start = () => {
      if (id !== null) return;
      tick();
      id = window.setInterval(tick, 1000);
    };
    const stop = () => {
      if (id !== null) window.clearInterval(id);
      id = null;
    };
    const onVisibility = () => {
      const v = isVisible();
      setVisible(v);
      if (v) start();
      else stop();
    };
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [formatter]);

  /* ── latency + connection: guarded health probe ────────────────────────── */
  const probe = useCallback(async () => {
    if (inFlight.current) return; // never overlap
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setLatencyMs(null);
      setConn('offline');
      return;
    }
    const controller = new AbortController();
    inFlight.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
    const started = performance.now();
    try {
      const res = await fetch(HEALTH_URL, { cache: 'no-store', signal: controller.signal });
      const elapsed = performance.now() - started;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLatencyMs(Math.max(0, Math.round(elapsed)));
      setConn('online');
    } catch {
      setLatencyMs(null);
      setConn(
        typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'servicio',
      );
    } finally {
      window.clearTimeout(timeout);
      if (inFlight.current === controller) inFlight.current = null;
    }
  }, []);

  useEffect(() => {
    let id: number | null = null;
    const start = () => {
      if (id !== null) return;
      void probe();
      id = window.setInterval(() => void probe(), POLL_MS);
    };
    const stop = () => {
      if (id !== null) window.clearInterval(id);
      id = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };
    const onOnline = () => void probe();
    const onOffline = () => {
      setLatencyMs(null);
      setConn('offline');
    };
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      stop();
      inFlight.current?.abort();
      inFlight.current = null;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [probe]);

  const pulsing = conn === 'online' && visible;

  return (
    <div className="mod-indicators">
      <span className="mod-ind mod-ind--clock" aria-label="Hora actual">
        <span aria-hidden="true">{time}</span>
      </span>
      <span className="mod-ind__sep" aria-hidden="true">
        ·
      </span>
      <span className="mod-ind mod-ind--latency" aria-label="Latencia">
        {latencyMs === null ? '—' : latencyMs} ms
      </span>
      <span className="mod-ind__sep" aria-hidden="true">
        ·
      </span>
      <span className="mod-ind mod-ind--conn">
        <span
          className={`mod-ind__dot mod-ind__dot--${conn === 'online' ? 'online' : conn === 'verificando' ? 'idle' : 'failure'}${pulsing ? ' mod-ind__dot--pulse' : ''}`}
          aria-hidden="true"
        />
        <span aria-live="polite">{LABELS[conn]}</span>
      </span>
    </div>
  );
}

export default HubIndicators;
