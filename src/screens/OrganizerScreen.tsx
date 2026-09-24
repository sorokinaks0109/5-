// Панель организатора: тур, личные коды, прогресс, итоги и выгрузка.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/index.ts';
import { Badge5 } from '../components/Badge5.tsx';
import { pc } from '../content.ts';
import { prettyCode } from '../core/codes.ts';
import type { Account, ProgressRow, ResultsView, StageStatus } from '../core/types.ts';
import { formatDate, meters, useApp } from '../hooks.ts';
import { downloadCsv, downloadXlsx, stamp, type Sheet } from '../lib/export.ts';
import { RatingMountain } from './LeaderboardScreen.tsx';

type Tab = 'tour' | 'codes' | 'progress' | 'results';

const ROLE: Record<string, string> = { participant: 'Участник', jury: 'Жюри', organizer: 'Организатор' };
const STATUS_ICON: Record<StageStatus, string> = { locked: '·', available: '○', active: '◐', finished: '●' };

export function OrganizerScreen() {
  const { logout } = useApp();
  const [tab, setTab] = useState<Tab>('tour');
  return (
    <>
      <header className="topbar">
        <div className="title">Организатор</div>
        <button className="btn btn-ghost btn-small" onClick={logout}>
          Выйти
        </button>
      </header>
      <main className="container wide">
        <nav className="tabs">
          {(
            [
              ['tour', 'Тур'],
              ['codes', 'Личные коды'],
              ['progress', 'Прогресс'],
              ['results', 'Итоги и выгрузка'],
            ] as [Tab, string][]
          ).map(([k, t]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {t}
            </button>
          ))}
        </nav>
        {tab === 'tour' && <TourTab />}
        {tab === 'codes' && <CodesTab />}
        {tab === 'progress' && <ProgressTab />}
        {tab === 'results' && <ResultsTab />}
      </main>
    </>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function TourTab() {
  const { me, refresh, error, info } = useApp();
  const t = me.tour;
  const [busy, setBusy] = useState(false);
  const [closes, setCloses] = useState(toLocalInput(t.closesAt));
  useEffect(() => setCloses(toLocalInput(t.closesAt)), [t.closesAt]);

  const act = async (action: Parameters<typeof api.orgTour>[0], confirmText: string, closesAt?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    try {
      await api.orgTour(action, closesAt);
      await refresh();
      info('Готово.');
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };

  const stateText = t.state === 'draft' ? 'не открыт' : t.state === 'open' ? 'открыт' : 'закрыт';
  const s = pc.settings;
  return (
    <div className="home-grid">
      <div>
        <div className="card">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <h1>{s.tourName}</h1>
              <p>
                Состояние тура: <b>{stateText}</b>
                {t.resultsPublished && ', итоги опубликованы'}.
              </p>
              {t.opensAt && <p className="small">Открыт: {formatDate(t.opensAt)}</p>}
              {t.closesAt && <p className="small">Закрытие: {formatDate(t.closesAt)}</p>}
            </div>
            <Badge5 size={80} dark />
          </div>
          <div className="row">
            {t.state !== 'open' && (
              <button
                className="btn"
                disabled={busy}
                onClick={() =>
                  act(
                    'open',
                    `Открыть тур на ${s.tourDays} дней? Участники смогут входить и проходить вершины.${
                      t.opensAt ? '\n\nВнимание: тур уже открывался. Прогресс участников сохранится.' : ''
                    }`,
                  )
                }
              >
                Открыть тур
              </button>
            )}
            {t.state === 'open' && (
              <button className="btn btn-secondary" disabled={busy} onClick={() => act('close', 'Закрыть тур сейчас? Новые вершины начать будет нельзя.')}>
                Закрыть тур
              </button>
            )}
            {t.state === 'closed' && !t.resultsPublished && (
              <button
                className="btn"
                disabled={busy}
                onClick={() => act('publish', 'Опубликовать итоги? Участники увидят полный рейтинг и смогут скачать сертификаты. Оценки жюри будут закрыты.')}
              >
                Опубликовать итоги
              </button>
            )}
            {t.resultsPublished && (
              <button className="btn btn-ghost" disabled={busy} onClick={() => act('unpublish', 'Скрыть итоги от участников?')}>
                Скрыть итоги
              </button>
            )}
          </div>
        </div>
        {t.state !== 'draft' && (
          <div className="card">
            <h3>Изменить дату закрытия</h3>
            <div className="row">
              <input type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} style={{ maxWidth: 280 }} />
              <button className="btn btn-ghost" disabled={busy || !closes} onClick={() => act('setClosesAt', '', new Date(closes).toISOString())}>
                Сохранить
              </button>
            </div>
          </div>
        )}
        {api.mode === 'demo' && (
          <div className="card">
            <span className="tag draft">ДЕМО</span>
            <p className="small" style={{ marginTop: 8 }}>
              Данные демо хранятся только в этом браузере. Можно начать заново: появятся новые боты и коды.
            </p>
            <button
              className="btn btn-ghost"
              onClick={async () => {
                if (!window.confirm('Удалить все демо-данные и начать заново?')) return;
                await api.reset?.();
                window.location.hash = '/';
                window.location.reload();
              }}
            >
              Сбросить демо
            </button>
          </div>
        )}
      </div>
      <div className="card">
        <h2>Как провести тур</h2>
        <ol className="small" style={{ paddingLeft: 20 }}>
          <li>«Личные коды» → создайте коды участников и жюри, скачайте список.</li>
          <li>Раздайте коды. Кому какой код выдан — храните у себя, в системе нет ФИО.</li>
          <li>«Открыть тур» — тур откроется на {s.tourDays} дней.</li>
          <li>Следите за «Прогрессом».</li>
          <li>После закрытия жюри оценивает идеи. Проверьте, что у всех работ по {s.juryCount} оценки.</li>
          <li>«Опубликовать итоги» — участники увидят рейтинг и скачают сертификаты.</li>
          <li>«Итоги и выгрузка» → скачайте Excel. Первые {s.finalistsCount} — финалисты.</li>
        </ol>
        <h3>Настройки (из content.json)</h3>
        <ul className="small" style={{ paddingLeft: 20, margin: 0 }}>
          <li>Участников: до {s.maxParticipants}; жюри: {s.juryCount}</li>
          <li>Время на вершины: {s.stageMinutes.join(' / ')} мин</li>
          <li>Подсказок: {s.hintsTotal}, штраф {Math.round(s.hintPenalty * 100)}%</li>
          <li>Финалистов: {s.finalistsCount}</li>
        </ul>
      </div>
    </div>
  );
}

function codeSheet(accounts: Account[]): Sheet {
  return {
    name: 'Коды',
    header: ['Роль', '№', 'Личный код', 'Ник', 'Подразделение', 'Кому выдан (заполните сами)'],
    rows: accounts.map((a) => [ROLE[a.role], a.number, prettyCode(a.code), a.nick ?? '', a.department ?? '', '']),
  };
}

function CodesTab() {
  const { error, info } = useApp();
  const [list, setList] = useState<Account[] | null>(null);
  const [fresh, setFresh] = useState<Account[]>([]);
  const [busy, setBusy] = useState(false);
  const participants = list?.filter((a) => a.role === 'participant').length ?? 0;
  const jury = list?.filter((a) => a.role === 'jury').length ?? 0;
  const [count, setCount] = useState(pc.settings.maxParticipants);

  const load = useCallback(() => api.orgCodes().then(setList).catch(error), [error]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => setCount(Math.max(0, pc.settings.maxParticipants - participants)), [participants]);

  const gen = async (role: 'participant' | 'jury', n: number) => {
    setBusy(true);
    try {
      const created = await api.orgGenerateCodes(role, n);
      setFresh(created);
      await load();
      info(`Создано кодов: ${created.length}. Скачайте список.`);
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="card">
        <h2>Создать коды</h2>
        <p className="small muted">
          Код — единственный ключ входа. Мы не храним ФИО: список «кто есть кто» ведите у себя. В выгрузке есть пустая
          колонка «Кому выдан».
        </p>
        <div className="row">
          <input
            type="number"
            min={1}
            max={pc.settings.maxParticipants - participants}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            style={{ maxWidth: 120 }}
            aria-label="Сколько кодов участников создать"
          />
          <button className="btn" disabled={busy || count < 1} onClick={() => gen('participant', count)}>
            Создать {count} кодов участников
          </button>
          <span className="small muted">
            Уже есть: {participants} из {pc.settings.maxParticipants}
          </span>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button
            className="btn btn-secondary"
            disabled={busy || jury >= pc.settings.juryCount}
            onClick={() => gen('jury', pc.settings.juryCount - jury)}
          >
            Создать коды жюри ({Math.max(0, pc.settings.juryCount - jury)})
          </button>
          <span className="small muted">
            Жюри: {jury} из {pc.settings.juryCount}
          </span>
        </div>
        {busy && <p className="small">Создаём коды… Для 150 кодов в боевом режиме это может занять до минуты.</p>}
        {fresh.length > 0 && (
          <div className="notice ok" style={{ marginTop: 12 }}>
            Только что создано: {fresh.length}.{' '}
            <button className="btn btn-small" onClick={() => downloadXlsx([codeSheet(fresh)], `novye_kody_${stamp()}.xlsx`)}>
              Скачать новые коды (Excel)
            </button>
          </div>
        )}
      </div>
      <div className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>Все коды</h2>
          <span className="spacer" />
          {list && (
            <>
              <button className="btn btn-ghost btn-small" onClick={() => downloadXlsx([codeSheet(list)], `kody_${stamp()}.xlsx`)}>
                Excel
              </button>
              <button className="btn btn-ghost btn-small" onClick={() => downloadCsv(codeSheet(list), `kody_${stamp()}.csv`)}>
                CSV
              </button>
            </>
          )}
        </div>
        <div className="table-wrap" style={{ maxHeight: 480, marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Роль</th>
                <th>№</th>
                <th>Код</th>
                <th>Ник</th>
                <th>Подразделение</th>
              </tr>
            </thead>
            <tbody>
              {list?.map((a) => (
                <tr key={a.id}>
                  <td>{ROLE[a.role]}</td>
                  <td>{a.number}</td>
                  <td className="mono">{prettyCode(a.code)}</td>
                  <td>{a.nick ?? <span className="muted">—</span>}</td>
                  <td className="small">{a.department ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function ProgressTab() {
  const { error } = useApp();
  const [rows, setRows] = useState<ProgressRow[] | null>(null);
  const load = useCallback(() => api.orgProgress().then(setRows).catch(error), [error]);
  useEffect(() => {
    load();
  }, [load]);
  if (!rows) return <p className="muted">Загрузка…</p>;

  const started = rows.filter((r) => r.stages.some((s) => s !== 'locked' && s !== 'available')).length;
  const perStage = [0, 1, 2, 3, 4].map((i) => rows.filter((r) => r.stages[i] === 'finished').length);
  return (
    <>
      <div className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>Прогресс</h2>
          <span className="spacer" />
          <button className="btn btn-ghost btn-small" onClick={load}>
            Обновить
          </button>
        </div>
        <p>
          Кодов: <b>{rows.length}</b>, вошли и заполнили профиль: <b>{rows.filter((r) => r.nick).length}</b>, начали
          восхождение: <b>{started}</b>.
        </p>
        <div className="row small">
          {perStage.map((n, i) => (
            <span key={i} className="tag">
              {i + 1}. {pc.stages[i].name}: {n}
            </span>
          ))}
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>
          ● пройдена · ◐ идёт сейчас · ○ доступна · · закрыта
        </p>
      </div>
      <div className="card">
        <div className="table-wrap" style={{ maxHeight: 600 }}>
          <table>
            <thead>
              <tr>
                <th>№</th>
                <th>Код</th>
                <th>Ник</th>
                <th>Подразделение</th>
                <th>Вершины</th>
                <th>Высота</th>
                <th>Подсказки</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code}>
                  <td>{r.number}</td>
                  <td className="mono small">{prettyCode(r.code)}</td>
                  <td>{r.nick ?? <span className="muted">не входил</span>}</td>
                  <td className="small">{r.department ?? ''}</td>
                  <td className="mono" title={r.stages.join(', ')}>
                    {r.stages.map((s) => STATUS_ICON[s]).join(' ')}
                  </td>
                  <td>{meters(r.altitude)}</td>
                  <td>{r.hintsUsed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function ResultsTab() {
  const { error, me } = useApp();
  const [data, setData] = useState<ResultsView | null>(null);
  const load = useCallback(() => api.orgResults().then(setData).catch(error), [error]);
  useEffect(() => {
    load();
  }, [load]);
  if (!data) return <p className="muted">Загрузка…</p>;

  const criteria = pc.stage5.criteria;
  const ratingSheet: Sheet = {
    name: 'Рейтинг',
    header: [
      'Место',
      'Финалист',
      'Ник',
      'Подразделение',
      'Код',
      ...pc.stages.map((s, i) => `В${i + 1} ${s.name}, м`),
      'Итого, м',
      'Время В1–В4, мин',
      'Подсказок',
      'Оценок жюри',
    ],
    rows: data.rows.map((r) => [
      r.place,
      r.finalist ? 'да' : '',
      r.nick,
      r.department,
      prettyCode(r.code),
      ...r.stageAltitudes,
      r.altitude,
      Math.round((r.seconds14 / 60) * 10) / 10,
      r.hintsUsed,
      r.juryScored,
    ]),
  };
  const jurySheet: Sheet = {
    name: 'Жюри',
    header: [
      'Работа №',
      'Ник автора',
      'Судья №',
      ...criteria.map((c) => c.name),
      'Сумма',
      'Комментарий',
      'Среднее по работе',
    ],
    rows: data.jury.flatMap((j) =>
      j.scores.length
        ? j.scores.map((s) => [j.workNo, j.nick, s.juryNumber, ...criteria.map((c) => s.scores[c.id] ?? 0), s.total, s.comment, j.average ?? ''])
        : [[j.workNo, j.nick, '—', ...criteria.map(() => ''), '', 'нет оценок', '']],
    ),
  };
  const ideasSheet: Sheet = {
    name: 'Идеи',
    header: ['Работа №', 'Ник автора', ...pc.stage5.fields.map((f) => (f.group ? `${f.group}: ${f.label}` : f.label))],
    rows: data.jury.map((j) => [j.workNo, j.nick, ...pc.stage5.fields.map((f) => j.fields[f.id] ?? '')]),
  };
  const incomplete = data.jury.filter((j) => j.scores.length < pc.settings.juryCount);

  return (
    <>
      <div className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>Итоговый рейтинг</h2>
          <span className="spacer" />
          <button className="btn btn-small" onClick={() => downloadXlsx([ratingSheet, jurySheet, ideasSheet], `itogi_${stamp()}.xlsx`).catch(error)}>
            Скачать Excel
          </button>
          <button className="btn btn-ghost btn-small" onClick={() => downloadCsv(ratingSheet, `reyting_${stamp()}.csv`)}>
            Рейтинг CSV
          </button>
          <button className="btn btn-ghost btn-small" onClick={() => downloadCsv(jurySheet, `zhyuri_${stamp()}.csv`)}>
            Жюри CSV
          </button>
        </div>
        {!me.tour.resultsPublished && (
          <p className="small muted" style={{ marginTop: 8 }}>
            Рейтинг предварительный: участники его пока не видят.
          </p>
        )}
        {incomplete.length > 0 && (
          <div className="notice warn" style={{ marginTop: 8 }}>
            Не все судьи оценили работы: {incomplete.map((j) => `№ ${j.workNo} (${j.scores.length}/${pc.settings.juryCount})`).join(', ')}.
          </div>
        )}
      </div>
      <div className="home-grid">
        <div className="card">
          <div className="table-wrap" style={{ maxHeight: 640 }}>
            <table>
              <thead>
                <tr>
                  <th>Место</th>
                  <th>Ник</th>
                  <th>В1–В5</th>
                  <th>Итого</th>
                  <th>Время В1–4</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.accountId} className={r.finalist ? 'finalist' : ''}>
                    <td>{r.place}</td>
                    <td>
                      {r.nick} {r.finalist && <span className="tag orange">финал</span>}
                      <div className="small muted">{r.department}</div>
                    </td>
                    <td className="small mono">{r.stageAltitudes.join(' / ')}</td>
                    <td>
                      <b>{meters(r.altitude)}</b>
                    </td>
                    <td className="small">{Math.round(r.seconds14 / 60)} мин</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card" style={{ padding: 8 }}>
          <RatingMountain
            rows={data.rows.map((r) => ({
              place: r.place,
              nick: r.nick,
              department: r.department,
              altitude: r.altitude,
              finalist: r.finalist,
              me: false,
            }))}
          />
        </div>
      </div>
    </>
  );
}
