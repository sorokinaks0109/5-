// 5С в почте: разобрать входящие по папкам. Касание письма, потом папки.
// Повторное касание разобранного письма позволяет переложить его.
import { useState } from 'react';
import type { InboxItem, ReviewEntry } from '../core/types.ts';

type Placement = Record<string, string>;

export function InboxInput({
  item,
  value,
  onChange,
  disabled,
  review,
}: {
  item: InboxItem;
  value: Placement;
  onChange: (v: Placement) => void;
  disabled: boolean;
  review?: ReviewEntry;
}) {
  const firstFree = item.emails.find((e) => !value[e.id])?.id ?? null;
  const [selected, setSelected] = useState<string | null>(disabled ? null : firstFree);
  const correct = review?.correct as Placement | undefined;
  const folder = (id: string) => item.folders.find((f) => f.id === id);
  const done = item.emails.filter((e) => value[e.id]).length;
  const count = (fid: string) => item.emails.filter((e) => value[e.id] === fid).length;

  const put = (fid: string) => {
    if (disabled || !selected) return;
    const next = { ...value, [selected]: fid };
    onChange(next);
    const rest = item.emails.filter((e) => !next[e.id]);
    setSelected(rest[0]?.id ?? null);
  };

  return (
    <div className="inbox">
      {!disabled && (
        <div className="inbox-folders" role="group" aria-label="Папки">
          {item.folders.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`inbox-folder ${selected ? 'target' : ''} ${f.id === 'trash' ? 'trash' : ''}`}
              onClick={() => put(f.id)}
              disabled={!selected}
              title={f.hint}
            >
              <span className="inbox-folder-icon" aria-hidden="true">
                {f.icon}
              </span>
              <span className="inbox-folder-name">{f.text}</span>
              {count(f.id) > 0 && <span className="inbox-count">{count(f.id)}</span>}
              {f.hint && <span className="inbox-folder-hint">{f.hint}</span>}
            </button>
          ))}
        </div>
      )}
      {!disabled && (
        <p className="small muted" style={{ margin: '8px 0' }}>
          {selected
            ? '👉 Письмо выбрано. Теперь коснитесь папки.'
            : done === item.emails.length
              ? 'Все письма разобраны! Проверьте и нажмите «Ответить». Чтобы переложить письмо, коснитесь его.'
              : 'Коснитесь письма, чтобы выбрать его.'}
        </p>
      )}

      <div className="inbox-window">
        <div className="inbox-head">
          <b>📥 Входящие</b>
          <span className="small">
            разобрано {done} из {item.emails.length}
          </span>
        </div>
        <ul className="inbox-list">
          {item.emails.map((e) => {
            const placed = value[e.id];
            const f = placed ? folder(placed) : undefined;
            const ok = correct ? correct[e.id] === placed : undefined;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  className={`inbox-mail ${selected === e.id ? 'selected' : ''} ${placed ? 'placed' : ''} ${
                    ok === true ? 'ok' : ok === false ? 'bad' : ''
                  }`}
                  onClick={() => !disabled && setSelected(e.id)}
                  aria-pressed={selected === e.id}
                >
                  <span className={`inbox-dot ${placed ? 'read' : ''}`} aria-hidden="true" />
                  <span className="inbox-body">
                    <span className="inbox-from">{e.from}</span>
                    <span className="inbox-subject">{e.subject}</span>
                    {f && (
                      <span className="inbox-tag">
                        {ok === true ? '✓ ' : ok === false ? '✗ ' : ''}
                        {f.icon} {f.text}
                      </span>
                    )}
                    {ok === false && correct && (
                      <span className="inbox-right">
                        Верно: {folder(correct[e.id])?.icon} {folder(correct[e.id])?.text}
                      </span>
                    )}
                  </span>
                  <span className="inbox-date">{e.date}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
