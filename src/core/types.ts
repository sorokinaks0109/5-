// Общие типы игры. Файл без зависимостей: используется и в браузере, и в серверной функции.

export type Role = 'participant' | 'jury' | 'organizer';
export type StageNo = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const STAGES: StageNo[] = [1, 2, 3, 4, 5, 6, 7];

/** Что за вершина стоит на каждом месте маршрута. Раздел content.json называется так же. */
export type StageKind = 'waste' | 'fiveS' | 'flow' | 'eightSteps' | 'whys' | 'fishbone' | 'idea';
export const STAGE_KINDS: StageKind[] = ['waste', 'fiveS', 'flow', 'eightSteps', 'whys', 'fishbone', 'idea'];
export const kindOf = (stage: StageNo): StageKind => STAGE_KINDS[stage - 1];

/** Вершина с идеей: её оценивает жюри. Остальные проверяются автоматически. */
export const IDEA_STAGE: StageNo = 7;
export const AUTO_STAGES: StageNo[] = [1, 2, 3, 4, 5, 6];

// ---------- Контент (content.json) ----------

export interface Option {
  id: string;
  text: string;
}

export interface ContentSettings {
  /** Название игры — показывается на экране входа, главной и в сертификате */
  gameName: string;
  tourName: string;
  tagline: string;
  /** Надписи по кругу на значке */
  badgeTop: string;
  badgeBottom: string;
  maxParticipants: number;
  tourDays: number;
  /** Минуты на вершины 1..6 */
  stageMinutes: number[];
  finalistsCount: number;
  hintsTotal: number;
  /** Доля, на которую подсказка снижает метры за задание (0.3 = 30 %) */
  hintPenalty: number;
  juryCount: number;
  stageMaxAltitude: number;
  /** Сколько секунд после окончания таймера сервер ещё принимает ответ (задержка сети) */
  graceSeconds: number;
  /** Доля участников, которым на вершине 5С выпадает почта, а не склад (0.5 = половина) */
  fiveSOfficeShare: number;
  draw: {
    wasteSituations: number;
    flowProcesses: number;
    eightStepsSituations: number;
    eightStepsTools: number;
    whysCases: number;
    whysQuestions: number;
    fishboneCases: number;
  };
  points: {
    fiveS: { order: number; find: number; match: number };
    flow: { order: number; flags: number; number: number; littleCalc: number; littleTarget: number };
    eightSteps: { order: number; phases: number; tools: number; situations: number; loop: number };
    whys: { whys: number; root: number; measures: number; questions: number };
    fishbone: { fishbone: number; focus: number; next: number };
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

/** Нарушение 5С: что не так и какой шаг нарушен */
export interface Violation {
  id: string;
  /** Какой шаг 5С нарушен: sort, order, shine, standard, sustain */
  step: string;
  /** Что за нарушение (участник видит его в задании на сопоставление и в разборе) */
  label: string;
  /** Короткое пояснение для разбора */
  explain?: string;
}

/** Нарушение на картинке: прямоугольник в процентах от ширины/высоты */
export interface Zone extends Violation {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Вариант 5С «склад»: найти нарушения на картинке */
export interface WarehouseImage {
  type?: 'picture';
  id: string;
  title: string;
  description: string;
  image: string;
  /** Отношение ширины к высоте картинки, например 1.6 */
  aspect: number;
  /** Нарушения: по одному на каждый шаг 5С */
  zones: Zone[];
  hints?: { find?: string; match?: string };
  explanations?: { find?: string; match?: string };
}

export interface Email {
  id: string;
  from: string;
  subject: string;
  date: string;
  /** Куда правильно убрать письмо: id папки */
  answer: string;
}

/** Вариант 5С «почта»: разобрать входящие */
export interface InboxVariant {
  type: 'inbox';
  id: string;
  title: string;
  description: string;
  folders: (Option & { icon: string; hint?: string })[];
  emails: Email[];
  /** Нарушения 5С в работе с почтой: по одному на каждый шаг */
  violations: Violation[];
  hints?: { find?: string; match?: string };
  explanations?: { find?: string; match?: string };
}

export type FiveSVariant = WarehouseImage | InboxVariant;
export const isInbox = (v: FiveSVariant): v is InboxVariant => v.type === 'inbox';

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

/** Закон Литтла: срок = заявки в работе / скорость */
export interface LittleTask {
  id: string;
  context: string;
  wip: number;
  cr: number;
  /** Цель по сроку для второго вопроса */
  target: number;
  tolerance: number;
  explanation?: string;
}

export interface EightStep {
  id: string;
  text: string;
  question: string;
  /** id этапа: problem, solution, implementation */
  phase: string;
}

export interface EightStepsContent {
  steps: EightStep[];
  phases: Option[];
  tools: (Option & { answer: string })[];
  situations: (Option & { answer: string; hint?: string; explanation?: string })[];
  loop: ChoiceQuestion;
  hints?: { order?: string; phases?: string; tools?: string };
  explanations?: { order?: string; phases?: string; tools?: string };
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

/** Код корзины «не относится к проблеме» на диаграмме Исикавы */
export const NOT_A_CAUSE = 'none';

export interface FishboneCause {
  id: string;
  text: string;
  /** id категории 6М или "none" — не причина */
  category: string;
}

export interface FishboneCase {
  id: string;
  title: string;
  /** Коротко — «голова рыбы» */
  problem: string;
  text: string;
  causes: FishboneCause[];
  focus: ChoiceQuestion;
  hints?: { fishbone?: string };
  explanations?: { fishbone?: string };
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
  /** Названия и вступления вершин, по порядку маршрута */
  stages: StageText[];
  waste: { wasteTypes: (Option & { description: string })[]; situations: Situation[] };
  fiveS: {
    /** Шаги 5С. look — подсказка «что искать» */
    steps: (Option & { description: string; look?: string })[];
    orderQuestion: string;
    orderHint?: string;
    orderExplanation?: string;
    variants: FiveSVariant[];
  };
  flow: { processes: Process[]; little: LittleTask[] };
  eightSteps: EightStepsContent;
  whys: { cases: Case[]; questions: (ChoiceQuestion & { id: string })[] };
  fishbone: {
    categories: (Option & { icon: string; hint: string })[];
    cases: FishboneCase[];
    next: ChoiceQuestion;
  };
  idea: { fields: IdeaField[]; criteria: Criterion[] };
}

/** То, что можно отдать в браузер: без банка заданий и ответов */
export interface PublicContent {
  settings: ContentSettings;
  stages: Content['stages'];
  wasteTypes: Content['waste']['wasteTypes'];
  steps: Content['fiveS']['steps'];
  idea: Content['idea'];
}

// ---------- Задания, которые видит участник ----------

export type ItemKind = 'choice' | 'multi' | 'order' | 'hotspots' | 'match' | 'flags' | 'number' | 'fishbone' | 'inbox';

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
  /** Тренажёр закона Литтла: бегунки «заявок в работе» и «скорость», срок считается на лету */
  calc?: { wip: number; cr: number; target: number };
}

/** Диаграмма Исикавы: разложить причины по «костям» 6М */
export interface FishboneItem extends PublicItemBase {
  kind: 'fishbone';
  problem: string;
  categories: (Option & { icon: string; hint: string })[];
  cards: Option[];
  /** Есть ли корзина «Не причина» */
  allowNone: boolean;
}

/** Почта 5С: разложить письма по папкам */
export interface InboxItem extends PublicItemBase {
  kind: 'inbox';
  folders: (Option & { icon: string; hint?: string })[];
  emails: { id: string; from: string; subject: string; date: string }[];
}

export type PublicItem =
  | ChoiceItem
  | MultiItem
  | OrderItem
  | HotspotsItem
  | MatchItem
  | FlagsItem
  | NumberItem
  | FishboneItem
  | InboxItem;

/** Ключ ответа — живёт только на сервере (или в демо) */
export type AnswerKey =
  | { kind: 'choice'; answer: string }
  | { kind: 'multi'; answers: string[] }
  | { kind: 'order'; order: string[] }
  | { kind: 'hotspots'; zones: Zone[] }
  | { kind: 'match'; pairs: Record<string, string> }
  | { kind: 'flags'; answers: string[] }
  | { kind: 'number'; answer: number; tolerance: number }
  | { kind: 'fishbone'; placement: Record<string, string> }
  | { kind: 'inbox'; placement: Record<string, string> };

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
  /** Не используется: подразделение убрано из игры, поле оставлено для совместимости с базой */
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
  /** Стирает прохождения, идеи и оценки. Коды и ники остаются. */
  resetResults(): Promise<void>;
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
  /** Для вершины с идеей: сколько судей уже оценили */
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
  stageAltitudes: number[];
  altitude: number;
  secondsAuto: number;
  hintsUsed: number;
  juryScored: number;
  finalist: boolean;
}

export interface PublicRatingRow {
  place: number;
  nick: string;
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
