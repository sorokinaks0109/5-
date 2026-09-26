import { describe, expect, it } from 'vitest';
import { toPublicContent, validateContent } from '../src/core/content.ts';
import { content } from './helpers.ts';

describe('content.json', () => {
  it('проходит проверку без ошибок', () => {
    expect(validateContent(content)).toEqual([]);
  });

  it('банк больше, чем выдаётся на один проход', () => {
    const d = content.settings.draw;
    expect(content.waste.situations.length).toBeGreaterThanOrEqual(20);
    expect(content.waste.situations.length).toBeGreaterThan(d.wasteSituations);
    expect(content.fiveS.variants.filter((v) => v.type === 'inbox').length).toBeGreaterThan(1);
    expect(content.fiveS.variants.filter((v) => v.type !== 'inbox').length).toBeGreaterThan(1);
    expect(content.flow.processes.length).toBeGreaterThan(d.flowProcesses);
    expect(content.flow.little.length).toBeGreaterThan(1);
    expect(content.eightSteps.situations.length).toBeGreaterThan(d.eightStepsSituations);
    expect(content.eightSteps.tools.length).toBeGreaterThan(d.eightStepsTools);
    expect(content.whys.cases.length).toBeGreaterThan(d.whysCases);
    expect(content.whys.questions.length).toBeGreaterThan(d.whysQuestions);
  });

  it('публичная часть не содержит заданий и ответов', () => {
    const pub = JSON.stringify(toPublicContent(content));
    expect(pub).not.toContain('"situations":[');
    expect(pub).not.toContain('"emails"');
    expect(pub).not.toContain('"answer"');
    expect(pub).not.toContain('zones');
  });

  it('находит ошибки в испорченном контенте', () => {
    const broken = structuredClone(content);
    broken.waste.situations[0].answer = 'нет-такого';
    broken.settings.points.fiveS.order = 1;
    const errors = validateContent(broken);
    expect(errors.some((e) => e.includes('нет-такого'))).toBe(true);
    expect(errors.some((e) => e.includes('points.fiveS'))).toBe(true);
  });

  it('в каждом варианте 5С ровно по одному нарушению на шаг', () => {
    for (const v of content.fiveS.variants) {
      const violations = v.type === 'inbox' ? v.violations : v.zones;
      expect(violations.map((z) => z.step).sort()).toEqual(content.fiveS.steps.map((s) => s.id).sort());
    }
    const broken = structuredClone(content);
    const first = broken.fiveS.variants[0];
    if (first.type === 'inbox') first.violations.pop();
    else first.zones.pop();
    expect(validateContent(broken).some((e) => e.includes('по одному на каждый шаг'))).toBe(true);
  });
});
