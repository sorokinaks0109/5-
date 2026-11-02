// Документ «Итоги и идеи» для вдумчивого чтения: один файл, который открывается в браузере и печатается в PDF.
import type { JuryDetail, RatingRow } from '../core/types.ts';

export interface ReportOptions {
  tourName: string;
  rows: RatingRow[];
  ideas: JuryDetail[];
  fields: { id: string; label: string; group?: string }[];
  criteria: { id: string; name: string; max: number }[];
  stageNames: string[];
  generatedAt: Date;
}

const esc = (s: string | number) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Переносы строк в тексте идеи сохраняем */
const text = (s: string) => esc(s).replace(/\r?\n/g, '<br>');

export function buildReport(o: ReportOptions): string {
  const byCode = new Map(o.rows.map((r) => [r.code, r]));
  const date = o.generatedAt.toLocaleString('ru-RU');

  const ratingRows = o.rows
    .map(
      (r) =>
        `<tr><td>${r.place}</td><td>${esc(r.nick)}</td><td>${r.stageAltitudes.join(' / ')}</td><td><b>${r.altitude}</b></td><td>${Math.round(r.secondsAuto / 60)}</td><td>${r.hintsUsed}</td></tr>`,
    )
    .join('');

  // Идеи идут по месту автора в рейтинге: сильные участники первыми
  const ordered = [...o.ideas].sort((a, b) => (byCode.get(a.code)?.place ?? 999) - (byCode.get(b.code)?.place ?? 999));

  const ideaBlocks = ordered
    .map((j) => {
      const r = byCode.get(j.code);
      let lastGroup = '';
      const body = o.fields
        .map((f) => {
          const v = (j.fields[f.id] ?? '').trim();
          const head = f.group && f.group !== lastGroup ? `<h4>${esc(f.group)}</h4>` : '';
          if (f.group) lastGroup = f.group;
          else lastGroup = '';
          if (!v && f.group) return '';
          return `${head}<div class="f"><div class="l">${esc(f.label)}</div><div class="v">${v ? text(v) : '<i>не заполнено</i>'}</div></div>`;
        })
        .join('');
      const jury = j.scores.length
        ? `<div class="jury"><b>Оценки жюри</b> (среднее ${j.average ?? '—'})<ul>${j.scores
            .map(
              (s) =>
                `<li>Судья ${s.juryNumber}: ${s.total}${s.comment ? `. «${esc(s.comment)}»` : ''}</li>`,
            )
            .join('')}</ul></div>`
        : '<div class="jury muted">Оценок жюри пока нет.</div>';
      return `<section class="idea">
<h3>Работа № ${j.workNo}. ${esc(j.nick)}</h3>
<p class="meta">${r ? `Место в рейтинге: ${r.place} · высота ${r.altitude} м · вершины 1–${o.stageNames.length - 1}: ${r.stageAltitudes.slice(0, -1).join(' / ')} · идея: ${r.stageAltitudes[r.stageAltitudes.length - 1]} м` : ''}</p>
${body}
${jury}
</section>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Итоги и идеи. ${esc(o.tourName)}</title>
<style>
body{font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1c1b3a;max-width:860px;margin:0 auto;padding:24px 16px}
h1{font-size:28px;margin:0 0 4px}h2{margin-top:40px;border-bottom:2px solid #5b43d6;padding-bottom:4px}
h3{margin:0 0 4px;font-size:20px}h4{margin:14px 0 4px;color:#5b43d6}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #d5d2ee;padding:5px 8px;text-align:left}th{background:#efedfb}
.muted,.meta{color:#6b6990}.meta{margin:0 0 12px;font-size:14px}
.idea{border:1px solid #d5d2ee;border-radius:12px;padding:16px 20px;margin:20px 0;page-break-inside:avoid-page}
.f{margin:10px 0}.l{font-weight:600;font-size:14px;color:#5b43d6}.v{white-space:normal}
.jury{margin-top:14px;padding-top:10px;border-top:1px dashed #d5d2ee;font-size:14px}.jury ul{margin:4px 0 0 18px;padding:0}
@media print{body{max-width:none;padding:0}.idea{break-inside:avoid}}
</style></head><body>
<h1>Итоги и идеи</h1>
<p class="muted">${esc(o.tourName)} · выгружено ${esc(date)}. В документе ники участников и тексты идей, храните его внутри компании.</p>
<h2>Рейтинг</h2>
<table><thead><tr><th>Место</th><th>Ник</th><th>Метры по вершинам</th><th>Итого, м</th><th>Время, мин</th><th>Подсказок</th></tr></thead><tbody>${ratingRows}</tbody></table>
<h2>Идеи (${ordered.length})</h2>
<p class="muted">Идеи расположены по месту автора в рейтинге. Критерии оценки: ${o.criteria.map((c) => `${esc(c.name)} (до ${c.max})`).join(', ')}.</p>
${ideaBlocks || '<p class="muted">Отправленных идей пока нет.</p>'}
</body></html>`;
}
