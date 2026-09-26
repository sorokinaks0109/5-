// «Найдите нарушения» на картинке склада: увеличение, режим на весь экран, подсказка «что искать».
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { pc } from '../content.ts';
import type { HotspotsItem, ReviewEntry } from '../core/types.ts';

type Mark = { x: number; y: number };

const ZOOMS = [1, 1.5, 2, 3];
export const STEP_ICON: Record<string, string> = {
  sort: '🗑️',
  order: '📍',
  shine: '🧽',
  standard: '📏',
  sustain: '🔁',
};

const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`.replace(/\/\.\//, '/');

export function HotspotsInput({
  item,
  value,
  onChange,
  disabled,
  review,
}: {
  item: HotspotsItem;
  value: Mark[];
  onChange: (v: Mark[]) => void;
  disabled: boolean;
  review?: ReviewEntry;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [full, setFull] = useState(false);
  const left = item.markers - value.length;

  // В полноэкранном режиме закрываемся по Esc и не даём странице под нами прокручиваться
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false);
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [full]);

  const add = (e: React.MouseEvent) => {
    if (disabled || !box.current || left <= 0) return;
    const r = box.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * 1000) / 10;
    const y = Math.round(((e.clientY - r.top) / r.height) * 1000) / 10;
    onChange([...value, { x, y }]);
  };

  const zi = ZOOMS.indexOf(zoom);
  const stepName = (id: string) => pc.steps.find((s) => s.id === id)?.text ?? id;

  const toolbar = (
    <div className="hs-toolbar">
      <div className="hs-zoom" role="group" aria-label="Масштаб картинки">
        <button type="button" onClick={() => setZoom(ZOOMS[Math.max(0, zi - 1)])} disabled={zi <= 0} aria-label="Уменьшить">
          −
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, zi + 1)])}
          disabled={zi >= ZOOMS.length - 1}
          aria-label="Увеличить"
        >
          +
        </button>
      </div>
      {!disabled && (
        <button type="button" className="hs-btn" disabled={value.length === 0} onClick={() => onChange(value.slice(0, -1))}>
          ↩ Убрать метку
        </button>
      )}
      {full ? (
        <button type="button" className="hs-btn hs-done" onClick={() => setFull(false)}>
          Готово
        </button>
      ) : (
        <button type="button" className="hs-btn" onClick={() => setFull(true)}>
          ⛶ На весь экран
        </button>
      )}
    </div>
  );

  return (
    <>
      {!disabled && (
        <details className="hs-legend" open>
          <summary>Что искать: по одному нарушению на каждый шаг 5С</summary>
          <ul>
            {pc.steps.map((s) => (
              <li key={s.id}>
                <span aria-hidden="true">{STEP_ICON[s.id] ?? '•'}</span> <b>{s.text}.</b> {s.look ?? s.description}
              </li>
            ))}
          </ul>
        </details>
      )}

      {(() => {
        const viewer = (
      <div className={`hs-wrap ${full ? 'hs-full' : ''}`}>
        {full && (
          <div className="hs-full-head">
            <b>{item.title}</b>
            <span>
              {disabled ? 'Просмотр' : left > 0 ? `Осталось меток: ${left}` : 'Все метки поставлены'}
            </span>
          </div>
        )}
        {toolbar}
        {full && (
          <p className="small" style={{ color: '#e0e7ff', margin: 0 }}>
            Двигайте картинку пальцем. Если держать телефон горизонтально, видно ещё больше.
          </p>
        )}
        {!full && (
          <p className="small muted" style={{ margin: '6px 0' }}>
            {disabled
              ? 'Увеличьте картинку, чтобы рассмотреть детали.'
              : left > 0
                ? `Коснитесь нарушения, чтобы поставить метку. Осталось меток: ${left}. Коснитесь метки, чтобы убрать её.`
                : 'Все метки поставлены. Проверьте их и нажмите «Ответить».'}
          </p>
        )}
        <div className="hs-scroll">
          <div
            ref={box}
            className="hotspot-box"
            style={{ aspectRatio: String(item.aspect), width: `${zoom * 100}%` }}
            onClick={add}
            role="application"
            aria-label="Картинка склада: коснитесь нарушения, чтобы поставить метку"
          >
            <img src={assetUrl(item.image)} alt="Иллюстрация склада" draggable={false} />
            {review?.zones?.map((z) => (
              <div
                key={z.id}
                className="zone-outline"
                style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` }}
                title={z.label}
              >
                <span className="zone-tag">{STEP_ICON[z.step] ?? '•'}</span>
              </div>
            ))}
            {value.map((m, i) => (
              <button
                key={i}
                type="button"
                className="marker"
                style={{ left: `${m.x}%`, top: `${m.y}%` }}
                aria-label={`Метка ${i + 1}${disabled ? '' : ', убрать'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!disabled) onChange(value.filter((_, j) => j !== i));
                }}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
        );
        // На весь экран — поверх всей страницы, чтобы шапка этапа не перекрывала картинку
        return full ? createPortal(viewer, document.body) : viewer;
      })()}

      {review?.zones && (
        <div className="review small">
          <b>Где были нарушения (обведены зелёным):</b>
          <ul className="hs-review">
            {review.zones.map((z) => (
              <li key={z.id}>
                <span aria-hidden="true">{STEP_ICON[z.step] ?? '•'}</span> <b>{z.label}.</b> Шаг «{stepName(z.step)}».{' '}
                {z.explain}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
