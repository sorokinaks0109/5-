import { describe, expect, it } from 'vitest';
import type { JuryDetail, RatingRow } from '../src/core/types.ts';
import { buildReport } from '../src/lib/report.ts';

const row = (place: number, code: string, nick: string): RatingRow => ({
  place,
  accountId: code,
  number: place,
  code,
  nick,
  stageAltitudes: [10, 20, 30, 40, 50, 60, 70],
  altitude: 280,
  secondsAuto: 600,
  hintsUsed: 1,
  juryScored: 0,
  finalist: false,
});

const idea = (workNo: number, code: string, nick: string, problem: string): JuryDetail => ({
  workNo,
  nick,
  code,
  fields: { problem, effectTime: '' },
  scores: [],
  average: null,
});

describe('отчёт «Итоги и идеи»', () => {
  const html = buildReport({
    tourName: 'Тур',
    rows: [row(1, 'A', 'Орёл'), row(2, 'B', 'Сокол')],
    ideas: [idea(1, 'B', 'Сокол', 'Вторая'), idea(2, 'A', 'Орёл', 'Первая <b>x</b>\nстрока')],
    fields: [
      { id: 'problem', label: 'Проблема' },
      { id: 'effectTime', label: 'Время', group: 'Ожидаемый эффект' },
    ],
    criteria: [{ id: 'c', name: 'Актуальность', max: 200 }],
    stageNames: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    generatedAt: new Date('2026-11-02T10:00:00Z'),
  });

  it('ставит идеи по месту автора в рейтинге', () => {
    expect(html.indexOf('Орёл</h3>')).toBeLessThan(html.indexOf('Сокол</h3>'));
  });

  it('экранирует html и сохраняет переносы строк', () => {
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;<br>строка');
    expect(html).not.toContain('<b>x</b>');
  });

  it('не показывает пустые поля группы', () => {
    expect(html).not.toContain('Ожидаемый эффект</h4>');
  });
});
