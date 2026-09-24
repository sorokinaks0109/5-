// Личные коды. Алфавит без похожих символов (нет 0/O, 1/I/L), чтобы код легко продиктовать.
import type { Rng } from './random.ts';

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Приводит введённый код к единому виду: верхний регистр, без пробелов и дефисов. */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Код вида ABCD-EFGH (8 символов после префикса). Префикс помогает различать роли. */
export function generateCode(rng: Rng, prefix = ''): string {
  let body = '';
  for (let i = 0; i < 8; i++) body += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  const pretty = `${body.slice(0, 4)}-${body.slice(4)}`;
  return prefix ? `${prefix}-${pretty}` : pretty;
}

export function generateUniqueCodes(count: number, rng: Rng, existing: Iterable<string>, prefix = ''): string[] {
  const used = new Set([...existing].map(normalizeCode));
  const out: string[] = [];
  while (out.length < count) {
    const c = generateCode(rng, prefix);
    const n = normalizeCode(c);
    if (used.has(n)) continue;
    used.add(n);
    out.push(c);
  }
  return out;
}

/** Служебный адрес для входа через Supabase Auth. Настоящей почты нет, письма не отправляются. */
export function codeEmail(normalizedCode: string): string {
  return `${normalizedCode.toLowerCase()}@codes.idei-igry.example.com`;
}

/** Красивый вид для показа: ABCDEFGH → ABCD-EFGH */
export function prettyCode(normalized: string): string {
  return normalized.match(/.{1,4}/g)?.join('-') ?? normalized;
}
