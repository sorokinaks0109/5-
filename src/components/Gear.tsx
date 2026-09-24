// Снаряжение (подсказки): ледорубы, закрашенные — доступны.
export function Gear({ left, total }: { left: number; total: number }) {
  return (
    <span className="gear" aria-label={`Подсказок осталось: ${left} из ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <svg key={i} width="20" height="22" viewBox="0 0 20 22" aria-hidden="true">
          <path d="M9 3 L11 3 L11 21 L9 21 Z" fill={i < left ? '#ff7a1a' : '#8da9c4'} />
          <path d="M3 4 Q10 0 17 4 L17 6 Q10 3 3 6 Z" fill={i < left ? '#ff7a1a' : '#8da9c4'} />
        </svg>
      ))}
    </span>
  );
}
