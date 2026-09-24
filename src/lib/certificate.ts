// Сертификат «Покоритель вершины» в PNG. Рисуется на canvas прямо в браузере.
import { downloadBlob } from './export.ts';

const W = 1600;
const H = 1130;

function badge(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.fillStyle = '#ff7a1a';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0b2545';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `900 ${r * 0.75}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('5', cx, cy + r * 0.04);
  // Надпись по кругу
  const text = 'ИДЕЙНЫЕ ИГРЫ · 5 ЛЕТ · 2027 · ';
  ctx.font = `800 ${r * 0.17}px Arial, sans-serif`;
  ctx.fillStyle = '#0b2545';
  const step = (Math.PI * 2) / text.length;
  for (let i = 0; i < text.length; i++) {
    const a = -Math.PI / 2 + i * step;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * r * 0.79, cy + Math.sin(a) * r * 0.79);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(text[i], 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startSize: number, weight = 800) {
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px Arial, sans-serif`;
    size -= 4;
  } while (ctx.measureText(text).width > maxWidth && size > 24);
}

export function drawCertificate(canvas: HTMLCanvasElement, nick: string, altitude: number) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0b2545');
  sky.addColorStop(1, '#1d4273');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Горы
  ctx.fillStyle = 'rgba(141,169,196,0.35)';
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, 840);
  ctx.lineTo(260, 720);
  ctx.lineTo(480, 800);
  ctx.lineTo(800, 640);
  ctx.lineTo(1100, 790);
  ctx.lineTo(1340, 700);
  ctx.lineTo(W, 800);
  ctx.lineTo(W, H);
  ctx.fill();
  ctx.fillStyle = '#e6edf5';
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, 850);
  ctx.lineTo(400, 790);
  ctx.lineTo(800, 815);
  ctx.lineTo(1200, 785);
  ctx.lineTo(W, 840);
  ctx.lineTo(W, H);
  ctx.fill();

  // Флажок на вершине
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(800, 640);
  ctx.lineTo(800, 550);
  ctx.stroke();
  ctx.fillStyle = '#ff7a1a';
  ctx.beginPath();
  ctx.moveTo(803, 550);
  ctx.lineTo(870, 572);
  ctx.lineTo(803, 594);
  ctx.fill();

  // Рамка
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(40, 40, W - 80, H - 80);

  // Место для логотипа
  ctx.setLineDash([12, 10]);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.strokeRect(90, 90, 300, 120);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '600 26px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Место для логотипа', 240, 150);

  badge(ctx, W - 210, 170, 110);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#cfe0f1';
  ctx.font = '700 34px Arial, sans-serif';
  ctx.fillText('ИДЕЙНЫЕ ИГРЫ · 2027 · ОТБОРОЧНЫЙ ТУР «ПЯТЬ ВЕРШИН»', W / 2, 300);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 96px Arial, sans-serif';
  ctx.fillText('СЕРТИФИКАТ', W / 2, 400);
  ctx.fillStyle = '#ffb38a';
  ctx.font = '800 56px Arial, sans-serif';
  ctx.fillText('«Покоритель вершины»', W / 2, 480);

  ctx.fillStyle = '#0b2545';
  fitText(ctx, nick, 1100, 88);
  ctx.fillText(nick, W / 2, 940);

  ctx.font = '800 48px Arial, sans-serif';
  ctx.fillStyle = '#c2410c';
  ctx.fillText(`Набранная высота: ${altitude.toLocaleString('ru-RU')} м из 5 000 м`, W / 2, 1030);
}

export async function downloadCertificate(nick: string, altitude: number) {
  const canvas = document.createElement('canvas');
  drawCertificate(canvas, nick, altitude);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error('Не удалось создать картинку сертификата.');
  const safe = nick.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40) || 'uchastnik';
  downloadBlob(blob, `sertifikat_${safe}.png`);
}
