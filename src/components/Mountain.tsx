// Главная гора: тропа с пятью вершинами, флажок участника поднимается по мере прохождения.
import type { StageSummary } from '../core/types.ts';
import { pc } from '../content.ts';

const BASE = { x: 24, y: 238 };
export const PEAKS = [
  { x: 72, y: 192 },
  { x: 142, y: 160 },
  { x: 212, y: 126 },
  { x: 282, y: 94 },
  { x: 348, y: 40 },
];

export function Flag({ color = '#ff7a1a', label }: { color?: string; label?: string }) {
  return (
    <g>
      <line x1="0" y1="0" x2="0" y2="-28" stroke="#0e1c2f" strokeWidth="2.2" strokeLinecap="round" />
      <path className="flag-wave" d="M1 -28 L22 -22 L1 -15 Z" fill={color} stroke="#0e1c2f" strokeWidth="1" />
      {label && (
        <text x="4" y="-32" fontSize="10" fontWeight="700" fill="#0e1c2f" stroke="#fff" strokeWidth="3" paintOrder="stroke">
          {label}
        </text>
      )}
    </g>
  );
}

export function Mountain({ stages, nick }: { stages: StageSummary[]; nick?: string | null }) {
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
            <stop offset="0" stopColor="#13315c" />
            <stop offset="1" stopColor="#3d6a9e" />
          </linearGradient>
          <linearGradient id="rock" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8da9c4" />
            <stop offset="1" stopColor="#4f6782" />
          </linearGradient>
        </defs>
        <rect width="400" height="260" fill="url(#sky)" rx="14" />
        <circle cx="60" cy="50" r="18" fill="#f4f7fb" opacity="0.18" />
        <path d="M0 260 L0 170 L60 120 L110 150 L180 80 L250 130 L320 70 L400 120 L400 260 Z" fill="#2b5283" opacity="0.6" />
        <path
          d="M0 260 L0 244 L40 226 L72 192 L104 206 L142 160 L172 174 L212 126 L244 142 L282 94 L312 112 L348 40 L378 84 L400 98 L400 260 Z"
          fill="url(#rock)"
        />
        {/* снежные шапки */}
        <path d="M60 204 L72 192 L84 200 L76 202 L70 198 Z" fill="#f4f7fb" />
        <path d="M128 174 L142 160 L156 170 L146 170 L140 166 Z" fill="#f4f7fb" />
        <path d="M196 144 L212 126 L228 138 L218 138 L210 134 Z" fill="#f4f7fb" />
        <path d="M264 114 L282 94 L300 106 L288 108 L280 102 Z" fill="#f4f7fb" />
        <path d="M326 70 L348 40 L368 70 L356 66 L348 72 L340 64 Z" fill="#f4f7fb" />
        <path d="M0 260 L0 248 L400 236 L400 260 Z" fill="#e6edf5" />

        <polyline points={trail} fill="none" stroke="#f4f7fb" strokeWidth="2.5" strokeDasharray="5 6" opacity="0.8" />
        <polyline points={walked} fill="none" stroke="#ff7a1a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />

        {PEAKS.map((p, i) => {
          const st = stages[i];
          const fin = st?.status === 'finished';
          const act = st?.status === 'active' || st?.status === 'available';
          return (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={i === 4 ? 11 : 9}
                fill={fin ? '#1f7a4a' : act ? '#ff7a1a' : '#0b2545'}
                stroke="#fff"
                strokeWidth="2"
              />
              <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff">
                {fin ? '✓' : i + 1}
              </text>
              <text
                x={p.x}
                y={p.y + (i === 4 ? 26 : 22)}
                textAnchor="middle"
                fontSize="9"
                fontWeight="700"
                fill="#0b2545"
                stroke="#f4f7fb"
                strokeWidth="2.5"
                paintOrder="stroke"
              >
                {pc.stages[i].name}
              </text>
            </g>
          );
        })}
        <text x="348" y="18" textAnchor="middle" fontSize="10" fontWeight="800" fill="#ffb38a">
          ★ 5 лет ★
        </text>
        <g className="flag-move" style={{ transform: `translate(${pos.x}px, ${pos.y - 8}px)` }}>
          <Flag label={nick ?? undefined} />
        </g>
      </svg>
    </div>
  );
}
