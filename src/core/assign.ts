// Случайная выдача заданий: каждому участнику свой набор из банка и свой порядок вариантов.
import { createRng, pick, shuffle, shuffleNotIdentity } from './random.ts';
import { isInbox, kindOf, type Assignment, type Content, type FiveSVariant, type StageNo } from './types.ts';

/** Зерно выдачи: соль тура + участник + этап. Соль задаётся при создании тура,
 *  поэтому выдачу нельзя предсказать заранее, но её можно воспроизвести. */
export function assignmentSeed(salt: string, accountId: string, stage: StageNo): string {
  return `${salt}:${accountId}:${stage}`;
}

export function assignStage(stage: StageNo, content: Content, seed: string): Assignment {
  const rng = createRng(seed);
  const draw = content.settings.draw;
  const ids = <T extends { id: string }>(a: T[]) => a.map((x) => x.id);

  switch (kindOf(stage)) {
    case 'waste': {
      const sits = pick(content.waste.situations, draw.wasteSituations, rng);
      return {
        items: sits.map((s) => ({ id: `waste-${s.id}`, ref: s.id, order: shuffle(ids(content.waste.wasteTypes), rng) })),
      };
    }

    case 'fiveS': {
      // Сначала решаем, склад или почта, потом берём вариант этого вида
      const variants = content.fiveS.variants;
      const office = variants.filter(isInbox);
      const warehouse = variants.filter((v) => !isInbox(v));
      const wantOffice = rng() < content.settings.fiveSOfficeShare;
      const pool: FiveSVariant[] = (wantOffice && office.length) || !warehouse.length ? office : warehouse;
      const [v] = pick(pool, 1, rng);
      const stepIds = ids(content.fiveS.steps);
      const violations = isInbox(v) ? v.violations : v.zones;
      return {
        group: v.id,
        items: [
          { id: 'fiveS-order', ref: 'order', order: shuffleNotIdentity(stepIds, rng) },
          isInbox(v) ? { id: 'fiveS-find', ref: 'inbox', order: shuffle(ids(v.emails), rng) } : { id: 'fiveS-find', ref: 'picture' },
          { id: 'fiveS-match', ref: 'match', order: shuffle(ids(violations), rng), order2: shuffle(stepIds, rng) },
        ],
      };
    }

    case 'flow': {
      const [proc] = pick(content.flow.processes, draw.flowProcesses, rng);
      const [little] = pick(content.flow.little, 1, rng);
      return {
        group: proc.id,
        items: [
          { id: 'flow-order', ref: 'order', order: shuffleNotIdentity(ids(proc.cards), rng) },
          { id: 'flow-flags', ref: 'flags', order: shuffle(ids(proc.cards), rng) },
          { id: 'flow-number', ref: 'number' },
          { id: 'flow-little', ref: `little:${little.id}` },
          { id: 'flow-target', ref: `target:${little.id}` },
        ],
      };
    }

    case 'eightSteps': {
      const e = content.eightSteps;
      const stepIds = ids(e.steps);
      const tools = pick(e.tools, Math.min(draw.eightStepsTools, e.tools.length), rng);
      const sits = pick(e.situations, draw.eightStepsSituations, rng);
      return {
        items: [
          { id: 'e8-order', ref: 'order', order: shuffleNotIdentity(stepIds, rng) },
          { id: 'e8-phases', ref: 'phases', order: shuffle(stepIds, rng), order2: ids(e.phases) },
          { id: 'e8-tools', ref: 'tools', order: ids(tools), order2: shuffle(stepIds, rng) },
          ...sits.map((s) => ({ id: `e8-sit-${s.id}`, ref: `sit:${s.id}`, order: shuffle(stepIds, rng) })),
          { id: 'e8-loop', ref: 'loop', order: shuffle(ids(e.loop.options), rng) },
        ],
      };
    }

    case 'whys': {
      const [cs] = pick(content.whys.cases, draw.whysCases, rng);
      const qs = pick(content.whys.questions, draw.whysQuestions, rng);
      return {
        group: cs.id,
        items: [
          ...cs.whys.map((w, i) => ({ id: `whys-why-${i + 1}`, ref: `why:${i}`, order: shuffle(ids(w.options), rng) })),
          { id: 'whys-root', ref: 'root', order: shuffle(ids(cs.root.options), rng) },
          { id: 'whys-measures', ref: 'measures', order: shuffle(ids(cs.measures.options), rng) },
          ...qs.map((q) => ({ id: `whys-q-${q.id}`, ref: `q:${q.id}`, order: shuffle(ids(q.options), rng) })),
        ],
      };
    }

    case 'fishbone': {
      const [fc] = pick(content.fishbone.cases, draw.fishboneCases, rng);
      return {
        group: fc.id,
        items: [
          { id: 'fb-fishbone', ref: 'fishbone', order: shuffle(ids(fc.causes), rng) },
          { id: 'fb-focus', ref: 'focus', order: shuffle(ids(fc.focus.options), rng) },
          { id: 'fb-next', ref: 'next', order: shuffle(ids(content.fishbone.next.options), rng) },
        ],
      };
    }

    case 'idea':
      return { items: [] };
  }
}
