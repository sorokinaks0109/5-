import { describe, expect, it } from 'vitest';
import { buildItems } from '../src/core/items.ts';
import { hintsLeft } from '../src/core/scoring.ts';
import { content, openTourWithPlayer } from './helpers.ts';

describe('подсказки («снаряжение»)', () => {
  it('считает остаток на весь тур', () => {
    expect(hintsLeft(3, [])).toBe(3);
    expect(hintsLeft(3, [['a'], ['b', 'c']])).toBe(0);
    expect(hintsLeft(3, [['a', 'b', 'c', 'd']])).toBe(0);
  });

  it('подсказка снижает метры за задание на 30 %', async () => {
    const { svc, store, player } = await openTourWithPlayer();
    const v = await svc.startStage(player, 1);
    const run = (await store.getRun(player.id, 1))!;
    const items = buildItems(1, content, run.assignment);
    const withHint = items.find((i) => i.hint)!;
    const h = await svc.hint(player, 1, withHint.item.id);
    expect(h.hint).toBe(withHint.hint);
    expect(h.hintsLeft).toBe(2);
    const key = withHint.key as { answer: string };
    const res = await svc.answer(player, 1, withHint.item.id, key.answer);
    expect(res.points).toBe(Math.round(withHint.item.maxPoints * 0.7));
    expect(v.hintsLeft).toBe(3);
  });

  it('повторный запрос той же подсказки бесплатный', async () => {
    const { svc, player } = await openTourWithPlayer();
    const v = await svc.startStage(player, 1);
    const id = v.items.find((i) => i.hasHint)!.id;
    await svc.hint(player, 1, id);
    const again = await svc.hint(player, 1, id);
    expect(again.hintsLeft).toBe(2);
  });

  it('больше трёх подсказок за тур взять нельзя', async () => {
    const { svc, player } = await openTourWithPlayer();
    const v = await svc.startStage(player, 1);
    const ids = v.items.filter((i) => i.hasHint).map((i) => i.id);
    expect(ids.length).toBeGreaterThanOrEqual(4);
    await svc.hint(player, 1, ids[0]);
    await svc.hint(player, 1, ids[1]);
    const third = await svc.hint(player, 1, ids[2]);
    expect(third.hintsLeft).toBe(0);
    await expect(svc.hint(player, 1, ids[3])).rejects.toThrow(/Снаряжение закончилось/);
  });

  it('после ответа подсказку взять нельзя', async () => {
    const { svc, player } = await openTourWithPlayer();
    const v = await svc.startStage(player, 1);
    const it = v.items.find((i) => i.hasHint)!;
    await svc.answer(player, 1, it.id, 'waiting');
    await expect(svc.hint(player, 1, it.id)).rejects.toThrow();
  });
});
