// Диаграмма Исикавы («рыбья кость»): участник раскладывает причины по костям 6М.
// Управление: нажать на карточку → нажать на кость (удобно на телефоне) или перетащить карточку.
// Нажатие на карточку на кости возвращает её обратно.
import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { NOT_A_CAUSE, type FishboneItem, type Option, type ReviewEntry } from '../core/types.ts';

const BONE_COLORS = ['#f43f5e', '#8b5cf6', '#0ea5e9', '#f59e0b', '#10b981', '#6366f1'];

type Placement = Record<string, string>;

function CardChip({
  card,
  selected,
  small,
  disabled,
  mark,
  onTap,
}: {
  card: Option;
  selected?: boolean;
  small?: boolean;
  disabled: boolean;
  mark?: 'ok' | 'bad';
  onTap: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id, disabled });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`fb-card ${small ? 'small' : ''} ${selected ? 'selected' : ''} ${mark ?? ''} ${isDragging ? 'ghost' : ''}`}
      onClick={
        disabled
          ? undefined
          : (e) => {
              e.stopPropagation();
              onTap();
            }
      }
      {...(disabled ? {} : listeners)}
      {...attributes}
      aria-pressed={selected}
    >
      {mark && <span aria-hidden="true">{mark === 'ok' ? '✓ ' : '✗ '}</span>}
      {card.text}
    </button>
  );
}

function Drop({
  id,
  className,
  style,
  onTap,
  children,
  label,
}: {
  id: string;
  className: string;
  style?: React.CSSProperties;
  onTap?: () => void;
  children: React.ReactNode;
  label: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`${className} ${isOver ? 'over' : ''}`}
      style={style}
      onClick={onTap}
      role={onTap ? 'button' : undefined}
      aria-label={label}
    >
      {children}
    </div>
  );
}

export function FishboneInput({
  item,
  value,
  onChange,
  disabled,
  review,
}: {
  item: FishboneItem;
  value: Placement;
  onChange: (v: Placement) => void;
  disabled: boolean;
  review?: ReviewEntry;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Задержка позволяет листать страницу пальцем, а долгое касание начинает перетаскивание
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );
  const correct = review?.correct as Placement | undefined;
  const byId = new Map(item.cards.map((c) => [c.id, c]));
  const pool = item.cards.filter((c) => !value[c.id]);
  const placedCount = item.cards.length - pool.length;
  const catName = (id: string) =>
    id === NOT_A_CAUSE ? 'Не причина' : item.categories.find((c) => c.id === id)?.text ?? '';

  const place = (cardId: string, target: string) => {
    if (disabled) return;
    const next = { ...value };
    if (target === 'pool') delete next[cardId];
    else next[cardId] = target;
    onChange(next);
    // Сразу выбираем следующую свободную карточку — раскладывать быстрее
    const rest = item.cards.filter((c) => !next[c.id] && c.id !== cardId);
    setSelected(target === 'pool' ? cardId : rest[0]?.id ?? null);
  };

  const tapTarget = (target: string) => {
    if (selected) place(selected, target);
  };

  const onStart = (e: DragStartEvent) => setDragging(String(e.active.id));
  const onEnd = (e: DragEndEvent) => {
    setDragging(null);
    if (e.over) place(String(e.active.id), String(e.over.id));
  };

  const countOn = (cat: string) => item.cards.filter((c) => value[c.id] === cat).length;
  const cardsOn = (cat: string) =>
    item.cards
      .filter((c) => value[c.id] === cat)
      .map((c) => (
        <CardChip
          key={c.id}
          card={c}
          small
          disabled={disabled}
          mark={correct ? (correct[c.id] === cat ? 'ok' : 'bad') : undefined}
          onTap={() => place(c.id, 'pool')}
        />
      ));

  const bone = (idx: number) => {
    const cat = item.categories[idx];
    if (!cat) return <div />;
    const color = BONE_COLORS[idx % BONE_COLORS.length];
    return (
      <Drop
        key={cat.id}
        id={cat.id}
        label={`Кость «${cat.text}»`}
        className={`fb-bone ${idx < 3 ? 'top' : 'bottom'} ${selected && !disabled ? 'target' : ''}`}
        style={{ '--bone': color } as React.CSSProperties}
        onTap={selected && !disabled ? () => tapTarget(cat.id) : undefined}
      >
        <div className="fb-bone-head">
          <span className="fb-icon">{cat.icon}</span>
          <b>{cat.text}</b>
          <span className="fb-count">{countOn(cat.id) || ''}</span>
          <span className="fb-hint">{cat.hint}</span>
        </div>
        <div className="fb-bone-cards">{cardsOn(cat.id)}</div>
      </Drop>
    );
  };

  // Для телефона: под рыбой — список «что на какой кости», крупным текстом
  const groups = [...item.categories.map((c) => ({ id: c.id, icon: c.icon, text: c.text })), ...(item.allowNone ? [{ id: NOT_A_CAUSE, icon: '🗑️', text: 'Не причина' }] : [])];

  return (
    <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setDragging(null)}>
      <div className="fishbone">
        {!disabled && (
          <Drop id="pool" className="fb-pool" label="Причины, которые ещё не разложены">
            <div className="row" style={{ marginBottom: 8 }}>
              <b>Причины</b>
              <span className="tag">
                разложено {placedCount} из {item.cards.length}
              </span>
            </div>
            {pool.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>
                Все причины на местах. Проверьте диаграмму и нажмите «Ответить». Чтобы переложить карточку — нажмите на неё.
              </p>
            ) : (
              <>
                <div className="fb-pool-cards">
                  {pool.map((c) => (
                    <CardChip
                      key={c.id}
                      card={c}
                      selected={selected === c.id}
                      disabled={disabled}
                      onTap={() => setSelected(c.id)}
                    />
                  ))}
                </div>
                <p className="small muted" style={{ margin: '8px 0 0' }}>
                  {selected ? '👉 Теперь нажмите на нужную кость рыбы.' : 'Нажмите на карточку, затем на кость. Или перетащите карточку.'}
                </p>
              </>
            )}
          </Drop>
        )}

        <div className="fb-problem-banner">
          <span aria-hidden="true">🐟</span> <b>Голова рыбы — проблема:</b> {item.problem}
        </div>
        <div className="fb-fish">
          {bone(0)}
          {bone(1)}
          {bone(2)}
          <div className="fb-head">
            <span className="fb-eye" aria-hidden="true" />
            <span className="fb-problem">{item.problem}</span>
          </div>
          <div className="fb-spine" aria-hidden="true" />
          {bone(3)}
          {bone(4)}
          {bone(5)}
        </div>

        {item.allowNone && (
          <Drop
            id={NOT_A_CAUSE}
            label="Корзина «Не причина»"
            className={`fb-none ${selected && !disabled ? 'target' : ''}`}
            onTap={selected && !disabled ? () => tapTarget(NOT_A_CAUSE) : undefined}
          >
            <div className="fb-bone-head">
              <span className="fb-icon">🗑️</span>
              <b>Не причина</b>
              <span className="fb-hint">Факт есть, но на проблему не влияет</span>
            </div>
            <div className="fb-bone-cards">{cardsOn(NOT_A_CAUSE)}</div>
          </Drop>
        )}

        <div className="fb-list">
          {groups
            .filter((g) => countOn(g.id) > 0)
            .map((g) => (
              <div key={g.id} className="fb-list-group">
                <div className="fb-list-title">
                  {g.icon} {g.text} · {countOn(g.id)}
                </div>
                <div className="fb-bone-cards">{cardsOn(g.id)}</div>
              </div>
            ))}
          {placedCount > 0 && !disabled && <p className="small muted">Нажмите на причину, чтобы вернуть её и переложить.</p>}
        </div>

        {correct && (
          <div className="review small">
            <b>
              {item.cards.every((c) => value[c.id] === correct[c.id])
                ? 'Все причины разложены верно!'
                : 'Где должны быть причины, которые легли не туда:'}
            </b>
            <ul style={{ margin: '4px 0 0', paddingLeft: 22 }}>
              {item.cards
                .filter((c) => value[c.id] !== correct[c.id])
                .map((c) => (
                  <li key={c.id}>
                    {c.text} → <b>{catName(correct[c.id])}</b>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging && byId.get(dragging) ? <div className="fb-card selected dragging">{byId.get(dragging)!.text}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}
