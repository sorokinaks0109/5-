// Главная гора: серпантин из семи лагерей к вершине. Флажок участника поднимается по мере прохождения.
// Касание лагеря открывает под горой карточку вершины с кнопкой.
import { useState } from "react";
import type { StageNo, StageSummary } from "../core/types.ts";
import { IDEA_STAGE } from "../core/types.ts";
import { pc } from "../content.ts";
import { STAGE_THEME } from "../theme.ts";

const W = 400;
const H = 580;
const BASE = { x: 330, y: 552 };
/** Лагеря змейкой: слева, справа, слева… последний на самой вершине */
export const PEAKS = [
  { x: 92, y: 492 },
  { x: 308, y: 428 },
  { x: 92, y: 364 },
  { x: 308, y: 300 },
  { x: 92, y: 236 },
  { x: 308, y: 172 },
  { x: 200, y: 84 },
];
const LAST = PEAKS.length - 1;
const PTS = [BASE, ...PEAKS];

/** Плавная тропа между точками */
function trailPath(n: number) {
  let d = `M${PTS[0].x} ${PTS[0].y}`;
  for (let i = 1; i <= n; i++) {
    const a = PTS[i - 1];
    const b = PTS[i];
    const midY = (a.y + b.y) / 2;
    d += ` C${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${b.y}`;
  }
  return d;
}

const km = (m: number) => `${m.toLocaleString("ru-RU")} м`;

function statusText(st: StageSummary | undefined, published: boolean) {
  if (!st) return "";
  if (st.status === "finished") {
    if (st.stage === IDEA_STAGE && !published) return "✓ оценивает жюри";
    return `✓ ${km(st.altitude)}`;
  }
  if (st.status === "active") return "⏳ идёт восхождение";
  if (st.status === "available") return "👉 можно идти";
  return "🔒 закрыта";
}

function actionText(st: StageSummary) {
  if (st.status === "available") return "Начать восхождение";
  if (st.status === "active") return "Продолжить";
  if (st.status === "finished")
    return st.stage === IDEA_STAGE ? "Моя идея" : "Разбор";
  return "";
}

export function Flag({
  color = "#ff6b2c",
  label,
}: {
  color?: string;
  label?: string;
}) {
  return (
    <g>
      <line
        x1="0"
        y1="0"
        x2="0"
        y2="-28"
        stroke="#1e1b4b"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        className="flag-wave"
        d="M1 -28 L22 -22 L1 -15 Z"
        fill={color}
        stroke="#1e1b4b"
        strokeWidth="1"
      />
      {label && (
        <text
          x="4"
          y="-32"
          fontSize="10"
          fontWeight="800"
          fill="#1e1b4b"
          stroke="#fff"
          strokeWidth="3"
          paintOrder="stroke"
        >
          {label}
        </text>
      )}
    </g>
  );
}

function Cloud({
  y,
  scale = 1,
  slow = false,
}: {
  y: number;
  scale?: number;
  slow?: boolean;
}) {
  return (
    <g className={`cloud ${slow ? "slow" : ""}`}>
      <g
        transform={`translate(0 ${y}) scale(${scale})`}
        fill="#fff"
        opacity="0.75"
      >
        <ellipse cx="20" cy="10" rx="20" ry="9" />
        <ellipse cx="36" cy="6" rx="14" ry="10" />
        <ellipse cx="50" cy="11" rx="16" ry="8" />
      </g>
    </g>
  );
}

/** Флажок участника; flip разворачивает полотнище влево */
function Climber({ flip }: { flip: boolean }) {
  return (
    <g transform={flip ? "scale(-1 1)" : undefined}>
      <line
        x1="0"
        y1="0"
        x2="0"
        y2="-40"
        stroke="#1e1b4b"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        className="flag-wave"
        d="M1.5 -40 L28 -32 L1.5 -24 Z"
        fill="#ff6b2c"
        stroke="#1e1b4b"
        strokeWidth="1.2"
      />
      <circle cx="0" cy="0" r="3" fill="#1e1b4b" />
    </g>
  );
}

const STARS = [
  [30, 24],
  [96, 14],
  [150, 40],
  [262, 18],
  [338, 36],
  [372, 12],
  [56, 70],
  [350, 90],
  [22, 130],
  [384, 150],
];

export function Mountain({
  stages,
  nick,
  onPeak,
  published = false,
}: {
  stages: StageSummary[];
  nick?: string | null;
  onPeak?: (stage: StageNo) => void;
  published?: boolean;
}) {
  const done = stages.filter((s) => s.status === "finished").length;
  const current = stages.findIndex(
    (s) => s.status === "active" || s.status === "available",
  );
  const [picked, setPicked] = useState<number | null>(null);
  const sel = picked ?? (current >= 0 ? current : null);
  const pos = PTS[Math.min(done, LAST + 1)];
  const selSt = sel !== null ? stages[sel] : undefined;
  const flagX =
    done === 0
      ? pos.x
      : done > LAST
        ? pos.x - 40
        : pos.x < W / 2
          ? pos.x - 34
          : pos.x + 34;

  return (
    <div className="mountain">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${nick ? nick + ": п" : "П"}ройдено вершин ${done} из ${PEAKS.length}`}
      >
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1e1b4b" />
            <stop offset="0.4" stopColor="#5b21b6" />
            <stop offset="0.75" stopColor="#db2777" />
            <stop offset="1" stopColor="#fb923c" />
          </linearGradient>
          <linearGradient id="rock" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e0e7ff" />
            <stop offset="0.5" stopColor="#a5b4fc" />
            <stop offset="1" stopColor="#6366f1" />
          </linearGradient>
          <linearGradient id="rockShade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#312e81" stopOpacity="0" />
            <stop offset="1" stopColor="#312e81" stopOpacity="0.35" />
          </linearGradient>
          <linearGradient id="ribbon1" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#22d3ee" stopOpacity="0" />
            <stop offset="0.5" stopColor="#34d399" />
            <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="trailGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#facc15" />
            <stop offset="1" stopColor="#f97316" />
          </linearGradient>
          <filter id="campShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow
              dx="0"
              dy="2"
              stdDeviation="2.5"
              floodColor="#1e1b4b"
              floodOpacity="0.45"
            />
          </filter>
          <clipPath id="mFrame">
            <rect width={W} height={H} rx="18" />
          </clipPath>
        </defs>
        <g clipPath="url(#mFrame)">
          <rect width={W} height={H} fill="url(#sky)" rx="18" />
          {/* северное сияние */}
          <path
            className="aurora-ribbon"
            d="M-10 90 C 80 40, 160 110, 240 60 S 360 50, 410 80 L410 100 C 330 80, 260 120, 200 90 S 60 80, -10 115 Z"
            fill="url(#ribbon1)"
            opacity="0.6"
          />
          <path
            className="aurora-ribbon"
            style={{ animationDelay: "-3s" }}
            d="M-10 50 C 90 10, 190 70, 280 30 S 380 20, 410 35 L410 48 C 320 40, 260 80, 190 55 S 50 40, -10 68 Z"
            fill="#a855f7"
            opacity="0.4"
          />
          {STARS.map(([x, y], i) => (
            <circle
              key={i}
              className="star"
              style={{ animationDelay: `${(i * 0.37) % 3}s` }}
              cx={x}
              cy={y}
              r={i % 2 ? 1.3 : 2}
              fill="#fff"
            />
          ))}
          <Cloud y={120} scale={1} />
          <Cloud y={250} scale={0.7} slow />

          {/* дальние горы */}
          <path
            d="M0 580 L0 300 L60 250 L120 290 L170 220 L230 270 L300 200 L360 250 L400 230 L400 580 Z"
            fill="#7c3aed"
            opacity="0.45"
          />
          {/* главная гора */}
          <path
            d="M-10 580 L-10 470 L40 420 L70 330 L110 260 L140 180 L175 110 L200 58 L228 108 L262 170 L300 240 L335 320 L372 400 L410 440 L410 580 Z"
            fill="url(#rock)"
          />
          <path
            d="M200 58 L228 108 L262 170 L300 240 L335 320 L372 400 L410 440 L410 580 L200 580 Z"
            fill="url(#rockShade)"
          />
          {/* снежная шапка */}
          <path
            d="M200 58 L228 108 L216 102 L206 118 L194 104 L182 116 L175 110 Z"
            fill="#fff"
          />
          <path d="M0 580 L0 560 L400 548 L400 580 Z" fill="#f5f3ff" />

          {/* тропа: вся пунктиром, пройденная ярко */}
          <path
            d={trailPath(PEAKS.length)}
            fill="none"
            stroke="#fff"
            strokeWidth="3"
            strokeDasharray="6 7"
            opacity="0.85"
          />
          {done > 0 && (
            <path
              d={trailPath(Math.min(done, PEAKS.length))}
              fill="none"
              stroke="url(#trailGrad)"
              strokeWidth="7"
              strokeLinecap="round"
            />
          )}

          {PEAKS.map((p, i) => {
            const st = stages[i];
            const fin = st?.status === "finished";
            const open = st?.status === "active" || st?.status === "available";
            const locked = !st || st.status === "locked";
            const theme = STAGE_THEME[i];
            const r = i === LAST ? 28 : 24;
            const name = pc.stages[i].name;
            const status = statusText(st, published);
            // Подпись к центру горы: у левых лагерей справа, у правых слева, у вершины снизу
            const labelW = Math.min(
              196,
              Math.max(name.length, status.length) * 7.3 + 22,
            );
            const side = p.x < W / 2 || i === LAST ? 1 : -1;
            const lx = side === 1 ? p.x + r + 6 : p.x - r - 6 - labelW;
            const ly = p.y - 21;
            const isSel = sel === i;
            return (
              <g
                key={i}
                className={`camp ${open ? "camp-current" : ""} ${isSel ? "camp-selected" : ""}`}
                onClick={() => setPicked(i)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) =>
                  (e.key === "Enter" || e.key === " ") && setPicked(i)
                }
                aria-label={`Вершина ${i + 1}: ${name}. ${status}`}
              >
                {/* подпись на плашке */}
                <g opacity={locked ? 0.85 : 1}>
                  <rect
                    x={lx}
                    y={ly}
                    width={labelW}
                    height="42"
                    rx="12"
                    fill={isSel ? theme.soft : "#ffffff"}
                    stroke={isSel ? theme.color : "rgba(30,27,75,0.15)"}
                    strokeWidth={isSel ? 2.5 : 1}
                    filter="url(#campShadow)"
                  />
                  <text
                    x={lx + labelW / 2}
                    y={ly + 18}
                    textAnchor="middle"
                    fontSize="13"
                    fontWeight="900"
                    fill="#1e1b4b"
                  >
                    {name}
                  </text>
                  <text
                    x={lx + labelW / 2}
                    y={ly + 34}
                    textAnchor="middle"
                    fontSize="11.5"
                    fontWeight="700"
                    fill={fin ? "#047857" : open ? theme.color : "#64748b"}
                  >
                    {status}
                  </text>
                </g>
                {/* кружок лагеря */}
                <g
                  className="camp-dot"
                  style={{ transformOrigin: `${p.x}px ${p.y}px` }}
                >
                  {open && (
                    <circle
                      className="camp-ring"
                      cx={p.x}
                      cy={p.y}
                      r={r + 6}
                      fill="none"
                      stroke={theme.color}
                      strokeWidth="3"
                    />
                  )}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={r}
                    fill={locked ? "#475569" : theme.color}
                    stroke="#fff"
                    strokeWidth="3.5"
                    filter="url(#campShadow)"
                  />
                  <text
                    x={p.x}
                    y={p.y + 8}
                    textAnchor="middle"
                    fontSize={i === LAST ? 26 : 22}
                    opacity={locked ? 0.55 : 1}
                  >
                    {theme.icon}
                  </text>
                  {/* номер или галочка */}
                  <circle
                    cx={p.x + r * 0.72}
                    cy={p.y - r * 0.72}
                    r="10"
                    fill={fin ? "#10b981" : "#1e1b4b"}
                    stroke="#fff"
                    strokeWidth="2"
                  />
                  <text
                    x={p.x + r * 0.72}
                    y={p.y - r * 0.72 + 4}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="900"
                    fill="#fff"
                  >
                    {fin ? "✓" : locked ? "🔒" : i + 1}
                  </text>
                </g>
              </g>
            );
          })}

          {/* флажок участника: снаружи от кружка, чтобы не закрывать подписи */}
          <g
            className="flag-move"
            style={{ transform: `translate(${flagX}px, ${pos.y + 4}px)` }}
          >
            <Climber flip={flagX < W / 2} />
          </g>
        </g>
      </svg>

      {selSt && sel !== null && (
        <div
          key={sel}
          className="camp-card"
          style={{ borderColor: STAGE_THEME[sel].color }}
        >
          <div
            className="camp-card-icon"
            style={{ background: STAGE_THEME[sel].soft }}
            aria-hidden="true"
          >
            {STAGE_THEME[sel].icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="small"
              style={{ color: STAGE_THEME[sel].color, fontWeight: 800 }}
            >
              Вершина {sel + 1} · {STAGE_THEME[sel].term}
            </div>
            <div className="camp-card-name">{pc.stages[sel].name}</div>
            <div className="small muted">
              {selSt.status === "locked"
                ? sel > 0
                  ? `Откроется после вершины ${sel}.`
                  : "Пока закрыта."
                : selSt.status === "available"
                  ? `Кислорода на ${pc.settings.stageMinutes[sel]} мин. Таймер включится сразу.`
                  : statusText(selSt, published)}
            </div>
          </div>
          {onPeak && selSt.status !== "locked" && (
            <button
              type="button"
              className={`btn btn-small ${selSt.status === "finished" ? "btn-ghost" : ""}`}
              onClick={() => onPeak((sel + 1) as StageNo)}
            >
              {actionText(selSt)}
            </button>
          )}
        </div>
      )}
      <p
        className="small muted"
        style={{ textAlign: "center", margin: "6px 0 2px" }}
      >
        Коснитесь любой вершины на горе
      </p>
    </div>
  );
}
