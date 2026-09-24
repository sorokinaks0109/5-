// Вершина 5: своя идея по шаблону. Черновик сохраняется на сервер автоматически.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/index.ts';
import { Oxygen } from '../components/Oxygen.tsx';
import { pc } from '../content.ts';
import { IDEA_STAGE, type IdeaField, type StageView } from '../core/types.ts';
import { serverOffset, useApp, useNow } from '../hooks.ts';

const DRAFT_KEY = 'kaizen-idea-draft';
const AUTOSAVE_MS = 15_000;

function FieldBox({
  f,
  value,
  onChange,
  disabled,
}: {
  f: IdeaField;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const len = value.length;
  return (
    <label className="field">
      <span>
        {f.label}
        {f.required && <span style={{ color: 'var(--bad)' }}> *</span>}
      </span>
      <span className="small muted" style={{ fontWeight: 400 }}>
        {f.help}
      </span>
      <textarea
        rows={f.rows ?? 3}
        value={value}
        maxLength={f.maxLength}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className={`counter ${len >= f.maxLength ? 'over' : ''}`}>
        {len} / {f.maxLength}
      </div>
    </label>
  );
}

export function IdeaScreen() {
  const { error, go, refresh, info } = useApp();
  const [view, setView] = useState<StageView | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [offset, setOffset] = useState(0);
  const [saved, setSaved] = useState<'saved' | 'dirty' | 'saving'>('saved');
  const [busy, setBusy] = useState(false);
  const now = useNow(offset);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const reloading = useRef(false);

  const load = useCallback(async () => {
    try {
      const v = await api.getStage(IDEA_STAGE);
      setOffset(serverOffset(v.serverNow));
      setView(v);
      return v;
    } catch (e) {
      error(e);
      go('/');
    }
  }, [error, go]);

  useEffect(() => {
    load().then((v) => {
      if (!v) return;
      let local: Record<string, string> = {};
      try {
        local = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
      } catch {
        /* нет черновика */
      }
      const server = v.idea?.fields ?? {};
      // Берём более длинный текст по каждому полю: так не потеряется ни серверный, ни локальный черновик
      const merged: Record<string, string> = {};
      for (const f of pc.idea.fields) {
        const a = server[f.id] ?? '';
        const b = v.status === 'active' ? local[f.id] ?? '' : '';
        merged[f.id] = b.length > a.length ? b : a;
      }
      setFields(merged);
    });
  }, [load]);

  const save = useCallback(async () => {
    setSaved('saving');
    try {
      await api.saveIdea(fieldsRef.current, false);
      setSaved('saved');
    } catch (e) {
      setSaved('dirty');
      error(e);
    }
  }, [error]);

  // Автосохранение
  useEffect(() => {
    if (saved !== 'dirty' || view?.status !== 'active') return;
    const t = setTimeout(save, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [saved, fields, save, view?.status]);

  // Время вышло — сервер сам отправит сохранённый черновик
  useEffect(() => {
    if (!view || view.status !== 'active' || reloading.current) return;
    const left = new Date(view.deadline).getTime() - now.getTime();
    if (left < 3000 && left > 0 && saved === 'dirty') save();
    if (left < -(pc.settings.graceSeconds + 1) * 1000) {
      reloading.current = true;
      load().finally(() => {
        reloading.current = false;
        refresh();
      });
    }
  }, [now, view, saved, save, load, refresh]);

  if (!view) return <div className="container center muted" style={{ paddingTop: 80 }}>Поднимаемся…</div>;
  const active = view.status === 'active';

  const change = (id: string, v: string) => {
    const next = { ...fields, [id]: v };
    setFields(next);
    setSaved('dirty');
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    } catch {
      /* приватный режим */
    }
  };

  const submit = async () => {
    if (!window.confirm('Отправить идею жюри? После отправки изменить её будет нельзя.')) return;
    setBusy(true);
    try {
      const v = await api.saveIdea(fields, true);
      setView(v);
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ничего */
      }
      await refresh();
      info('Идея отправлена жюри. Вы на юбилейной вершине!');
      window.scrollTo(0, 0);
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };

  const groups: { title?: string; fields: IdeaField[] }[] = [];
  for (const f of pc.idea.fields) {
    const last = groups[groups.length - 1];
    if (last && f.group && last.title === f.group) last.fields.push(f);
    else groups.push({ title: f.group, fields: [f] });
  }

  return (
    <>
      <div className="stage-bar">
        <button className="btn btn-ghost btn-small" style={{ color: '#fff' }} onClick={() => go('/')} aria-label="На главную">
          ←
        </button>
        <div className="name">
          {pc.stages[IDEA_STAGE - 1].name}
          <small>
            {active ? (saved === 'saved' ? 'Черновик сохранён' : saved === 'saving' ? 'Сохраняем…' : 'Есть несохранённые изменения') : 'Отправлено'}
          </small>
        </div>
        {active && <Oxygen startedAt={view.startedAt} deadline={view.deadline} now={now} />}
      </div>
      <main className="container">
        {active ? (
          <div className="card">
            <h1 style={{ fontSize: '1.3rem' }}>{pc.stages[IDEA_STAGE - 1].title}</h1>
            <p className="small muted">{pc.stages[IDEA_STAGE - 1].intro}</p>
            <p className="small">
              Черновик сохраняется автоматически. Если время закончится, жюри получит последний сохранённый вариант. Не
              указывайте в тексте своё имя — оценка анонимная.
            </p>
          </div>
        ) : (
          <div className="card" style={{ background: 'var(--ok-soft)' }}>
            <h1>Идея у жюри</h1>
            <p>
              {view.idea?.submittedAt
                ? `Работа № ${view.idea.workNo} отправлена. Жюри оценит её анонимно по пяти критериям.`
                : 'Время вышло, а черновик был пустым — идея не отправлена.'}
            </p>
            <button className="btn" onClick={() => go('/')}>
              К маршруту
            </button>
          </div>
        )}

        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {groups.map((g, gi) =>
            g.title ? (
              <fieldset key={gi} style={{ border: '2px solid var(--snow-2)', borderRadius: 12, padding: 12, marginBottom: 14 }}>
                <legend style={{ fontWeight: 700, padding: '0 6px' }}>{g.title}</legend>
                {g.fields.map((f) => (
                  <FieldBox key={f.id} f={f} value={fields[f.id] ?? ''} onChange={(v) => change(f.id, v)} disabled={!active} />
                ))}
              </fieldset>
            ) : (
              g.fields.map((f) => (
                <FieldBox key={f.id} f={f} value={fields[f.id] ?? ''} onChange={(v) => change(f.id, v)} disabled={!active} />
              ))
            ),
          )}
          {active && (
            <div className="row">
              <button type="button" className="btn btn-ghost" onClick={save} disabled={saved === 'saving'}>
                Сохранить черновик
              </button>
              <button className="btn" disabled={busy}>
                {busy ? 'Отправляем…' : 'Отправить жюри'}
              </button>
            </div>
          )}
        </form>
        <div className="card">
          <h3>Как оценивает жюри</h3>
          <ul className="small" style={{ paddingLeft: 20, margin: 0 }}>
            {pc.idea.criteria.map((c) => (
              <li key={c.id}>
                <b>{c.name}</b> (до {c.max} м) — {c.description}
              </li>
            ))}
          </ul>
        </div>
      </main>
    </>
  );
}
