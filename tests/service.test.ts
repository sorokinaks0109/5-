import { describe, expect, it } from 'vitest';
import { buildItems, perfectAnswer } from '../src/core/items.ts';
import type { StageNo } from '../src/core/types.ts';
import { content, openTourWithPlayer } from './helpers.ts';

async function solveStage(ctx: Awaited<ReturnType<typeof openTourWithPlayer>>, stage: StageNo, perfect = true) {
  await ctx.svc.startStage(ctx.player, stage);
  const run = (await ctx.store.getRun(ctx.player.id, stage))!;
  for (const it of buildItems(stage, content, run.assignment)) {
    ctx.tick(20_000);
    const value = perfect ? perfectAnswer(it.key) : it.key.kind === 'number' ? -1 : perfectAnswer(it.key);
    await ctx.svc.answer(ctx.player, stage, it.item.id, value);
  }
}

describe('прохождение тура', () => {
  it('вершины открываются по очереди', async () => {
    const ctx = await openTourWithPlayer();
    await expect(ctx.svc.startStage(ctx.player, 2)).rejects.toThrow(/предыдущей/);
    await solveStage(ctx, 1);
    const me = await ctx.svc.me(ctx.player);
    expect(me.participant!.stages.map((s) => s.status)).toEqual(['finished', 'available', 'locked', 'locked', 'locked']);
  });

  it('идеальное прохождение этапов 1–4 даёт 4000 м', async () => {
    const ctx = await openTourWithPlayer();
    for (const st of [1, 2, 3, 4] as StageNo[]) await solveStage(ctx, st);
    const me = await ctx.svc.me(ctx.player);
    expect(me.participant!.altitude).toBe(4000);
    expect(me.participant!.place).toBe(1);
    expect(me.participant!.stages[4].status).toBe('available');
  });

  it('ответ окончательный, ошибка портит погоду', async () => {
    const ctx = await openTourWithPlayer();
    const v = await ctx.svc.startStage(ctx.player, 1);
    const run = (await ctx.store.getRun(ctx.player.id, 1))!;
    const it = buildItems(1, content, run.assignment)[0];
    const wrong = content.stage1.wasteTypes.find((w) => w.id !== (it.key as { answer: string }).answer)!.id;
    const res = await ctx.svc.answer(ctx.player, 1, v.items[0].id, wrong);
    expect(res.fraction).toBe(0);
    expect(res.weather.level).toBeGreaterThan(0);
    await expect(ctx.svc.answer(ctx.player, 1, v.items[0].id, wrong)).rejects.toThrow(/уже дан/);
  });

  it('правильные ответы приходят только после завершения этапа', async () => {
    const ctx = await openTourWithPlayer();
    const active = await ctx.svc.startStage(ctx.player, 1);
    expect(active.review).toBeUndefined();
    expect(JSON.stringify(active)).not.toMatch(/"explanation"|"answer"/);
    const done = await ctx.svc.finishStage(ctx.player, 1);
    expect(done.review).toBeDefined();
    expect(Object.keys(done.review!)).toHaveLength(10);
  });

  it('этап проходится один раз', async () => {
    const ctx = await openTourWithPlayer();
    await ctx.svc.startStage(ctx.player, 1);
    await ctx.svc.finishStage(ctx.player, 1);
    await expect(ctx.svc.finishStage(ctx.player, 1)).rejects.toThrow(/завершён/);
    const again = await ctx.svc.startStage(ctx.player, 1);
    expect(again.status).toBe('finished');
  });

  it('этап 5: черновик, отправка, анонимная оценка жюри, итог — среднее', async () => {
    const ctx = await openTourWithPlayer();
    for (const st of [1, 2, 3, 4] as StageNo[]) await solveStage(ctx, st);
    await ctx.svc.startStage(ctx.player, 5);
    const long = 'я'.repeat(5000);
    await ctx.svc.saveIdea(ctx.player, { problem: long }, false);
    await expect(ctx.svc.saveIdea(ctx.player, { problem: 'x' }, true)).rejects.toThrow(/обязательные/);
    const fields = Object.fromEntries(content.stage5.fields.map((f) => [f.id, 'текст']));
    const v = await ctx.svc.saveIdea(ctx.player, fields, true);
    expect(v.status).toBe('finished');
    expect(v.idea!.submittedAt).toBeTruthy();

    const jury = await ctx.svc.orgGenerateCodes(ctx.org, 'jury', 3);
    const list = await ctx.svc.juryList(jury[0]);
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain('Альпинист');
    expect(JSON.stringify(list)).not.toContain(ctx.player.id);
    const all = (v: number) => Object.fromEntries(content.stage5.criteria.map((c) => [c.id, v]));
    await ctx.svc.juryScore(jury[0], list[0].workNo, all(200), 'Отлично');
    await ctx.svc.juryScore(jury[1], list[0].workNo, all(100), '');
    await ctx.svc.juryScore(jury[2], list[0].workNo, all(100), '');
    await expect(ctx.svc.juryScore(jury[0], list[0].workNo, all(201), '')).rejects.toThrow();
    await expect(ctx.svc.juryList(ctx.player)).rejects.toThrow(/прав/);

    // Пока итоги не опубликованы, участник не видит оценку жюри
    let me = await ctx.svc.me(ctx.player);
    expect(me.participant!.altitude).toBe(4000);

    await ctx.svc.orgTour(ctx.org, 'close');
    await ctx.svc.orgTour(ctx.org, 'publish');
    me = await ctx.svc.me(ctx.player);
    expect(me.participant!.altitude).toBe(4667);
    const results = await ctx.svc.orgResults(ctx.org);
    expect(results.rows[0].stageAltitudes).toEqual([1000, 1000, 1000, 1000, 667]);
    expect(results.jury[0].scores).toHaveLength(3);
  });

  it('черновик идеи отправляется сам, когда кончилось время', async () => {
    const ctx = await openTourWithPlayer();
    for (const st of [1, 2, 3, 4] as StageNo[]) await solveStage(ctx, st);
    await ctx.svc.startStage(ctx.player, 5);
    await ctx.svc.saveIdea(ctx.player, { problem: 'Долгая приёмка' }, false);
    ctx.tick(41 * 60_000);
    const me = await ctx.svc.me(ctx.player);
    expect(me.participant!.stages[4].status).toBe('finished');
    expect((await ctx.store.getIdea(ctx.player.id))!.submittedAt).toBeTruthy();
  });

  it('во время тура участник видит только своё место, полный рейтинг — после публикации', async () => {
    const ctx = await openTourWithPlayer();
    await solveStage(ctx, 1);
    let lb = await ctx.svc.leaderboard(ctx.player);
    expect(lb.published).toBe(false);
    expect(lb.rows).toEqual([]);
    expect(lb.me.place).toBe(1);
    await expect(ctx.svc.orgTour(ctx.org, 'publish')).rejects.toThrow(/закройте/);
    await ctx.svc.orgTour(ctx.org, 'close');
    await ctx.svc.orgTour(ctx.org, 'publish');
    lb = await ctx.svc.leaderboard(ctx.player);
    expect(lb.rows).toHaveLength(1);
    expect(lb.rows[0].me).toBe(true);
    expect(JSON.stringify(lb)).not.toContain(ctx.player.code);
  });

  it('после закрытия тура новые этапы не начинаются', async () => {
    const ctx = await openTourWithPlayer();
    ctx.tick(8 * 86_400_000);
    const me = await ctx.svc.me(ctx.player);
    expect(me.tour.state).toBe('closed');
    await expect(ctx.svc.startStage(ctx.player, 1)).rejects.toThrow(/закрыт/);
  });

  it('организатор создаёт коды с учётом лимитов, ники уникальны', async () => {
    const ctx = await openTourWithPlayer();
    const created = await ctx.svc.orgGenerateCodes(ctx.org, 'participant', 149);
    expect(created).toHaveLength(149);
    await expect(ctx.svc.orgGenerateCodes(ctx.org, 'participant', 1)).rejects.toThrow(/Лимит/);
    await expect(ctx.svc.orgGenerateCodes(ctx.player, 'participant', 1)).rejects.toThrow(/прав/);
    await expect(ctx.svc.setProfile(created[0], 'альпинист', content.departments[0])).rejects.toThrow(/занят/);
    const logged = await ctx.svc.loginByCode(created[5].code.toLowerCase());
    expect(logged.id).toBe(created[5].id);
    const progress = await ctx.svc.orgProgress(ctx.org);
    expect(progress).toHaveLength(150);
  });
});

describe('демо-режим', () => {
  it('наполняется ботами без ошибок', async () => {
    const { MemoryStore } = await import('../src/core/memoryStore.ts');
    const { seedDemo } = await import('../src/core/demoSeed.ts');
    const store = new MemoryStore();
    await seedDemo(store, content);
    const accounts = await store.listAccounts();
    expect(accounts.filter((a) => a.role === 'jury')).toHaveLength(3);
    expect(accounts.find((a) => a.code === 'ORG2027')?.role).toBe('organizer');
    expect((await store.listRuns()).length).toBeGreaterThan(10);
  });
});
