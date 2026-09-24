// Единая точка входа: «действие + параметры» → метод GameService.
// Одинаково используется серверной функцией Supabase и демо-режимом.
import { GameError } from './errors.ts';
import type { GameService, TourAction } from './service.ts';
import type { StageNo } from './types.ts';

export type Action =
  | 'me'
  | 'setProfile'
  | 'startStage'
  | 'getStage'
  | 'answer'
  | 'hint'
  | 'finishStage'
  | 'saveIdea'
  | 'leaderboard'
  | 'juryList'
  | 'juryScore'
  | 'orgTour'
  | 'orgGenerateCodes'
  | 'orgCodes'
  | 'orgProgress'
  | 'orgResults';

// deno-lint-ignore no-explicit-any
type P = Record<string, any>;

export async function dispatch(svc: GameService, actorId: string | null, action: Action, p: P = {}): Promise<unknown> {
  const acc = await svc.actor(actorId);
  const stage = Number(p.stage) as StageNo;
  switch (action) {
    case 'me':
      return svc.me(acc);
    case 'setProfile':
      return svc.setProfile(acc, p.nick, p.department);
    case 'startStage':
      return svc.startStage(acc, stage);
    case 'getStage':
      return svc.getStage(acc, stage);
    case 'answer':
      return svc.answer(acc, stage, String(p.itemId), p.value);
    case 'hint':
      return svc.hint(acc, stage, String(p.itemId));
    case 'finishStage':
      return svc.finishStage(acc, stage);
    case 'saveIdea':
      return svc.saveIdea(acc, p.fields ?? {}, !!p.submit);
    case 'leaderboard':
      return svc.leaderboard(acc);
    case 'juryList':
      return svc.juryList(acc);
    case 'juryScore':
      return svc.juryScore(acc, Number(p.workNo), p.scores ?? {}, p.comment ?? '');
    case 'orgTour':
      return svc.orgTour(acc, p.action as TourAction, p.closesAt);
    case 'orgGenerateCodes':
      return svc.orgGenerateCodes(acc, p.role, Number(p.count));
    case 'orgCodes':
      return svc.orgCodes(acc);
    case 'orgProgress':
      return svc.orgProgress(acc);
    case 'orgResults':
      return svc.orgResults(acc);
    default:
      throw new GameError('Неизвестное действие.');
  }
}
