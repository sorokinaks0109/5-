// Главная гора: северное сияние, тропа с пятью вершинами, флажок участника поднимается по мере прохождения.
// По вершинам можно нажимать.
import type { StageNo, StageSummary } from '../core/types.ts';
import { pc } from '../content.ts';
import { STAGE_THEME } from '../theme.ts';

const BASE = { x: 24, y: 238 };
export const PEAKS = [
  { x: 72, y: 192 },
  { x: 142, y: 160 },
  { x: 212, y: 126 },
  { x: 282, y: 94 },
  { x: 348, y: 40 },
];

export function Flag({ color = '#ff6b2c', label }: { color?: string; label?: string }) {
  return (
    <g>
      <line x1="0" y1="0" x2="0" y2="-28" stroke="#1e1b4b" strokeWidth="2.2" strokeLinecap="round" />
      <path className="flag-wave" d="M1 -28 L22 -22 L1 -15 Z" fill={color} stroke="#1e1b4b" strokeWidth="1" />
      {label && (
        <text x="4" y="-32" fontSize="10" fontWeight="800" fill="#1e1b4b" stroke="#fff" strokeWidth="3" paintOrder="stroke">
          {label}
        </text>
      )}
    </g>
  );
}

function Cloud({ y, scale = 1, slow = false }: { y: number; scale?: number; slow?: boolean }) {
  return (
    <g className={`cloud ${slow ? 'slow' : ''}`}>
      <g transform={`translate(0 ${y}) scale(${scale})`} fill="#fff" opacity="0.75">
        <ellipse cx="20" cy="10" rx="20" ry="9" />
        <ellipse cx="36" cy="6" rx="14" ry="10" />
        <ellipse cx="50" cy="11" rx="16" ry="8" />
      </g>
    </g>
  );
}

export function Mountain({
  stages,
  nick,
  onPeak,
}: {
  stages: StageSummary[];
  nick?: string | null;
  onPeak?: (stage: StageNo) => void;
}) {
  const done = stages.filter((s) => s.status === 'finished').length;
  const pts = [BASE, ...PEAKS];
  const pos = pts[done];
  const trail = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const walked = pts.slice(0, done + 1).map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="mountain">
      <svg viewBox="0 0 400 260" role="img" aria-label={`Пройдено вершин: ${done} из 5`}>
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1e1b4b" />
            <stop offset="0.45" stopColor="#5b21b6" />
            <stop offset="0.8" stopColor="#db2777" />
            <stop offset="1" stopColor="#fb923c" />
          </linearGradient>
          <linearGradient id="rock" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#c7d2fe" />
            <stop offset="1" stopColor="#6366f1" />
          </linearGradient>
          <linearGradient id="ribbon1" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#22d3ee" stopOpacity="0" />
            <stop offset="0.5" stopColor="#34d399" />
            <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="trailGrad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#facc15" />
            <stop offset="1" stopColor="#f97316" />
          </linearGradient>
        </defs>
        <rect width="400" height="260" fill="url(#sky)" rx="16" />
        {/* северное сияние */}
        <path className="aurora-ribbon" d="M-10 70 C 80 20, 160 90, 240 40 S 360 30, 410 60 L410 80 C 330 60, 260 100, 200 70 S 60 60, -10 95 Z" fill="url(#ribbon1)" opacity="0.6" />
        <path className="aurora-ribbon" style={{ animationDelay: '-3s' }} d="M-10 40 C 90 0, 190 60, 280 20 S 380 10, 410 25 L410 38 C 320 30, 260 70, 190 45 S 50 30, -10 58 Z" fill="#a855f7" opacity="0.4" />
        {/* звёзды */}
        {[
          [30, 20],
          [110, 14],
          [180, 30],
          [300, 12],
          [370, 22],
          [250, 55],
          [60, 50],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 2 ? 1.2 : 1.8} fill="#fff" opacity="0.8" />
        ))}
        <Cloud y={70} scale={0.9} />
        <Cloud y={110} scale={0.6} slow />

        <path d="M0 260 L0 170 L60 120 L110 150 L180 80 L250 130 L320 70 L400 120 L400 260 Z" fill="#7c3aed" opacity="0.45" />
        <path
          d="M0 260 L0 244 L40 226 L72 192 L104 206 L142 160 L172 174 L212 126 L244 142 L282 94 L312 112 L348 40 L378 84 L400 98 L400 260 Z"
          fill="url(#rock)"
        />
        {/* снежные шапки */}
        <path d="M60 204 L72 192 L84 200 L76 202 L70 198 Z" fill="#fff" />
        <path d="M128 174 L142 160 L156 170 L146 170 L140 166 Z" fill="#fff" />
        <path d="M196 144 L212 126 L228 138 L218 138 L210 134 Z" fill="#fff" />
        <path d="M264 114 L282 94 L300 106 L288 108 L280 102 Z" fill="#fff" />
        <path d="M326 70 L348 40 L368 70 L356 66 L348 72 L340 64 Z" fill="#fff" />
        <path d="M0 260 L0 248 L400 236 L400 260 Z" fill="#f5f3ff" />

        <polyline points={trail} fill="none" stroke="#fff" strokeWidth="2.5" strokeDasharray="5 6" opacity="0.9" />
        <polyline points={walked} fill="none" stroke="url(#trailGrad)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />

        {PEAKS.map((p, i) => {
          const st = stages[i];
          const fin = st?.status === 'finished';
          const open = st?.status === 'active' || st?.status === 'available';
          const theme = STAGE_THEME[i];
          const clickable = !!onPeak && st?.status !== 'locked';
          return (
            <g
              key={i}
              className={`${clickable ? 'peak' : ''} ${open ? 'peak-current' : ''}`}
              onClick={clickable ? () => onPeak!((i + 1) as StageNo) : undefined}
              role={clickable ? 'button' : undefined}
              aria-label={clickable ? `Вершина ${i + 1}: ${pc.stages[i].name}` : undefined}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={i === 4 ? 12 : 10}
                fill={fin || open ? theme.color : '#312e81'}
                stroke="#fff"
                strokeWidth="2.5"
              />
              <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11" fontWeight="900" fill="#fff" pointerEvents="none">
                {fin ? '✓' : i + 1}
              </text>
              <text
                x={p.x}
                y={p.y + (i === 4 ? 27 : 23)}
                textAnchor="middle"
                fontSize="9"
                fontWeight="800"
                fill="#1e1b4b"
                stroke="#fff"
                strokeWidth="3"
                paintOrder="stroke"
                pointerEvents="none"
              >
                {pc.stages[i].name}
              </text>
            </g>
          );
        })}
        <text x="348" y="18" textAnchor="middle" fontSize="10" fontWeight="900" fill="#facc15">
          ★ 5 лет ★
        </text>
        <g className="flag-move" style={{ transform: `translate(${pos.x}px, ${pos.y - 10}px)` }}>
          <Flag label={nick ?? undefined} />
        </g>
      </svg>
    </div>
  );
}
