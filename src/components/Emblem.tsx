// Эмблема игры: вершина с флажком. Надписи по кругу берутся из content.json (settings.badgeTop / badgeBottom).
import { pc } from '../content.ts';

export function Emblem({ size = 96 }: { size?: number }) {
  const top = pc.settings.badgeTop;
  const bottom = pc.settings.badgeBottom;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`${top}. ${bottom}`}>
      <defs>
        <linearGradient id="badge-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#facc15" />
          <stop offset="0.5" stopColor="#f97316" />
          <stop offset="1" stopColor="#ec4899" />
        </linearGradient>
        <linearGradient id="badge-core" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4338ca" />
          <stop offset="1" stopColor="#1e1b4b" />
        </linearGradient>
        <path id="badge-arc-top" d="M 16 60 A 44 44 0 0 1 104 60" />
        <path id="badge-arc-bottom" d="M 13 60 A 47 47 0 0 0 107 60" />
      </defs>
      <circle cx="60" cy="60" r="58" fill="url(#badge-ring)" />
      <circle cx="60" cy="60" r="50" fill="none" stroke="#fff" strokeWidth="1.5" strokeDasharray="3 4" opacity="0.8" />
      <circle cx="60" cy="60" r="34" fill="url(#badge-core)" />
      <path d="M30 80 L50 54 L58 64 L70 44 L90 80 Z" fill="#22d3ee" />
      <path d="M64 53 L70 44 L76 53 L72 51 L70 54 L67 51 Z" fill="#fff" />
      <path d="M50 54 L54 59 L46 59 Z" fill="#fff" opacity="0.8" />
      <line x1="70" y1="44" x2="70" y2="26" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M71 26 L86 30.5 L71 35 Z" fill="#f97316" />
      <text fontSize="11" fontWeight="900" fill="#1e1b4b" letterSpacing="1.5" fontFamily="Arial, sans-serif">
        <textPath href="#badge-arc-top" startOffset="50%" textAnchor="middle">
          {top}
        </textPath>
      </text>
      <text fontSize="10" fontWeight="900" fill="#1e1b4b" letterSpacing="1.2" fontFamily="Arial, sans-serif">
        <textPath href="#badge-arc-bottom" startOffset="50%" textAnchor="middle" dominantBaseline="hanging">
          {bottom}
        </textPath>
      </text>
    </svg>
  );
}
