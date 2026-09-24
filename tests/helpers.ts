import raw from '../content/content.json';
import { GameService } from '../src/core/service.ts';
import { MemoryStore } from '../src/core/memoryStore.ts';
import { createRng } from '../src/core/random.ts';
import type { Content } from '../src/core/types.ts';

export const content = raw as unknown as Content;

/** Сервис с управляемыми часами и хранилищем в памяти. */
export function setup() {
  let now = new Date('2027-03-01T09:00:00Z');
  const store = new MemoryStore();
  const svc = new GameService(store, content, () => now, createRng('test'));
  return {
    store,
    svc,
    tick(ms: number) {
      now = new Date(now.getTime() + ms);
    },
    now: () => now,
  };
}

export async function openTourWithPlayer(nick = 'Альпинист') {
  const ctx = setup();
  const org = await ctx.svc.ensureOrganizer('ORGTEST1');
  await ctx.svc.orgTour(org, 'open');
  const [p] = await ctx.svc.orgGenerateCodes(org, 'participant', 1);
  await ctx.svc.setProfile(p, nick, content.departments[0]);
  const player = (await ctx.store.getAccount(p.id))!;
  return { ...ctx, org, player };
}
