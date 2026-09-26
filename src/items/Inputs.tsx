// Поля ввода для разных видов заданий.
import { useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
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
  MatchItem,
  MultiItem,
  NumberItem,
  Option,
  OrderItem,
  ReviewEntry,
} from '../core/types.ts';


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
        <span className="handle" {...attributes} {...listeners} aria-label="Потяните, чтобы переставить">
          <span aria-hidden="true">⠿</span>
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
    // Мышь — сразу; палец — только за бегунок, поэтому остальная карточка спокойно листается
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor),
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
      {!disabled && (
        <p className="small muted" style={{ marginTop: 0 }}>
          Тяните карточку за цветной бегунок слева или нажимайте ▲▼. Листать список можно пальцем по тексту.
        </p>
      )}
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

// Нарушения на картинке: отдельный файл Hotspots.tsx
export { HotspotsInput } from './Hotspots.tsx';

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
                <option value="">Выберите шаг…</option>
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
/** Тренажёр закона Литтла: срок = заявки в работе ÷ скорость */
function LittleCalc({
  calc,
  onPick,
  disabled,
}: {
  calc: { wip: number; cr: number; target: number };
  onPick: (wip: number) => void;
  disabled: boolean;
}) {
  const [wip, setWip] = useState(calc.wip);
  const [cr, setCr] = useState(calc.cr);
  const lt = Math.round((wip / cr) * 10) / 10;
  const ok = lt <= calc.target;
  const scaleMax = Math.max(calc.wip / calc.cr, calc.target) * 1.3;
  const icons = Math.min(40, Math.round(wip / Math.max(1, Math.ceil(calc.wip / 40))));
  return (
    <div className="little">
      <div className="little-formula">
        Срок = <b>{wip}</b> заявок ÷ <b>{cr}</b> в день = <b className={ok ? 'good' : 'bad'}>{String(lt).replace('.', ',')} дн.</b>
      </div>
      <div className="little-meter" aria-hidden="true">
        <span className={`little-fill ${ok ? 'good' : 'bad'}`} style={{ width: `${Math.min(100, (lt / scaleMax) * 100)}%` }} />
        <span className="little-target" style={{ left: `${(calc.target / scaleMax) * 100}%` }}>
          цель {String(calc.target).replace('.', ',')} дн.
        </span>
      </div>
      <div className="little-queue" aria-hidden="true">
        {Array.from({ length: icons }, (_, i) => (
          <span key={i}>📄</span>
        ))}
      </div>
      <label className="little-slider">
        <span>
          Заявок в работе: <b>{wip}</b>
        </span>
        <input type="range" min={1} max={Math.round(calc.wip * 1.5)} value={wip} onChange={(e) => setWip(Number(e.target.value))} />
      </label>
      <label className="little-slider">
        <span>
          Скорость, заявок в день: <b>{cr}</b>
        </span>
        <input type="range" min={1} max={Math.round(calc.cr * 2)} value={cr} onChange={(e) => setCr(Number(e.target.value))} />
      </label>
      <p className="small muted" style={{ margin: '4px 0 0' }}>
        {ok ? '✅ Срок в пределах цели.' : '⏳ Пока дольше цели.'} Меньше заявок в работе или выше скорость, и срок сокращается.
      </p>
      {!disabled && (
        <button type="button" className="btn btn-ghost btn-small" style={{ marginTop: 8 }} onClick={() => onPick(wip)}>
          Взять {wip} в ответ
        </button>
      )}
    </div>
  );
}

export function NumberInput({ item, value, onChange, disabled, review }: Props<NumberItem, string>) {
  const c = review?.correct as { answer: number; tolerance: number } | undefined;
  return (
    <div>
      {item.calc && <LittleCalc calc={item.calc} disabled={disabled} onPick={(w) => onChange(String(w))} />}
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
