import { describe, expect, it } from 'vitest';
import { assignStage, assignmentSeed } from '../src/core/assign.ts';
import { buildItems } from '../src/core/items.ts';
import { createRng, pick, shuffle } from '../src/core/random.ts';
import { generateUniqueCodes, normalizeCode } from '../src/core/codes.ts';
import { AUTO_STAGES, type StageNo } from '../src/core/types.ts';
import { content } from './helpers.ts';

const seed = (acc: string, stage: StageNo) => assignmentSeed('salt', acc, stage);

describe('случайная выдача заданий', () => {
  it('генератор воспроизводим', () => {
    const a = createRng('x');
    const b = createRng('x');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(createRng('y')()).not.toBe(createRng('x')());
  });

  it('перемешивание не теряет элементы', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const s = shuffle(arr, createRng(1));
    expect(s.slice().sort()).toEqual(arr);
    expect(arr).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(() => pick(arr, 9, createRng(1))).toThrow();
  });

  it('этап 1: 10 разных ситуаций из 20', () => {
    const a = assignStage(1, content, seed('p1', 1));
    expect(a.items).toHaveLength(10);
    expect(new Set(a.items.map((i) => i.ref)).size).toBe(10);
    a.items.forEach((i) => expect(i.order!.slice().sort()).toEqual(content.waste.wasteTypes.map((w) => w.id).sort()));
  });

  it('одинаковое зерно — одинаковая выдача, разные участники — разные наборы', () => {
    expect(assignStage(1, content, seed('p1', 1))).toEqual(assignStage(1, content, seed('p1', 1)));
    const sets = new Set<string>();
    for (let i = 0; i < 30; i++) {
      sets.add(assignStage(1, content, seed(`p${i}`, 1)).items.map((x) => x.ref).join(','));
    }
    expect(sets.size).toBeGreaterThan(25);
  });

  it('выдача распределяется по всему банку', () => {
    const count = new Map<string, number>();
    for (let i = 0; i < 150; i++) {
      assignStage(1, content, seed(`p${i}`, 1)).items.forEach((x) => count.set(x.ref, (count.get(x.ref) ?? 0) + 1));
      const v = assignStage(2, content, seed(`p${i}`, 2)).group!;
      count.set(v, (count.get(v) ?? 0) + 1);
    }
    content.waste.situations.forEach((s) => expect(count.get(s.id)).toBeGreaterThan(40));
    content.fiveS.variants.forEach((s) => expect(count.get(s.id)).toBeGreaterThan(15));
  });

  it('5С: примерно половине достаётся почта, половине склад', () => {
    let office = 0;
    for (let i = 0; i < 300; i++) {
      const a = assignStage(2, content, seed(`p${i}`, 2));
      if (a.items[1].ref === 'inbox') office++;
    }
    expect(office).toBeGreaterThan(110);
    expect(office).toBeLessThan(190);
  });

  it('вершины 2–6: вариант 5С, процесс с законом Литтла, восемь шагов, кейсы', () => {
    const a2 = assignStage(2, content, seed('p1', 2));
    expect(content.fiveS.variants.map((i) => i.id)).toContain(a2.group);
    expect(a2.items.map((i) => i.id)).toEqual(['fiveS-order', 'fiveS-find', 'fiveS-match']);
    // порядок шагов 5С участнику не выдаётся готовым
    expect(a2.items[0].order).not.toEqual(content.fiveS.steps.map((s) => s.id));

    const a3 = assignStage(3, content, seed('p1', 3));
    expect(content.flow.processes.map((i) => i.id)).toContain(a3.group);
    expect(a3.items.map((i) => i.id)).toEqual(['flow-order', 'flow-flags', 'flow-number', 'flow-little', 'flow-target']);

    const a4 = assignStage(4, content, seed('p1', 4));
    expect(a4.items.filter((i) => i.ref.startsWith('sit:'))).toHaveLength(content.settings.draw.eightStepsSituations);
    expect(a4.items.find((i) => i.ref === 'tools')!.order).toHaveLength(content.settings.draw.eightStepsTools);

    const a5 = assignStage(5, content, seed('p1', 5));
    expect(a5.items.filter((i) => i.ref.startsWith('q:'))).toHaveLength(4);
    expect(a5.items.filter((i) => i.ref.startsWith('why:'))).toHaveLength(5);

    const a6 = assignStage(6, content, seed('p1', 6));
    expect(content.fishbone.cases.map((i) => i.id)).toContain(a6.group);
    expect(a6.items.map((i) => i.ref)).toEqual(['fishbone', 'focus', 'next']);
  });

  it('сумма метров на автоматических вершинах ровно 1000', () => {
    for (const st of AUTO_STAGES) {
      for (let i = 0; i < 10; i++) {
        const items = buildItems(st, content, assignStage(st, content, seed(`p${i}`, st)));
        expect(items.reduce((s, x) => s + x.item.maxPoints, 0)).toBe(1000);
      }
    }
  });

  it('в публичных заданиях нет правильных ответов (оба вида 5С)', () => {
    for (let i = 0; i < 20; i++) {
      const items = buildItems(2, content, assignStage(2, content, seed(`p${i}`, 2)));
      expect(JSON.stringify(items.map((x) => x.item))).not.toMatch(/"answer"|"zones"|"step"/);
    }
  });

  it('в публичных заданиях нет правильных ответов', () => {
    for (const st of AUTO_STAGES) {
      const items = buildItems(st, content, assignStage(st, content, seed('p1', st)));
      const pub = JSON.stringify(items.map((i) => i.item));
      expect(pub).not.toMatch(/"answer"|"answers"|"valueAdded"|"zones"|"pairs"|"placement"|"category"|"phase"|"step"/);
    }
  });

  it('личные коды уникальны и без похожих символов', () => {
    const codes = generateUniqueCodes(500, createRng('c'), []);
    expect(new Set(codes.map(normalizeCode)).size).toBe(500);
    codes.forEach((c) => expect(c).toMatch(/^[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}$/));
    expect(normalizeCode(' abcd-efgh ')).toBe('ABCDEFGH');
  });
});

describe('ввод кода', () => {
  it('похожие русские буквы превращаются в латинские', async () => {
    const { normalizeCode, hasCyrillic } = await import('../src/core/codes.ts');
    expect(normalizeCode('рнтс-кмах')).toBe('PHTCKMAX');
    expect(hasCyrillic('ГПНС2026')).toBe(true);
    expect(hasCyrillic('АВС-2026')).toBe(false);
  });
});
