// Лёгкий снегопад на CSS, без canvas и тяжёлых эффектов. windy — метель со сносом ветром.
import { useMemo } from 'react';

export function Snow({ count = 36, windy = false }: { count?: number; windy?: boolean }) {
  const flakes = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: `${(i * 97) % 100 + (windy ? 20 : 0)}%`,
        size: 3 + ((i * 7) % 5),
        duration: (windy ? 3 : 7) + ((i * 13) % 9) * (windy ? 0.4 : 1),
        delay: -((i * 17) % 12),
        opacity: 0.4 + ((i * 11) % 6) / 10,
      })),
    [count, windy],
  );
  if (!count) return null;
  return (
    <div className={`snow ${windy ? 'windy' : ''}`} aria-hidden="true">
      {flakes.map((f, i) => (
        <i
          key={i}
          style={{
            left: f.left,
            width: f.size,
            height: f.size,
            opacity: f.opacity,
            animationDuration: `${f.duration}s`,
            animationDelay: `${f.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
