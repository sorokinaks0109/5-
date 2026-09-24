// «Кислородный баллон» — таймер этапа.
import { formatClock, oxygenShare, remainingMs } from '../core/timer.ts';

export function Oxygen({ startedAt, deadline, now }: { startedAt: string; deadline: string; now: Date }) {
  const share = oxygenShare(startedAt, deadline, now);
  const left = remainingMs(deadline, now);
  const low = share < 0.2;
  const h = 30 * share;
  return (
    <div className={`oxygen ${low ? 'low' : ''}`} role="timer" aria-label={`Осталось ${formatClock(left)}`}>
      <svg width="22" height="42" viewBox="0 0 22 42" aria-hidden="true">
        <rect x="8" y="0" width="6" height="5" rx="1" fill="#e0e7ff" />
        <rect x="5" y="4" width="12" height="4" rx="1" fill="#e0e7ff" />
        <rect x="2" y="8" width="18" height="33" rx="8" fill="none" stroke="#e0e7ff" strokeWidth="2" />
        <rect className="oxygen-fill" x="4" y={39 - h} width="14" height={h} rx="6" fill={low ? '#ff7a1a' : '#8fd3ff'} />
      </svg>
      <span>{formatClock(left)}</span>
    </div>
  );
}
