// Личные коды. Алфавит без похожих символов (нет 0/O, 1/I/L), чтобы код легко продиктовать.
import type { Rng } from './random.ts';

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Русские буквы, похожие на латинские: участник мог набрать код в русской раскладке
const LOOKALIKE: Record<string, string> = {
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', У: 'Y', Х: 'X',
};

/** Приводит введённый код к единому виду: верхний регистр, без пробелов и дефисов,
 *  похожие русские буквы заменяются на латинские. */
export function normalizeCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[АВЕКМНОРСТУХ]/g, (ch) => LOOKALIKE[ch])
    .replace(/[^A-Z0-9]/g, '');
}

/** Есть ли в коде русские буквы, которые нельзя заменить латинскими */
export function hasCyrillic(code: string): boolean {
  return /[А-ЯЁ]/.test(code.toUpperCase().replace(/[АВЕКМНОРСТУХ]/g, ''));
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
