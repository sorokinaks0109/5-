// Шкала «погоды»: портится с ошибками, но игру не останавливает.
import type { Weather as W } from '../core/types.ts';

const ICONS = ['☀️', '⛅', '🌨️', '🌬️', '❄️'];

export function Weather({ weather }: { weather: W }) {
  return (
    <div className="weather" title={`Погода: ${weather.name}`}>
      <span aria-hidden="true" style={{ fontSize: '1.2rem' }}>
        {ICONS[weather.level]}
      </span>
      <div className="weather-scale" aria-label={`Погода: ${weather.name}`}>
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className={i < weather.level ? 'on bad' : ''} />
        ))}
      </div>
    </div>
  );
}
