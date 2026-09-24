// Общий интерфейс связи с «сервером». Экраны не знают, демо это или Supabase.
import type { Action } from '../core/dispatch.ts';
import type {
  Account,
  AnswerResult,
  AnswerValue,
  JuryWork,
  LeaderboardView,
  MeView,
  ProgressRow,
  ResultsView,
  StageNo,
  StageView,
  TourView,
} from '../core/types.ts';
import type { TourAction } from '../core/service.ts';

export interface Transport {
  mode: 'demo' | 'supabase';
  login(code: string): Promise<void>;
  logout(): Promise<void>;
  hasSession(): Promise<boolean>;
  call(action: Action, payload?: Record<string, unknown>): Promise<unknown>;
  /** Только для демо: сбросить данные */
  reset?(): Promise<void>;
}

export function createClient(t: Transport) {
  const c = <T>(action: Action, payload?: Record<string, unknown>) => t.call(action, payload) as Promise<T>;
  return {
    mode: t.mode,
    login: (code: string) => t.login(code),
    logout: () => t.logout(),
    hasSession: () => t.hasSession(),
    reset: t.reset?.bind(t),
    me: () => c<MeView>('me'),
    setProfile: (nick: string, department: string) => c<MeView>('setProfile', { nick, department }),
    startStage: (stage: StageNo) => c<StageView>('startStage', { stage }),
    getStage: (stage: StageNo) => c<StageView>('getStage', { stage }),
    answer: (stage: StageNo, itemId: string, value: AnswerValue) => c<AnswerResult>('answer', { stage, itemId, value }),
    hint: (stage: StageNo, itemId: string) => c<{ hint: string; hintsLeft: number }>('hint', { stage, itemId }),
    finishStage: (stage: StageNo) => c<StageView>('finishStage', { stage }),
    saveIdea: (fields: Record<string, string>, submit: boolean) => c<StageView>('saveIdea', { fields, submit }),
    leaderboard: () => c<LeaderboardView>('leaderboard'),
    juryList: () => c<JuryWork[]>('juryList'),
    juryScore: (workNo: number, scores: Record<string, number>, comment: string) =>
      c<JuryWork[]>('juryScore', { workNo, scores, comment }),
    orgTour: (action: TourAction, closesAt?: string) => c<TourView>('orgTour', { action, closesAt }),
    orgGenerateCodes: (role: 'participant' | 'jury', count: number) => c<Account[]>('orgGenerateCodes', { role, count }),
    orgCodes: () => c<Account[]>('orgCodes'),
    orgProgress: () => c<ProgressRow[]>('orgProgress'),
    orgResults: () => c<ResultsView>('orgResults'),
  };
}

export type Client = ReturnType<typeof createClient>;
