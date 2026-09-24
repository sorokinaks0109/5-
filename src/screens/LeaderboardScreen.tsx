// Рейтинг — гора, на склонах которой стоят флажки участников.
import { useEffect, useState } from 'react';
import { api } from '../api/index.ts';
import { Flag } from '../components/Mountain.tsx';
import { pc } from '../content.ts';
import type { LeaderboardView, PublicRatingRow } from '../core/types.ts';
import { meters, useApp } from '../hooks.ts';

const W = 400;
const H = 300;
const TOP = { x: 200, y: 30 };
const BASE_Y = 285;

function flagPos(r: PublicRatingRow, i: number, max: number) {
  const share = max > 0 ? r.altitude / max : 0;
  const y = BASE_Y - share * (BASE_Y - TOP.y - 12);
  const halfWidth = ((y - TOP.y) / (BASE_Y - TOP.y)) * 180;
  const side = i % 2 === 0 ? -1 : 1;
  const spread = 0.25 + (((i * 37) % 60) / 100);
  return { x: TOP.x + side * halfWidth * spread, y };
}

export function RatingMountain({ rows }: { rows: PublicRatingRow[] }) {
  const max = pc.settings.stageMaxAltitude * 5;
  const sorted = rows.slice().sort((a, b) => a.altitude - b.altitude);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Гора рейтинга" style={{ width: '100%', display: 'block' }}>
      <rect width={W} height={H} fill="#312e81" rx="14" />
      <path d={`M10 ${BASE_Y + 15} L${TOP.x} ${TOP.y} L${W - 10} ${BASE_Y + 15} Z`} fill="#a5b4fc" />
      <path d={`M${TOP.x - 40} ${TOP.y + 55} L${TOP.x} ${TOP.y} L${TOP.x + 40} ${TOP.y + 55} L${TOP.x + 15} ${TOP.y + 45} L${TOP.x} ${TOP.y + 58} L${TOP.x - 18} ${TOP.y + 44} Z`} fill="#f4f7fb" />
      {[1000, 2000, 3000, 4000, 5000].map((m) => {
        const y = BASE_Y - (m / max) * (BASE_Y - TOP.y - 12);
        return (
          <g key={m}>
            <line x1="8" x2="60" y1={y} y2={y} stroke="#e0e7ff" strokeDasharray="3 4" opacity="0.6" />
            <text x="10" y={y - 3} fontSize="9" fill="#e0e7ff">
              {m} м
            </text>
          </g>
        );
      })}
      {sorted.map((r, i) => {
        const p = flagPos(r, i, max);
        const color = r.me ? '#ff6b2c' : r.finalist ? '#facc15' : '#f5f3ff';
        return (
          <g key={`${r.nick}-${i}`} className="flag-move" style={{ transform: `translate(${p.x}px, ${p.y}px) scale(${r.me ? 1 : 0.7})` }}>
            <title>{`${r.place}. ${r.nick} — ${r.altitude} м`}</title>
            <Flag color={color} label={r.me || r.place <= 3 ? r.nick : undefined} />
          </g>
        );
      })}
    </svg>
  );
}

export function LeaderboardScreen() {
  const { go, error } = useApp();
  const [lb, setLb] = useState<LeaderboardView | null>(null);
  useEffect(() => {
    api.leaderboard().then(setLb).catch(error);
  }, [error]);

  return (
    <>
      <header className="topbar">
        <div className="title">Рейтинг экспедиции</div>
        <button className="btn btn-ghost btn-small" onClick={() => go('/')}>
          Назад
        </button>
      </header>
      <main className="container">
        {!lb ? (
          <p className="muted center">Загрузка…</p>
        ) : !lb.published ? (
          <div className="card">
            <h2>Рейтинг откроется после закрытия тура</h2>
            <p>
              Сейчас ваша высота — <b>{meters(lb.me.altitude)}</b>, место — <b>{lb.me.place ?? '—'}</b> из{' '}
              {lb.me.participantsCount}.
            </p>
          </div>
        ) : (
          <>
            <div className="card" style={{ padding: 8 }}>
              <RatingMountain rows={lb.rows} />
              <p className="small muted center" style={{ margin: '8px 0 0' }}>
                Оранжевый флажок — вы, жёлтые — финалисты.
              </p>
            </div>
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Место</th>
                      <th>Ник</th>
                      <th>Подразделение</th>
                      <th>Высота</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lb.rows.map((r, i) => (
                      <tr key={i} className={`${r.me ? 'me' : ''} ${r.finalist ? 'finalist' : ''}`}>
                        <td>{r.place}</td>
                        <td>
                          {r.nick} {r.finalist && <span className="tag orange">финал</span>}
                        </td>
                        <td className="small">{r.department}</td>
                        <td>{meters(r.altitude)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}
