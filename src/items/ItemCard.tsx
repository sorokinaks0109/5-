// Карточка одного задания: ввод ответа, подсказка, результат и разбор.
import { useState } from 'react';
import type { AnswerRecord, AnswerValue, PublicItem, ReviewEntry } from '../core/types.ts';
import { meters } from '../hooks.ts';
import { pc } from '../content.ts';
import { Burst } from '../components/Burst.tsx';
import { ChoiceInput, FlagsInput, HotspotsInput, MatchInput, MultiInput, NumberInput, OrderInput } from './Inputs.tsx';

type Answer = Omit<AnswerRecord, 'answeredAt'>;

function initialValue(item: PublicItem, answer?: Answer): unknown {
  if (answer) return item.kind === 'number' ? String(answer.value) : answer.value;
  switch (item.kind) {
    case 'choice':
      return null;
    case 'multi':
    case 'flags':
    case 'hotspots':
      return [];
    case 'order':
      return item.elements.map((e) => e.id);
    case 'match':
      return {};
    case 'number':
      return '';
  }
}

function isReady(item: PublicItem, v: unknown): boolean {
  switch (item.kind) {
    case 'choice':
      return typeof v === 'string';
    case 'multi':
    case 'flags':
    case 'hotspots':
      return Array.isArray(v) && v.length > 0;
    case 'order':
      return true;
    case 'match':
      return item.left.every((l) => !!(v as Record<string, string>)[l.id]);
    case 'number':
      return Number.isFinite(Number(String(v).replace(',', '.'))) && String(v).trim() !== '';
  }
}

function toAnswer(item: PublicItem, v: unknown): AnswerValue {
  if (item.kind === 'number') return Number(String(v).replace(',', '.'));
  return v as AnswerValue;
}

export function ResultLine({ fraction, points, hint }: { fraction: number; points: number; hint?: boolean }) {
  const cls = fraction >= 1 ? 'ok' : fraction > 0 ? 'part' : 'bad';
  const text = fraction >= 1 ? 'Верно!' : fraction > 0 ? `Частично (${Math.round(fraction * 100)}%)` : 'Неверно.';
  return (
    <div className={`result ${cls}`} role="status">
      {text} +{meters(points)}
      {hint && <span className="small"> (с подсказкой)</span>}
    </div>
  );
}

export function ItemCard({
  item,
  answer,
  hint,
  review,
  finished,
  blocked,
  hintsLeft,
  flagsOrder,
  fx,
  onAnswer,
  onHint,
}: {
  item: PublicItem;
  answer?: Answer;
  hint?: string;
  review?: ReviewEntry;
  finished: boolean;
  blocked?: string;
  hintsLeft: number;
  flagsOrder?: string[];
  /** Эффект только что данного ответа: конфетти или «непогода» */
  fx?: { key: number; points: number; fraction: number };
  onAnswer: (value: AnswerValue) => Promise<void>;
  onHint: () => Promise<void>;
}) {
  const [value, setValue] = useState<unknown>(() => initialValue(item, answer));
  const [busy, setBusy] = useState(false);
  const locked = !!answer || finished || !!blocked;

  const submit = async () => {
    setBusy(true);
    try {
      await onAnswer(toAnswer(item, value));
    } finally {
      setBusy(false);
    }
  };
  const takeHint = async () => {
    const ok =
      hint ||
      window.confirm(
        `Взять снаряжение? Подсказка снизит высоту за это задание на ${Math.round(pc.settings.hintPenalty * 100)}%. Осталось подсказок: ${hintsLeft}.`,
      );
    if (!ok) return;
    setBusy(true);
    try {
      await onHint();
    } finally {
      setBusy(false);
    }
  };

  const common = { disabled: locked || busy, review, fraction: answer?.fraction };
  let input: React.ReactNode;
  switch (item.kind) {
    case 'choice':
      input = <ChoiceInput item={item} value={value as string | null} onChange={setValue} {...common} />;
      break;
    case 'multi':
      input = <MultiInput item={item} value={value as string[]} onChange={setValue} {...common} />;
      break;
    case 'order':
      input = <OrderInput item={item} value={value as string[]} onChange={setValue} {...common} />;
      break;
    case 'hotspots':
      input = <HotspotsInput item={item} value={value as { x: number; y: number }[]} onChange={setValue} {...common} />;
      break;
    case 'match':
      input = <MatchInput item={item} value={value as Record<string, string>} onChange={setValue} {...common} />;
      break;
    case 'flags':
      input = <FlagsInput item={item} value={value as string[]} onChange={setValue} order={flagsOrder} {...common} />;
      break;
    case 'number':
      input = <NumberInput item={item} value={value as string} onChange={setValue} {...common} />;
      break;
  }

  return (
    <section
      key={fx?.key}
      className={`card item-card ${fx ? (fx.fraction > 0 ? 'glow-ok' : 'shake') : ''}`}
    >
      {fx && <Burst key={fx.key} points={fx.points} fraction={fx.fraction} />}
      <div className="item-title">
        <h2 style={{ margin: 0 }}>{item.title}</h2>
        <span className="tag">до {meters(item.maxPoints)}</span>
      </div>
      <p className="prompt">{item.prompt}</p>
      {item.kind === 'multi' && !locked && <p className="small muted">Можно выбрать несколько. Лишний выбор снижает результат.</p>}
      {blocked && !answer && !finished && <div className="notice warn">{blocked}</div>}
      {input}

      {hint && (
        <div className="hint-box">
          <b>Подсказка:</b> {hint}
        </div>
      )}

      {answer && <ResultLine fraction={answer.fraction} points={answer.points} hint={answer.hint} />}
      {!answer && finished && <div className="result bad">Нет ответа. +0 м</div>}
      {review?.explanation && (
        <div className="review small">
          <b>Пояснение:</b> {review.explanation}
        </div>
      )}

      {!locked && (
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn" disabled={busy || !isReady(item, value)} onClick={submit}>
            {busy ? 'Проверяем…' : 'Ответить'}
          </button>
          {item.hasHint && !hint && (
            <button className="btn btn-ghost" disabled={busy || hintsLeft <= 0} onClick={takeHint}>
              🧗 Подсказка (−{Math.round(pc.settings.hintPenalty * 100)}%)
            </button>
          )}
          <span className="small muted">Ответ окончательный.</span>
        </div>
      )}
    </section>
  );
}
