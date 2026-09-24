// Выгрузка таблиц в CSV и Excel (xlsx) прямо в браузере.
import writeXlsxFile from 'write-excel-file/universal';

export type Cell = string | number | null | undefined;
export interface Sheet {
  name: string;
  header: string[];
  rows: Cell[][];
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** CSV с разделителем «;» и BOM — так русский Excel открывает файл без «кракозябр». */
export function toCsv(sheet: Sheet): string {
  const esc = (v: Cell) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [sheet.header, ...sheet.rows].map((r) => r.map(esc).join(';')).join('\r\n');
}

export function downloadCsv(sheet: Sheet, fileName: string) {
  downloadBlob(new Blob([toCsv(sheet)], { type: 'text/csv;charset=utf-8' }), fileName);
}

export async function downloadXlsx(sheets: Sheet[], fileName: string) {
  const data = sheets.map((s) => ({
    sheet: s.name.slice(0, 31),
    data: [
      s.header.map((h) => ({ value: h, fontWeight: 'bold' as const })),
      ...s.rows.map((r) => r.map((v) => (v === null || v === undefined || v === '' ? null : { value: v }))),
    ],
    columns: s.header.map((h) => ({ width: Math.min(60, Math.max(10, h.length + 4)) })),
  }));
  const blob = await writeXlsxFile(data).toBlob();
  downloadBlob(blob, fileName);
}

export function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
}
