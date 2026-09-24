// Подсчёт метров (баллов), подсказки и «погода».
import type { AnswerRecord, Criterion, IdeaScore, Weather } from './types.ts';

/** Делит total метров на n заданий целыми числами так, чтобы сумма была ровно total. */
export function splitPoints(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const rest = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

/** Метры за задание: максимум × доля правильности × (1 − штраф, если брали подсказку). */
export function pointsFor(maxPoints: number, fraction: number, usedHint: boolean, hintPenalty: number): number {
  const f = Math.max(0, Math.min(1, fraction));
  const k = usedHint ? 1 - hintPenalty : 1;
  return Math.round(maxPoints * f * k);
}

/** Сколько подсказок осталось у участника на весь тур. */
export function hintsLeft(total: number, usedPerStage: string[][]): number {
  const used = usedPerStage.reduce((s, h) => s + h.length, 0);
  return Math.max(0, total - used);
}

/** Сумма метров по ответам этапа. */
export function stageAltitude(answers: Record<string, AnswerRecord>): number {
  return Object.values(answers).reduce((s, a) => s + a.points, 0);
}

/** Ошибка = задание решено не полностью. */
export function countErrors(answers: Record<string, AnswerRecord>): number {
  return Object.values(answers).filter((a) => a.fraction < 1).length;
}

const WEATHER: Weather[] = [
  { level: 0, name: 'Ясно' },
  { level: 1, name: 'Облачно' },
  { level: 2, name: 'Снегопад' },
  { level: 3, name: 'Метель' },
  { level: 4, name: 'Буран' },
];

/** Погода портится с каждой ошибкой, но игру не останавливает. */
export function weatherFor(errors: number, totalItems: number): Weather {
  if (errors <= 0) return WEATHER[0];
  const share = totalItems > 0 ? errors / totalItems : 1;
  const level = share <= 0.15 ? 1 : share <= 0.3 ? 2 : share <= 0.5 ? 3 : 4;
  return WEATHER[level];
}

/** Сумма баллов одного судьи по критериям (каждый критерий обрезается до его максимума). */
export function juryTotal(scores: Record<string, number>, criteria: Criterion[]): number {
  return criteria.reduce((s, c) => {
    const v = Number(scores[c.id] ?? 0);
    return s + Math.max(0, Math.min(c.max, Number.isFinite(v) ? v : 0));
  }, 0);
}

/** Итог этапа 5 = среднее сумм всех судей, оценивших работу. null — пока никто не оценил. */
export function ideaAltitude(scores: IdeaScore[], criteria: Criterion[]): number | null {
  if (scores.length === 0) return null;
  const sum = scores.reduce((s, sc) => s + juryTotal(sc.scores, criteria), 0);
  return Math.round(sum / scores.length);
}
