// Лёгкий снегопад на CSS: 36 снежинок, без canvas и тяжёлых эффектов.
import { useMemo } from 'react';

export function Snow({ count = 36 }: { count?: number }) {
  const flakes = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: `${(i * 97) % 100}%`,
        size: 3 + ((i * 7) % 5),
        duration: 7 + ((i * 13) % 9),
        delay: -((i * 17) % 12),
        opacity: 0.4 + ((i * 11) % 6) / 10,
      })),
    [count],
  );
  return (
    <div className="snow" aria-hidden="true">
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
