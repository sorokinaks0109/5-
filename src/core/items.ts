// Сборка заданий этапа из content.json по выдаче участника, публичный вид и проверка ответов.
import { GameError } from './errors.ts';
import { splitPoints } from './scoring.ts';
import type {
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
import { NOT_A_CAUSE } from './types.ts';

function byOrder<T extends { id: string }>(list: T[], order?: string[]): T[] {
  if (!order) return list.slice();
  const map = new Map(list.map((x) => [x.id, x]));
  return order.map((id) => {
    const v = map.get(id);
    if (!v) throw new Error(`В content.json не найден элемент «${id}»`);
    return v;
  });
}

function opts(list: Option[]): Option[] {
  return list.map((o) => ({ id: o.id, text: o.text }));
}

/** Заголовок и вводный текст этапа (кейс, процесс или картинка). */
export function stageIntro(stage: StageNo, content: Content, a: Assignment): { title: string; text: string } | undefined {
  if (stage === 2) {
    const img = content.stage2.images.find((i) => i.id === a.group);
    return img && { title: img.title, text: img.description };
  }
  if (stage === 3) {
    const p = content.stage3.processes.find((i) => i.id === a.group);
    return p && { title: p.title, text: p.description };
  }
  if (stage === 4) {
    const c = content.stage4.cases.find((i) => i.id === a.group);
    return c && { title: c.title, text: c.text };
  }
  if (stage === 5) {
    const c = content.stage5.cases.find((i) => i.id === a.group);
    return c && { title: c.title, text: c.text };
  }
  return undefined;
}

export function buildItems(stage: StageNo, content: Content, a: Assignment): InternalItem[] {
  const pts = content.settings.points;
  const max = content.settings.stageMaxAltitude;

  if (stage === 1) {
    const split = splitPoints(max, a.items.length);
    return a.items.map((ai, i) => {
      const s = content.stage1.situations.find((x) => x.id === ai.ref);
      if (!s) throw new Error(`Ситуация «${ai.ref}» не найдена`);
      return {
        item: {
          id: ai.id,
          kind: 'choice',
          title: `Ситуация ${i + 1}`,
          prompt: s.text,
          maxPoints: split[i],
          hasHint: !!s.hint,
          options: opts(byOrder(content.stage1.wasteTypes, ai.order)),
        },
        key: { kind: 'choice', answer: s.answer },
        hint: s.hint,
        explanation: s.explanation,
      };
    });
  }

  if (stage === 2) {
    const img = content.stage2.images.find((x) => x.id === a.group);
    if (!img) throw new Error(`Картинка «${a.group}» не найдена`);
    const steps = content.stage2.steps;
    return a.items.map((ai): InternalItem => {
      if (ai.ref === 'order') {
        return {
          item: {
            id: ai.id,
            kind: 'order',
            title: 'Шаги 5С по порядку',
            prompt: content.stage2.orderQuestion,
            maxPoints: pts.stage2.order,
            hasHint: !!content.stage2.orderHint,
            elements: opts(byOrder(steps, ai.order)),
          },
          key: { kind: 'order', order: steps.map((s) => s.id) },
          hint: content.stage2.orderHint,
          explanation: content.stage2.orderExplanation,
        };
      }
      if (ai.ref === 'hotspots') {
        return {
          item: {
            id: ai.id,
            kind: 'hotspots',
            title: 'Найдите нарушения',
            prompt: `На картинке ${img.zones.length} нарушений порядка. Отметьте их касанием — не больше ${img.zones.length} меток. Лишние метки снижают результат.`,
            maxPoints: pts.stage2.hotspots,
            hasHint: !!img.hints?.hotspots,
            image: img.image,
            aspect: img.aspect,
            markers: img.zones.length,
          },
          key: { kind: 'hotspots', zones: img.zones },
          hint: img.hints?.hotspots,
          explanation: img.explanations?.hotspots,
        };
      }
      // match
      return {
        item: {
          id: ai.id,
          kind: 'match',
          title: 'Нарушение → шаг 5С',
          prompt: 'Для каждого нарушения выберите шаг 5С, который поможет его устранить.',
          maxPoints: pts.stage2.match,
          hasHint: !!img.hints?.match,
          left: opts(byOrder(img.match, ai.order)),
          right: opts(byOrder(steps, ai.order2)),
        },
        key: { kind: 'match', pairs: Object.fromEntries(img.match.map((m) => [m.id, m.answer])) },
        hint: img.hints?.match,
        explanation: img.explanations?.match,
      };
    });
  }

  if (stage === 3) {
    const p = content.stage3.processes.find((x) => x.id === a.group);
    if (!p) throw new Error(`Процесс «${a.group}» не найден`);
    const nva = p.cards.filter((c) => !c.valueAdded);
    return a.items.map((ai): InternalItem => {
      if (ai.ref === 'order') {
        return {
          item: {
            id: ai.id,
            kind: 'order',
            title: 'Соберите процесс',
            prompt: 'Расставьте операции в том порядке, в котором они идут на самом деле.',
            maxPoints: pts.stage3.order,
            hasHint: !!p.hints?.order,
            elements: byOrder(p.cards, ai.order).map((c) => ({ id: c.id, text: c.text, note: `${c.minutes} ${p.unit ?? 'мин'}` })),
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
            prompt: 'Отметьте операции, которые НЕ добавляют ценности для потребителя (за них он не готов платить).',
            maxPoints: pts.stage3.flags,
            hasHint: !!p.hints?.flags,
            unit: p.unit ?? 'мин',
            elements: byOrder(p.cards, ai.order).map((c) => ({ id: c.id, text: c.text, minutes: c.minutes })),
          },
          key: { kind: 'flags', answers: nva.map((c) => c.id) },
          hint: p.hints?.flags,
          explanation: p.explanations?.flags,
        };
      }
      return {
        item: {
          id: ai.id,
          kind: 'number',
          title: 'Расчёт экономии',
          prompt: p.savingQuestion,
          maxPoints: pts.stage3.number,
          hasHint: !!p.hints?.number,
          unit: p.unit ?? 'мин',
        },
        key: { kind: 'number', answer: nva.reduce((s, c) => s + c.minutes, 0), tolerance: p.savingTolerance },
        hint: p.hints?.number,
        explanation: p.explanations?.number,
      };
    });
  }

  if (stage === 4) {
    const cs = content.stage4.cases.find((x) => x.id === a.group);
    if (!cs) throw new Error(`Кейс «${a.group}» не найден`);
    const whyItems = a.items.filter((x) => x.ref.startsWith('why:'));
    const qItems = a.items.filter((x) => x.ref.startsWith('q:'));
    const whySplit = splitPoints(pts.stage4.whys, whyItems.length);
    const qSplit = splitPoints(pts.stage4.questions, qItems.length);
    return a.items.map((ai: AssignmentItem): InternalItem => {
      if (ai.ref.startsWith('why:')) {
        const i = Number(ai.ref.slice(4));
        const w = cs.whys[i];
        return {
          item: {
            id: ai.id,
            kind: 'choice',
            title: `Почему? Шаг ${i + 1} из ${cs.whys.length}`,
            prompt: w.question,
            maxPoints: whySplit[i],
            hasHint: !!w.hint,
            options: opts(byOrder(w.options, ai.order)),
          },
          key: { kind: 'choice', answer: w.answer },
          hint: w.hint,
          explanation: w.explanation,
        };
      }
      if (ai.ref === 'root') {
        return {
          item: {
            id: ai.id,
            kind: 'choice',
            title: 'Корневая причина',
            prompt: cs.root.question,
            maxPoints: pts.stage4.root,
            hasHint: !!cs.root.hint,
            options: opts(byOrder(cs.root.options, ai.order)),
          },
          key: { kind: 'choice', answer: cs.root.answer },
          hint: cs.root.hint,
          explanation: cs.root.explanation,
        };
      }
      if (ai.ref === 'measures') {
        return {
          item: {
            id: ai.id,
            kind: 'multi',
            title: 'Меры',
            prompt: cs.measures.question,
            maxPoints: pts.stage4.measures,
            hasHint: !!cs.measures.hint,
            options: opts(byOrder(cs.measures.options, ai.order)),
          },
          key: { kind: 'multi', answers: cs.measures.answers },
          hint: cs.measures.hint,
          explanation: cs.measures.explanation,
        };
      }
      const qid = ai.ref.slice(2);
      const q = content.stage4.questions.find((x) => x.id === qid);
      if (!q) throw new Error(`Вопрос «${qid}» не найден`);
      const qi = qItems.indexOf(ai);
      return {
        item: {
          id: ai.id,
          kind: 'choice',
          title: `Регулярный менеджмент: вопрос ${qi + 1}`,
          prompt: q.question,
          maxPoints: qSplit[qi],
          hasHint: !!q.hint,
          options: opts(byOrder(q.options, ai.order)),
        },
        key: { kind: 'choice', answer: q.answer },
        hint: q.hint,
        explanation: q.explanation,
      };
    });
  }

  if (stage === 5) {
    const fc = content.stage5.cases.find((x) => x.id === a.group);
    if (!fc) throw new Error(`Кейс Исикавы «${a.group}» не найден`);
    const cats = content.stage5.categories;
    return a.items.map((ai): InternalItem => {
      if (ai.ref === 'fishbone') {
        return {
          item: {
            id: ai.id,
            kind: 'fishbone',
            title: 'Соберите «рыбью кость»',
            prompt:
              'Разложите причины по «костям» диаграммы Исикавы (6М). Нажмите на карточку, затем на нужную кость — или перетащите карточку. Если факт не влияет на проблему, отправьте его в корзину «Не причина».',
            maxPoints: pts.stage5.fishbone,
            hasHint: !!fc.hints?.fishbone,
            problem: fc.problem,
            categories: cats.map((c) => ({ id: c.id, text: c.text, icon: c.icon, hint: c.hint })),
            cards: opts(byOrder(fc.causes, ai.order)),
            allowNone: fc.causes.some((c) => c.category === NOT_A_CAUSE),
          },
          key: { kind: 'fishbone', placement: Object.fromEntries(fc.causes.map((c) => [c.id, c.category])) },
          hint: fc.hints?.fishbone,
          explanation: fc.explanations?.fishbone,
        };
      }
      const q = ai.ref === 'focus' ? fc.focus : content.stage5.next;
      return {
        item: {
          id: ai.id,
          kind: 'choice',
          title: ai.ref === 'focus' ? 'Главная причина' : 'Что дальше?',
          prompt: q.question,
          maxPoints: ai.ref === 'focus' ? pts.stage5.focus : pts.stage5.next,
          hasHint: !!q.hint,
          options: opts(byOrder(q.options, ai.order)),
        },
        key: { kind: 'choice', answer: q.answer },
        hint: q.hint,
        explanation: q.explanation,
      };
    });
  }

  return [];
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
    case 'fishbone': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad();
      const v = value as Record<string, unknown>;
      const pairs = key.kind === 'match' ? key.pairs : key.placement;
      const ids = Object.keys(pairs);
      return ids.filter((id) => v[id] === pairs[id]).length / ids.length;
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
      return { ...key.placement };
    case 'number':
      return key.answer;
  }
}
