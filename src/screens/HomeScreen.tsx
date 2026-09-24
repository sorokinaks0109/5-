import { useState } from 'react';
import { api } from '../api/index.ts';
import { Emblem } from '../components/Emblem.tsx';
import { Gear } from '../components/Gear.tsx';
import { Mountain } from '../components/Mountain.tsx';
import { LogoSlot } from '../components/Notice.tsx';
import { pc } from '../content.ts';
import { IDEA_STAGE, STAGES, type StageNo, type StageSummary } from '../core/types.ts';
import { formatDate, meters, serverOffset, useApp, useCountUp, useNow } from '../hooks.ts';
import { STAGE_THEME } from '../theme.ts';
import { formatClock, remainingMs } from '../core/timer.ts';
import { downloadCertificate } from '../lib/certificate.ts';

const STATUS_TEXT: Record<StageSummary['status'], string> = {
  locked: 'Закрыта',
  available: 'Можно идти',
  active: 'Идёт восхождение',
  finished: 'Пройдена',
};

export function HomeScreen() {
  const { me, refresh, error, go, logout } = useApp();
  const p = me.participant!;
  const now = useNow(serverOffset(me.tour.serverNow));
  const [busy, setBusy] = useState<number | null>(null);
  const shownAltitude = useCountUp(p.altitude);
  const maxTotal = pc.settings.stageMaxAltitude * STAGES.length;

  const start = async (s: StageSummary) => {
    if (s.status === 'locked') return;
    if (s.status === 'available') {
      const min = pc.settings.stageMinutes[s.stage - 1];
      const ok = window.confirm(
        `Вершина ${s.stage}: «${pc.stages[s.stage - 1].name}».\n\nЗапас кислорода — ${min} минут. Таймер запустится сразу и не остановится, даже если закрыть страницу. Пройти вершину можно только один раз.\n\nНачинаем?`,
      );
      if (!ok) return;
      setBusy(s.stage);
      try {
        await api.startStage(s.stage);
      } catch (e) {
        error(e);
        setBusy(null);
        await refresh();
        return;
      }
    }
    go(`/stage/${s.stage}`);
  };

  const tour = me.tour;
  const published = tour.resultsPublished;

  return (
    <>
      <header className="topbar">
        <div className="title">{pc.settings.gameName}</div>
        <button className="btn btn-ghost btn-small" onClick={() => go('/profile')}>
          Профиль
        </button>
        <button className="btn btn-ghost btn-small" onClick={logout}>
          Выйти
        </button>
      </header>
      <main className="container wide">
        <div className="home-grid">
          <div>
            <section className="hero">
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="small" style={{ color: '#e0e7ff' }}>
                    {me.nick} · {me.department}
                  </div>
                  <div className="alt">
                    {meters(shownAltitude)} <small>из {meters(maxTotal)}</small>
                  </div>
                </div>
                <Emblem size={72} />
              </div>
              <div className="progress-bar" aria-hidden="true">
                <span style={{ width: `${Math.min(100, (p.altitude / maxTotal) * 100)}%` }} />
              </div>
              <div className="stats">
                <div className="stat">
                  <b>{p.place ?? '—'}</b>
                  <span>место{p.participantsCount ? ` из ${p.participantsCount}` : ''}</span>
                </div>
                <div className="stat">
                  <b>{p.stages.filter((s) => s.status === 'finished').length} / {STAGES.length}</b>
                  <span>вершин</span>
                </div>
                <div className="stat">
                  <b>
                    <Gear left={p.hintsLeft} total={pc.settings.hintsTotal} />
                  </b>
                  <span>снаряжение</span>
                </div>
              </div>
            </section>
            <div className="card" style={{ padding: 8 }}>
              <Mountain stages={p.stages} nick={me.nick} onPeak={(st) => start(p.stages[st - 1])} />
            </div>
            <TourInfo />
          </div>

          <div>
            {published && (
              <div className="card">
                <h2>Итоги опубликованы</h2>
                <p>
                  Ваша высота — <b>{meters(p.altitude)}</b>, место — <b>{p.place ?? '—'}</b>.
                </p>
                <div className="row">
                  <button className="btn" onClick={() => go('/rating')}>
                    Рейтинг на горе
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => downloadCertificate(me.nick ?? '', p.altitude).catch(error)}
                  >
                    Скачать сертификат
                  </button>
                </div>
              </div>
            )}
            <h2>Маршрут</h2>
            <div className="stage-list">
              {p.stages.map((s) => (
                <div
                  key={s.stage}
                  className={`stage-card ${s.status}`}
                  style={s.status === 'locked' ? undefined : { borderLeftColor: STAGE_THEME[s.stage - 1].color }}
                >
                  <div
                    className="stage-num"
                    style={{
                      background: s.status === 'locked' ? undefined : STAGE_THEME[s.stage - 1].soft,
                      color: STAGE_THEME[s.stage - 1].color,
                    }}
                  >
                    {s.status === 'finished' ? '✓' : STAGE_THEME[s.stage - 1].icon}
                  </div>
                  <div className="info">
                    <span className="term" style={{ color: STAGE_THEME[s.stage - 1].color }}>
                      {s.stage}. {STAGE_THEME[s.stage - 1].term}
                    </span>
                    <b>{pc.stages[s.stage - 1].name}</b>
                    <span className="small muted">
                      {STATUS_TEXT[s.status]}
                      {s.status === 'finished' && s.stage !== IDEA_STAGE && ` · ${meters(s.altitude)}`}
                      {s.status === 'finished' && s.stage === IDEA_STAGE && (published ? ` · ${meters(s.altitude)}` : ' · оценивает жюри')}
                      {s.status === 'active' && s.deadline && ` · осталось ${formatClock(remainingMs(s.deadline, now))}`}
                      {s.status === 'available' && ` · ${pc.settings.stageMinutes[s.stage - 1]} мин`}
                    </span>
                  </div>
                  {s.status === 'available' && (
                    <button className="btn btn-small" disabled={busy !== null} onClick={() => start(s)}>
                      {busy === s.stage ? '…' : 'Начать'}
                    </button>
                  )}
                  {s.status === 'active' && (
                    <button className="btn btn-small" onClick={() => go(`/stage/${s.stage}`)}>
                      Продолжить
                    </button>
                  )}
                  {s.status === 'finished' && (
                    <button className="btn btn-ghost btn-small" onClick={() => go(`/stage/${s.stage as StageNo}`)}>
                      {s.stage === IDEA_STAGE ? 'Моя идея' : 'Разбор'}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="card" style={{ marginTop: 16 }}>
              <h3>Правила экспедиции</h3>
              <ul className="small" style={{ paddingLeft: 20, margin: 0 }}>
                <li>Высота — ваши баллы. За каждую вершину — до {meters(pc.settings.stageMaxAltitude)}.</li>
                <li>Вершины открываются по очереди, каждую можно пройти один раз.</li>
                <li>Время на вершину — запас кислорода. Таймер не останавливается, если закрыть страницу.</li>
                <li>
                  Снаряжение — {pc.settings.hintsTotal} подсказки на весь тур. Подсказка снижает высоту за задание на{' '}
                  {Math.round(pc.settings.hintPenalty * 100)}%.
                </li>
                <li>Ошибки портят погоду, но не останавливают игру.</li>
                <li>При равной высоте выше тот, кто быстрее прошёл вершины 1–5.</li>
                <li>В финал выходят {pc.settings.finalistsCount} лучших.</li>
              </ul>
            </div>
            <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
              <LogoSlot dark />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

function TourInfo() {
  const { me } = useApp();
  const t = me.tour;
  if (t.state === 'draft') return <div className="notice warn">Тур ещё не открыт. Загляните позже.</div>;
  if (t.state === 'open')
    return (
      <div className="notice">
        Тур открыт до <b>{formatDate(t.closesAt)}</b>. Проходите вершины в удобное время.
      </div>
    );
  return (
    <div className="notice warn">
      Тур закрыт{t.resultsPublished ? ', итоги опубликованы.' : '. Жюри оценивает идеи — итоги появятся здесь.'}
    </div>
  );
}
