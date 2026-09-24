// Знак «5 лет Идейным играм».
export function Badge5({ size = 96, dark = false }: { size?: number; dark?: boolean }) {
  const ring = dark ? '#0b2545' : '#ffffff';
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="5 лет Идейным играм">
      <defs>
        <path id="badge-arc-top" d="M 16 60 A 44 44 0 0 1 104 60" />
        <path id="badge-arc-bottom" d="M 12 60 A 48 48 0 0 0 108 60" />
      </defs>
      <circle cx="60" cy="60" r="57" fill="#ff7a1a" />
      <circle cx="60" cy="60" r="50" fill="none" stroke={ring} strokeWidth="2" strokeDasharray="3 4" opacity="0.8" />
      <circle cx="60" cy="60" r="33" fill="#0b2545" />
      <path d="M36 74 L52 52 L60 62 L70 46 L86 74 Z" fill="#8da9c4" />
      <path d="M66 52 L70 46 L74 52 Z" fill="#fff" />
      <text x="60" y="72" textAnchor="middle" fontSize="38" fontWeight="900" fill="#fff" fontFamily="Arial, sans-serif">
        5
      </text>
      <text fontSize="11" fontWeight="800" fill="#0b2545" letterSpacing="1.5" fontFamily="Arial, sans-serif">
        <textPath href="#badge-arc-top" startOffset="50%" textAnchor="middle">
          ИДЕЙНЫЕ ИГРЫ
        </textPath>
      </text>
      <text fontSize="11" fontWeight="800" fill="#0b2545" letterSpacing="2" fontFamily="Arial, sans-serif">
        <textPath href="#badge-arc-bottom" startOffset="50%" textAnchor="middle" dominantBaseline="hanging">
          ЛЕТ · 2027
        </textPath>
      </text>
    </svg>
  );
}
