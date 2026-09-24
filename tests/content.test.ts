import { describe, expect, it } from 'vitest';
import { toPublicContent, validateContent } from '../src/core/content.ts';
import { content } from './helpers.ts';

describe('content.json', () => {
  it('проходит проверку без ошибок', () => {
    expect(validateContent(content)).toEqual([]);
  });

  it('банк больше, чем выдаётся на один проход', () => {
    const d = content.settings.draw;
    expect(content.stage1.situations.length).toBeGreaterThanOrEqual(20);
    expect(content.stage1.situations.length).toBeGreaterThan(d.stage1Situations);
    expect(content.stage2.images.length).toBeGreaterThan(d.stage2Images);
    expect(content.stage3.processes.length).toBeGreaterThan(d.stage3Processes);
    expect(content.stage4.cases.length).toBeGreaterThan(d.stage4Cases);
    expect(content.stage4.questions.length).toBeGreaterThan(d.stage4Questions);
  });

  it('публичная часть не содержит заданий и ответов', () => {
    const pub = JSON.stringify(toPublicContent(content));
    expect(pub).not.toContain('situations');
    expect(pub).not.toContain('"answer"');
    expect(pub).not.toContain('zones');
  });

  it('находит ошибки в испорченном контенте', () => {
    const broken = structuredClone(content);
    broken.stage1.situations[0].answer = 'нет-такого';
    broken.settings.points.stage2.order = 1;
    const errors = validateContent(broken);
    expect(errors.some((e) => e.includes('нет-такого'))).toBe(true);
    expect(errors.some((e) => e.includes('points.stage2'))).toBe(true);
  });
});
