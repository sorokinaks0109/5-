// Рейтинг: сумма высоты, при равенстве — кто быстрее прошёл автоматические вершины (1–5).
export interface RankInput {
  accountId: string;
  number: number;
  altitude: number;
  secondsAuto: number;
}

export function compareRank(a: RankInput, b: RankInput): number {
  if (b.altitude !== a.altitude) return b.altitude - a.altitude;
  if (a.secondsAuto !== b.secondsAuto) return a.secondsAuto - b.secondsAuto;
  return a.number - b.number;
}

/** Сортирует и проставляет места. Полное равенство высоты и времени даёт одно место на двоих. */
export function rank<T extends RankInput>(rows: T[]): (T & { place: number })[] {
  const sorted = rows.slice().sort(compareRank);
  let place = 0;
  return sorted.map((r, i) => {
    const prev = sorted[i - 1];
    if (!prev || prev.altitude !== r.altitude || prev.secondsAuto !== r.secondsAuto) place = i + 1;
    return { ...r, place };
  });
}
