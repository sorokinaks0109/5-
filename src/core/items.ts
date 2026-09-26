// Сборка заданий этапа из content.json по выдаче участника, публичный вид и проверка ответов.
import { GameError } from './errors.ts';
import { splitPoints } from './scoring.ts';
import type {
  ChoiceQuestion,
  Violation,
  AnswerKey,
  AnswerValue,
  Assignment,
  AssignmentItem,
  Content,
  InternalItem,
  Option,
  ReviewEntry,
  StageNo,
} from './types.ts';
import { NOT_A_CAUSE, isInbox, kindOf } from './types.ts';

function byOrder<T extends { id: string }>(list: T[], order?: string[]): T[] {
  if (!order) return list.slice();
  const map = new Map(list.map((x) => [x.id, x]));
  // Незнакомые id пропускаем, а недостающие добавляем в конец: так старые прохождения
  // не ломаются, если задания в content.json поменяли
  const picked = order.map((id) => map.get(id)).filter((x): x is T => !!x);
  const rest = list.filter((x) => !order.includes(x.id));
  return [...picked, ...rest];
}

function opts(list: Option[]): Option[] {
  return list.map((o) => ({ id: o.id, text: o.text }));
}

/** Заголовок и вводный текст этапа (кейс, процесс или картинка). */
export function stageIntro(stage: StageNo, content: Content, a: Assignment): { title: string; text: string } | undefined {
  const find = <T extends { id: string }>(list: T[]) => list.find((x) => x.id === a.group);
  switch (kindOf(stage)) {
    case 'fiveS': {
      const v = find(content.fiveS.variants);
      return v && { title: v.title, text: v.description };
    }
    case 'flow': {
      const p = find(content.flow.processes);
      return p && { title: p.title, text: p.description };
    }
    case 'whys': {
      const c = find(content.whys.cases);
      return c && { title: c.title, text: c.text };
    }
    case 'fishbone': {
      const c = find(content.fishbone.cases);
      return c && { title: c.title, text: c.text };
    }
    default:
      return undefined;
  }
}

/** Вопрос с одним ответом из content.json → задание */
function choiceItem(
  id: string,
  title: string,
  q: ChoiceQuestion,
  maxPoints: number,
  order?: string[],
): InternalItem {
  return {
    item: { id, kind: 'choice', title, prompt: q.question, maxPoints, hasHint: !!q.hint, options: opts(byOrder(q.options, order)) },
    key: { kind: 'choice', answer: q.answer },
    hint: q.hint,
    explanation: q.explanation,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
/** Число по-русски: 1,5 вместо 1.5 */
const ru = (n: number) => String(round1(n)).replace('.', ',');

export function buildItems(stage: StageNo, content: Content, a: Assignment): InternalItem[] {
  const pts = content.settings.points;
  const max = content.settings.stageMaxAltitude;

  switch (kindOf(stage)) {
    case 'waste': {
      const sitItems = a.items.filter((x) => !x.ref.startsWith('money:'));
      const moneyItems = a.items.filter((x) => x.ref.startsWith('money:'));
      // Старые выдачи без вопросов про деньги: все метры на ситуации
      const split = splitPoints(moneyItems.length ? pts.waste.situations : max, sitItems.length);
      const moneySplit = splitPoints(pts.waste.money, moneyItems.length);
      return a.items.map((ai) => {
        if (ai.ref.startsWith('money:')) {
          const q = content.waste.money.find((x) => x.id === ai.ref.slice(6));
          if (!q) throw new Error(`Вопрос «${ai.ref}» не найден`);
          const k = moneyItems.indexOf(ai);
          return choiceItem(ai.id, `Потери и деньги: вопрос ${k + 1}`, q, moneySplit[k], ai.order);
        }
        const i = sitItems.indexOf(ai);
        const s = content.waste.situations.find((x) => x.id === ai.ref);
        if (!s) throw new Error(`Ситуация «${ai.ref}» не найдена`);
        return {
          item: {
            id: ai.id,
            kind: 'choice',
            title: `Ситуация ${i + 1}`,
            prompt: s.text,
            maxPoints: split[i],
            hasHint: !!s.hint,
            options: opts(byOrder(content.waste.wasteTypes, ai.order)),
          },
          key: { kind: 'choice', answer: s.answer },
          hint: s.hint,
          explanation: s.explanation,
        };
      });
    }

    case 'fiveS': {
      const v = content.fiveS.variants.find((x) => x.id === a.group);
      if (!v) throw new Error(`Вариант 5С «${a.group}» не найден`);
      const steps = content.fiveS.steps;
      const violations: Violation[] = isInbox(v) ? v.violations : v.zones;
      return a.items.map((ai): InternalItem => {
        if (ai.ref === 'order') {
          return {
            item: {
              id: ai.id,
              kind: 'order',
              title: 'Шаги 5С по порядку',
              prompt: content.fiveS.orderQuestion,
              maxPoints: pts.fiveS.order,
              hasHint: !!content.fiveS.orderHint,
              elements: opts(byOrder(steps, ai.order)),
            },
            key: { kind: 'order', order: steps.map((s) => s.id) },
            hint: content.fiveS.orderHint,
            explanation: content.fiveS.orderExplanation,
          };
        }
        if (ai.ref === 'inbox' && isInbox(v)) {
          return {
            item: {
              id: ai.id,
              kind: 'inbox',
              title: 'Наведите порядок во входящих',
              prompt:
                'Разберите письма: коснитесь письма, а потом папки, куда его убрать. Ненужное смело отправляйте в корзину.',
              maxPoints: pts.fiveS.find,
              hasHint: !!v.hints?.find,
              folders: v.folders.map((f) => ({ id: f.id, text: f.text, icon: f.icon, hint: f.hint })),
              emails: byOrder(v.emails, ai.order).map((e) => ({ id: e.id, from: e.from, subject: e.subject, date: e.date })),
            },
            key: { kind: 'inbox', placement: Object.fromEntries(v.emails.map((e) => [e.id, e.answer])) },
            hint: v.hints?.find,
            explanation: v.explanations?.find,
          };
        }
        if (ai.ref === 'picture' && !isInbox(v)) {
          return {
            item: {
              id: ai.id,
              kind: 'hotspots',
              title: 'Найдите нарушения',
              prompt: `На картинке спрятаны ${v.zones.length} нарушений, по одному на каждый шаг 5С. Найдите их и отметьте касанием. Меток можно поставить не больше ${v.zones.length}, а за лишние снимаются метры.`,
              maxPoints: pts.fiveS.find,
              hasHint: !!v.hints?.find,
              image: v.image,
              aspect: v.aspect,
              markers: v.zones.length,
            },
            key: { kind: 'hotspots', zones: v.zones },
            hint: v.hints?.find,
            explanation: v.explanations?.find,
          };
        }
        // match
        return {
          item: {
            id: ai.id,
            kind: 'match',
            title: 'Какой шаг 5С нарушен?',
            prompt: isInbox(v)
              ? 'Вот что обычно творится с почтой. Для каждой ситуации выберите шаг 5С, который здесь не соблюдается.'
              : 'Вот те же нарушения с картинки. Для каждого выберите шаг 5С, который здесь не соблюдается.',
            maxPoints: pts.fiveS.match,
            hasHint: !!v.hints?.match,
            left: byOrder(violations, ai.order).map((z) => ({ id: z.id, text: z.label })),
            right: opts(byOrder(steps, ai.order2)),
          },
          key: { kind: 'match', pairs: Object.fromEntries(violations.map((z) => [z.id, z.step])) },
          hint: v.hints?.match,
          explanation: v.explanations?.match ?? violations.map((z) => `${z.label}: ${z.explain ?? ''}`.trim()).join(' '),
        };
      });
    }

    case 'flow': {
      const p = content.flow.processes.find((x) => x.id === a.group);
      if (!p) throw new Error(`Процесс «${a.group}» не найден`);
      const nva = p.cards.filter((c) => !c.valueAdded);
      const unit = p.unit ?? 'мин';
      return a.items.map((ai): InternalItem => {
        if (ai.ref === 'order') {
          return {
            item: {
              id: ai.id,
              kind: 'order',
              title: 'Соберите процесс',
              prompt: 'Расставьте операции в том порядке, в котором они идут на самом деле.',
              maxPoints: pts.flow.order,
              hasHint: !!p.hints?.order,
              elements: byOrder(p.cards, ai.order).map((c) => ({ id: c.id, text: c.text, note: `${c.minutes} ${unit}` })),
            },
            key: { kind: 'order', order: p.cards.map((c) => c.id) },
            hint: p.hints?.order,
            explanation: p.explanations?.order,
          };
        }
        if (ai.ref === 'flags') {
          return {
            item: {
              id: ai.id,
              kind: 'flags',
              title: 'Операции без ценности',
              prompt: 'Отметьте операции, которые НЕ добавляют ценности: за них заказчик платить не готов.',
              maxPoints: pts.flow.flags,
              hasHint: !!p.hints?.flags,
              unit,
              elements: byOrder(p.cards, ai.order).map((c) => ({ id: c.id, text: c.text, minutes: c.minutes })),
            },
            key: { kind: 'flags', answers: nva.map((c) => c.id) },
            hint: p.hints?.flags,
            explanation: p.explanations?.flags,
          };
        }
        if (ai.ref === 'number') {
          return {
            item: {
              id: ai.id,
              kind: 'number',
              title: 'Расчёт экономии',
              prompt: p.savingQuestion,
              maxPoints: pts.flow.number,
              hasHint: !!p.hints?.number,
              unit,
            },
            key: { kind: 'number', answer: nva.reduce((s, c) => s + c.minutes, 0), tolerance: p.savingTolerance },
            hint: p.hints?.number,
            explanation: p.explanations?.number,
          };
        }
        // Закон Литтла
        const [kind, lid] = ai.ref.split(':');
        if (kind === 'lq') {
          const q = content.flow.littleQuestions.find((x) => x.id === lid);
          if (!q) throw new Error(`Вопрос «${lid}» не найден`);
          return choiceItem(ai.id, 'Закон Литтла: вопрос', q, pts.flow.littleQuestion, ai.order);
        }
        const l = content.flow.little.find((x) => x.id === lid);
        if (!l) throw new Error(`Задача Литтла «${lid}» не найдена`);
        if (kind === 'little') {
          return {
            item: {
              id: ai.id,
              kind: 'number',
              title: 'Закон Литтла: сколько ждать?',
              prompt: `Вернёмся к исходным цифрам: в работе ${l.wip} заявок, выполняют ${l.cr} заявок в день. Сколько дней в среднем проходит от поступления заявки до её выполнения?`,
              maxPoints: pts.flow.littleCalc,
              hasHint: true,
              unit: 'дн.',
            },
            key: { kind: 'number', answer: round1(l.wip / l.cr), tolerance: l.tolerance },
            hint: 'Закон Литтла: срок выполнения = заявки в работе ÷ скорость выполнения (LT = WIP / CR).',
            explanation: l.explanation ?? `${l.wip} ÷ ${l.cr} = ${ru(l.wip / l.cr)} дн.`,
          };
        }
        return {
          item: {
            id: ai.id,
            kind: 'number',
            title: 'Закон Литтла: тренажёр',
            prompt: `${l.context} Сейчас в работе ${l.wip} заявок, а выполняют ${l.cr} заявок в день. Сколько заявок можно держать в работе одновременно, чтобы при той же скорости срок был не больше ${ru(l.target)} дн.? Покрутите бегунки и найдите ответ.`,
            maxPoints: pts.flow.littleTarget,
            hasHint: false,
            unit: 'заявок',
            calc: { wip: l.wip, cr: l.cr, target: l.target },
          },
          key: { kind: 'number', answer: l.cr * l.target, tolerance: Math.max(1, Math.round(l.cr * 0.1)) },
          explanation: `WIP = LT × CR = ${ru(l.target)} × ${l.cr} = ${l.cr * l.target}. Меньше заявок в работе, и каждая проходит быстрее.`,
        };
      });
    }

    case 'eightSteps': {
      const e = content.eightSteps;
      const sitItems = a.items.filter((x) => x.ref.startsWith('sit:'));
      const sitSplit = splitPoints(pts.eightSteps.situations, sitItems.length);
      const stepName = (id: string) => e.steps.find((s) => s.id === id)?.text ?? id;
      const stepExplain = (id: string) => {
        const n = e.steps.findIndex((s) => s.id === id);
        return n < 0 ? undefined : `Это шаг ${n + 1} «${e.steps[n].text}». Его вопрос: ${e.steps[n].question}`;
      };
      return a.items.map((ai): InternalItem => {
        if (ai.ref === 'order') {
          return {
            item: {
              id: ai.id,
              kind: 'order',
              title: 'Восемь шагов по порядку',
              prompt: 'Расставьте шаги решения проблем по порядку: первый шаг сверху.',
              maxPoints: pts.eightSteps.order,
              hasHint: !!e.hints?.order,
              elements: byOrder(e.steps, ai.order).map((s) => ({ id: s.id, text: s.text, note: s.question })),
            },
            key: { kind: 'order', order: e.steps.map((s) => s.id) },
            hint: e.hints?.order,
            explanation: e.explanations?.order,
          };
        }
        if (ai.ref === 'phases') {
          return {
            item: {
              id: ai.id,
              kind: 'match',
              title: 'Три этапа',
              prompt: 'Восемь шагов делятся на три этапа. Для каждого шага выберите, к какому этапу он относится.',
              maxPoints: pts.eightSteps.phases,
              hasHint: !!e.hints?.phases,
              left: byOrder(e.steps, ai.order).map((s) => ({ id: s.id, text: s.text })),
              right: opts(byOrder(e.phases, ai.order2)),
            },
            key: { kind: 'match', pairs: Object.fromEntries(e.steps.map((s) => [s.id, s.phase])) },
            hint: e.hints?.phases,
            explanation: e.explanations?.phases,
          };
        }
        if (ai.ref === 'tools') {
          const tools = byOrder(e.tools, ai.order).filter((t) => ai.order?.includes(t.id) ?? true);
          return {
            item: {
              id: ai.id,
              kind: 'match',
              title: 'Инструмент к шагу',
              prompt: 'На каком шаге пригодится каждый инструмент?',
              maxPoints: pts.eightSteps.tools,
              hasHint: !!e.hints?.tools,
              left: opts(tools),
              right: opts(byOrder(e.steps, ai.order2)),
            },
            key: { kind: 'match', pairs: Object.fromEntries(tools.map((t) => [t.id, t.answer])) },
            hint: e.hints?.tools,
            explanation: e.explanations?.tools ?? tools.map((t) => `${t.text}: шаг «${stepName(t.answer)}».`).join(' '),
          };
        }
        if (ai.ref.startsWith('sit:')) {
          const sid = ai.ref.slice(4);
          const s = e.situations.find((x) => x.id === sid);
          if (!s) throw new Error(`Ситуация «${sid}» не найдена`);
          const k = sitItems.indexOf(ai);
          return {
            item: {
              id: ai.id,
              kind: 'choice',
              title: `На каком мы шаге? ${k + 1} из ${sitItems.length}`,
              prompt: s.text,
              maxPoints: sitSplit[k],
              hasHint: !!s.hint,
              options: opts(byOrder(e.steps, ai.order)),
            },
            key: { kind: 'choice', answer: s.answer },
            hint: s.hint,
            explanation: s.explanation ?? stepExplain(s.answer),
          };
        }
        return choiceItem(ai.id, 'Решение не сработало', e.loop, pts.eightSteps.loop, ai.order);
      });
    }

    case 'whys': {
      const cs = content.whys.cases.find((x) => x.id === a.group);
      if (!cs) throw new Error(`Кейс «${a.group}» не найден`);
      const whyItems = a.items.filter((x) => x.ref.startsWith('why:'));
      const qItems = a.items.filter((x) => x.ref.startsWith('q:'));
      const whySplit = splitPoints(pts.whys.whys, whyItems.length);
      const qSplit = splitPoints(pts.whys.questions, qItems.length);
      return a.items.map((ai: AssignmentItem): InternalItem => {
        if (ai.ref.startsWith('why:')) {
          const i = Number(ai.ref.slice(4));
          return choiceItem(ai.id, `Почему? Шаг ${i + 1} из ${cs.whys.length}`, cs.whys[i], whySplit[i], ai.order);
        }
        if (ai.ref === 'root') return choiceItem(ai.id, 'Корневая причина', cs.root, pts.whys.root, ai.order);
        if (ai.ref === 'measures') {
          return {
            item: {
              id: ai.id,
              kind: 'multi',
              title: 'Меры',
              prompt: cs.measures.question,
              maxPoints: pts.whys.measures,
              hasHint: !!cs.measures.hint,
              options: opts(byOrder(cs.measures.options, ai.order)),
            },
            key: { kind: 'multi', answers: cs.measures.answers },
            hint: cs.measures.hint,
            explanation: cs.measures.explanation,
          };
        }
        const qid = ai.ref.slice(2);
        const q = content.whys.questions.find((x) => x.id === qid);
        if (!q) throw new Error(`Вопрос «${qid}» не найден`);
        const qi = qItems.indexOf(ai);
        return choiceItem(ai.id, `Регулярный менеджмент: вопрос ${qi + 1}`, q, qSplit[qi], ai.order);
      });
    }

    case 'fishbone': {
      const fc = content.fishbone.cases.find((x) => x.id === a.group);
      if (!fc) throw new Error(`Кейс Исикавы «${a.group}» не найден`);
      const cats = content.fishbone.categories;
      return a.items.map((ai): InternalItem => {
        if (ai.ref === 'fishbone') {
          return {
            item: {
              id: ai.id,
              kind: 'fishbone',
              title: 'Соберите «рыбью кость»',
              prompt:
                'Разложите причины по «костям» диаграммы Исикавы (6М). Коснитесь карточки, а потом нужной кости. Можно и просто перетащить. Если факт на проблему не влияет, отправьте его в корзину «Не причина».',
              maxPoints: pts.fishbone.fishbone,
              hasHint: !!fc.hints?.fishbone,
              problem: fc.problem,
              categories: cats.map((c) => ({ id: c.id, text: c.text, icon: c.icon, hint: c.hint })),
              cards: opts(byOrder(fc.causes, ai.order)),
              allowNone: fc.causes.some((c) => c.category === NOT_A_CAUSE),
            },
            key: {
              kind: 'fishbone',
              placement: Object.fromEntries(fc.causes.map((c) => [c.id, c.category])),
              alt: Object.fromEntries(fc.causes.filter((c) => c.accept?.length).map((c) => [c.id, c.accept!])),
            },
            hint: fc.hints?.fishbone,
            explanation: fc.explanations?.fishbone,
          };
        }
        return ai.ref === 'focus'
          ? choiceItem(ai.id, 'Главная причина', fc.focus, pts.fishbone.focus, ai.order)
          : choiceItem(ai.id, 'Что дальше?', content.fishbone.next, pts.fishbone.next, ai.order);
      });
    }

    case 'idea':
      return [];
  }
}

// ---------- Проверка ответа ----------

const isStr = (v: unknown): v is string => typeof v === 'string';
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const bad = () => new GameError('Неверный формат ответа. Обновите страницу и попробуйте ещё раз.');

/** Небольшой запас вокруг зоны: палец на телефоне не всегда точен. */
export const HOTSPOT_PADDING = 2;

/** Проверяет ответ и возвращает долю правильности от 0 до 1. */
export function gradeAnswer(key: AnswerKey, value: AnswerValue): number {
  switch (key.kind) {
    case 'choice':
      if (!isStr(value)) throw bad();
      return value === key.answer ? 1 : 0;

    case 'multi':
    case 'flags': {
      if (!isStrArr(value)) throw bad();
      const correct = new Set(key.answers);
      const chosen = new Set(value);
      let tp = 0;
      let fp = 0;
      chosen.forEach((v) => (correct.has(v) ? tp++ : fp++));
      return correct.size ? Math.max(0, (tp - fp) / correct.size) : 0;
    }

    case 'order': {
      if (!isStrArr(value) || value.length !== key.order.length) throw bad();
      const ok = key.order.filter((id, i) => value[i] === id).length;
      return ok / key.order.length;
    }

    case 'hotspots': {
      if (!Array.isArray(value)) throw bad();
      const marks = (value as unknown[]).slice(0, key.zones.length);
      const hit = new Set<string>();
      let misses = 0;
      for (const m of marks) {
        if (!m || typeof m !== 'object') throw bad();
        const { x, y } = m as { x: unknown; y: unknown };
        if (typeof x !== 'number' || typeof y !== 'number') throw bad();
        const p = HOTSPOT_PADDING;
        const z = key.zones.find((z) => x >= z.x - p && x <= z.x + z.w + p && y >= z.y - p && y <= z.y + z.h + p);
        if (z) hit.add(z.id);
        else misses++;
      }
      return Math.max(0, (hit.size - 0.5 * misses) / key.zones.length);
    }

    case 'match':
    case 'fishbone':
    case 'inbox': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad();
      const v = value as Record<string, unknown>;
      const pairs = key.kind === 'match' ? key.pairs : key.placement;
      const alt = key.kind === 'fishbone' ? key.alt ?? {} : {};
      const ids = Object.keys(pairs);
      const ok = (id: string) => v[id] === pairs[id] || (alt[id] ?? []).includes(String(v[id]));
      return ids.filter(ok).length / ids.length;
    }

    case 'number': {
      const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
      if (!Number.isFinite(n)) throw bad();
      return Math.abs(n - key.answer) <= key.tolerance ? 1 : 0;
    }
  }
}

/** Правильный ответ для разбора после завершения этапа. */
export function reviewFor(it: InternalItem): ReviewEntry {
  const k = it.key;
  const base = { explanation: it.explanation };
  switch (k.kind) {
    case 'choice':
      return { ...base, correct: k.answer };
    case 'multi':
    case 'flags':
      return { ...base, correct: k.answers };
    case 'order':
      return { ...base, correct: k.order };
    case 'hotspots':
      return { ...base, correct: k.zones.map((z) => z.label), zones: k.zones };
    case 'match':
      return { ...base, correct: k.pairs };
    case 'fishbone':
      return { ...base, correct: k.placement, alt: k.alt };
    case 'inbox':
      return { ...base, correct: k.placement };
    case 'number':
      return { ...base, correct: { answer: k.answer, tolerance: k.tolerance } };
  }
}

/** Идеальный ответ по ключу — для тестов и ботов демо-режима. */
export function perfectAnswer(key: AnswerKey): AnswerValue {
  switch (key.kind) {
    case 'choice':
      return key.answer;
    case 'multi':
    case 'flags':
      return key.answers.slice();
    case 'order':
      return key.order.slice();
    case 'hotspots':
      return key.zones.map((z) => ({ x: z.x + z.w / 2, y: z.y + z.h / 2 }));
    case 'match':
      return { ...key.pairs };
    case 'fishbone':
    case 'inbox':
      return { ...key.placement };
    case 'number':
      return key.answer;
  }
}
