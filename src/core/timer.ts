// Таймер этапа («запас кислорода»). Время считает сервер: старт фиксируется при открытии этапа
// и не останавливается, если участник закрыл страницу.

export function computeDeadline(startedAt: Date, minutes: number): Date {
  return new Date(startedAt.getTime() + minutes * 60_000);
}

/** Сколько миллисекунд осталось (не меньше нуля). */
export function remainingMs(deadline: Date | string, now: Date): number {
  const d = typeof deadline === 'string' ? new Date(deadline) : deadline;
  return Math.max(0, d.getTime() - now.getTime());
}

/** Время вышло окончательно (с учётом небольшой форы на задержку сети). */
export function isExpired(deadline: Date | string, now: Date, graceSeconds = 0): boolean {
  const d = typeof deadline === 'string' ? new Date(deadline) : deadline;
  return now.getTime() > d.getTime() + graceSeconds * 1000;
}

/** Доля оставшегося кислорода от 0 до 1 — для рисования баллона. */
export function oxygenShare(startedAt: Date | string, deadline: Date | string, now: Date): number {
  const s = new Date(startedAt).getTime();
  const d = new Date(deadline).getTime();
  if (d <= s) return 0;
  return Math.max(0, Math.min(1, (d - now.getTime()) / (d - s)));
}

/** «мм:сс» */
export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Длительность этапа в секундах; незавершённый этап считается за весь лимит. */
export function stageSeconds(startedAt: string | null, finishedAt: string | null, limitMinutes: number): number {
  if (!startedAt || !finishedAt) return limitMinutes * 60;
  const sec = (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000;
  return Math.max(0, Math.min(limitMinutes * 60, Math.round(sec)));
}
