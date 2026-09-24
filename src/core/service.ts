// GameService — все правила игры в одном месте.
// Работает одинаково в демо-режиме (в браузере) и на сервере (функция Supabase),
// поэтому правила проверяются тестами один раз.
import { assignStage, assignmentSeed } from './assign.ts';
import { generateUniqueCodes, normalizeCode } from './codes.ts';
import { GameError } from './errors.ts';
import { buildItems, gradeAnswer, reviewFor, stageIntro } from './items.ts';
import { rank } from './ranking.ts';
import { cryptoRng, type Rng } from './random.ts';
import { countErrors, hintsLeft, ideaAltitude, juryTotal, pointsFor, stageAltitude, weatherFor } from './scoring.ts';
import { computeDeadline, isExpired, stageSeconds } from './timer.ts';
import {
  AUTO_STAGES,
  IDEA_STAGE,
  STAGES,
  type Account,
  type AnswerResult,
  type AnswerValue,
  type Content,
  type Idea,
  type IdeaScore,
  type JuryDetail,
  type JuryWork,
  type LeaderboardView,
  type MeView,
  type ProgressRow,
  type RatingRow,
  type ResultsView,
  type Role,
  type StageNo,
  type StageRun,
  type StageStatus,
  type StageSummary,
  type StageView,
  type Store,
  type Tour,
  type TourView,
} from './types.ts';

export type TourAction = 'open' | 'close' | 'publish' | 'unpublish' | 'setClosesAt';

export class GameService {
  constructor(
    private store: Store,
    private content: Content,
    private clock: () => Date = () => new Date(),
    private rng: Rng = cryptoRng,
  ) {}

  private now() {
    return this.clock();
  }

  // ---------- Общее ----------

  /** Вход по коду (используется в демо; в боевом режиме вход делает Supabase Auth). */
  async loginByCode(code: string): Promise<Account> {
    const acc = await this.store.findAccountByCode(normalizeCode(code));
    if (!acc) throw new GameError('Код не найден. Проверьте, нет ли опечатки.');
    return acc;
  }

  async actor(id: string | null): Promise<Account> {
    const acc = id ? await this.store.getAccount(id) : null;
    if (!acc) throw new GameError('Сессия устарела. Войдите по коду заново.');
    return acc;
  }

  /** Создаёт организатора с заданным кодом, если его ещё нет. */
  async ensureOrganizer(code: string): Promise<Account> {
    const norm = normalizeCode(code);
    const found = await this.store.findAccountByCode(norm);
    if (found) {
      if (found.role !== 'organizer') throw new GameError('Этот код уже выдан не организатору.');
      return found;
    }
    const all = await this.store.listAccounts();
    const [acc] = await this.store.createAccounts([
      { code: norm, role: 'organizer', number: nextNumber(all, 'organizer'), nick: null, department: null },
    ]);
    return acc;
  }

  private effectiveState(tour: Tour): Tour['state'] {
    if (tour.state === 'open' && tour.closesAt && this.now() >= new Date(tour.closesAt)) return 'closed';
    return tour.state;
  }

  private tourView(tour: Tour): TourView {
    return {
      state: this.effectiveState(tour),
      opensAt: tour.opensAt,
      closesAt: tour.closesAt,
      resultsPublished: tour.resultsPublished,
      serverNow: this.now().toISOString(),
    };
  }

  private require(acc: Account, role: Role) {
    if (acc.role !== role) throw new GameError('Недостаточно прав для этого действия.');
  }

  private minutes(stage: StageNo) {
    return this.content.settings.stageMinutes[stage - 1];
  }

  // ---------- Участник ----------

  async me(acc: Account): Promise<MeView> {
    const tour = await this.store.getTour();
    const view: MeView = {
      role: acc.role,
      number: acc.number,
      nick: acc.nick,
      department: acc.department,
      tour: this.tourView(tour),
    };
    if (acc.role !== 'participant') return view;

    await this.finalizeExpired(acc.id);
    const runs = await this.store.listRuns(acc.id);
    const stages = await this.summaries(acc, runs, tour);
    const rating = await this.rating(tour.resultsPublished);
    const mine = rating.find((r) => r.accountId === acc.id);
    view.participant = {
      stages,
      altitude: stages.reduce((s, x) => s + x.altitude, 0),
      hintsLeft: hintsLeft(this.content.settings.hintsTotal, runs.map((r) => r.hints)),
      place: mine?.place ?? null,
      participantsCount: rating.length,
    };
    return view;
  }

  async setProfile(acc: Account, nick: string, department: string): Promise<MeView> {
    this.require(acc, 'participant');
    const n = String(nick ?? '').trim().replace(/\s+/g, ' ');
    if (n.length < 2 || n.length > 24) throw new GameError('Ник — от 2 до 24 символов.');
    if (!this.content.departments.includes(department)) throw new GameError('Выберите подразделение из списка.');
    const tour = await this.store.getTour();
    if (tour.resultsPublished) throw new GameError('Итоги уже опубликованы, профиль менять нельзя.');
    const others = await this.store.listAccounts();
    if (others.some((a) => a.id !== acc.id && a.role === 'participant' && a.nick?.toLowerCase() === n.toLowerCase()))
      throw new GameError('Такой ник уже занят. Придумайте другой.');
    const updated = { ...acc, nick: n, department };
    await this.store.updateAccount(updated);
    return this.me(updated);
  }

  private async summaries(acc: Account, runs: StageRun[], tour: Tour): Promise<StageSummary[]> {
    const open = this.effectiveState(tour) === 'open';
    const byStage = new Map(runs.map((r) => [r.stage, r]));
    const idea = await this.store.getIdea(acc.id);
    const scores = idea ? (await this.store.listIdeaScores()).filter((s) => s.ideaAccountId === acc.id) : [];
    return STAGES.map((stage): StageSummary => {
      const run = byStage.get(stage);
      const prev = stage === 1 ? true : !!byStage.get((stage - 1) as StageNo)?.finishedAt;
      let status: StageStatus;
      if (run) status = run.finishedAt ? 'finished' : 'active';
      else status = prev && open && !!acc.nick ? 'available' : 'locked';
      let altitude = run ? stageAltitude(run.answers) : 0;
      if (stage === IDEA_STAGE) {
        altitude = tour.resultsPublished && idea?.submittedAt ? ideaAltitude(scores, this.content.idea.criteria) ?? 0 : 0;
      }
      return {
        stage,
        status,
        altitude,
        maxAltitude: this.content.settings.stageMaxAltitude,
        startedAt: run?.startedAt ?? null,
        deadline: run?.deadline ?? null,
        finishedAt: run?.finishedAt ?? null,
        errors: run ? countErrors(run.answers) : 0,
        juryScored: stage === IDEA_STAGE && tour.resultsPublished ? scores.length : undefined,
      };
    });
  }

  /** Закрывает этапы, у которых вышло время (таймер идёт, даже если страница закрыта). */
  private async finalizeExpired(accountId: string): Promise<void> {
    const runs = await this.store.listRuns(accountId);
    for (const run of runs) {
      if (!run.finishedAt && isExpired(run.deadline, this.now(), this.content.settings.graceSeconds)) {
        await this.closeRun(run, run.deadline);
      }
    }
  }

  private async closeRun(run: StageRun, at: string) {
    run.finishedAt = at;
    if (run.stage === IDEA_STAGE) {
      // Черновик идеи отправляется автоматически, если в нём что-то написано.
      const idea = await this.store.getIdea(run.accountId);
      if (idea && !idea.submittedAt && Object.values(idea.fields).some((v) => v.trim())) {
        await this.store.saveIdea({ ...idea, submittedAt: at });
      }
    }
    await this.store.saveRun(run);
  }

  async startStage(acc: Account, stage: StageNo): Promise<StageView> {
    this.require(acc, 'participant');
    if (!STAGES.includes(stage)) throw new GameError('Нет такой вершины.');
    await this.finalizeExpired(acc.id);
    const existing = await this.store.getRun(acc.id, stage);
    if (existing) return this.stageView(acc, existing);

    const tour = await this.store.getTour();
    const runs = await this.store.listRuns(acc.id);
    const status = (await this.summaries(acc, runs, tour))[stage - 1].status;
    if (status !== 'available') {
      if (!acc.nick) throw new GameError('Сначала заполните профиль: ник и подразделение.');
      if (this.effectiveState(tour) !== 'open') throw new GameError('Тур сейчас закрыт.');
      throw new GameError('Эта вершина откроется после прохождения предыдущей.');
    }

    const now = this.now();
    const run: StageRun = {
      accountId: acc.id,
      stage,
      startedAt: now.toISOString(),
      deadline: computeDeadline(now, this.minutes(stage)).toISOString(),
      finishedAt: null,
      assignment: assignStage(stage, this.content, assignmentSeed(tour.salt, acc.id, stage)),
      answers: {},
      hints: [],
    };
    const inserted = await this.store.insertRun(run);
    const saved = inserted ? run : await this.store.getRun(acc.id, stage);
    if (!saved) throw new GameError('Не удалось начать этап. Попробуйте ещё раз.');
    return this.stageView(acc, saved);
  }

  async getStage(acc: Account, stage: StageNo): Promise<StageView> {
    this.require(acc, 'participant');
    await this.finalizeExpired(acc.id);
    const run = await this.store.getRun(acc.id, stage);
    if (!run) throw new GameError('Этот этап ещё не начат.');
    return this.stageView(acc, run);
  }

  private async stageView(acc: Account, run: StageRun): Promise<StageView> {
    const items = buildItems(run.stage, this.content, run.assignment);
    const runs = await this.store.listRuns(acc.id);
    const errors = countErrors(run.answers);
    const hints: Record<string, string> = {};
    for (const id of run.hints) {
      const it = items.find((i) => i.item.id === id);
      if (it?.hint) hints[id] = it.hint;
    }
    const answers: StageView['answers'] = {};
    for (const [id, a] of Object.entries(run.answers)) {
      answers[id] = { value: a.value, fraction: a.fraction, points: a.points, hint: a.hint };
    }
    const view: StageView = {
      stage: run.stage,
      status: run.finishedAt ? 'finished' : 'active',
      startedAt: run.startedAt,
      deadline: run.deadline,
      finishedAt: run.finishedAt,
      serverNow: this.now().toISOString(),
      intro: stageIntro(run.stage, this.content, run.assignment),
      items: items.map((i) => i.item),
      answers,
      hints,
      hintsLeft: hintsLeft(this.content.settings.hintsTotal, runs.map((r) => r.hints)),
      weather: weatherFor(errors, items.length),
      errors,
      altitude: stageAltitude(run.answers),
    };
    // Правильные ответы — только после завершения этапа.
    if (run.finishedAt && run.stage !== IDEA_STAGE) {
      view.review = Object.fromEntries(items.map((i) => [i.item.id, reviewFor(i)]));
    }
    if (run.stage === IDEA_STAGE) {
      const idea = await this.store.getIdea(acc.id);
      view.idea = idea
        ? { fields: idea.fields, submittedAt: idea.submittedAt, workNo: idea.workNo }
        : { fields: {}, submittedAt: null, workNo: 0 };
    }
    return view;
  }

  private async activeRun(acc: Account, stage: StageNo): Promise<StageRun> {
    this.require(acc, 'participant');
    await this.finalizeExpired(acc.id);
    const run = await this.store.getRun(acc.id, stage);
    if (!run) throw new GameError('Этот этап ещё не начат.');
    if (run.finishedAt) throw new GameError('Этап уже завершён. Ответы больше не принимаются.');
    return run;
  }

  async answer(acc: Account, stage: StageNo, itemId: string, value: AnswerValue): Promise<AnswerResult> {
    const run = await this.activeRun(acc, stage);
    const items = buildItems(stage, this.content, run.assignment);
    const it = items.find((i) => i.item.id === itemId);
    if (!it) throw new GameError('Задание не найдено.');
    if (run.answers[itemId]) throw new GameError('На это задание уже дан ответ.');

    const fraction = gradeAnswer(it.key, value);
    const hint = run.hints.includes(itemId);
    run.answers[itemId] = {
      value,
      fraction,
      points: pointsFor(it.item.maxPoints, fraction, hint, this.content.settings.hintPenalty),
      hint,
      answeredAt: this.now().toISOString(),
    };
    // Все задания решены — этап завершается сам: так честнее для времени в тай-брейке.
    if (items.every((i) => run.answers[i.item.id])) run.finishedAt = this.now().toISOString();
    await this.store.saveRun(run);
    const errors = countErrors(run.answers);
    return {
      itemId,
      fraction,
      points: run.answers[itemId].points,
      altitude: stageAltitude(run.answers),
      errors,
      weather: weatherFor(errors, items.length),
    };
  }

  async hint(acc: Account, stage: StageNo, itemId: string): Promise<{ hint: string; hintsLeft: number }> {
    const run = await this.activeRun(acc, stage);
    const it = buildItems(stage, this.content, run.assignment).find((i) => i.item.id === itemId);
    if (!it) throw new GameError('Задание не найдено.');
    if (!it.hint) throw new GameError('Для этого задания нет подсказки.');
    if (run.answers[itemId]) throw new GameError('Ответ уже дан — подсказка не нужна.');
    const runs = await this.store.listRuns(acc.id);
    const left = hintsLeft(this.content.settings.hintsTotal, runs.map((r) => r.hints));
    if (!run.hints.includes(itemId)) {
      if (left <= 0) throw new GameError('Снаряжение закончилось: все подсказки уже использованы.');
      run.hints.push(itemId);
      await this.store.saveRun(run);
      return { hint: it.hint, hintsLeft: left - 1 };
    }
    return { hint: it.hint, hintsLeft: left };
  }

  async finishStage(acc: Account, stage: StageNo): Promise<StageView> {
    if (stage === IDEA_STAGE) throw new GameError('Эта вершина завершается отправкой идеи.');
    const run = await this.activeRun(acc, stage);
    await this.closeRun(run, this.now().toISOString());
    return this.stageView(acc, run);
  }

  async saveIdea(acc: Account, fields: Record<string, string>, submit: boolean): Promise<StageView> {
    const run = await this.activeRun(acc, IDEA_STAGE);
    const clean: Record<string, string> = {};
    for (const f of this.content.idea.fields) {
      clean[f.id] = String(fields?.[f.id] ?? '').slice(0, f.maxLength);
    }
    if (submit) {
      const empty = this.content.idea.fields.filter((f) => f.required && !clean[f.id].trim());
      if (empty.length) throw new GameError(`Заполните обязательные поля: ${empty.map((f) => f.label).join(', ')}.`);
    }
    const now = this.now().toISOString();
    const existing = await this.store.getIdea(acc.id);
    const idea: Idea = existing
      ? { ...existing, fields: clean, updatedAt: now }
      : { accountId: acc.id, workNo: await this.freeWorkNo(), fields: clean, submittedAt: null, updatedAt: now };
    if (submit) idea.submittedAt = now;
    await this.store.saveIdea(idea);
    if (submit) await this.closeRun(run, now);
    return this.stageView(acc, run);
  }

  /** Номер работы для жюри — случайный, чтобы по нему нельзя было угадать автора. */
  private async freeWorkNo(): Promise<number> {
    const used = new Set((await this.store.listIdeas()).map((i) => i.workNo));
    for (let i = 0; i < 1000; i++) {
      const n = 100 + Math.floor(this.rng() * 900);
      if (!used.has(n)) return n;
    }
    let n = 1000;
    while (used.has(n)) n++;
    return n;
  }

  async leaderboard(acc: Account): Promise<LeaderboardView> {
    const tour = await this.store.getTour();
    const rows = await this.rating(tour.resultsPublished);
    const mine = rows.find((r) => r.accountId === acc.id);
    const me = { place: mine?.place ?? null, altitude: mine?.altitude ?? 0, participantsCount: rows.length };
    if (!tour.resultsPublished) return { published: false, rows: [], me };
    return {
      published: true,
      me,
      rows: rows.map((r) => ({
        place: r.place,
        nick: r.nick,
        department: r.department,
        altitude: r.altitude,
        finalist: r.finalist,
        me: r.accountId === acc.id,
      })),
    };
  }

  /** Рейтинг. includeJury=false — без этапа 5 (пока итоги не опубликованы, участники его не видят). */
  private async rating(includeJury: boolean): Promise<RatingRow[]> {
    const [accounts, runs, ideas, scores] = await Promise.all([
      this.store.listAccounts(),
      this.store.listRuns(),
      this.store.listIdeas(),
      this.store.listIdeaScores(),
    ]);
    const criteria = this.content.idea.criteria;
    const rows = accounts
      .filter((a) => a.role === 'participant')
      .map((a) => {
        const my = runs.filter((r) => r.accountId === a.id);
        if (!my.length) return null;
        const byStage = new Map(my.map((r) => [r.stage, r]));
        const idea = ideas.find((i) => i.accountId === a.id && i.submittedAt);
        const ideaScores = idea ? scores.filter((s) => s.ideaAccountId === a.id) : [];
        const stageAltitudes = STAGES.map((st) => {
          if (st === IDEA_STAGE) return includeJury ? ideaAltitude(ideaScores, criteria) ?? 0 : 0;
          const r = byStage.get(st);
          return r ? stageAltitude(r.answers) : 0;
        });
        const secondsAuto = AUTO_STAGES.reduce((s, st) => {
          const r = byStage.get(st);
          return s + stageSeconds(r?.startedAt ?? null, r?.finishedAt ?? null, this.minutes(st));
        }, 0);
        return {
          accountId: a.id,
          number: a.number,
          code: a.code,
          nick: a.nick ?? `Участник ${a.number}`,
          department: a.department ?? '',
          stageAltitudes,
          altitude: stageAltitudes.reduce((s, x) => s + x, 0),
          secondsAuto,
          hintsUsed: my.reduce((s, r) => s + r.hints.length, 0),
          juryScored: ideaScores.length,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    const n = this.content.settings.finalistsCount;
    return rank(rows).map((r, i) => ({ ...r, finalist: i < n && r.altitude > 0 }));
  }

  // ---------- Жюри ----------

  async juryList(acc: Account): Promise<JuryWork[]> {
    this.require(acc, 'jury');
    const ideas = (await this.store.listIdeas()).filter((i) => i.submittedAt);
    const scores = (await this.store.listIdeaScores()).filter((s) => s.juryId === acc.id);
    return ideas
      .sort((a, b) => a.workNo - b.workNo)
      .map((i) => {
        const my = scores.find((s) => s.ideaAccountId === i.accountId);
        return {
          workNo: i.workNo,
          fields: i.fields,
          submittedAt: i.submittedAt!,
          myScores: my?.scores ?? null,
          myComment: my?.comment ?? '',
        };
      });
  }

  async juryScore(acc: Account, workNo: number, scores: Record<string, number>, comment: string): Promise<JuryWork[]> {
    this.require(acc, 'jury');
    const tour = await this.store.getTour();
    if (tour.resultsPublished) throw new GameError('Итоги опубликованы — оценки больше менять нельзя.');
    const idea = (await this.store.listIdeas()).find((i) => i.workNo === Number(workNo) && i.submittedAt);
    if (!idea) throw new GameError('Работа не найдена.');
    const clean: Record<string, number> = {};
    for (const c of this.content.idea.criteria) {
      const v = Number(scores?.[c.id]);
      if (!Number.isFinite(v) || v < 0 || v > c.max) throw new GameError(`«${c.name}»: оценка от 0 до ${c.max}.`);
      clean[c.id] = Math.round(v);
    }
    const score: IdeaScore = {
      ideaAccountId: idea.accountId,
      juryId: acc.id,
      scores: clean,
      comment: String(comment ?? '').slice(0, 2000),
      updatedAt: this.now().toISOString(),
    };
    await this.store.saveIdeaScore(score);
    return this.juryList(acc);
  }

  // ---------- Организатор ----------

  async orgTour(acc: Account, action: TourAction, closesAt?: string): Promise<TourView> {
    this.require(acc, 'organizer');
    const tour = await this.store.getTour();
    const now = this.now();
    switch (action) {
      case 'open':
        tour.state = 'open';
        tour.opensAt = now.toISOString();
        tour.closesAt = new Date(now.getTime() + this.content.settings.tourDays * 86_400_000).toISOString();
        tour.resultsPublished = false;
        break;
      case 'close':
        tour.state = 'closed';
        tour.closesAt = now.toISOString();
        break;
      case 'setClosesAt': {
        const d = new Date(String(closesAt));
        if (Number.isNaN(d.getTime())) throw new GameError('Неверная дата закрытия.');
        tour.closesAt = d.toISOString();
        if (tour.state === 'closed' && d > now) tour.state = 'open';
        break;
      }
      case 'publish':
        if (this.effectiveState(tour) !== 'closed') throw new GameError('Сначала закройте тур.');
        tour.state = 'closed';
        tour.resultsPublished = true;
        break;
      case 'unpublish':
        tour.resultsPublished = false;
        break;
      default:
        throw new GameError('Неизвестное действие.');
    }
    await this.store.saveTour(tour);
    return this.tourView(tour);
  }

  async orgGenerateCodes(acc: Account, role: 'participant' | 'jury', count: number): Promise<Account[]> {
    this.require(acc, 'organizer');
    if (role !== 'participant' && role !== 'jury') throw new GameError('Коды можно создать для участников или жюри.');
    const n = Math.floor(Number(count));
    if (!(n > 0)) throw new GameError('Укажите количество кодов.');
    const all = await this.store.listAccounts();
    const have = all.filter((a) => a.role === role).length;
    const limit = role === 'participant' ? this.content.settings.maxParticipants : this.content.settings.juryCount;
    if (have + n > limit)
      throw new GameError(`Лимит — ${limit} ${role === 'participant' ? 'участников' : 'судей'}. Уже создано: ${have}.`);
    const codes = generateUniqueCodes(n, this.rng, all.map((a) => a.code));
    const start = nextNumber(all, role);
    return this.store.createAccounts(
      codes.map((c, i) => ({ code: normalizeCode(c), role, number: start + i, nick: null, department: null })),
    );
  }

  async orgCodes(acc: Account): Promise<Account[]> {
    this.require(acc, 'organizer');
    const all = await this.store.listAccounts();
    const order: Record<Role, number> = { organizer: 0, jury: 1, participant: 2 };
    return all.sort((a, b) => order[a.role] - order[b.role] || a.number - b.number);
  }

  async orgProgress(acc: Account): Promise<ProgressRow[]> {
    this.require(acc, 'organizer');
    const [accounts, runs, tour] = await Promise.all([this.store.listAccounts(), this.store.listRuns(), this.store.getTour()]);
    const rows: ProgressRow[] = [];
    for (const a of accounts.filter((x) => x.role === 'participant').sort((x, y) => x.number - y.number)) {
      const my = runs.filter((r) => r.accountId === a.id);
      const sums = await this.summaries(a, my, { ...tour, resultsPublished: true });
      rows.push({
        number: a.number,
        code: a.code,
        role: a.role,
        nick: a.nick,
        department: a.department,
        stages: sums.map((s) => s.status),
        altitude: sums.reduce((s, x) => s + x.altitude, 0),
        hintsUsed: my.reduce((s, r) => s + r.hints.length, 0),
      });
    }
    return rows;
  }

  async orgResults(acc: Account): Promise<ResultsView> {
    this.require(acc, 'organizer');
    const rows = await this.rating(true);
    const [accounts, ideas, scores] = await Promise.all([
      this.store.listAccounts(),
      this.store.listIdeas(),
      this.store.listIdeaScores(),
    ]);
    const criteria = this.content.idea.criteria;
    const jury: JuryDetail[] = ideas
      .filter((i) => i.submittedAt)
      .sort((a, b) => a.workNo - b.workNo)
      .map((i) => {
        const author = accounts.find((a) => a.id === i.accountId);
        const my = scores.filter((s) => s.ideaAccountId === i.accountId);
        return {
          workNo: i.workNo,
          nick: author?.nick ?? '',
          code: author?.code ?? '',
          fields: i.fields,
          scores: my.map((s) => ({
            juryNumber: accounts.find((a) => a.id === s.juryId)?.number ?? 0,
            total: juryTotal(s.scores, criteria),
            scores: s.scores,
            comment: s.comment,
          })),
          average: ideaAltitude(my, criteria),
        };
      });
    return { rows, jury };
  }
}

function nextNumber(all: Account[], role: Role): number {
  return all.filter((a) => a.role === role).reduce((m, a) => Math.max(m, a.number), 0) + 1;
}
