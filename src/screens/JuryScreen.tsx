// Панель жюри: работы этапа 5 без имён, оценка по критериям и комментарий.
import { useEffect, useState } from 'react';
import { api } from '../api/index.ts';
import { pc } from '../content.ts';
import type { JuryWork } from '../core/types.ts';
import { formatDate, meters, useApp } from '../hooks.ts';

function Scoring({ work, onSaved }: { work: JuryWork; onSaved: (list: JuryWork[]) => void }) {
  const { error, info, me } = useApp();
  const [scores, setScores] = useState<Record<string, number>>(
    () => work.myScores ?? Object.fromEntries(pc.stage5.criteria.map((c) => [c.id, 0])),
  );
  const [comment, setComment] = useState(work.myComment);
  const [busy, setBusy] = useState(false);
  const total = pc.stage5.criteria.reduce((s, c) => s + (scores[c.id] ?? 0), 0);
  const locked = me.tour.resultsPublished;

  const save = async () => {
    setBusy(true);
    try {
      onSaved(await api.juryScore(work.workNo, scores, comment));
      info(`Оценка работы № ${work.workNo} сохранена.`);
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>Оценка</h2>
      {pc.stage5.criteria.map((c) => (
        <div key={c.id} className="score-row">
          <div>
            <b>{c.name}</b>
            <div className="small muted">{c.description}</div>
          </div>
          <input
            type="number"
            min={0}
            max={c.max}
            step={10}
            value={scores[c.id] ?? 0}
            disabled={locked}
            onChange={(e) => setScores({ ...scores, [c.id]: Math.max(0, Math.min(c.max, Number(e.target.value) || 0)) })}
            aria-label={`${c.name}, от 0 до ${c.max}`}
          />
          <input
            type="range"
            min={0}
            max={c.max}
            step={10}
            value={scores[c.id] ?? 0}
            disabled={locked}
            onChange={(e) => setScores({ ...scores, [c.id]: Number(e.target.value) })}
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>
      ))}
      <p style={{ marginTop: 12 }}>
        Итого: <b>{meters(total)}</b> из {meters(pc.settings.stageMaxAltitude)}
      </p>
      <label className="field">
        <span>Комментарий</span>
        <textarea rows={3} value={comment} disabled={locked} maxLength={2000} onChange={(e) => setComment(e.target.value)} />
      </label>
      {locked ? (
        <div className="notice">Итоги опубликованы — оценки закрыты для изменений.</div>
      ) : (
        <button className="btn btn-block" onClick={save} disabled={busy}>
          {busy ? 'Сохраняем…' : work.myScores ? 'Обновить оценку' : 'Сохранить оценку'}
        </button>
      )}
    </div>
  );
}

export function JuryScreen() {
  const { me, logout, error } = useApp();
  const [list, setList] = useState<JuryWork[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    api.juryList().then(setList).catch(error);
  }, [error]);

  const work = list?.find((w) => w.workNo === open);
  const done = list?.filter((w) => w.myScores).length ?? 0;

  return (
    <>
      <header className="topbar">
        <div className="title">Жюри · судья № {me.number}</div>
        {work && (
          <button className="btn btn-ghost btn-small" onClick={() => setOpen(null)}>
            К списку
          </button>
        )}
        <button className="btn btn-ghost btn-small" onClick={logout}>
          Выйти
        </button>
      </header>
      <main className="container">
        {!list ? (
          <p className="muted center">Загрузка…</p>
        ) : work ? (
          <>
            <div className="card work-text">
              <h1>Работа № {work.workNo}</h1>
              <p className="small muted">Отправлена {formatDate(work.submittedAt)}. Автор скрыт.</p>
              {pc.stage5.fields.map((f) => (
                <div key={f.id}>
                  <h4>
                    {f.group ? `${f.group}: ` : ''}
                    {f.label}
                  </h4>
                  <p>{work.fields[f.id]?.trim() || <span className="muted">— не заполнено —</span>}</p>
                </div>
              ))}
            </div>
            <Scoring key={work.workNo} work={work} onSaved={setList} />
          </>
        ) : (
          <>
            <div className="card">
              <h1>Идеи участников</h1>
              <p>
                Оценено: <b>{done}</b> из {list.length}. Работы анонимные: вы видите только номер работы. Каждую работу
                оценивают все {pc.settings.juryCount} судьи, итог — среднее.
              </p>
            </div>
            {list.length === 0 && <div className="notice">Пока нет отправленных идей.</div>}
            <div className="stage-list">
              {list.map((w) => (
                <button
                  key={w.workNo}
                  className={`stage-card ${w.myScores ? 'finished' : 'available'}`}
                  style={{ textAlign: 'left', border: 'none', cursor: 'pointer', font: 'inherit' }}
                  onClick={() => {
                    setOpen(w.workNo);
                    window.scrollTo(0, 0);
                  }}
                >
                  <div className="stage-num">{w.myScores ? '✓' : '•'}</div>
                  <div className="info">
                    <b>Работа № {w.workNo}</b>
                    <span className="small muted">{(w.fields.problem ?? '').slice(0, 90)}…</span>
                  </div>
                  <span className="small">
                    {w.myScores ? meters(Object.values(w.myScores).reduce((a, b) => a + b, 0)) : 'Оценить'}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
