import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/index.ts';
import { Gear } from '../components/Gear.tsx';
import { Oxygen } from '../components/Oxygen.tsx';
import { Weather } from '../components/Weather.tsx';
import { pc } from '../content.ts';
import type { AnswerValue, StageNo, StageView } from '../core/types.ts';
import { meters, serverOffset, useApp, useNow } from '../hooks.ts';
import { ItemCard } from '../items/ItemCard.tsx';

/** Задания, которые нужно решать строго по порядку (цепочка «5 почему»). */
function blockedReason(view: StageView, idx: number): string | undefined {
  const id = view.items[idx].id;
  const why = id.match(/^s4-why-(\d+)$/);
  if (why && Number(why[1]) > 1 && !view.answers[`s4-why-${Number(why[1]) - 1}`])
    return 'Сначала ответьте на предыдущий шаг «почему».';
  if (id === 's4-root' && view.items.some((i) => i.id.startsWith('s4-why-') && !view.answers[i.id]))
    return 'Сначала пройдите все шаги «5 почему».';
  return undefined;
}

export function StageScreen({ stage }: { stage: StageNo }) {
  const { error, go, refresh } = useApp();
  const [view, setView] = useState<StageView | null>(null);
  const [idx, setIdx] = useState(0);
  const [offset, setOffset] = useState(0);
  const now = useNow(offset);
  const reloading = useRef(false);

  const load = useCallback(async () => {
    try {
      const v = await api.getStage(stage);
      setOffset(serverOffset(v.serverNow));
      setView(v);
      return v;
    } catch (e) {
      error(e);
      go('/');
    }
  }, [stage, error, go]);

  useEffect(() => {
    load().then((v) => {
      if (!v) return;
      const first = v.items.findIndex((i) => !v.answers[i.id]);
      setIdx(v.status === 'active' && first >= 0 ? first : 0);
    });
  }, [load]);

  // Кислород кончился — сервер сам закроет этап, перезагружаем вид
  useEffect(() => {
    if (!view || view.status !== 'active' || reloading.current) return;
    const over = now.getTime() > new Date(view.deadline).getTime() + (pc.settings.graceSeconds + 1) * 1000;
    if (over) {
      reloading.current = true;
      load().finally(() => {
        reloading.current = false;
        refresh();
      });
    }
  }, [now, view, load, refresh]);

  if (!view) return <div className="container center muted" style={{ paddingTop: 80 }}>Поднимаемся…</div>;

  const finished = view.status === 'finished';
  const item = view.items[idx];
  const answeredCount = Object.keys(view.answers).length;

  const onAnswer = async (value: AnswerValue) => {
    try {
      const r = await api.answer(stage, item.id, value);
      const next: StageView = {
        ...view,
        answers: { ...view.answers, [item.id]: { value, fraction: r.fraction, points: r.points, hint: view.hints[item.id] !== undefined } },
        altitude: r.altitude,
        errors: r.errors,
        weather: r.weather,
      };
      setView(next);
      if (Object.keys(next.answers).length === view.items.length) {
        await load();
        await refresh();
        window.scrollTo(0, 0);
      }
    } catch (e) {
      error(e);
      await load();
    }
  };

  const onHint = async () => {
    try {
      const r = await api.hint(stage, item.id);
      setView({ ...view, hints: { ...view.hints, [item.id]: r.hint }, hintsLeft: r.hintsLeft });
    } catch (e) {
      error(e);
    }
  };

  const finish = async () => {
    const left = view.items.length - answeredCount;
    const msg = left
      ? `Не отвечено заданий: ${left}. За них будет 0 м. Завершить восхождение на эту вершину?`
      : 'Завершить этап?';
    if (!window.confirm(msg)) return;
    try {
      setView(await api.finishStage(stage));
      await refresh();
      setIdx(0);
      window.scrollTo(0, 0);
    } catch (e) {
      error(e);
    }
  };

  const dotClass = (i: number) => {
    const a = view.answers[view.items[i].id];
    const st = a ? (a.fraction >= 1 ? 'ok' : a.fraction > 0 ? 'part' : 'bad') : '';
    return `dot ${st} ${i === idx ? 'current' : ''}`;
  };

  const flagsOrder = view.answers['s3-order']?.value as string[] | undefined;

  return (
    <>
      <div className="stage-bar">
        <button className="btn btn-ghost btn-small" style={{ color: '#fff' }} onClick={() => go('/')} aria-label="На главную">
          ←
        </button>
        <div className="name">
          {pc.stages[stage - 1].name}
          <small>
            {meters(view.altitude)} · {answeredCount}/{view.items.length}
          </small>
        </div>
        <Weather weather={view.weather} />
        {!finished && <Oxygen startedAt={view.startedAt} deadline={view.deadline} now={now} />}
      </div>
      <main className="container">
        {finished ? (
          <div className="card" style={{ background: 'var(--ok-soft)' }}>
            <h1>Вершина пройдена!</h1>
            <p>
              Набрано: <b>{meters(view.altitude)}</b> из {meters(pc.settings.stageMaxAltitude)}. Ошибок: {view.errors}. Погода:{' '}
              {view.weather.name.toLowerCase()}.
            </p>
            <p className="small">Ниже — разбор с правильными ответами. Он полезен для практики на работе.</p>
            <button className="btn" onClick={() => go('/')}>
              К маршруту
            </button>
          </div>
        ) : (
          <div className="card">
            <h1 style={{ fontSize: '1.3rem' }}>{pc.stages[stage - 1].title}</h1>
            <p className="small muted" style={{ marginBottom: 8 }}>
              {pc.stages[stage - 1].intro}
            </p>
            <div className="row small">
              <span>Снаряжение:</span>
              <Gear left={view.hintsLeft} total={pc.settings.hintsTotal} />
            </div>
          </div>
        )}

        {view.intro && (
          <div className="card">
            <div className="row" style={{ marginBottom: 6 }}>
              <h2 style={{ margin: 0 }}>{view.intro.title}</h2>
            </div>
            <p style={{ marginBottom: 0 }}>{view.intro.text}</p>
          </div>
        )}

        <nav className="dots" aria-label="Задания">
          {view.items.map((it, i) => (
            <button key={it.id} className={dotClass(i)} onClick={() => setIdx(i)} aria-label={`Задание ${i + 1}`}>
              {i + 1}
            </button>
          ))}
        </nav>

        <ItemCard
          key={item.id + (finished ? '-review' : '')}
          item={item}
          answer={view.answers[item.id]}
          hint={view.hints[item.id]}
          review={view.review?.[item.id]}
          finished={finished}
          blocked={blockedReason(view, idx)}
          hintsLeft={view.hintsLeft}
          flagsOrder={flagsOrder}
          onAnswer={onAnswer}
          onHint={onHint}
        />

        <div className="row">
          <button className="btn btn-ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>
            ← Назад
          </button>
          <span className="spacer" />
          <button className="btn btn-ghost" disabled={idx === view.items.length - 1} onClick={() => setIdx(idx + 1)}>
            Дальше →
          </button>
        </div>
        {!finished && (
          <div style={{ marginTop: 24 }}>
            <button className="btn btn-secondary btn-block" onClick={finish}>
              Завершить этап
            </button>
          </div>
        )}
      </main>
    </>
  );
}
