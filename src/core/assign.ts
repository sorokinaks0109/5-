// Случайная выдача заданий: каждому участнику — свой набор из банка и свой порядок вариантов.
import { createRng, pick, shuffle, shuffleNotIdentity } from './random.ts';
import type { Assignment, Content, StageNo } from './types.ts';

/** Зерно выдачи: соль тура + участник + этап. Соль задаётся при создании тура,
 *  поэтому выдачу нельзя предсказать заранее, но её можно воспроизвести. */
export function assignmentSeed(salt: string, accountId: string, stage: StageNo): string {
  return `${salt}:${accountId}:${stage}`;
}

export function assignStage(stage: StageNo, content: Content, seed: string): Assignment {
  const rng = createRng(seed);
  const draw = content.settings.draw;
  const ids = <T extends { id: string }>(a: T[]) => a.map((x) => x.id);

  switch (stage) {
    case 1: {
      const sits = pick(content.stage1.situations, draw.stage1Situations, rng);
      return {
        items: sits.map((s) => ({ id: `s1-${s.id}`, ref: s.id, order: shuffle(ids(content.stage1.wasteTypes), rng) })),
      };
    }
    case 2: {
      const [img] = pick(content.stage2.images, draw.stage2Images, rng);
      const stepIds = ids(content.stage2.steps);
      return {
        group: img.id,
        items: [
          { id: 's2-order', ref: 'order', order: shuffleNotIdentity(stepIds, rng) },
          { id: 's2-hotspots', ref: 'hotspots' },
          { id: 's2-match', ref: 'match', order: shuffle(ids(img.match), rng), order2: shuffle(stepIds, rng) },
        ],
      };
    }
    case 3: {
      const [proc] = pick(content.stage3.processes, draw.stage3Processes, rng);
      return {
        group: proc.id,
        items: [
          { id: 's3-order', ref: 'order', order: shuffleNotIdentity(ids(proc.cards), rng) },
          { id: 's3-flags', ref: 'flags', order: shuffle(ids(proc.cards), rng) },
          { id: 's3-number', ref: 'number' },
        ],
      };
    }
    case 4: {
      const [cs] = pick(content.stage4.cases, draw.stage4Cases, rng);
      const qs = pick(content.stage4.questions, draw.stage4Questions, rng);
      return {
        group: cs.id,
        items: [
          ...cs.whys.map((w, i) => ({ id: `s4-why-${i + 1}`, ref: `why:${i}`, order: shuffle(ids(w.options), rng) })),
          { id: 's4-root', ref: 'root', order: shuffle(ids(cs.root.options), rng) },
          { id: 's4-measures', ref: 'measures', order: shuffle(ids(cs.measures.options), rng) },
          ...qs.map((q) => ({ id: `s4-q-${q.id}`, ref: `q:${q.id}`, order: shuffle(ids(q.options), rng) })),
        ],
      };
    }
    case 5: {
      const [fc] = pick(content.stage5.cases, draw.stage5Cases, rng);
      return {
        group: fc.id,
        items: [
          { id: 's5-fishbone', ref: 'fishbone', order: shuffle(ids(fc.causes), rng) },
          { id: 's5-focus', ref: 'focus', order: shuffle(ids(fc.focus.options), rng) },
          { id: 's5-next', ref: 'next', order: shuffle(ids(content.stage5.next.options), rng) },
        ],
      };
    }
    case 6:
      return { items: [] };
  }
}
