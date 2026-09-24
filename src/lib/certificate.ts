// Сертификат «Покоритель вершины» в PNG. Рисуется на canvas прямо в браузере.
import { pc } from '../content.ts';
import { downloadBlob } from './export.ts';

const W = 1600;
const H = 1130;

function badge(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.save();
  const ring = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  ring.addColorStop(0, '#facc15');
  ring.addColorStop(0.5, '#f97316');
  ring.addColorStop(1, '#ec4899');
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1e1b4b';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2);
  ctx.fill();
  // Вершина с флажком
  const u = r / 60;
  ctx.fillStyle = '#22d3ee';
  ctx.beginPath();
  ctx.moveTo(cx - 30 * u, cy + 20 * u);
  ctx.lineTo(cx - 10 * u, cy - 6 * u);
  ctx.lineTo(cx - 2 * u, cy + 4 * u);
  ctx.lineTo(cx + 10 * u, cy - 16 * u);
  ctx.lineTo(cx + 30 * u, cy + 20 * u);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.5 * u;
  ctx.beginPath();
  ctx.moveTo(cx + 10 * u, cy - 16 * u);
  ctx.lineTo(cx + 10 * u, cy - 34 * u);
  ctx.stroke();
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.moveTo(cx + 11 * u, cy - 34 * u);
  ctx.lineTo(cx + 26 * u, cy - 29.5 * u);
  ctx.lineTo(cx + 11 * u, cy - 25 * u);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Надпись по кругу
  const text = `${pc.settings.badgeTop} · ${pc.settings.badgeBottom} · `;
  ctx.font = `800 ${r * 0.17}px Arial, sans-serif`;
  ctx.fillStyle = '#1e1b4b';
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
  sky.addColorStop(0, '#1e1b4b');
  sky.addColorStop(0.45, '#5b21b6');
  sky.addColorStop(0.8, '#db2777');
  sky.addColorStop(1, '#fb923c');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Горы
  // Северное сияние
  const aur = ctx.createLinearGradient(0, 0, W, 0);
  aur.addColorStop(0, 'rgba(34,211,238,0)');
  aur.addColorStop(0.5, 'rgba(52,211,153,0.55)');
  aur.addColorStop(1, 'rgba(34,211,238,0)');
  ctx.fillStyle = aur;
  ctx.beginPath();
  ctx.moveTo(0, 520);
  ctx.bezierCurveTo(400, 380, 800, 600, 1200, 430);
  ctx.bezierCurveTo(1400, 360, 1500, 420, W, 400);
  ctx.lineTo(W, 470);
  ctx.bezierCurveTo(1300, 500, 900, 620, 600, 560);
  ctx.bezierCurveTo(300, 500, 150, 560, 0, 600);
  ctx.fill();
  ctx.fillStyle = 'rgba(167,139,250,0.55)';
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
  ctx.fillStyle = '#f5f3ff';
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
  ctx.fillStyle = '#e0e7ff';
  fitText(ctx, `${pc.settings.gameName} · ${pc.settings.tourName}`.toUpperCase(), 1000, 34, 700);
  ctx.fillText(`${pc.settings.gameName} · ${pc.settings.tourName}`.toUpperCase(), W / 2, 300);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 96px Arial, sans-serif';
  ctx.fillText('СЕРТИФИКАТ', W / 2, 400);
  ctx.fillStyle = '#facc15';
  ctx.font = '800 56px Arial, sans-serif';
  ctx.fillText('«Покоритель вершины»', W / 2, 480);

  ctx.fillStyle = '#1e1b4b';
  fitText(ctx, nick, 1100, 88);
  ctx.fillText(nick, W / 2, 940);

  ctx.font = '800 48px Arial, sans-serif';
  ctx.fillStyle = '#c026d3';
  ctx.fillText(`Набранная высота: ${altitude.toLocaleString('ru-RU')} м из ${(pc.settings.stageMaxAltitude * pc.stages.length).toLocaleString('ru-RU')} м`, W / 2, 1030);
}

export async function downloadCertificate(nick: string, altitude: number) {
  const canvas = document.createElement('canvas');
  drawCertificate(canvas, nick, altitude);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error('Не удалось создать картинку сертификата.');
  const safe = nick.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40) || 'uchastnik';
  downloadBlob(blob, `sertifikat_${safe}.png`);
}
