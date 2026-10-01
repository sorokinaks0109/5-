// Сертификат для награждения: имя и «за что» вводит организатор. Рисуется на canvas прямо в браузере,
// ничего никуда не отправляется и не сохраняется.
import { pc } from '../content.ts';
import { badge, type BadgeColors } from './certificate.ts';

export type Medal = 'gold' | 'silver' | 'bronze' | 'star' | 'none';

export interface AwardOptions {
  name: string;
  /** Что стоит после слова «за» */
  reason: string;
  medal: Medal;
  /** Подпись под линией слева, например «Руководитель дивизиона» */
  signer: string;
  signLine: boolean;
  date: string;
}

/** Рисуем в условных единицах 1600 × 1131 (А4 альбомный), потом масштабируем под нужную ширину */
const BW = 1600;
const BH = (BW * 210) / 297;
/** 300 точек на дюйм для печати на А4 */
export const PRINT_WIDTH = 2480;

const CONFETTI = ['#fde047', '#38bdf8', '#ffffff', '#22d3ee', '#60a5fa', '#bae6fd', '#facc15'];

/** Эмблема на синем: золотое кольцо и тёмно-синяя середина */
const BADGE: BadgeColors = { ring: ['#fef08a', '#facc15', '#f59e0b'], core: '#0a2a66', text: '#0a2a66' };

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function poly(ctx: CanvasRenderingContext2D, pts: number[][], fill: string | CanvasGradient) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
}

function spaced(ctx: CanvasRenderingContext2D, px: string) {
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = px;
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, start: number, weight = 900) {
  let size = start;
  do {
    ctx.font = `${weight} ${size}px Arial, sans-serif`;
    size -= 2;
  } while (ctx.measureText(text).width > maxWidth && size > 28);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function medalShape(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, medal: Exclude<Medal, 'none'>) {
  const pal = {
    gold: ['#fef9c3', '#f59e0b', '#7c2d12'],
    star: ['#fef9c3', '#f59e0b', '#7c2d12'],
    silver: ['#ffffff', '#94a3b8', '#1e293b'],
    bronze: ['#ffedd5', '#c2410c', '#431407'],
  }[medal];
  ctx.save();
  ctx.shadowColor = 'rgba(6,26,69,0.55)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 8;
  // зубчатый край
  const n = 28;
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const rad = i % 2 ? r * 0.9 : r;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, pal[0]);
  g.addColorStop(0.5, pal[1]);
  g.addColorStop(1, pal[0]);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  // внутренний круг
  ctx.save();
  const g2 = ctx.createLinearGradient(cx - r, cy + r, cx + r, cy - r);
  g2.addColorStop(0, pal[0]);
  g2.addColorStop(0.6, pal[1]);
  g2.addColorStop(1, pal[0]);
  ctx.fillStyle = g2;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = r * 0.05;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = pal[2];
  if (medal === 'star') {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 ? r * 0.23 : r * 0.5;
      const x = cx + Math.cos(a) * rad;
      const y = cy + Math.sin(a) * rad + r * 0.03;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.font = `900 ${r * 0.95}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(medal === 'gold' ? '1' : medal === 'silver' ? '2' : '3', cx, cy + r * 0.04);
  }
  ctx.restore();
}

export function drawAward(canvas: HTMLCanvasElement, o: AwardOptions, width = PRINT_WIDTH) {
  canvas.width = width;
  canvas.height = Math.round((width * 210) / 297);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(width / BW, width / BW);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  spaced(ctx, '0px');

  // небо
  const sky = ctx.createLinearGradient(0, 0, 0, BH);
  sky.addColorStop(0, '#061a45');
  sky.addColorStop(0.42, '#0b3d94');
  sky.addColorStop(0.78, '#1479d4');
  sky.addColorStop(1, '#5cc8f7');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, BW, BH);

  // северное сияние
  const aur = ctx.createLinearGradient(0, 0, BW, 0);
  aur.addColorStop(0, 'rgba(34,211,238,0)');
  aur.addColorStop(0.5, 'rgba(45,212,191,0.4)');
  aur.addColorStop(1, 'rgba(34,211,238,0)');
  ctx.fillStyle = aur;
  ctx.beginPath();
  ctx.moveTo(0, 470);
  ctx.bezierCurveTo(400, 330, 800, 560, 1200, 380);
  ctx.bezierCurveTo(1400, 310, 1500, 370, BW, 350);
  ctx.lineTo(BW, 420);
  ctx.bezierCurveTo(1300, 450, 900, 570, 600, 510);
  ctx.bezierCurveTo(300, 450, 150, 510, 0, 550);
  ctx.fill();
  ctx.fillStyle = 'rgba(125,211,252,0.28)';
  ctx.beginPath();
  ctx.moveTo(0, 250);
  ctx.bezierCurveTo(300, 170, 700, 300, 1000, 200);
  ctx.bezierCurveTo(1250, 130, 1450, 190, BW, 160);
  ctx.lineTo(BW, 215);
  ctx.bezierCurveTo(1400, 245, 1200, 190, 950, 255);
  ctx.bezierCurveTo(650, 335, 300, 220, 0, 305);
  ctx.fill();

  // звёзды
  const r1 = rng(7);
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.35 + r1() * 0.6})`;
    ctx.beginPath();
    ctx.arc(60 + r1() * (BW - 120), 50 + r1() * 560, 1 + r1() * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // горы: дальние, средние со снежными шапками, передние
  poly(ctx, [[0, BH], [0, 880], [220, 750], [430, 850], [700, 770], [1000, 870], [1300, 720], [BW, 860], [BW, BH]], 'rgba(147,197,253,0.55)');
  poly(ctx, [[0, BH], [0, 950], [260, 850], [520, 950], [800, 920], [1080, 950], [1340, 845], [BW, 950], [BW, BH]], '#1d4ed8');
  poly(ctx, [[260, 850], [232, 884], [252, 876], [262, 892], [276, 874], [292, 882]], '#ffffff');
  poly(ctx, [[1340, 845], [1310, 882], [1330, 874], [1342, 892], [1356, 872], [1374, 882]], '#ffffff');
  poly(ctx, [[0, BH], [0, 1020], [400, 990], [800, 1010], [1200, 985], [BW, 1020], [BW, BH]], '#061a45');

  // флажок на правой вершине, ниже текста
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(1340, 846);
  ctx.lineTo(1340, 800);
  ctx.stroke();
  poly(ctx, [[1342, 800], [1384, 813], [1342, 826]], '#facc15');

  // рамка
  const gold = ctx.createLinearGradient(0, 0, BW, BH);
  gold.addColorStop(0, '#fde68a');
  gold.addColorStop(0.5, '#ffffff');
  gold.addColorStop(1, '#7dd3fc');
  ctx.strokeStyle = gold;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.roundRect(32, 32, BW - 64, BH - 64, 30);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(52, 52, BW - 104, BH - 104, 20);
  ctx.stroke();

  // конфетти по краям
  const r2 = rng(21);
  for (let i = 0; i < 90; i++) {
    const x = 70 + r2() * (BW - 140);
    const y = 70 + r2() * 640;
    const inText = x > 230 && x < 1370 && y > 60 && y < 900;
    const rot = r2() * Math.PI;
    const color = CONFETTI[Math.floor(r2() * CONFETTI.length)];
    const sz = 8 + r2() * 14;
    const round = r2() > 0.55;
    if (inText) continue;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    if (round) {
      ctx.beginPath();
      ctx.arc(0, 0, sz / 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else ctx.fillRect(-sz / 2, -sz / 4, sz, sz / 2);
    ctx.restore();
  }

  // шапка
  badge(ctx, BW / 2, 140, 85, BADGE);
  ctx.fillStyle = '#dbeafe';
  ctx.font = '800 30px Arial, sans-serif';
  spaced(ctx, '6px');
  ctx.fillText(pc.settings.gameName.toUpperCase(), BW / 2, 278);
  ctx.fillStyle = '#bfdbfe';
  ctx.font = '600 27px Arial, sans-serif';
  spaced(ctx, '1px');
  ctx.fillText(pc.settings.tourName, BW / 2, 316);

  // СЕРТИФИКАТ
  ctx.save();
  ctx.shadowColor = 'rgba(6,26,69,0.6)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 7;
  const tg = ctx.createLinearGradient(0, 340, 0, 440);
  tg.addColorStop(0, '#ffffff');
  tg.addColorStop(1, '#fde68a');
  ctx.fillStyle = tg;
  ctx.font = '900 122px Arial, sans-serif';
  spaced(ctx, '10px');
  ctx.fillText('СЕРТИФИКАТ', BW / 2 + 5, 440);
  ctx.restore();
  spaced(ctx, '0px');
  const stripe = ctx.createLinearGradient(BW / 2 - 270, 0, BW / 2 + 270, 0);
  stripe.addColorStop(0, '#facc15');
  stripe.addColorStop(0.5, '#ffffff');
  stripe.addColorStop(1, '#38bdf8');
  ctx.fillStyle = stripe;
  ctx.beginPath();
  ctx.roundRect(BW / 2 - 270, 464, 540, 9, 5);
  ctx.fill();

  ctx.fillStyle = '#bae6fd';
  ctx.font = '700 38px Arial, sans-serif';
  spaced(ctx, '8px');
  ctx.fillText('НАГРАЖДАЕТСЯ', BW / 2 + 4, 548);
  spaced(ctx, '0px');

  // имя
  const name = o.name.trim();
  ctx.save();
  ctx.shadowColor = 'rgba(6,26,69,0.7)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = name ? '#fde047' : 'rgba(253,224,71,0.45)';
  fit(ctx, name || 'Фамилия Имя Отчество', 1200, 112);
  const shown = name || 'Фамилия Имя Отчество';
  ctx.fillText(shown, BW / 2, 672);
  const nameW = ctx.measureText(shown).width;
  ctx.restore();
  const lineW = Math.max(620, Math.min(1300, nameW + 140));
  const ug = ctx.createLinearGradient(BW / 2 - lineW / 2, 0, BW / 2 + lineW / 2, 0);
  ug.addColorStop(0, 'rgba(250,204,21,0)');
  ug.addColorStop(0.5, '#fde047');
  ug.addColorStop(1, 'rgba(250,204,21,0)');
  ctx.fillStyle = ug;
  ctx.fillRect(BW / 2 - lineW / 2, 698, lineW, 4);

  // за что
  const reason = o.reason.trim().replace(/^за\s+/i, '');
  if (reason) {
    ctx.fillStyle = '#ffffff';
    let size = 54;
    let lines: string[] = [];
    // сначала пробуем уложиться в две строки, крупнее, потом три помельче
    for (const sz of [54, 50, 46, 42, 38, 34]) {
      size = sz;
      ctx.font = `700 ${size}px Arial, sans-serif`;
      lines = wrap(ctx, `за ${reason}`, 1180);
      if (lines.length <= (sz >= 38 ? 2 : 3)) break;
    }
    lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, BW / 2, 776 + i * (size + 10)));
  }

  // медаль
  if (o.medal !== 'none') medalShape(ctx, BW / 2, 985, 72, o.medal);

  // подпись и дата
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2.5;
  if (o.signLine) {
    ctx.beginPath();
    ctx.moveTo(170, 1030);
    ctx.lineTo(560, 1030);
    ctx.stroke();
    ctx.font = '600 24px Arial, sans-serif';
    ctx.fillStyle = '#dbeafe';
    ctx.fillText(o.signer.trim() || 'подпись', 365, 1062);
  }
  ctx.beginPath();
  ctx.moveTo(1040, 1030);
  ctx.lineTo(1430, 1030);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 34px Arial, sans-serif';
  ctx.fillText(o.date.trim(), 1235, 1020);
  ctx.font = '600 24px Arial, sans-serif';
  ctx.fillStyle = '#dbeafe';
  ctx.fillText('дата', 1235, 1062);
}

export async function awardBlob(o: AwardOptions): Promise<Blob> {
  const canvas = document.createElement('canvas');
  drawAward(canvas, o);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error('Не удалось создать картинку сертификата.');
  return blob;
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Имя файла латиницей: русские буквы в именах файлов некоторые браузеры теряют */
export function awardFileName(name: string): string {
  const latin = [...name.trim().toLowerCase()].map((c) => TRANSLIT[c] ?? c).join('');
  const safe = latin.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'award';
  return `sertifikat_${safe}.png`;
}
