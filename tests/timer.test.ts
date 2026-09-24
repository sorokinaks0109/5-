import { describe, expect, it } from 'vitest';
import { computeDeadline, formatClock, isExpired, oxygenShare, remainingMs, stageSeconds } from '../src/core/timer.ts';
import { openTourWithPlayer } from './helpers.ts';

describe('таймер («кислород»)', () => {
  const start = new Date('2027-03-01T10:00:00Z');
  const deadline = computeDeadline(start, 15);

  it('считает дедлайн и остаток', () => {
    expect(deadline.toISOString()).toBe('2027-03-01T10:15:00.000Z');
    expect(remainingMs(deadline, new Date('2027-03-01T10:10:00Z'))).toBe(5 * 60_000);
    expect(remainingMs(deadline, new Date('2027-03-01T10:20:00Z'))).toBe(0);
  });

  it('учитывает фору на задержку сети', () => {
    const after5s = new Date(deadline.getTime() + 5000);
    expect(isExpired(deadline, after5s, 10)).toBe(false);
    expect(isExpired(deadline, after5s, 0)).toBe(true);
  });

  it('рисует баллон и часы', () => {
    expect(oxygenShare(start, deadline, start)).toBe(1);
    expect(oxygenShare(start, deadline, new Date('2027-03-01T10:07:30Z'))).toBe(0.5);
    expect(oxygenShare(start, deadline, new Date('2027-03-01T11:00:00Z'))).toBe(0);
    expect(formatClock(65_000)).toBe('01:05');
    expect(formatClock(0)).toBe('00:00');
  });

  it('незавершённый этап в тай-брейке считается за весь лимит', () => {
    expect(stageSeconds(null, null, 15)).toBe(900);
    expect(stageSeconds('2027-03-01T10:00:00Z', '2027-03-01T10:05:00Z', 15)).toBe(300);
  });

  it('таймер идёт, даже если участник закрыл страницу: этап закрывается сам', async () => {
    const { svc, player, tick } = await openTourWithPlayer();
    const v = await svc.startStage(player, 1);
    expect(v.status).toBe('active');
    tick(16 * 60_000); // участник вернулся через 16 минут
    const me = await svc.me(player);
    expect(me.participant!.stages[0].status).toBe('finished');
    expect(me.participant!.stages[0].finishedAt).toBe(v.deadline);
    expect(me.participant!.stages[1].status).toBe('available');
    await expect(svc.answer(player, 1, v.items[0].id, 'waiting')).rejects.toThrow(/завершён/);
  });

  it('ответ в пределах форы принимается, после — нет', async () => {
    const { svc, player, tick } = await openTourWithPlayer();
    const v = await svc.startStage(player, 1);
    tick(15 * 60_000 + 5_000);
    await expect(svc.answer(player, 1, v.items[0].id, 'waiting')).resolves.toBeTruthy();
    tick(10_000);
    await expect(svc.answer(player, 1, v.items[1].id, 'waiting')).rejects.toThrow();
  });

  it('повторный вход в этап не перезапускает таймер', async () => {
    const { svc, player, tick } = await openTourWithPlayer();
    const v1 = await svc.startStage(player, 1);
    tick(60_000);
    const v2 = await svc.startStage(player, 1);
    expect(v2.startedAt).toBe(v1.startedAt);
    expect(v2.deadline).toBe(v1.deadline);
  });
});
