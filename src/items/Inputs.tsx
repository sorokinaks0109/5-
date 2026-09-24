// Поля ввода для разных видов заданий.
import { useRef } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type {
  ChoiceItem,
  FlagsItem,
  HotspotsItem,
  MatchItem,
  MultiItem,
  NumberItem,
  Option,
  OrderItem,
  ReviewEntry,
} from '../core/types.ts';

const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`.replace(/\/\.\//, '/');

interface Props<I, V> {
  item: I;
  value: V;
  onChange: (v: V) => void;
  disabled: boolean;
  review?: ReviewEntry;
  /** Доля правильности уже данного ответа (если есть) */
  fraction?: number;
}

// ---------- Один вариант ----------
export function ChoiceInput({ item, value, onChange, disabled, review, fraction }: Props<ChoiceItem, string | null>) {
  return (
    <div className="choices" role="radiogroup">
      {item.options.map((o) => {
        const selected = value === o.id;
        let cls = selected ? 'selected' : '';
        if (fraction !== undefined && selected) cls = fraction === 1 ? 'correct' : 'wrong';
        if (review && review.correct === o.id) cls = 'correct';
        return (
          <label key={o.id} className={`chip ${cls} ${disabled ? 'disabled' : ''}`}>
            <input
              type="radio"
              name={item.id}
              checked={selected}
              disabled={disabled}
              onChange={() => onChange(o.id)}
            />
            <span>{o.text}</span>
          </label>
        );
      })}
    </div>
  );
}

// ---------- Несколько вариантов ----------
export function MultiInput({ item, value, onChange, disabled, review }: Props<MultiItem, string[]>) {
  const correct = new Set((review?.correct as string[]) ?? []);
  return (
    <div className="choices">
      {item.options.map((o) => {
        const selected = value.includes(o.id);
        let cls = selected ? 'selected' : '';
        if (review) cls = correct.has(o.id) ? 'correct' : selected ? 'wrong' : '';
        return (
          <label key={o.id} className={`chip ${cls} ${disabled ? 'disabled' : ''}`}>
            <input
              type="checkbox"
              checked={selected}
              disabled={disabled}
              onChange={() => onChange(selected ? value.filter((x) => x !== o.id) : [...value, o.id])}
            />
            <span>{o.text}</span>
          </label>
        );
      })}
    </div>
  );
}

// ---------- Порядок (перетаскивание + стрелки) ----------
function SortRow({
  el,
  index,
  total,
  disabled,
  move,
  mark,
}: {
  el: Option & { note?: string };
  index: number;
  total: number;
  disabled: boolean;
  move: (from: number, to: number) => void;
  mark?: 'ok' | 'bad';
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: el.id, disabled });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <li
      ref={setNodeRef}
      style={{
        ...style,
        borderColor: mark === 'ok' ? 'var(--ok)' : mark === 'bad' ? 'var(--bad)' : undefined,
      }}
      className={isDragging ? 'dragging' : ''}
    >
      {!disabled && (
        <span className="handle" {...attributes} {...listeners} aria-label="Перетащить">
          ⠿
        </span>
      )}
      <span className="pos">{index + 1}.</span>
      <span className="text">
        {el.text}
        {el.note && <span className="small muted"> · {el.note}</span>}
      </span>
      {mark && <span aria-hidden="true">{mark === 'ok' ? '✓' : '✗'}</span>}
      {!disabled && (
        <span className="arrows">
          <button type="button" aria-label="Выше" disabled={index === 0} onClick={() => move(index, index - 1)}>
            ▲
          </button>
          <button type="button" aria-label="Ниже" disabled={index === total - 1} onClick={() => move(index, index + 1)}>
            ▼
          </button>
        </span>
      )}
    </li>
  );
}

export function OrderInput({ item, value, onChange, disabled, review }: Props<OrderItem, string[]>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const byId = new Map(item.elements.map((e) => [e.id, e]));
  const els = value.map((id) => byId.get(id)!).filter(Boolean);
  const move = (from: number, to: number) => onChange(arrayMove(value, from, to));
  const onEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    move(value.indexOf(String(e.active.id)), value.indexOf(String(e.over.id)));
  };
  const correct = review?.correct as string[] | undefined;
  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onEnd}>
        <SortableContext items={value} strategy={verticalListSortingStrategy}>
          <ol className="sortable">
            {els.map((el, i) => (
              <SortRow
                key={el.id}
                el={el}
                index={i}
                total={els.length}
                disabled={disabled}
                move={move}
                mark={correct ? (correct[i] === el.id ? 'ok' : 'bad') : undefined}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      {correct && (
        <div className="review small">
          <b>Правильный порядок:</b>
          <ol style={{ margin: '4px 0 0', paddingLeft: 22 }}>
            {correct.map((id) => (
              <li key={id}>{byId.get(id)?.text}</li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}

// ---------- Нарушения на картинке ----------
export function HotspotsInput({ item, value, onChange, disabled, review }: Props<HotspotsItem, { x: number; y: number }[]>) {
  const box = useRef<HTMLDivElement>(null);
  const add = (e: React.MouseEvent) => {
    if (disabled || !box.current) return;
    if (value.length >= item.markers) return;
    const r = box.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * 1000) / 10;
    const y = Math.round(((e.clientY - r.top) / r.height) * 1000) / 10;
    onChange([...value, { x, y }]);
  };
  return (
    <>
      <p className="small muted">
        Меток: <b>{value.length}</b> из {item.markers}. {!disabled && 'Нажмите на метку, чтобы убрать её.'}
      </p>
      <div
        ref={box}
        className="hotspot-box"
        style={{ aspectRatio: String(item.aspect) }}
        onClick={add}
        role="application"
        aria-label="Картинка склада: нажмите на нарушение, чтобы поставить метку"
      >
        <img src={assetUrl(item.image)} alt="Иллюстрация склада" draggable={false} />
        {review?.zones?.map((z) => (
          <div
            key={z.id}
            className="zone-outline"
            style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` }}
            title={z.label}
          />
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
      {review?.zones && (
        <div className="review small">
          <b>Нарушения (обведены зелёным):</b>
          <ul style={{ margin: '4px 0 0', paddingLeft: 22 }}>
            {review.zones.map((z) => (
              <li key={z.id}>{z.label}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

// ---------- Сопоставление ----------
export function MatchInput({ item, value, onChange, disabled, review }: Props<MatchItem, Record<string, string>>) {
  const correct = review?.correct as Record<string, string> | undefined;
  const name = (id: string) => item.right.find((r) => r.id === id)?.text ?? '';
  return (
    <div>
      {item.left.map((l) => {
        const ok = correct ? correct[l.id] === value[l.id] : undefined;
        return (
          <div key={l.id} className="match-row">
            <div>
              {correct && <span aria-hidden="true">{ok ? '✓ ' : '✗ '}</span>}
              {l.text}
            </div>
            <div>
              <select
                value={value[l.id] ?? ''}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, [l.id]: e.target.value })}
                aria-label={`Шаг 5С для: ${l.text}`}
                style={correct ? { borderColor: ok ? 'var(--ok)' : 'var(--bad)' } : undefined}
              >
                <option value="">— выберите шаг —</option>
                {item.right.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.text}
                  </option>
                ))}
              </select>
              {correct && !ok && <div className="small" style={{ color: 'var(--ok)' }}>Верно: {name(correct[l.id])}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Операции без ценности ----------
export function FlagsInput({
  item,
  value,
  onChange,
  disabled,
  review,
  order,
}: Props<FlagsItem, string[]> & { order?: string[] }) {
  const correct = review ? new Set(review.correct as string[]) : null;
  const byId = new Map(item.elements.map((e) => [e.id, e]));
  const ids = order && order.length === item.elements.length ? order : item.elements.map((e) => e.id);
  return (
    <div className="choices">
      {ids.map((id) => {
        const el = byId.get(id)!;
        const on = value.includes(id);
        let cls = on ? 'selected' : '';
        if (correct) cls = correct.has(id) ? 'correct' : on ? 'wrong' : '';
        return (
          <label key={id} className={`chip ${cls} ${disabled ? 'disabled' : ''}`}>
            <input
              type="checkbox"
              checked={on}
              disabled={disabled}
              onChange={() => onChange(on ? value.filter((x) => x !== id) : [...value, id])}
            />
            <span style={{ flex: 1 }}>{el.text}</span>
            <b className="small" style={{ whiteSpace: 'nowrap' }}>
              {el.minutes} {item.unit}
            </b>
          </label>
        );
      })}
      {correct && <p className="small muted">Зелёным отмечены операции без ценности.</p>}
    </div>
  );
}

// ---------- Число ----------
export function NumberInput({ item, value, onChange, disabled, review }: Props<NumberItem, string>) {
  const c = review?.correct as { answer: number; tolerance: number } | undefined;
  return (
    <div>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.,-]/g, ''))}
          style={{ maxWidth: 200, fontSize: '1.3rem', fontWeight: 700 }}
          aria-label="Ваш ответ"
        />
        <b>{item.unit}</b>
      </div>
      {c && (
        <div className="review small">
          Правильный ответ: <b>{c.answer} {item.unit}</b> (засчитывается ±{c.tolerance})
        </div>
      )}
    </div>
  );
}
