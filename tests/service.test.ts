import { describe, expect, it } from 'vitest';
import { buildItems, perfectAnswer } from '../src/core/items.ts';
import { AUTO_STAGES, IDEA_STAGE, type StageNo } from '../src/core/types.ts';
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
    expect(me.participant!.stages.map((s) => s.status)).toEqual(['finished', 'available', 'locked', 'locked', 'locked', 'locked', 'locked']);
  });

  it('идеальное прохождение автоматических вершин 1–6 даёт 6000 м', async () => {
    const ctx = await openTourWithPlayer();
    for (const st of AUTO_STAGES) await solveStage(ctx, st);
    const me = await ctx.svc.me(ctx.player);
    expect(me.participant!.altitude).toBe(6000);
    expect(me.participant!.place).toBe(1);
    expect(me.participant!.stages[6].status).toBe('available');
  });

  it('ответ окончательный, ошибка портит погоду', async () => {
    const ctx = await openTourWithPlayer();
    const v = await ctx.svc.startStage(ctx.player, 1);
    const run = (await ctx.store.getRun(ctx.player.id, 1))!;
    const it = buildItems(1, content, run.assignment)[0];
    const wrong = content.waste.wasteTypes.find((w) => w.id !== (it.key as { answer: string }).answer)!.id;
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
    expect(Object.keys(done.review!)).toHaveLength(10 + content.settings.draw.wasteMoney);
  });

  it('этап проходится один раз', async () => {
    const ctx = await openTourWithPlayer();
    await ctx.svc.startStage(ctx.player, 1);
    await ctx.svc.finishStage(ctx.player, 1);
    await expect(ctx.svc.finishStage(ctx.player, 1)).rejects.toThrow(/завершён/);
    const again = await ctx.svc.startStage(ctx.player, 1);
    expect(again.status).toBe('finished');
  });

  it('вершина с идеей: черновик, отправка, анонимная оценка жюри, итог — среднее', async () => {
    const ctx = await openTourWithPlayer();
    for (const st of AUTO_STAGES) await solveStage(ctx, st);
    await ctx.svc.startStage(ctx.player, IDEA_STAGE);
    const long = 'я'.repeat(5000);
    await ctx.svc.saveIdea(ctx.player, { problem: long }, false);
    await expect(ctx.svc.saveIdea(ctx.player, { problem: 'x' }, true)).rejects.toThrow(/обязательные/);
    const fields = Object.fromEntries(content.idea.fields.map((f) => [f.id, 'текст']));
    const v = await ctx.svc.saveIdea(ctx.player, fields, true);
    expect(v.status).toBe('finished');
    expect(v.idea!.submittedAt).toBeTruthy();

    const jury = await ctx.svc.orgGenerateCodes(ctx.org, 'jury', 3);
    const list = await ctx.svc.juryList(jury[0]);
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain('Альпинист');
    expect(JSON.stringify(list)).not.toContain(ctx.player.id);
    const all = (v: number) => Object.fromEntries(content.idea.criteria.map((c) => [c.id, v]));
    await ctx.svc.juryScore(jury[0], list[0].workNo, all(200), 'Отлично');
    await ctx.svc.juryScore(jury[1], list[0].workNo, all(100), '');
    await ctx.svc.juryScore(jury[2], list[0].workNo, all(100), '');
    await expect(ctx.svc.juryScore(jury[0], list[0].workNo, all(201), '')).rejects.toThrow();
    await expect(ctx.svc.juryList(ctx.player)).rejects.toThrow(/прав/);

    // Пока итоги не опубликованы, участник не видит оценку жюри
    let me = await ctx.svc.me(ctx.player);
    expect(me.participant!.altitude).toBe(6000);

    await ctx.svc.orgTour(ctx.org, 'close');
    await ctx.svc.orgTour(ctx.org, 'publish');
    me = await ctx.svc.me(ctx.player);
    expect(me.participant!.altitude).toBe(6667);
    const results = await ctx.svc.orgResults(ctx.org);
    expect(results.rows[0].stageAltitudes).toEqual([1000, 1000, 1000, 1000, 1000, 1000, 667]);
    expect(results.jury[0].scores).toHaveLength(3);
  });

  it('черновик идеи отправляется сам, когда кончилось время', async () => {
    const ctx = await openTourWithPlayer();
    for (const st of AUTO_STAGES) await solveStage(ctx, st);
    await ctx.svc.startStage(ctx.player, IDEA_STAGE);
    await ctx.svc.saveIdea(ctx.player, { problem: 'Долгая приёмка' }, false);
    ctx.tick(41 * 60_000);
    const me = await ctx.svc.me(ctx.player);
    expect(me.participant!.stages[6].status).toBe('finished');
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
    await expect(ctx.svc.orgGenerateCodes(ctx.org, 'participant', 1)).rejects.toThrow(/не больше/);
    await expect(ctx.svc.orgGenerateCodes(ctx.player, 'participant', 1)).rejects.toThrow(/прав/);
    await expect(ctx.svc.setProfile(created[0], 'альпинист')).rejects.toThrow(/занят/);
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

describe('новые задания', () => {
  it('5С даёт 1000 м за идеальный ответ и на складе, и в почте', async () => {
    const { assignStage } = await import('../src/core/assign.ts');
    const seen = new Set<string>();
    for (let i = 0; i < 40 && seen.size < 2; i++) {
      const a = assignStage(2, content, `salt:p${i}:2`);
      const items = buildItems(2, content, a);
      const kind = items[1].item.kind;
      seen.add(kind);
      const { gradeAnswer } = await import('../src/core/items.ts');
      const total = items.reduce((s, it) => s + it.item.maxPoints * gradeAnswer(it.key, perfectAnswer(it.key)), 0);
      expect(total).toBe(1000);
    }
    expect([...seen].sort()).toEqual(['hotspots', 'inbox']);
  });

  it('рыбья кость: спорную карточку засчитывают и на второй кости', async () => {
    const { gradeAnswer } = await import('../src/core/items.ts');
    const fc = content.fishbone.cases.find((c) => c.causes.some((x) => x.accept?.length))!;
    const items = buildItems(5, content, { group: fc.id, items: [{ id: 'fb-fishbone', ref: 'fishbone' }] });
    const key = items[0].key;
    const perfect = perfectAnswer(key) as Record<string, string>;
    const disputed = fc.causes.find((x) => x.accept?.length)!;
    expect(gradeAnswer(key, { ...perfect, [disputed.id]: disputed.accept![0] })).toBe(1);
    expect(gradeAnswer(key, { ...perfect, [disputed.id]: 'environment' === disputed.category ? 'people' : 'environment' })).toBeLessThan(1);
  });

  it('закон Литтла: срок = заявки ÷ скорость, цель = скорость × срок', () => {
    const l = content.flow.little[0];
    const items = buildItems(3, content, {
      group: content.flow.processes[0].id,
      items: [
        { id: 'flow-little', ref: `little:${l.id}` },
        { id: 'flow-target', ref: `target:${l.id}` },
      ],
    });
    expect(items[0].key).toMatchObject({ kind: 'number', answer: Math.round((l.wip / l.cr) * 10) / 10 });
    expect(items[1].key).toMatchObject({ kind: 'number', answer: l.cr * l.target });
    expect(items[1].item.kind === 'number' && items[1].item.calc).toBeTruthy();
  });

  it('организатор очищает результаты перед настоящим туром', async () => {
    const ctx = await openTourWithPlayer();
    await solveStage(ctx, 1);
    await ctx.svc.orgReset(ctx.org);
    expect(await ctx.store.listRuns()).toHaveLength(0);
    const me = await ctx.svc.me(ctx.player);
    expect(me.tour.state).toBe('draft');
    expect(me.nick).toBe('Альпинист');
    await expect(ctx.svc.orgReset(ctx.player)).rejects.toThrow(/прав/);
  });
});
