// Хранилище в памяти. В демо-режиме сохраняется в localStorage браузера, в тестах — просто в памяти.
import { cryptoRng } from './random.ts';
import type { Account, Idea, IdeaScore, StageNo, StageRun, Store, Tour } from './types.ts';

export interface MemoryData {
  tour: Tour;
  accounts: Account[];
  runs: StageRun[];
  ideas: Idea[];
  scores: IdeaScore[];
}

export function newSalt(): string {
  return Math.floor(cryptoRng() * 2 ** 32).toString(16) + Math.floor(cryptoRng() * 2 ** 32).toString(16);
}

export function emptyData(): MemoryData {
  return {
    tour: { state: 'draft', opensAt: null, closesAt: null, resultsPublished: false, salt: newSalt() },
    accounts: [],
    runs: [],
    ideas: [],
    scores: [],
  };
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export class MemoryStore implements Store {
  data: MemoryData;
  private idCounter = 0;

  constructor(data?: MemoryData, private onChange?: (d: MemoryData) => void) {
    this.data = data ?? emptyData();
    this.idCounter = this.data.accounts.length;
  }

  private changed() {
    this.onChange?.(this.data);
  }

  async getTour() {
    return clone(this.data.tour);
  }
  async saveTour(tour: Tour) {
    this.data.tour = clone(tour);
    this.changed();
  }
  async getAccount(id: string) {
    const a = this.data.accounts.find((x) => x.id === id);
    return a ? clone(a) : null;
  }
  async findAccountByCode(code: string) {
    const a = this.data.accounts.find((x) => x.code === code);
    return a ? clone(a) : null;
  }
  async listAccounts() {
    return clone(this.data.accounts);
  }
  async createAccounts(items: Omit<Account, 'id' | 'createdAt'>[]) {
    const now = new Date().toISOString();
    const created = items.map((i) => ({ ...i, id: `acc-${++this.idCounter}-${newSalt().slice(0, 6)}`, createdAt: now }));
    this.data.accounts.push(...clone(created));
    this.changed();
    return created;
  }
  async updateAccount(account: Account) {
    this.data.accounts = this.data.accounts.map((a) => (a.id === account.id ? clone(account) : a));
    this.changed();
  }
  async getRun(accountId: string, stage: StageNo) {
    const r = this.data.runs.find((x) => x.accountId === accountId && x.stage === stage);
    return r ? clone(r) : null;
  }
  async listRuns(accountId?: string) {
    return clone(accountId ? this.data.runs.filter((r) => r.accountId === accountId) : this.data.runs);
  }
  async insertRun(run: StageRun) {
    if (this.data.runs.some((x) => x.accountId === run.accountId && x.stage === run.stage)) return false;
    this.data.runs.push(clone(run));
    this.changed();
    return true;
  }
  async saveRun(run: StageRun) {
    this.data.runs = this.data.runs.map((r) => (r.accountId === run.accountId && r.stage === run.stage ? clone(run) : r));
    this.changed();
  }
  async getIdea(accountId: string) {
    const i = this.data.ideas.find((x) => x.accountId === accountId);
    return i ? clone(i) : null;
  }
  async listIdeas() {
    return clone(this.data.ideas);
  }
  async saveIdea(idea: Idea) {
    const rest = this.data.ideas.filter((i) => i.accountId !== idea.accountId);
    this.data.ideas = [...rest, clone(idea)];
    this.changed();
  }
  async listIdeaScores() {
    return clone(this.data.scores);
  }
  async saveIdeaScore(score: IdeaScore) {
    const rest = this.data.scores.filter((s) => !(s.ideaAccountId === score.ideaAccountId && s.juryId === score.juryId));
    this.data.scores = [...rest, clone(score)];
    this.changed();
  }
}
