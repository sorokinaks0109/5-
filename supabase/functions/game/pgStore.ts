// Хранилище в Postgres (Supabase). Работает с ключом service role — только внутри серверной функции.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { codeEmail } from '../_shared/core/codes.ts';
import { GameError } from '../_shared/core/errors.ts';
import type { Account, Idea, IdeaScore, StageNo, StageRun, Store, Tour } from '../_shared/core/types.ts';

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
const MAX_ROWS = 10000;

function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new Error(`База данных: ${res.error.message}`);
  return res.data;
}

const toAccount = (r: Row): Account => ({
  id: r.id,
  code: r.code,
  role: r.role,
  number: r.number,
  nick: r.nick,
  department: r.department,
  createdAt: r.created_at,
});
const toRun = (r: Row): StageRun => ({
  accountId: r.account_id,
  stage: r.stage,
  startedAt: r.started_at,
  deadline: r.deadline,
  finishedAt: r.finished_at,
  assignment: r.assignment,
  answers: r.answers ?? {},
  hints: r.hints ?? [],
});
const fromRun = (r: StageRun): Row => ({
  account_id: r.accountId,
  stage: r.stage,
  started_at: r.startedAt,
  deadline: r.deadline,
  finished_at: r.finishedAt,
  assignment: r.assignment,
  answers: r.answers,
  hints: r.hints,
});
const toIdea = (r: Row): Idea => ({
  accountId: r.account_id,
  workNo: r.work_no,
  fields: r.fields ?? {},
  submittedAt: r.submitted_at,
  updatedAt: r.updated_at,
});
const toScore = (r: Row): IdeaScore => ({
  ideaAccountId: r.idea_account_id,
  juryId: r.jury_id,
  scores: r.scores ?? {},
  comment: r.comment ?? '',
  updatedAt: r.updated_at,
});

export class PgStore implements Store {
  constructor(private db: SupabaseClient) {}

  async getTour(): Promise<Tour> {
    const r = check(await this.db.from('tour').select('*').eq('id', 1).single()) as Row;
    return {
      state: r.state,
      opensAt: r.opens_at,
      closesAt: r.closes_at,
      resultsPublished: r.results_published,
      salt: r.salt,
    };
  }
  async saveTour(t: Tour) {
    check(
      await this.db
        .from('tour')
        .update({ state: t.state, opens_at: t.opensAt, closes_at: t.closesAt, results_published: t.resultsPublished })
        .eq('id', 1),
    );
  }

  async getAccount(id: string) {
    const r = check(await this.db.from('accounts').select('*').eq('id', id).maybeSingle()) as Row | null;
    return r ? toAccount(r) : null;
  }
  async findAccountByCode(code: string) {
    const r = check(await this.db.from('accounts').select('*').eq('code', code).maybeSingle()) as Row | null;
    return r ? toAccount(r) : null;
  }
  async listAccounts() {
    return (check(await this.db.from('accounts').select('*').range(0, MAX_ROWS)) as Row[]).map(toAccount);
  }

  /** Для каждого кода создаётся пользователь Supabase Auth (вход по коду) и строка в accounts. */
  async createAccounts(items: Omit<Account, 'id' | 'createdAt'>[]) {
    const created: Account[] = [];
    const BATCH = 10;
    for (let i = 0; i < items.length; i += BATCH) {
      const part = items.slice(i, i + BATCH);
      const users = await Promise.all(
        part.map(async (it) => {
          const { data, error } = await this.db.auth.admin.createUser({
            email: codeEmail(it.code),
            password: it.code,
            email_confirm: true,
            app_metadata: { role: it.role },
          });
          if (error || !data.user) throw new GameError(`Не удалось создать код ${it.code}: ${error?.message ?? ''}`);
          return { ...it, id: data.user.id };
        }),
      );
      const rows = users.map((u) => ({
        id: u.id,
        code: u.code,
        role: u.role,
        number: u.number,
        nick: u.nick,
        department: u.department,
      }));
      const inserted = check(await this.db.from('accounts').insert(rows).select('*')) as Row[];
      created.push(...inserted.map(toAccount));
    }
    return created;
  }

  async updateAccount(a: Account) {
    const res = await this.db.from('accounts').update({ nick: a.nick, department: a.department }).eq('id', a.id);
    if (res.error?.code === '23505') throw new GameError('Такой ник уже занят. Придумайте другой.');
    check(res);
  }

  async getRun(accountId: string, stage: StageNo) {
    const r = check(
      await this.db.from('stage_runs').select('*').eq('account_id', accountId).eq('stage', stage).maybeSingle(),
    ) as Row | null;
    return r ? toRun(r) : null;
  }
  async listRuns(accountId?: string) {
    let q = this.db.from('stage_runs').select('*');
    if (accountId) q = q.eq('account_id', accountId);
    return (check(await q.range(0, MAX_ROWS)) as Row[]).map(toRun);
  }
  async insertRun(run: StageRun) {
    const res = await this.db.from('stage_runs').insert(fromRun(run));
    if (res.error?.code === '23505') return false; // этап уже начат (двойное нажатие)
    check(res);
    return true;
  }
  async saveRun(run: StageRun) {
    check(await this.db.from('stage_runs').update(fromRun(run)).eq('account_id', run.accountId).eq('stage', run.stage));
  }

  async getIdea(accountId: string) {
    const r = check(await this.db.from('ideas').select('*').eq('account_id', accountId).maybeSingle()) as Row | null;
    return r ? toIdea(r) : null;
  }
  async listIdeas() {
    return (check(await this.db.from('ideas').select('*').range(0, MAX_ROWS)) as Row[]).map(toIdea);
  }
  async saveIdea(i: Idea) {
    check(
      await this.db.from('ideas').upsert({
        account_id: i.accountId,
        work_no: i.workNo,
        fields: i.fields,
        submitted_at: i.submittedAt,
        updated_at: i.updatedAt,
      }),
    );
  }

  async listIdeaScores() {
    return (check(await this.db.from('idea_scores').select('*').range(0, MAX_ROWS)) as Row[]).map(toScore);
  }
  async saveIdeaScore(s: IdeaScore) {
    check(
      await this.db.from('idea_scores').upsert({
        idea_account_id: s.ideaAccountId,
        jury_id: s.juryId,
        scores: s.scores,
        comment: s.comment,
        updated_at: s.updatedAt,
      }),
    );
  }
}
