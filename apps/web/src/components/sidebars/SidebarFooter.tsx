'use client';

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { KeyRound, LogOut, Moon, Sun, UserRound } from 'lucide-react';
import { useTheme } from '../../lib/theme';
import { SidebarChangePassword } from './SidebarChangePassword';

/** AUTH-002-B — desktop footer preserved; mobile keeps logout outside the account menu. */
export function SidebarFooter({ email, onLogout }: { email: string; onLogout: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const logoutRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const firstFocus = useRef<'first' | 'last'>('first');
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const open = position !== null;
  const themeLabel = theme === 'dark' ? 'Modo claro' : 'Modo oscuro';

  const close = useCallback(() => {
    setPosition(null);
    // On resize to desktop the trigger is hidden; logout remains the same DOM button.
    const target = triggerRef.current?.offsetParent ? triggerRef.current : logoutRef.current;
    target?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    items?.[firstFocus.current === 'last' ? items.length - 1 : 0]?.focus();
    const outsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };
    // Click runs after native pointer focus, so outside dismissal restores the trigger.
    document.addEventListener('click', outsideClick);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('click', outsideClick);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open, close]);

  const show = (focus: 'first' | 'last' = 'first') => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    firstFocus.current = focus;
    setPosition({
      top: rect.bottom + 4,
      left: Math.max(8, Math.min(rect.right - 220, window.innerWidth - 228)),
    });
  };

  const onMenuKeyDown = (event: KeyboardEvent) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      close();
      // Leave the menu in document order; never trap Tab inside an account popup.
      if (!event.shiftKey) logoutRef.current?.focus();
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  };

  return (
    <div className="tn-sidebar__foot">
      <div className="hidden md:contents">
        <button onClick={toggleTheme} aria-label={themeLabel} className="tn-theme-toggle">
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          {themeLabel}
        </button>
        <div className="tn-sidebar__email" title={email}>
          {email}
        </div>
        <SidebarChangePassword />
      </div>
      <div className="md:hidden">
        <button
          ref={triggerRef}
          id={`${id}-trigger`}
          type="button"
          aria-label="Cuenta"
          title="Cuenta"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? `${id}-menu` : undefined}
          onClick={() => (open ? close() : show())}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              show(event.key === 'ArrowUp' ? 'last' : 'first');
            }
          }}
          className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--sidebar-border)] text-[var(--sidebar-text)] hover:text-[var(--sidebar-text-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sidebar-text-hover)]"
        >
          <UserRound size={18} aria-hidden="true" />
        </button>
      </div>
      <button ref={logoutRef} onClick={onLogout} className="tn-logout">
        <LogOut size={14} />
        Cerrar sesión
      </button>
      {position &&
        createPortal(
          <div
            ref={menuRef}
            id={`${id}-menu`}
            role="menu"
            aria-labelledby={`${id}-trigger`}
            onKeyDown={onMenuKeyDown}
            className="fixed z-[60] w-[220px] max-w-[calc(100vw-16px)] rounded-lg border border-line bg-card-solid p-1 text-fg shadow-lg"
            style={position}
          >
            <Link
              href="/cambiar-clave"
              role="menuitem"
              tabIndex={-1}
              onClick={close}
              className="flex min-h-11 items-center gap-2 rounded px-3 text-sm hover:bg-subtle-hover focus-visible:bg-subtle-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <KeyRound size={14} aria-hidden="true" />
              Cambiar contraseña
            </Link>
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                toggleTheme();
                close();
              }}
              className="flex min-h-11 w-full items-center gap-2 rounded px-3 text-left text-sm hover:bg-subtle-hover focus-visible:bg-subtle-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {theme === 'dark' ? (
                <Sun size={14} aria-hidden="true" />
              ) : (
                <Moon size={14} aria-hidden="true" />
              )}
              {themeLabel}
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
