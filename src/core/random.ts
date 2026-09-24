// Сидируемый генератор случайных чисел: одно и то же «зерно» даёт одну и ту же выдачу.
// Это нужно, чтобы результат выдачи можно было воспроизвести и проверить тестами.

export type Rng = () => number;

/** Превращает строку в 32-битное число (хеш FNV-1a). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Генератор Mulberry32: быстрый и достаточно хороший для игры. */
export function createRng(seed: string | number): Rng {
  let a = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Перемешивание Фишера — Йетса. Исходный массив не меняется. */
export function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Выбор n разных элементов в случайном порядке. */
export function pick<T>(arr: readonly T[], n: number, rng: Rng): T[] {
  if (n > arr.length) throw new Error(`Нельзя выбрать ${n} из ${arr.length}`);
  return shuffle(arr, rng).slice(0, n);
}

/** Перемешивает так, чтобы порядок по возможности отличался от исходного
 *  (для заданий «расставьте по порядку» — иначе участнику может выпасть готовый ответ). */
export function shuffleNotIdentity<T>(arr: readonly T[], rng: Rng): T[] {
  if (arr.length < 2) return arr.slice();
  for (let i = 0; i < 10; i++) {
    const s = shuffle(arr, rng);
    if (s.some((v, idx) => v !== arr[idx])) return s;
  }
  const s = arr.slice();
  [s[0], s[1]] = [s[1], s[0]];
  return s;
}

/** Криптостойкий генератор — для личных кодов (их нельзя угадать). */
export const cryptoRng: Rng = () => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
};
