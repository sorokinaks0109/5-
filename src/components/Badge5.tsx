// Юбилейный знак «5 лет». Надписи по кругу берутся из content.json (settings.badgeTop / badgeBottom).
import { pc } from '../content.ts';

export function Badge5({ size = 96 }: { size?: number; dark?: boolean }) {
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
      <path d="M34 76 L50 54 L58 64 L70 46 L88 76 Z" fill="#22d3ee" opacity="0.85" />
      <path d="M66 52 L70 46 L74 52 Z" fill="#fff" />
      <text x="60" y="73" textAnchor="middle" fontSize="38" fontWeight="900" fill="#fff" fontFamily="Arial, sans-serif">
        5
      </text>
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
