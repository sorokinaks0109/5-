import { createContext, useContext, useEffect, useState } from 'react';
import type { MeView } from './core/types.ts';

/** Текущее время по часам сервера: offset = серверное время − время устройства. */
export function useNow(offset: number, intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date(Date.now() + offset));
  useEffect(() => {
    setNow(new Date(Date.now() + offset));
    const t = setInterval(() => setNow(new Date(Date.now() + offset)), intervalMs);
    return () => clearInterval(t);
  }, [offset, intervalMs]);
  return now;
}

export function serverOffset(serverNow: string): number {
  return new Date(serverNow).getTime() - Date.now();
}

/** Маршрут в адресной строке после «#»: работает на GitHub Pages без настройки сервера. */
export function useHashRoute(): [string, (r: string) => void] {
  const get = () => window.location.hash.replace(/^#/, '') || '/';
  const [route, setRoute] = useState(get);
  useEffect(() => {
    const on = () => {
      setRoute(get());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [route, (r: string) => (window.location.hash = r)];
}

export interface AppCtx {
  me: MeView;
  refresh: () => Promise<void>;
  error: (e: unknown) => void;
  info: (text: string) => void;
  logout: () => void;
  go: (route: string) => void;
}

export const Ctx = createContext<AppCtx | null>(null);
export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('Нет контекста приложения');
  return c;
}

export function errorText(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return 'Что-то пошло не так. Попробуйте ещё раз.';
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

export function meters(n: number): string {
  return `${n.toLocaleString('ru-RU')} м`;
}
