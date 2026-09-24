// Серверная функция «game»: единственная точка, где хранятся правильные ответы и идёт проверка.
// Публикуется в Supabase через GitHub Actions (см. README).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { dispatch, type Action } from '../_shared/core/dispatch.ts';
import { GameError } from '../_shared/core/errors.ts';
import { normalizeCode } from '../_shared/core/codes.ts';
import { GameService } from '../_shared/core/service.ts';
import type { Content } from '../_shared/core/types.ts';
import rawContent from '../_shared/content.ts';
import { PgStore } from './pgStore.ts';

const content = rawContent as unknown as Content;
/** Служебный ключ: старое имя SUPABASE_SERVICE_ROLE_KEY или новые секретные ключи SUPABASE_SECRET_KEYS. */
function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? '';
  try {
    const keys = JSON.parse(raw) as Record<string, string>;
    return keys.default ?? Object.values(keys)[0] ?? '';
  } catch {
    return raw;
  }
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Метод не поддерживается' }, 405);
  try {
    const body = await req.json();
    const svc = new GameService(new PgStore(admin), content);

    // Первый вход организатора по коду из секрета ORGANIZER_CODE
    if (body.action === 'bootstrap') {
      const secret = normalizeCode(Deno.env.get('ORGANIZER_CODE') ?? '');
      if (!secret) throw new GameError('На сервере не задан секрет ORGANIZER_CODE (README, шаг 4).');
      if (secret.length < 8)
        throw new GameError('Секрет ORGANIZER_CODE короче 8 латинских букв и цифр. Русские буквы и знаки в коде не учитываются.');
      if (normalizeCode(String(body.code ?? '')) !== secret) throw new GameError('Код не найден.');
      await svc.ensureOrganizer(secret);
      return json({ ok: true });
    }

    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    let actorId: string | null = null;
    if (token) {
      const { data } = await admin.auth.getUser(token);
      actorId = data.user?.id ?? null;
    }
    const payload = body.payload && typeof body.payload === 'object' ? body.payload : body;
    const result = await dispatch(svc, actorId, body.action as Action, payload);
    return json(result ?? null);
  } catch (e) {
    if (e instanceof GameError) return json({ error: e.message }, 400);
    console.error(e);
    const detail = e instanceof Error ? e.message : String(e);
    return json({ error: `Ошибка сервера: ${detail.slice(0, 200)}` }, 500);
  }
});
