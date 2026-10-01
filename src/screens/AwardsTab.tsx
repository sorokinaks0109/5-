// Сертификаты для награждения: организатор вводит имя и «за что», получает готовую картинку.
// Всё рисуется в браузере, имена нигде не сохраняются.
import { useEffect, useRef, useState } from 'react';
import { pc } from '../content.ts';
import { awardBlob, awardFileName, drawAward, type Medal } from '../lib/award.ts';
import { downloadBlob } from '../lib/export.ts';
import { useApp } from '../hooks.ts';

const game = pc.settings.gameName;

const PRESETS: { id: string; label: string; reason: string; medal: Medal }[] = [
  { id: '1', label: '1 место', reason: `1 место в рейтинге игры «${game}»`, medal: 'gold' },
  { id: '2', label: '2 место', reason: `2 место в рейтинге игры «${game}»`, medal: 'silver' },
  { id: '3', label: '3 место', reason: `3 место в рейтинге игры «${game}»`, medal: 'bronze' },
  { id: 'idea', label: 'Лучшая идея', reason: 'лучшее предложение по улучшению', medal: 'star' },
  { id: 'active', label: 'Активное участие', reason: `активное участие и высокий результат в игре «${game}»`, medal: 'star' },
  { id: 'own', label: 'Своя формулировка', reason: '', medal: 'star' },
];

const MEDALS: [Medal, string][] = [
  ['gold', 'Золото, цифра 1'],
  ['silver', 'Серебро, цифра 2'],
  ['bronze', 'Бронза, цифра 3'],
  ['star', 'Звезда'],
  ['none', 'Без медали'],
];

function today() {
  return new Date().toLocaleDateString('ru-RU');
}

function canShareFiles(): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([], 'a.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
}

export function AwardsTab() {
  const { error, info } = useApp();
  const [name, setName] = useState('');
  const [preset, setPreset] = useState('1');
  const [reason, setReason] = useState(PRESETS[0].reason);
  const [medal, setMedal] = useState<Medal>('gold');
  const [signer, setSigner] = useState('');
  const [signLine, setSignLine] = useState(true);
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const share = canShareFiles();

  const opts = { name, reason, medal, signer, signLine, date };

  useEffect(() => {
    if (canvas.current) drawAward(canvas.current, { name, reason, medal, signer, signLine, date }, 1240);
  }, [name, reason, medal, signer, signLine, date]);

  const pick = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    setPreset(id);
    setReason(p.reason);
    setMedal(p.medal);
  };

  const run = async (how: 'download' | 'share') => {
    if (!name.trim()) {
      info('Впишите, кого награждаем.');
      return;
    }
    setBusy(true);
    try {
      const blob = await awardBlob(opts);
      const file = awardFileName(name);
      if (how === 'share') {
        await navigator.share({ files: [new File([blob], file, { type: 'image/png' })], title: 'Сертификат' });
      } else {
        downloadBlob(blob, file);
      }
    } catch (e) {
      // отмена в окне «Поделиться» ошибкой не считаем
      if (!(e instanceof DOMException && e.name === 'AbortError')) error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>Сертификат для награждения</h2>
      <p className="small muted">
        Впишите имя и за что награждаем, картинка вверху меняется сразу. Имена нигде не сохраняются: сертификат создаётся прямо у вас
        в браузере.
      </p>
      <div className="award-preview">
        <canvas ref={canvas} aria-label="Предпросмотр сертификата" />
      </div>
      <div className="award-form">
        <label className="field">
          <span>Кого награждаем</span>
          <input type="text" value={name} maxLength={60} placeholder="Фамилия Имя Отчество" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>За что</span>
          <select value={preset} onChange={(e) => pick(e.target.value)}>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Текст после слова «за» (можно поправить)</span>
          <input type="text" value={reason} maxLength={110} placeholder="например, лучшее предложение по складу" onChange={(e) => setReason(e.target.value)} />
        </label>
        <label className="field">
          <span>Медаль</span>
          <select value={medal} onChange={(e) => setMedal(e.target.value as Medal)}>
            {MEDALS.map(([k, t]) => (
              <option key={k} value={k}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Кто подписывает (должность, по желанию)</span>
          <input type="text" value={signer} maxLength={50} placeholder="Руководитель дивизиона" onChange={(e) => setSigner(e.target.value)} />
        </label>
        <label className="field">
          <span>Дата (можно стереть или поменять)</span>
          <input type="text" value={date} maxLength={30} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="row" style={{ gap: 8 }}>
          <input type="checkbox" checked={signLine} onChange={(e) => setSignLine(e.target.checked)} />
          <span>Строка для подписи слева (для печати)</span>
        </label>
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <button className="btn" disabled={busy || !name.trim()} onClick={() => run('download')}>
            Скачать PNG
          </button>
          {share && (
            <button className="btn btn-ghost" disabled={busy || !name.trim()} onClick={() => run('share')}>
              Отправить
            </button>
          )}
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          PNG для печати на А4 (альбомный лист, 300 точек на дюйм). Кнопка «Отправить» открывает список мессенджеров, если телефон это
          позволяет.
        </p>
      </div>
    </div>
  );
}
