import { describe, expect, it } from 'vitest';
import { gradeAnswer } from '../src/core/items.ts';
import { rank } from '../src/core/ranking.ts';
import { ideaAltitude, juryTotal, pointsFor, splitPoints, weatherFor } from '../src/core/scoring.ts';
import { content } from './helpers.ts';

describe('подсчёт метров', () => {
  it('делит метры без потерь', () => {
    expect(splitPoints(1000, 10)).toEqual(Array(10).fill(100));
    expect(splitPoints(300, 4)).toEqual([75, 75, 75, 75]);
    expect(splitPoints(1000, 3).reduce((a, b) => a + b)).toBe(1000);
    expect(splitPoints(100, 0)).toEqual([]);
  });

  it('подсказка снижает метры на 30 %', () => {
    expect(pointsFor(100, 1, false, 0.3)).toBe(100);
    expect(pointsFor(100, 1, true, 0.3)).toBe(70);
    expect(pointsFor(450, 0.5, true, 0.3)).toBe(158);
    expect(pointsFor(100, 0, true, 0.3)).toBe(0);
    expect(pointsFor(100, 1.5, false, 0.3)).toBe(100);
  });

  it('проверяет выбор одного варианта', () => {
    expect(gradeAnswer({ kind: 'choice', answer: 'a' }, 'a')).toBe(1);
    expect(gradeAnswer({ kind: 'choice', answer: 'a' }, 'b')).toBe(0);
    expect(() => gradeAnswer({ kind: 'choice', answer: 'a' }, 5)).toThrow();
  });

  it('проверяет выбор нескольких вариантов: лишний выбор снижает результат', () => {
    const key = { kind: 'multi' as const, answers: ['a', 'b', 'c'] };
    expect(gradeAnswer(key, ['a', 'b', 'c'])).toBe(1);
    expect(gradeAnswer(key, ['a', 'b'])).toBeCloseTo(2 / 3);
    expect(gradeAnswer(key, ['a', 'b', 'c', 'd'])).toBeCloseTo(2 / 3);
    expect(gradeAnswer(key, ['d', 'e', 'f', 'a'])).toBe(0);
    // «Выбрать всё» не даёт выигрыша
    expect(gradeAnswer(key, ['a', 'b', 'c', 'd', 'e', 'f'])).toBe(0);
  });

  it('проверяет порядок по позициям', () => {
    const key = { kind: 'order' as const, order: ['a', 'b', 'c', 'd'] };
    expect(gradeAnswer(key, ['a', 'b', 'c', 'd'])).toBe(1);
    expect(gradeAnswer(key, ['a', 'b', 'd', 'c'])).toBe(0.5);
    expect(() => gradeAnswer(key, ['a', 'b'])).toThrow();
  });

  it('проверяет «горячие зоны» со штрафом за лишние метки', () => {
    const zones = [
      { id: 'z1', x: 10, y: 10, w: 10, h: 10, label: '1' },
      { id: 'z2', x: 50, y: 50, w: 10, h: 10, label: '2' },
    ];
    const key = { kind: 'hotspots' as const, zones };
    expect(gradeAnswer(key, [{ x: 15, y: 15 }, { x: 55, y: 55 }])).toBe(1);
    expect(gradeAnswer(key, [{ x: 15, y: 15 }])).toBe(0.5);
    expect(gradeAnswer(key, [{ x: 15, y: 15 }, { x: 90, y: 90 }])).toBe(0.25);
    // Две метки в одну зону засчитываются один раз
    expect(gradeAnswer(key, [{ x: 12, y: 12 }, { x: 18, y: 18 }])).toBe(0.5);
    // Меток больше, чем зон, — лишние отбрасываются
    expect(gradeAnswer(key, [{ x: 15, y: 15 }, { x: 55, y: 55 }, { x: 90, y: 90 }])).toBe(1);
  });

  it('проверяет сопоставление', () => {
    const key = { kind: 'match' as const, pairs: { m1: 'sort', m2: 'order' } };
    expect(gradeAnswer(key, { m1: 'sort', m2: 'order' })).toBe(1);
    expect(gradeAnswer(key, { m1: 'sort', m2: 'shine' })).toBe(0.5);
  });

  it('принимает расчёт в пределах допуска', () => {
    const key = { kind: 'number' as const, answer: 100, tolerance: 5 };
    expect(gradeAnswer(key, 100)).toBe(1);
    expect(gradeAnswer(key, 95)).toBe(1);
    expect(gradeAnswer(key, 105.0)).toBe(1);
    expect(gradeAnswer(key, 106)).toBe(0);
    expect(gradeAnswer(key, '97,5' as unknown as number)).toBe(1);
  });

  it('портит погоду с каждой ошибкой', () => {
    expect(weatherFor(0, 10).level).toBe(0);
    expect(weatherFor(1, 10).level).toBe(1);
    expect(weatherFor(3, 10).level).toBe(2);
    expect(weatherFor(5, 10).level).toBe(3);
    expect(weatherFor(8, 10).level).toBe(4);
  });

  it('считает этап 5 как среднее трёх судей', () => {
    const criteria = content.stage5.criteria;
    const full = Object.fromEntries(criteria.map((c) => [c.id, 200]));
    const half = Object.fromEntries(criteria.map((c) => [c.id, 100]));
    expect(juryTotal(full, criteria)).toBe(1000);
    expect(juryTotal({ relevance: 999 }, criteria)).toBe(200);
    const s = (scores: Record<string, number>) => ({ ideaAccountId: 'x', juryId: 'j', scores, comment: '', updatedAt: '' });
    expect(ideaAltitude([s(full), s(half), s(half)], criteria)).toBe(667);
    expect(ideaAltitude([], criteria)).toBeNull();
  });

  it('при равенстве высоты выше тот, кто быстрее прошёл этапы 1–4', () => {
    const r = rank([
      { accountId: 'a', number: 1, altitude: 3000, seconds14: 2000 },
      { accountId: 'b', number: 2, altitude: 3000, seconds14: 1500 },
      { accountId: 'c', number: 3, altitude: 3500, seconds14: 3600 },
      { accountId: 'd', number: 4, altitude: 3000, seconds14: 1500 },
    ]);
    expect(r.map((x) => x.accountId)).toEqual(['c', 'b', 'd', 'a']);
    expect(r.map((x) => x.place)).toEqual([1, 2, 2, 4]);
  });
});
