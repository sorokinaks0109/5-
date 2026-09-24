// Боевой режим: вход через Supabase Auth, все действия — через серверную функцию «game».
// Правильные ответы и проверка живут только на сервере.
import { createClient as createSupabase } from '@supabase/supabase-js';
import { codeEmail, hasCyrillic, normalizeCode } from '../core/codes.ts';
import { GameError } from '../core/errors.ts';
import type { Transport } from './api.ts';

export function createSupabaseTransport(url: string, anonKey: string): Transport {
  const sb = createSupabase(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  const fnUrl = `${url.replace(/\/$/, '')}/functions/v1/game`;

  async function post(body: Record<string, unknown>) {
    const { data } = await sb.auth.getSession();
    let res: Response;
    try {
      res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${data.session?.access_token ?? anonKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new GameError('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.');
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new GameError(json.error || 'Ошибка сервера. Попробуйте ещё раз.');
    return json;
  }

  async function signIn(code: string) {
    const norm = normalizeCode(code);
    return sb.auth.signInWithPassword({ email: codeEmail(norm), password: norm });
  }

  return {
    mode: 'supabase',
    async login(code) {
      const norm = normalizeCode(code);
      if (hasCyrillic(code)) throw new GameError('Код набирается латинскими буквами и цифрами. Переключите клавиатуру на английскую раскладку.');
      if (norm.length < 6) throw new GameError('Код слишком короткий.');
      let { error } = await signIn(norm);
      if (error && /rate|many/i.test(error.message)) throw new GameError('Слишком много попыток. Подождите пару минут.');
      if (error) {
        // Первый вход организатора: сервер создаёт его учётную запись по коду из настроек функции
        let bootstrapError = '';
        await post({ action: 'bootstrap', code: norm }).catch((e: unknown) => {
          bootstrapError = e instanceof Error ? e.message : String(e);
        });
        ({ error } = await signIn(norm));
        // Код не организатора — обычное «не найден». Любая другая ошибка сервера показывается как есть.
        if (error && bootstrapError && !/Код не найден/.test(bootstrapError)) throw new GameError(bootstrapError);
      }
      if (error) {
        if (/rate|many/i.test(error.message)) throw new GameError('Слишком много попыток. Подождите пару минут.');
        if (/confirm/i.test(error.message)) throw new GameError('Вход не подтверждён: проверьте настройки входа в Supabase (README, шаг 3).');
        throw new GameError('Код не найден. Проверьте, нет ли опечатки.');
      }
    },
    async logout() {
      await sb.auth.signOut();
    },
    async hasSession() {
      const { data } = await sb.auth.getSession();
      return !!data.session;
    },
    call(action, payload) {
      // Параметры отдельно от названия действия: у orgTour есть свой параметр «action»
      return post({ action, payload: payload ?? {} });
    },
  };
}
