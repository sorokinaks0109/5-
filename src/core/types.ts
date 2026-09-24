// Общие типы игры. Файл без зависимостей: используется и в браузере, и в серверной функции.

export type Role = 'participant' | 'jury' | 'organizer';
export type StageNo = 1 | 2 | 3 | 4 | 5;
export const STAGES: StageNo[] = [1, 2, 3, 4, 5];

// ---------- Контент (content.json) ----------

export interface Option {
  id: string;
  text: string;
}

export interface ContentSettings {
  tourName: string;
  maxParticipants: number;
  tourDays: number;
  /** Минуты на этапы 1..5 */
  stageMinutes: [number, number, number, number, number];
  finalistsCount: number;
  hintsTotal: number;
  /** Доля, на которую подсказка снижает метры за задание (0.3 = 30 %) */
  hintPenalty: number;
  juryCount: number;
  stageMaxAltitude: number;
  /** Сколько секунд после окончания таймера сервер ещё принимает ответ (задержка сети) */
  graceSeconds: number;
  draw: {
    stage1Situations: number;
    stage2Images: number;
    stage3Processes: number;
    stage4Cases: number;
    stage4Questions: number;
  };
  points: {
    stage2: { order: number; hotspots: number; match: number };
    stage3: { order: number; flags: number; number: number };
    stage4: { whys: number; root: number; measures: number; questions: number };
  };
}

export interface StageText {
  name: string;
  title: string;
  intro: string;
}

export interface Situation {
  id: string;
  text: string;
  answer: string; // id вида потерь
  hint?: string;
  explanation?: string;
}

export interface Zone {
  id: string;
  /** Координаты прямоугольника в процентах от ширины/высоты картинки */
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

export interface MatchPair {
  id: string;
  text: string;
  answer: string; // id шага 5С
}

export interface WarehouseImage {
  id: string;
  title: string;
  description: string;
  image: string;
  /** Отношение ширины к высоте картинки, например 1.6 */
  aspect: number;
  zones: Zone[];
  match: MatchPair[];
  hints?: { order?: string; hotspots?: string; match?: string };
  explanations?: { hotspots?: string; match?: string };
}

export interface ProcessCard {
  id: string;
  text: string;
  minutes: number;
  valueAdded: boolean;
}

export interface Process {
  id: string;
  title: string;
  description: string;
  /** Карточки в ПРАВИЛЬНОМ порядке */
  cards: ProcessCard[];
  /** Единица времени на карточках: «мин» или «ч» */
  unit?: string;
  savingQuestion: string;
  /** Допуск для расчёта, ± минут */
  savingTolerance: number;
  hints?: { order?: string; flags?: string; number?: string };
  explanations?: { order?: string; flags?: string; number?: string };
}

export interface ChoiceQuestion {
  id?: string;
  question: string;
  options: Option[];
  answer: string;
  hint?: string;
  explanation?: string;
}

export interface MultiQuestion {
  question: string;
  options: Option[];
  answers: string[];
  hint?: string;
  explanation?: string;
}

export interface Case {
  id: string;
  title: string;
  text: string;
  whys: ChoiceQuestion[];
  root: ChoiceQuestion;
  measures: MultiQuestion;
}

export interface IdeaField {
  id: string;
  label: string;
  help: string;
  maxLength: number;
  required?: boolean;
  group?: string;
  rows?: number;
}

export interface Criterion {
  id: string;
  name: string;
  description: string;
  max: number;
}

export interface Content {
  settings: ContentSettings;
  departments: string[];
  stages: [StageText, StageText, StageText, StageText, StageText];
  stage1: { wasteTypes: (Option & { description: string })[]; situations: Situation[] };
  stage2: {
    steps: (Option & { description: string })[];
    orderQuestion: string;
    orderHint?: string;
    orderExplanation?: string;
    images: WarehouseImage[];
  };
  stage3: { processes: Process[] };
  stage4: { cases: Case[]; questions: (ChoiceQuestion & { id: string })[] };
  stage5: { fields: IdeaField[]; criteria: Criterion[] };
}

/** То, что можно отдать в браузер: без банка заданий и ответов */
export interface PublicContent {
  settings: ContentSettings;
  departments: string[];
  stages: Content['stages'];
  wasteTypes: Content['stage1']['wasteTypes'];
  steps: Content['stage2']['steps'];
  stage5: Content['stage5'];
}

// ---------- Задания, которые видит участник ----------

export type ItemKind = 'choice' | 'multi' | 'order' | 'hotspots' | 'match' | 'flags' | 'number';

export interface PublicItemBase {
  id: string;
  kind: ItemKind;
  title: string;
  prompt: string;
  maxPoints: number;
  hasHint: boolean;
}

export interface ChoiceItem extends PublicItemBase {
  kind: 'choice';
  options: Option[];
}
export interface MultiItem extends PublicItemBase {
  kind: 'multi';
  options: Option[];
}
export interface OrderItem extends PublicItemBase {
  kind: 'order';
  elements: (Option & { note?: string })[];
}
export interface HotspotsItem extends PublicItemBase {
  kind: 'hotspots';
  image: string;
  aspect: number;
  markers: number;
}
export interface MatchItem extends PublicItemBase {
  kind: 'match';
  left: Option[];
  right: Option[];
}
export interface FlagsItem extends PublicItemBase {
  kind: 'flags';
  unit: string;
  elements: (Option & { minutes: number })[];
}
export interface NumberItem extends PublicItemBase {
  kind: 'number';
  unit: string;
}

export type PublicItem = ChoiceItem | MultiItem | OrderItem | HotspotsItem | MatchItem | FlagsItem | NumberItem;

/** Ключ ответа — живёт только на сервере (или в демо) */
export type AnswerKey =
  | { kind: 'choice'; answer: string }
  | { kind: 'multi'; answers: string[] }
  | { kind: 'order'; order: string[] }
  | { kind: 'hotspots'; zones: Zone[] }
  | { kind: 'match'; pairs: Record<string, string> }
  | { kind: 'flags'; answers: string[] }
  | { kind: 'number'; answer: number; tolerance: number };

export interface InternalItem {
  item: PublicItem;
  key: AnswerKey;
  hint?: string;
  explanation?: string;
}

/** Ответы участника по видам заданий */
export type AnswerValue =
  | string // choice
  | string[] // multi, order, flags
  | { x: number; y: number }[] // hotspots
  | Record<string, string> // match
  | number; // number

// ---------- Данные в хранилище ----------

export interface Tour {
  state: 'draft' | 'open' | 'closed';
  opensAt: string | null;
  closesAt: string | null;
  resultsPublished: boolean;
  salt: string;
}

export interface Account {
  id: string;
  code: string;
  role: Role;
  number: number;
  nick: string | null;
  department: string | null;
  createdAt: string;
}

export interface AssignmentItem {
  id: string;
  /** Ссылка на задание в content.json */
  ref: string;
  /** Порядок вариантов/элементов для этого участника */
  order?: string[];
  /** Второй порядок (например, правая колонка сопоставления) */
  order2?: string[];
}

export interface Assignment {
  /** Кейс / процесс / картинка, общий для этапа */
  group?: string;
  items: AssignmentItem[];
}

export interface AnswerRecord {
  value: AnswerValue;
  fraction: number;
  points: number;
  hint: boolean;
  answeredAt: string;
}

export interface StageRun {
  accountId: string;
  stage: StageNo;
  startedAt: string;
  deadline: string;
  finishedAt: string | null;
  assignment: Assignment;
  answers: Record<string, AnswerRecord>;
  hints: string[];
}

export interface Idea {
  accountId: string;
  workNo: number;
  fields: Record<string, string>;
  submittedAt: string | null;
  updatedAt: string;
}

export interface IdeaScore {
  ideaAccountId: string;
  juryId: string;
  scores: Record<string, number>;
  comment: string;
  updatedAt: string;
}

/** Хранилище данных. Реализации: в памяти/браузере (демо) и Postgres (Supabase). */
export interface Store {
  getTour(): Promise<Tour>;
  saveTour(tour: Tour): Promise<void>;
  getAccount(id: string): Promise<Account | null>;
  findAccountByCode(code: string): Promise<Account | null>;
  listAccounts(): Promise<Account[]>;
  /** Создаёт учётные записи. Реализация сама назначает id. */
  createAccounts(items: Omit<Account, 'id' | 'createdAt'>[]): Promise<Account[]>;
  updateAccount(account: Account): Promise<void>;
  getRun(accountId: string, stage: StageNo): Promise<StageRun | null>;
  listRuns(accountId?: string): Promise<StageRun[]>;
  /** Создаёт прогон этапа, если его ещё нет. Возвращает false, если он уже существует. */
  insertRun(run: StageRun): Promise<boolean>;
  saveRun(run: StageRun): Promise<void>;
  getIdea(accountId: string): Promise<Idea | null>;
  listIdeas(): Promise<Idea[]>;
  saveIdea(idea: Idea): Promise<void>;
  listIdeaScores(): Promise<IdeaScore[]>;
  saveIdeaScore(score: IdeaScore): Promise<void>;
}

// ---------- Ответы сервиса (что уходит в браузер) ----------

export type StageStatus = 'locked' | 'available' | 'active' | 'finished';

export interface StageSummary {
  stage: StageNo;
  status: StageStatus;
  altitude: number;
  maxAltitude: number;
  startedAt: string | null;
  deadline: string | null;
  finishedAt: string | null;
  errors: number;
  /** Для этапа 5: сколько судей уже оценили */
  juryScored?: number;
}

export interface TourView {
  state: Tour['state'];
  opensAt: string | null;
  closesAt: string | null;
  resultsPublished: boolean;
  serverNow: string;
}

export interface MeView {
  role: Role;
  number: number;
  nick: string | null;
  department: string | null;
  tour: TourView;
  participant?: {
    stages: StageSummary[];
    altitude: number;
    hintsLeft: number;
    place: number | null;
    participantsCount: number;
  };
}

export interface Weather {
  level: 0 | 1 | 2 | 3 | 4;
  name: string;
}

export interface ReviewEntry {
  correct: unknown;
  explanation?: string;
  /** Для «горячих зон»: где были нарушения */
  zones?: Zone[];
}

export interface StageView {
  stage: StageNo;
  status: StageStatus;
  startedAt: string;
  deadline: string;
  finishedAt: string | null;
  serverNow: string;
  intro?: { title: string; text: string };
  items: PublicItem[];
  answers: Record<string, Omit<AnswerRecord, 'answeredAt'>>;
  hints: Record<string, string>;
  hintsLeft: number;
  weather: Weather;
  errors: number;
  altitude: number;
  review?: Record<string, ReviewEntry>;
  idea?: { fields: Record<string, string>; submittedAt: string | null; workNo: number };
}

export interface AnswerResult {
  itemId: string;
  fraction: number;
  points: number;
  altitude: number;
  errors: number;
  weather: Weather;
}

export interface RatingRow {
  place: number;
  accountId: string;
  number: number;
  code: string;
  nick: string;
  department: string;
  stageAltitudes: number[];
  altitude: number;
  seconds14: number;
  hintsUsed: number;
  juryScored: number;
  finalist: boolean;
}

export interface PublicRatingRow {
  place: number;
  nick: string;
  department: string;
  altitude: number;
  finalist: boolean;
  me: boolean;
}

export interface LeaderboardView {
  published: boolean;
  rows: PublicRatingRow[];
  me: { place: number | null; altitude: number; participantsCount: number };
}

export interface JuryWork {
  workNo: number;
  fields: Record<string, string>;
  submittedAt: string;
  myScores: Record<string, number> | null;
  myComment: string;
}

export interface ProgressRow {
  number: number;
  code: string;
  role: Role;
  nick: string | null;
  department: string | null;
  stages: StageStatus[];
  altitude: number;
  hintsUsed: number;
}

export interface JuryDetail {
  workNo: number;
  nick: string;
  code: string;
  fields: Record<string, string>;
  scores: { juryNumber: number; total: number; scores: Record<string, number>; comment: string }[];
  average: number | null;
}

export interface ResultsView {
  rows: RatingRow[];
  jury: JuryDetail[];
}
