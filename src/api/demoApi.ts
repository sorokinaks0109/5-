// Демо-режим: вся «серверная» логика работает прямо в браузере, данные — в localStorage.
// Удобно, чтобы показать игру до подключения Supabase. Для настоящего тура не подходит:
// правильные ответы в демо находятся в браузере.
import fullContent from '@full-content';
import { dispatch, type Action } from '../core/dispatch.ts';
import { GameError } from '../core/errors.ts';
import { MemoryStore, type MemoryData } from '../core/memoryStore.ts';
import { GameService } from '../core/service.ts';
import type { Content } from '../core/types.ts';
import { seedDemo } from '../core/demoSeed.ts';
import type { Transport } from './api.ts';

const DATA_KEY = 'kaizen-demo-data-v2';
const SESSION_KEY = 'kaizen-demo-session-v2';

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Приватный режим браузера: данные живут до перезагрузки страницы
  }
}

export function createDemoTransport(): Transport {
  const content = fullContent as Content;
  let store: MemoryStore;
  let svc: GameService;
  let ready: Promise<void>;

  const init = (data: MemoryData | null) => {
    store = new MemoryStore(data ?? undefined, (d) => write(DATA_KEY, d));
    svc = new GameService(store, content);
    ready = data ? Promise.resolve() : seedDemo(store, content).then(() => write(DATA_KEY, store.data));
  };
  init(readJson<MemoryData>(DATA_KEY));

  let session: string | null = readJson<string>(SESSION_KEY);

  return {
    mode: 'demo',
    async login(code) {
      await ready;
      const acc = await svc.loginByCode(code);
      session = acc.id;
      write(SESSION_KEY, session);
    },
    async logout() {
      session = null;
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch {
        /* ничего */
      }
    },
    async hasSession() {
      await ready;
      return !!session && !!(await store.getAccount(session));
    },
    async call(action: Action, payload?: Record<string, unknown>) {
      await ready;
      // Небольшая задержка, как у настоящего сервера — чтобы интерфейс вёл себя одинаково
      await new Promise((r) => setTimeout(r, 80));
      try {
        // Копия через JSON — как при передаче по сети
        return JSON.parse(JSON.stringify(await dispatch(svc, session, action, payload)));
      } catch (e) {
        if (e instanceof GameError) throw e;
        console.error(e);
        throw new GameError('Что-то пошло не так. Попробуйте ещё раз.');
      }
    },
    async reset() {
      try {
        localStorage.removeItem(DATA_KEY);
      } catch {
        /* ничего */
      }
      init(null);
      await ready;
      session = null;
    },
  };
}
