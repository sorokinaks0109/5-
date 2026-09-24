// Праздник на ответ: конфетти и всплывающие метры. Лёгкий CSS, живёт чуть больше секунды.
import { useMemo } from 'react';

const COLORS = ['#f43f5e', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#ec4899', '#facc15'];

export function Burst({ points, fraction, noText = false }: { points: number; fraction: number; noText?: boolean }) {
  const pieces = useMemo(() => {
    const n = fraction >= 1 ? 26 : fraction > 0 ? 12 : 0;
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const r = 90 + Math.random() * 110;
      return {
        dx: `${Math.cos(a) * r}px`,
        dy: `${Math.sin(a) * r - 40}px`,
        rot: `${Math.round(Math.random() * 720 - 360)}deg`,
        color: COLORS[i % COLORS.length],
        delay: `${Math.random() * 0.12}s`,
      };
    });
  }, [fraction]);
  return (
    <>
      <div className="burst" aria-hidden="true">
        {pieces.map((p, i) => (
          <i
            key={i}
            style={
              {
                background: p.color,
                animationDelay: p.delay,
                '--dx': p.dx,
                '--dy': p.dy,
                '--rot': p.rot,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      {!noText && (
      <div className={`float-up ${fraction > 0 ? '' : 'bad'}`} aria-hidden="true">
        {fraction > 0 ? `+${points} м` : 'Непогода! 🌨️'}
      </div>
      )}
    </>
  );
}
