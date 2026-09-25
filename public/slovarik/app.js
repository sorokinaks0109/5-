/* Школьный словарик: выбор класса, запоминание, истории, тренировка. */
(function () {
  'use strict';

  // ---------- Хранение ----------
  const KEY = 'slovarik:v1';
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && typeof s === 'object') return s;
    } catch (e) { /* хранилище недоступно — работаем без него */ }
    return null;
  }
  const S = Object.assign({ grade: 1, selected: {}, stats: {}, mine: {}, stories: [], custom: {}, stars: 0, best: {} }, load() || {});
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ничего */ }
  }

  // ---------- Разбор слов ----------
  const VOWEL_ALTS = { о: ['о', 'а'], а: ['а', 'о'], е: ['е', 'и', 'я'], и: ['и', 'е'], я: ['я', 'е', 'и'], ё: ['ё', 'о'], э: ['э', 'е'], у: ['у', 'ю'], ы: ['ы', 'и'] };
  const PAIRS = { б: 'п', п: 'б', в: 'ф', ф: 'в', г: 'к', к: 'г', д: 'т', т: 'д', ж: 'ш', ш: 'ж', з: 'с', с: 'з' };
  const VOWELS = 'аеёиоуыэюя';

  function defaultAlts(t) {
    const low = t.toLowerCase();
    let alts;
    if (VOWEL_ALTS[low]) alts = VOWEL_ALTS[low];
    else if (low.length === 2 && low[0] === low[1]) alts = [low, low[0]];
    else if (PAIRS[low]) alts = [low, PAIRS[low]];
    else alts = [low];
    return t !== low ? alts.map((a) => a.toUpperCase()) : alts.slice();
  }

  /** «к[о]р[о]ва» → части слова; трудные части помечены t: true. */
  function parseMarked(src) {
    const parts = [];
    let buf = '';
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (ch === '[') {
        const end = src.indexOf(']', i);
        if (end < 0) { buf += ch; continue; }
        if (buf) { parts.push({ s: buf, t: false }); buf = ''; }
        const inner = src.slice(i + 1, end);
        if (inner.includes('|')) {
          const alts = inner.split('|');
          parts.push({ s: alts[0], t: true, alts, explicit: true });
        } else {
          parts.push({ s: inner, t: true, alts: defaultAlts(inner) });
        }
        i = end;
      } else buf += ch;
    }
    if (buf) parts.push({ s: buf, t: false });
    return parts;
  }

  function parseLine(line) {
    let [marked, emoji, hint, flag] = splitFields(line);
    // Уточнение в скобках: «пр[е|и]бывать (на работе)».
    let note = '';
    const nm = marked.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (nm) { marked = nm[1]; note = nm[2]; }
    const parts = parseMarked(marked);
    const id = parts.map((p) => p.s).join('');
    // Последнее поле: «н» — не предмет; «д: ~ торт» — действие для историй; «п: ~ крокодил» — признак с предметом.
    let kind = 'noun', phrase = '';
    const fm = (flag || '').trim().match(/^([ндп])\s*(?::\s*(.*))?$/i);
    if (fm) {
      const k = fm[1].toLowerCase();
      kind = k === 'д' ? 'verb' : k === 'п' ? 'noun' : 'other';
      if (fm[2]) phrase = fm[2].replace('~', marked);
    }
    return { id, marked, note, parts, emoji: emoji || '📘', hint: hint || '', noun: kind === 'noun', kind, phrase };
  }
  // Разделитель полей — « | » с пробелами, чтобы не путать с «[в|]» внутри слова.
  function splitFields(line) {
    return line.split(/\s+\|\s+|\s+\|$/).map((s) => s.trim());
  }

  function parseList(text) {
    return String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).map(parseLine);
  }

  const BUILTIN = {};
  const WORD_SRC = window.SLOVARIK_WORDS || {};
  Object.keys(WORD_SRC).forEach((g) => { BUILTIN[g] = parseList(WORD_SRC[g]); });
  const GRADES = Object.keys(BUILTIN).sort((a, b) => a - b);

  function gradeWords(g) {
    const custom = (S.custom[g] || []).map(parseLine);
    const all = (BUILTIN[g] || []).concat(custom);
    const seen = new Set();
    return all.filter((w) => (seen.has(w.id) ? false : seen.add(w.id)))
      .sort((a, b) => a.id.localeCompare(b.id, 'ru'));
  }
  function words() { return gradeWords(S.grade); }
  function byId(id) { return words().find((w) => w.id === id); }
  function selectedIds() {
    const all = new Set(words().map((w) => w.id));
    return (S.selected[S.grade] || []).filter((id) => all.has(id));
  }
  function selectedWords() { return selectedIds().map(byId).filter(Boolean); }

  // ---------- Прогресс ----------
  function stat(id) { return S.stats[id] || { s: 0, ok: 0, bad: 0 }; }
  function status(id) {
    const st = stat(id);
    if (st.s >= 3) return 'learned';
    if (st.ok + st.bad > 0) return 'learning';
    return 'new';
  }
  function record(id, ok) {
    const st = Object.assign({ s: 0, ok: 0, bad: 0 }, S.stats[id]);
    if (ok) { st.ok++; st.s++; } else { st.bad++; st.s = 0; }
    S.stats[id] = st;
    save();
  }

  // ---------- Помощники ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const norm = (s) => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[\s ]+/g, ' ').trim();
  const plural = (n, one, few, many) => {
    const a = n % 10, b = n % 100;
    return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
  };

  function marked(parts) {
    return parts.map((p) => (p.t ? `<span class="t">${esc(p.s)}</span>` : esc(p.s))).join('');
  }
  /** Текст с разметкой [о] → HTML с красными буквами. */
  function markedText(src) { return marked(parseMarked(src)); }

  function chars(w) {
    const out = [];
    w.parts.forEach((p) => { for (const ch of p.s) out.push({ ch, t: p.t }); });
    return out;
  }

  /** Деление на слоги для проговаривания «как пишется». */
  function syllables(w) {
    const cs = chars(w);
    const pieces = [];
    let start = 0;
    const isV = (i) => cs[i] && VOWELS.includes(cs[i].ch.toLowerCase());
    const low = (i) => (cs[i] ? cs[i].ch.toLowerCase() : '');
    const vs = [];
    cs.forEach((c, i) => { if (c.ch === ' ') vs.push(-i - 1); else if (isV(i)) vs.push(i); });
    for (let k = 0; k < vs.length - 1; k++) {
      const v1 = vs[k], v2 = vs[k + 1];
      if (v1 < 0 || v2 < 0) continue;
      const between = [];
      for (let i = v1 + 1; i < v2; i++) between.push(i);
      if (between.some((i) => cs[i].ch === ' ')) continue;
      let cut;
      const n = between.length;
      if (n === 0) cut = v1 + 1;
      else if (n === 1) cut = 'йьъ'.includes(low(v1 + 1)) ? v1 + 2 : v1 + 1;
      else if (low(v1 + 1) === 'й') cut = v1 + 2;
      else if ('ьъ'.includes(low(v1 + 2))) cut = v1 + 3;
      else if (low(v1 + 1) === low(v1 + 2)) cut = v1 + 2;
      else if ('рлмн'.includes(low(v1 + 1))) cut = v1 + 2;
      else cut = v1 + 1;
      pieces.push(cs.slice(start, cut));
      start = cut;
    }
    pieces.push(cs.slice(start));
    return pieces
      .map((p) => p.map((c) => (c.ch === ' ' ? ' ' : c.t ? `<span class="t">${esc(c.ch)}</span>` : esc(c.ch))).join(''))
      .join(' · ');
  }

  const LETTER_TIPS = {
    О: 'О круглая, как бублик, мяч и колесо. Представь её в слове толстой и румяной.',
    А: 'А похожа на домик с острой крышей или шалаш. В слове стоит маленький домик.',
    Е: 'Е — как расчёска с тремя зубчиками. Причеши ею слово!',
    И: 'И — как лесенка с косой ступенькой. По ней в слово забирается мышка.',
    Я: 'Я — буква-хвастунишка: «Я! Я! Я!» Всегда хочет, чтобы её заметили.',
    Э: 'Э — как ухо: прислушивается, чтобы её не перепутали с Е.',
    Ё: 'У Ё две точки — как два глаза.',
    У: 'У — как рогатка.',
  };
  const isDouble = (a) => a.length === 2 && a[0].toLowerCase() === a[1].toLowerCase();
  function groupOf(p, i, w) {
    const s = p.s;
    if (p.explicit && i === 1 && w.parts[0].s.toLowerCase() === 'пр' && /^[еи]$/i.test(s)) {
      return s.toLowerCase() === 'е' ? {
        key: 'ПРЕ', mark: 'пре', title: 'Приставка ПРЕ-', song: 'приставку ПРЕ',
        tip: 'ПРЕ- значит «очень» (премилый = очень милый) или «пере-» (превратить = переделать, прекратить = перестать). Если можно заменить на «очень» или «пере-» — пишем ПРЕ. Ещё есть слова, которые надо просто запомнить: предмет, премьера, препятствие.',
      } : {
        key: 'ПРИ', mark: 'при', title: 'Приставка ПРИ-', song: 'приставку ПРИ',
        tip: 'ПРИ- значит: приближение (прибыть, прийти), присоединение (пришить, приклеить), близость (пришкольный) или неполное действие (приоткрыть, притворить дверь). Всё, что «пришло поближе», — это ПРИ.',
      };
    }
    if (p.alts && p.alts.includes('')) return { key: 'тихие', mark: '★', title: 'Тихие буквы', song: 'тихие буквы', tip: 'Эта буква тихоня: её не слышно, но она есть. Произнеси слово по слогам так, как пишется.' };
    if (isDouble(s) || (p.alts && p.alts.some(isDouble))) return { key: 'двойные', mark: 'нн', title: 'Одна или две буквы?', song: 'двойные буквы', tip: 'Посчитай буквы: одна или две? Двойные стоят рядом, как близнецы, — не разлучай их. А одиночку не удваивай.' };
    const L = s.toUpperCase();
    if (VOWELS.includes(s.toLowerCase())) return { key: L, mark: L, title: 'Буква ' + L, song: 'букву ' + L, tip: LETTER_TIPS[L] || '' };
    return { key: 'согласные', mark: '★', title: 'Хитрые согласные', song: 'хитрые согласные', tip: 'Проговори слово так, как пишется, чётко выговаривая эту букву.' };
  }
  function groupsOf(w) {
    const m = new Map();
    w.parts.forEach((p, i) => { if (p.t) { const g = groupOf(p, i, w); m.set(g.key, g); } });
    return [...m.values()];
  }
  const noteHtml = (w) => (w.note ? ` <small class="muted">(${esc(w.note)})</small>` : '');

  // ---------- Рисунки (хранятся в IndexedDB этого браузера) ----------
  const PICS = new Map();
  let picDb = null;
  function openPicDb() {
    return new Promise((resolve) => {
      try {
        const r = indexedDB.open('slovarik', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('pics');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }
  openPicDb().then((db) => {
    picDb = db;
    if (!db) return;
    try {
      const req = db.transaction('pics').objectStore('pics').openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (c) { PICS.set(c.key, c.value); c.continue(); } else if (PICS.size && !V.draw) render();
      };
    } catch (e) { /* без рисунков */ }
  });
  function putPic(id, data) {
    PICS.set(id, data);
    try { if (picDb) picDb.transaction('pics', 'readwrite').objectStore('pics').put(data, id); } catch (e) { /* ничего */ }
  }
  function delPic(id) {
    PICS.delete(id);
    try { if (picDb) picDb.transaction('pics', 'readwrite').objectStore('pics').delete(id); } catch (e) { /* ничего */ }
  }
  /** Картинка слова: рисунок ребёнка, если есть, иначе эмодзи. */
  const pic = (w) => (PICS.has(w.id) ? `<img class="drawn" src="${PICS.get(w.id)}" alt="">` : w.emoji);
  const thumb = (w) => (PICS.has(w.id) ? `<img class="thumb" src="${PICS.get(w.id)}" alt="">` : `<span class="e" aria-hidden="true">${w.emoji}</span>`);

  // ---------- Звёзды и конфетти ----------
  function addStars(n) {
    if (n <= 0) return;
    S.stars = (S.stars || 0) + n; save();
    const el = document.getElementById('starCount');
    if (el) { el.textContent = S.stars; el.parentElement.classList.remove('pop'); void el.offsetWidth; el.parentElement.classList.add('pop'); }
  }
  function confetti() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = document.createElement('div');
    box.className = 'confetti';
    const bits = ['⭐', '🎉', '✨', '💫', '🌟', '🎈'];
    for (let i = 0; i < 22; i++) {
      const b = document.createElement('span');
      b.textContent = bits[i % bits.length];
      const ang = Math.random() * Math.PI * 2, dist = 90 + Math.random() * 160;
      b.style.setProperty('--x', Math.cos(ang) * dist + 'px');
      b.style.setProperty('--y', Math.sin(ang) * dist - 60 + 'px');
      b.style.animationDelay = Math.random() * 0.15 + 's';
      box.appendChild(b);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 1600);
  }

  // ---------- Коты-реакции ----------
  // Мультяшный кот рисуется кодом: мех, глаза, рот и «аксессуар» меняются.
  function catSvg(o) {
    const fur = o.fur, ink = '#2b2320';
    const eyes = {
      happy: `<path d="M36 60 q8 -9 16 0 M68 60 q8 -9 16 0" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
      shock: `<circle cx="44" cy="58" r="10" fill="#fff" stroke="${ink}" stroke-width="2"/><circle cx="76" cy="58" r="10" fill="#fff" stroke="${ink}" stroke-width="2"/><circle cx="44" cy="58" r="3.5" fill="${ink}"/><circle cx="76" cy="58" r="3.5" fill="${ink}"/>`,
      heart: `<path d="M44 66 l-8 -8 a4.5 4.5 0 0 1 8 -5 a4.5 4.5 0 0 1 8 5z M76 66 l-8 -8 a4.5 4.5 0 0 1 8 -5 a4.5 4.5 0 0 1 8 5z" fill="#e8344a"/>`,
      cool: `<path d="M30 54 h26 v8 q-2 8 -13 8 q-11 0 -13 -8z M64 54 h26 v8 q-2 8 -13 8 q-11 0 -13 -8z M56 57 h8" fill="${ink}" stroke="${ink}" stroke-width="3"/><path d="M36 58 l6 -2" stroke="#fff" stroke-width="2"/>`,
      cry: `<path d="M36 58 q8 7 16 0 M68 58 q8 7 16 0" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M40 64 q-4 10 0 14 q4 -4 0 -14z M80 64 q-4 10 0 14 q4 -4 0 -14z" fill="#5ab4f0"/>`,
      side: `<path d="M34 58 h20 M66 58 h20" stroke="${ink}" stroke-width="3" stroke-linecap="round"/><circle cx="50" cy="61" r="3.5" fill="${ink}"/><circle cx="82" cy="61" r="3.5" fill="${ink}"/>`,
      star: `<path d="M44 49 l3 7 7 1 -5 5 1 7 -6 -3 -6 3 1 -7 -5 -5 7 -1z M76 49 l3 7 7 1 -5 5 1 7 -6 -3 -6 3 1 -7 -5 -5 7 -1z" fill="#f5c211" stroke="${ink}" stroke-width="1.5"/>`,
    }[o.eyes];
    const mouth = {
      w: `<path d="M50 80 q5 6 10 0 q5 6 10 0" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
      grin: `<path d="M48 78 q12 16 24 0z" fill="#8a1c24" stroke="${ink}" stroke-width="2.5"/><path d="M54 84 q6 5 12 0" fill="#f28ba0"/>`,
      o: `<ellipse cx="60" cy="84" rx="6" ry="8" fill="#8a1c24" stroke="${ink}" stroke-width="2.5"/>`,
      flat: `<path d="M52 83 h16" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`,
      frown: `<path d="M50 86 q10 -9 20 0" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    }[o.mouth];
    const extra = {
      none: '',
      thumb: `<g transform="translate(92 86)"><rect x="-10" y="-2" width="20" height="18" rx="7" fill="${fur}" stroke="${ink}" stroke-width="2.5"/><rect x="-6" y="-16" width="9" height="18" rx="4.5" fill="${fur}" stroke="${ink}" stroke-width="2.5"/></g>`,
      hat: `<path d="M60 4 l14 30 h-28z" fill="#8e44ad" stroke="${ink}" stroke-width="2.5"/><circle cx="60" cy="4" r="5" fill="#f5c211" stroke="${ink}" stroke-width="2"/><path d="M52 22 l6 3 M64 16 l5 4" stroke="#f5c211" stroke-width="3"/>`,
      sweat: `<path d="M92 38 q-6 10 0 14 q6 -4 0 -14z" fill="#5ab4f0" stroke="${ink}" stroke-width="1.5"/>`,
      q: `<text x="96" y="30" font-size="30" font-weight="900" fill="#2451c7" font-family="Nunito, sans-serif">?</text>`,
      crown: `<path d="M40 30 l6 -18 8 12 6 -16 6 16 8 -12 6 18z" fill="#f5c211" stroke="${ink}" stroke-width="2.5"/>`,
      paws: `<ellipse cx="38" cy="96" rx="11" ry="8" fill="${fur}" stroke="${ink}" stroke-width="2.5"/><ellipse cx="82" cy="96" rx="11" ry="8" fill="${fur}" stroke="${ink}" stroke-width="2.5"/>`,
    }[o.extra || 'none'];
    const stripes = o.stripes ? `<path d="M52 36 q8 4 16 0 M50 44 q10 4 20 0" stroke="${o.stripes}" stroke-width="4" fill="none" stroke-linecap="round"/>` : '';
    return `<svg viewBox="0 0 120 112" width="100%" height="100%" aria-hidden="true">
      <path d="M22 50 L26 10 L52 32z M98 50 L94 10 L68 32z" fill="${fur}" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M29 38 L31 20 L43 32z M91 38 L89 20 L77 32z" fill="#f4a6b8"/>
      <ellipse cx="60" cy="66" rx="42" ry="36" fill="${fur}" stroke="${ink}" stroke-width="3"/>
      ${stripes}${eyes}
      <path d="M56 70 h8 l-4 5z" fill="#f28ba0" stroke="${ink}" stroke-width="1.5" stroke-linejoin="round"/>
      ${mouth}
      <path d="M14 70 l22 3 M14 80 l22 -2 M106 70 l-22 3 M106 80 l-22 -2" stroke="${ink}" stroke-width="2" stroke-linecap="round"/>
      ${extra}</svg>`;
  }
  const GINGER = { fur: '#f5a54a', stripes: '#d77a1c' }, GREY = { fur: '#b8c0cc', stripes: '#8b94a3' }, WHITE = { fur: '#fbf7f0' }, BLACK = { fur: '#4a4a52' };
  const CATS_GOOD = [
    ['КОТ ОДОБРЯЕТ', { ...GINGER, eyes: 'happy', mouth: 'w', extra: 'thumb' }],
    ['МУРР-ВЕЛИКОЛЕПНО', { ...WHITE, eyes: 'heart', mouth: 'w' }],
    ['ПЯТЁРКА С ЛАПКОЙ', { ...GREY, eyes: 'star', mouth: 'grin', extra: 'paws' }],
    ['ТЫ ГЕНИЙ, ЧЕЛОВЕК', { ...BLACK, eyes: 'cool', mouth: 'w' }],
    ['ВЕЧЕРИНКА В ЧЕСТЬ ТЕБЯ', { ...GINGER, eyes: 'happy', mouth: 'grin', extra: 'hat' }],
    ['КОРОЛЬ СЛОВАРЯ', { ...GREY, eyes: 'happy', mouth: 'w', extra: 'crown' }],
    ['Я ГОРЖУСЬ ТОБОЙ', { ...WHITE, eyes: 'cry', mouth: 'w' }],
  ];
  const CATS_BAD = [
    ['КОТ В ШОКЕ', { ...WHITE, eyes: 'shock', mouth: 'o' }],
    ['ЭТО ЧТО СЕЙЧАС БЫЛО?', { ...GINGER, eyes: 'side', mouth: 'flat', extra: 'q' }],
    ['НУ ТАКОЕ…', { ...GREY, eyes: 'side', mouth: 'frown', extra: 'sweat' }],
    ['КОТ ПЛАЧЕТ ГОРЬКО', { ...BLACK, eyes: 'cry', mouth: 'frown' }],
    ['ДАВАЙ ЕЩЁ РАЗ, Я ВЕРЮ', { ...GINGER, eyes: 'happy', mouth: 'flat', extra: 'paws' }],
    ['ХМ… ПОДУМАЙ', { ...WHITE, eyes: 'side', mouth: 'flat', extra: 'q' }],
  ];
  const ownReacts = (kind) => [...PICS.keys()].filter((k) => k.startsWith('react:' + kind + ':'));
  let reactTimer = 0;
  function react(ok) {
    if (S.cats === false) return;
    const kind = ok ? 'good' : 'bad';
    const own = ownReacts(kind);
    const set = ok ? CATS_GOOD : CATS_BAD;
    let img, cap;
    if (own.length && Math.random() < 0.6) {
      img = `<img src="${PICS.get(own[Math.floor(Math.random() * own.length)])}" alt="">`;
      cap = set[Math.floor(Math.random() * set.length)][0];
    } else {
      const [c, o] = set[Math.floor(Math.random() * set.length)];
      img = catSvg(o); cap = c;
    }
    let el = document.getElementById('react');
    if (!el) { el = document.createElement('div'); el.id = 'react'; document.body.appendChild(el); }
    el.className = 'react ' + kind;
    el.innerHTML = `<div class="rimg">${img}</div><div class="rcap">${esc(cap)}</div>`;
    el.hidden = false;
    void el.offsetWidth; el.classList.add('show');
    clearTimeout(reactTimer);
    reactTimer = setTimeout(() => { el.classList.remove('show'); setTimeout(() => { el.hidden = true; }, 300); }, 1900);
  }
  function loadReact(file, kind) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = 300; c.height = 300;
        const x = c.getContext('2d');
        const k = Math.max(300 / img.width, 300 / img.height);
        x.fillStyle = '#fff'; x.fillRect(0, 0, 300, 300);
        x.drawImage(img, (300 - img.width * k) / 2, (300 - img.height * k) / 2, img.width * k, img.height * k);
        putPic('react:' + kind + ':' + Date.now(), c.toDataURL('image/jpeg', 0.8));
        render(); react(kind === 'good');
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  // ---------- Озвучка ----------
  let ruVoice = null;
  function pickVoice() {
    if (!('speechSynthesis' in window)) return;
    const vs = window.speechSynthesis.getVoices() || [];
    ruVoice = vs.find((v) => /^ru/i.test(v.lang)) || null;
  }
  if ('speechSynthesis' in window) {
    pickVoice();
    window.speechSynthesis.onvoiceschanged = () => { const had = !!ruVoice; pickVoice(); if (!had && ruVoice) render(); };
  }
  const canSpeak = () => !!ruVoice;
  function speak(text) {
    if (!canSpeak()) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ru-RU'; u.voice = ruVoice; u.rate = 0.8;
      window.speechSynthesis.speak(u);
    } catch (e) { /* без звука */ }
  }

  // ---------- Состояние экрана ----------
  const V = { tab: 'words', learn: 0, train: null, story: {}, excl: {}, theme: 'any', draft: '', trainSet: 'selected', draw: null, bolt: null };
  const app = document.getElementById('app');
  const tabs = document.getElementById('tabs');
  const toastEl = document.getElementById('toast');
  let toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2200);
  }

  const TABS = [
    ['words', '📚', 'Слова'],
    ['learn', '💡', 'Запоминаю'],
    ['stories', '😂', 'Истории'],
    ['train', '✍️', 'Тренировка'],
  ];

  function header() {
    return `<header class="top">
      <div class="row" style="gap:12px"><h1 class="logo">Слов<b>а</b>рик</h1><span class="stars" title="Звёзды за успехи">⭐ <b id="starCount">${S.stars || 0}</b></span></div>
      <div class="grades" role="group" aria-label="Класс">
        <span>Класс</span>
        ${GRADES.map((g) => `<button class="grade" data-act="grade" data-g="${g}" aria-pressed="${String(S.grade) === g}">${g}</button>`).join('')}
      </div>
    </header>`;
  }

  function render() {
    if (!BUILTIN[S.grade]) S.grade = GRADES[0];
    tabs.innerHTML = TABS.map(([id, ic, name]) =>
      `<button class="tab" data-act="tab" data-tab="${id}" ${V.tab === id ? 'aria-current="page"' : ''}><i aria-hidden="true">${ic}</i>${name}</button>`).join('');
    let body = '';
    if (V.draw && byId(V.draw)) body = viewDraw();
    else if (V.tab === 'words') body = viewWords();
    else if (V.tab === 'learn') body = viewLearn();
    else if (V.tab === 'stories') body = viewStories();
    else body = viewTrain();
    app.innerHTML = header() + body;
    if (V.draw && byId(V.draw)) setupCanvas();
    afterRender();
  }

  function needSelection(what) {
    return `<div class="panel empty">
      <div style="font-size:54px" aria-hidden="true">📝</div>
      <h2>Сначала выбери слова</h2>
      <p class="lead">${what} Отметь на вкладке «Слова» те слова, которые задали, или возьми 10 новых.</p>
      <div class="row" style="justify-content:center">
        <button class="btn" data-act="pick10">Взять 10 новых слов</button>
        <button class="btn ghost" data-act="tab" data-tab="words">Выбрать самому</button>
      </div>
    </div>`;
  }

  // ---------- Вкладка «Слова» ----------
  function viewWords() {
    const ws = words();
    const sel = new Set(selectedIds());
    const learned = ws.filter((w) => status(w.id) === 'learned').length;
    const custom = S.custom[S.grade] || [];
    return `
      <section class="row between">
        <div style="display:flex;flex-direction:column;gap:6px">
          <h2>Словарные слова · ${S.grade} класс</h2>
          <p class="lead">Нажми на слова, которые нужно выучить сейчас. Лучше брать по 5–10 штук.</p>
        </div>
      </section>
      <div class="stats">
        <div class="stat"><b>${ws.length}</b><span class="muted">${plural(ws.length, 'слово', 'слова', 'слов')} за год</span></div>
        <div class="stat sel"><b>${sel.size}</b><span class="muted">выбрано сейчас</span></div>
        <div class="stat ok"><b>${learned}</b><span class="muted">уже ${plural(learned, 'выучено', 'выучены', 'выучено')}</span></div>
      </div>
      <div class="row">
        <button class="btn" data-act="pick10">Взять 10 новых</button>
        <button class="btn ghost" data-act="clearSel" ${sel.size ? '' : 'disabled'}>Снять выбор</button>
        <button class="btn ghost" data-act="tab" data-tab="learn" ${sel.size ? '' : 'disabled'}>Учить выбранные →</button>
      </div>
      <div class="legend">
        <span><i style="background:var(--line)"></i>новое</span>
        <span><i style="background:var(--pencil)"></i>учу</span>
        <span><i style="background:var(--green)"></i>выучено (3 раза подряд без ошибок)</span>
      </div>
      <div class="words">
        ${ws.map((w) => `<button class="word" data-act="toggle" data-id="${esc(w.id)}" aria-pressed="${sel.has(w.id)}">
          ${thumb(w)}<span>${marked(w.parts)}${noteHtml(w)}</span><span class="dot ${status(w.id)}"></span>
        </button>`).join('')}
      </div>
      <details class="panel">
        <summary>Добавить слово, которого нет в списке</summary>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">
          <p class="muted" style="margin:0">Трудную букву возьми в квадратные скобки. Через « | » можно добавить картинку-эмодзи и подсказку.<br>Например: <b>в[о]кзал | 🚉 | На вокзале круглые часы — О</b></p>
          <input type="text" id="newWord" placeholder="к[о]р[о]ва | 🐄 | Корова мычит «Мо-о-о»" autocomplete="off" spellcheck="false">
          <div class="row"><button class="btn small" data-act="addWord">Добавить в ${S.grade} класс</button></div>
          ${custom.length ? `<div class="chips">${custom.map((c, i) => `<span class="chip">${marked(parseLine(c).parts)} <button class="btn small ghost" style="min-height:0;padding:0 6px;border:0" data-act="delWord" data-i="${i}" aria-label="Удалить">✕</button></span>`).join('')}</div>` : ''}
        </div>
      </details>
      <p class="muted">${+S.grade <= 4
        ? 'Списки взяты из словариков учебника «Русский язык» (УМК «Школа России»).'
        : +S.grade === 6
          ? 'Слова из орфографического словаря учебника «Русский язык. 6 класс» Ладыженской, Баранова, Тростенцовой (ФГОС, 2023).'
          : 'Черновой список по учебнику «Русский язык» Ладыженской, Баранова, Тростенцовой.'} Если в вашем учебнике другие слова, добавьте их выше.</p>`;
  }

  // ---------- Вкладка «Запоминаю» ----------
  function viewLearn() {
    const list = selectedWords();
    if (!list.length) return needSelection('Здесь каждое слово превращается в карточку с подсказкой.');
    if (V.learn >= list.length) V.learn = 0;
    const w = list[V.learn];
    const groups = groupsOf(w);
    return `
      <h2>Запоминаю слова</h2>
      <p class="lead">Посмотри на красную букву, прочитай подсказку и придумай свою. Своя подсказка запоминается лучше всего!</p>
      <article class="panel card">
        <div class="pic" aria-hidden="true">${pic(w)}</div>
        <div class="big">${marked(w.parts)}</div>
        ${w.note ? `<div class="muted">(${esc(w.note)})</div>` : ''}
        <div class="row" style="justify-content:center">
          ${canSpeak() ? `<button class="btn small ghost" data-act="say" data-text="${esc(w.id)}">🔊 Послушать</button>` : ''}
          <button class="btn small" data-act="draw" data-id="${esc(w.id)}">🎨 ${PICS.has(w.id) ? 'Перерисовать' : 'Нарисуй своё'}</button>
          ${PICS.has(w.id) ? `<button class="btn small ghost" data-act="unpic" data-id="${esc(w.id)}">Вернуть эмодзи</button>` : ''}
        </div>
        <div class="muted">Скажи по слогам так, как пишется:<br><b style="font-size:24px;color:var(--ink)">${syllables(w)}</b></div>
        ${w.hint ? `<div class="hint"><span class="label">Подсказка</span>${esc(w.hint)}</div>` : ''}
        ${groups.map((g) => g.tip ? `<div class="hint"><span class="label">${esc(g.title)}</span>${esc(g.tip)}</div>` : '').join('')}
        <label class="mine" for="mine">
          <span class="label">Моя подсказка или смешная картинка в голове</span>
          <textarea id="mine" data-id="${esc(w.id)}" placeholder="Например: корова в огромных круглых очках — О-О">${esc(S.mine[w.id] || '')}</textarea>
        </label>
      </article>
      <div class="dots">${list.map((x, i) => `<button data-act="learnGo" data-i="${i}" aria-label="${esc(x.id)}" aria-current="${i === V.learn}"></button>`).join('')}</div>
      <div class="row between">
        <button class="btn ghost" data-act="learnPrev" ${V.learn ? '' : 'disabled'}>← Назад</button>
        <span class="muted">${V.learn + 1} из ${list.length}</span>
        ${V.learn < list.length - 1
          ? '<button class="btn" data-act="learnNext">Дальше →</button>'
          : '<button class="btn" data-act="tab" data-tab="train">Проверить себя ✍️</button>'}
      </div>`;
  }

  // ---------- Рисование ----------
  const COLORS = ['#1d2b4f', '#d7322b', '#2451c7', '#22844d', '#f3c233', '#ff8a1f', '#8b5a2b', '#ff6fa5', '#8e44ad'];
  const SIZES = [['6', 'Тонко'], ['14', 'Средне'], ['30', 'Толсто']];
  const D = { color: COLORS[1], size: 14, eraser: false, undo: [], ghost: true, ctx: null, cv: null };

  function viewDraw() {
    const w = byId(V.draw);
    return `
      <section class="draw">
        <div class="row between"><h2>Нарисуй: <span class="big" style="font-size:30px">${marked(w.parts)}</span></h2>
          <button class="btn small ghost" data-dact="cancel">Отмена</button></div>
        <p class="lead">Преврати красную букву в часть рисунка: у коровы глаза-О, у карандаша острый кончик-А, у ёжика иголки-Е. Рисуй прямо поверх бледного слова — потом оно исчезнет, а буква останется в рисунке.</p>
        <div class="canvasWrap">
          <div class="ghostWord" id="ghostWord" ${D.ghost ? '' : 'hidden'}>${marked(w.parts)}</div>
          <canvas id="cv" width="600" height="600" aria-label="Холст для рисунка"></canvas>
        </div>
        <div class="palette" role="group" aria-label="Цвет">
          ${COLORS.map((c) => `<button class="swatch" data-dact="color" data-c="${c}" style="background:${c}" aria-label="Цвет" aria-pressed="${!D.eraser && D.color === c}"></button>`).join('')}
        </div>
        <div class="row" role="group" aria-label="Кисть">
          ${SIZES.map(([v, n]) => `<button class="chip" data-dact="size" data-s="${v}" aria-pressed="${String(D.size) === v}">${n}</button>`).join('')}
          <button class="chip" data-dact="eraser" aria-pressed="${D.eraser}">🧽 Ластик</button>
        </div>
        <div class="row">
          <button class="btn small ghost" data-dact="undo">↩️ Отменить</button>
          <button class="btn small ghost" data-dact="clear">🗑 Очистить</button>
          <button class="btn small ghost" data-dact="ghost">👁 Слово под рисунком</button>
          <label class="btn small ghost" for="photo" style="display:inline-flex;align-items:center">📷 Фото рисунка с бумаги</label>
          <input type="file" id="photo" accept="image/*" hidden>
        </div>
        <button class="btn" data-dact="save" style="align-self:flex-start">💾 Сохранить рисунок</button>
      </section>`;
  }

  function setupCanvas() {
    const cv = document.getElementById('cv');
    const ctx = cv.getContext('2d');
    D.cv = cv; D.ctx = ctx; D.undo = [];
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (PICS.has(V.draw)) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, cv.width, cv.height);
      img.src = PICS.get(V.draw);
    }
    let drawing = false, last = null;
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) };
    };
    const line = (a, b) => {
      ctx.globalCompositeOperation = D.eraser ? 'destination-out' : 'source-over';
      ctx.strokeStyle = D.color;
      ctx.lineWidth = D.eraser ? D.size * 2.2 : D.size;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    };
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pushUndo();
      drawing = true; last = pos(e);
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ничего */ }
      line(last, { x: last.x + 0.1, y: last.y + 0.1 });
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const p = pos(e); line(last, p); last = p;
    });
    const stop = () => { drawing = false; };
    cv.addEventListener('pointerup', stop);
    cv.addEventListener('pointercancel', stop);
  }
  function pushUndo() {
    try {
      D.undo.push(D.ctx.getImageData(0, 0, D.cv.width, D.cv.height));
      if (D.undo.length > 20) D.undo.shift();
    } catch (e) { /* ничего */ }
  }
  function drawAction(el) {
    const a = el.dataset.dact;
    if (a === 'cancel') { V.draw = null; render(); return; }
    if (a === 'color') { D.color = el.dataset.c; D.eraser = false; }
    if (a === 'size') D.size = +el.dataset.s;
    if (a === 'eraser') D.eraser = !D.eraser;
    if (a === 'undo' && D.undo.length) D.ctx.putImageData(D.undo.pop(), 0, 0);
    if (a === 'clear') { pushUndo(); D.ctx.clearRect(0, 0, D.cv.width, D.cv.height); }
    if (a === 'ghost') { D.ghost = !D.ghost; document.getElementById('ghostWord').hidden = !D.ghost; }
    if (a === 'save') {
      const out = document.createElement('canvas');
      out.width = 360; out.height = 360;
      const o = out.getContext('2d');
      o.fillStyle = '#ffffff'; o.fillRect(0, 0, 360, 360);
      o.drawImage(D.cv, 0, 0, 360, 360);
      const first = !PICS.has(V.draw);
      putPic(V.draw, out.toDataURL('image/jpeg', 0.8));
      if (first) addStars(2);
      V.draw = null;
      render(); window.scrollTo(0, 0); confetti(); toast('Рисунок сохранён — теперь он на карточке и в тренировке');
      return;
    }
    // Обновляем только кнопки, холст не трогаем.
    document.querySelectorAll('[data-dact="color"]').forEach((b) => b.setAttribute('aria-pressed', String(!D.eraser && b.dataset.c === D.color)));
    document.querySelectorAll('[data-dact="size"]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.s === D.size)));
    const er = document.querySelector('[data-dact="eraser"]');
    if (er) er.setAttribute('aria-pressed', String(D.eraser));
  }
  function loadPhoto(file) {
    if (!file || !D.ctx) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        pushUndo();
        const cw = D.cv.width, k = Math.max(cw / img.width, cw / img.height);
        const w = img.width * k, h = img.height * k;
        D.ctx.globalCompositeOperation = 'source-over';
        D.ctx.drawImage(img, (cw - w) / 2, (cw - h) / 2, w, h);
        D.ghost = false; document.getElementById('ghostWord').hidden = true;
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  // ---------- Вкладка «Истории» ----------
  const THEMES = [
    ['any', '🎲 Любая'], ['space', '🚀 Космос'], ['school', '🏫 Школа'], ['food', '🍕 Еда'],
    ['tale', '🧚 Сказка'], ['detective', '🕵️ Детектив'], ['sport', '⚽ Спорт'], ['animals', '🐱 Звери'],
  ];
  // Шаблоны: слова подставляются в начальной форме, поэтому везде перечисление после двоеточия
  // или подлежащее с глаголом во множественном числе.
  const STORY = {
    noun: [
      ['space', 'Срочно! На космическую станцию прибыли новые космонавты: {list}. Командир посмотрел и сказал: «Хьюстон, у нас проблемы».'],
      ['space', 'Инопланетяне увезли с Земли самое ценное: {list}. Теперь на Марсе праздник.'],
      ['space', 'Из чёрной дыры вылетели: {list} — и почему-то один носок.'],
      ['space', '{List} решили стать космонавтами и первым делом надели шлемы задом наперёд.'],
      ['space', 'Первый экипаж ракеты «Пятёрочка»: {list}. Взлетели, но забыли бутерброды.'],
      ['school', 'Классный журнал. Отсутствовали: {list}. Причина: улетели на юг.'],
      ['school', 'На родительское собрание пришли: {list}. Учительница решила, что заболела.'],
      ['school', 'В классе новенькие: {list}. Учительница удивилась, но поставила всем пятёрки.'],
      ['school', 'Дежурные по классу на этой неделе: {list}. Доска чистая, класс — нет.'],
      ['school', 'Что нашли в портфеле Пети: {list}. Учебника не нашли.'],
      ['food', 'Рецепт бабушкиного супа: {list}. Варить три дня, есть — никогда.'],
      ['food', 'В холодильнике нашлись: {list}. Мама закрыла дверцу и сделала вид, что ничего не видела.'],
      ['food', 'Новая пицца «Сюрприз»: {list} и сыр. Повар уволился.'],
      ['food', 'Меню школьной столовой на понедельник: {list}. Компот — по записи.'],
      ['tale', 'Жили-были {list}. И жили они так дружно, что соседи вызвали полицию.'],
      ['tale', 'Колобок катился по лесу и встретил компанию: {list}. Все пошли к лисе на чай. Лиса обиделась.'],
      ['tale', 'Щука исполнила желание, и в избе появились {list}. Емеля до сих пор в шоке.'],
      ['tale', 'Мне приснилось, что {list} танцуют на крыше и поют песню про {song}.'],
      ['tale', 'Три богатыря позвали на подмогу новых друзей: {list}. Змей Горыныч сдался без боя.'],
      ['detective', 'Подозреваемые в краже торта: {list}. Улика одна — крошки на усах.'],
      ['detective', 'Сыщик записал в блокнот: «Свидетели: {list}. Все врут».'],
      ['detective', 'Пропажа века! Из музея исчезли {list}. Нашлись под кроватью у кота.'],
      ['detective', 'Шерлок Холмс открыл дверь, а там — {list}. «Элементарно», — сказал Холмс и упал в обморок.'],
      ['sport', 'На старт вышли: {list}. Победила дружба, второе место заняла газировка.'],
      ['sport', 'Сборная класса по футболу: {list}. Вратарь — кот.'],
      ['sport', 'Олимпиада по прыжкам в лужу. Участники: {list}. Судья промок первым.'],
      ['sport', 'На физкультуре {list} прыгали через скакалку. Победила дружба!'],
      ['animals', 'Новости: в зоопарке поселились {list}. Слон в шоке.'],
      ['animals', 'Кот Барсик привёл домой друзей: {list}. Мама считает до десяти.'],
      ['animals', 'В цирке выступали {list}. Зрители так хохотали, что попадали со стульев.'],
      ['animals', 'Пошёл дождь. Под одним зонтиком спрятались {list}. Тесно, зато весело!'],
      ['animals', '{List} стоят в очереди к ветеринару и спорят, кто тут самый больной.'],
    ],
    verb: [
      ['space', 'Инструкция для инопланетянина: {list}. Удачи на Земле!'],
      ['space', 'Что должен уметь космонавт: {list}. И не бояться невесомости.'],
      ['school', 'Домашнее задание от кота: {list}. Сдать до пятницы.'],
      ['school', 'Правила поведения в столовой: {list}. Нарушителей отправят мыть кастрюли.'],
      ['school', 'Идеальный ученик должен {list}. Таких в нашей школе пока не нашли.'],
      ['food', 'Повар объявил конкурс. Задания: {list}. Приз — ведро мороженого.'],
      ['school', 'Список дел на каникулы: {list}. Отдыхать некогда!'],
      ['food', 'Мама сказала: «Сегодня нужно {list}». Папа спрятался под диван.'],
      ['tale', 'Царь велел Ивану: «{List}! А не то голова с плеч». Иван попросил выходной.'],
      ['tale', 'Бабушкины советы на все случаи жизни: {list}. И шапку надень!'],
      ['tale', 'Что Дед Мороз делает летом: {list}. И загорает.'],
      ['detective', 'Задание от агента 007: {list}. Сообщение самоуничтожится через 5 секунд.'],
      ['detective', 'План Игоря на понедельник: {list}. Что может пойти не так?'],
      ['sport', 'Тренер сказал: «Сегодня нужно {list}». Команда тихо ушла домой.'],
      ['sport', 'Супергерой умеет {list}. А домашку делать — нет.'],
      ['animals', 'Кот Барсик составил список дел: {list}. И всё это до обеда!'],
      ['animals', 'Что хомяк мечтает сделать ночью: {list}. Утром делает вид, что спал.'],
      ['animals', 'Собака записала в дневник: «Завтра {list}. И погрызть тапок».'],
    ],
    other: [
      ['any', 'Попугай выучил новые слова: «{list}!» Теперь он не замолкает.'],
      ['space', 'Навигатор ракеты сошёл с ума и твердит: «{list}!» Мы прилетели на Юпитер.'],
      ['school', 'Робот-учитель знает только эти слова: «{list}». Урок прошёл отлично.'],
      ['tale', 'Волшебное заклинание: «{list}!» — и двойка превратилась в пятёрку.'],
      ['detective', 'Пароль от секретной базы: «{list}». Никому не говори!'],
      ['sport', 'Кричалка болельщиков: «{list}! Наша команда лучше всех!»'],
      ['food', 'Повар кричит на кухне: «{list}!» Котлеты разбегаются.'],
      ['animals', 'Кот Барсик во сне бормочет: «{list}…» Что ему снится?'],
    ],
  };
  const KIND_NAMES = { noun: 'предметов', verb: 'действий', other: 'прочих слов' };
  function joinList(arr) {
    return arr.length === 1 ? arr[0] : arr.slice(0, -1).join(', ') + ' и ' + arr[arr.length - 1];
  }
  /** Какой вид слов в наборе самый многочисленный. Истории не смешивают виды: только предметы, или только действия… */
  function storyKind(ws) {
    const cnt = { noun: 0, verb: 0, other: 0 };
    ws.forEach((w) => { cnt[w.kind]++; });
    const best = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
    return cnt[best] >= 2 ? best : null;
  }
  function makeStory(group, ws) {
    const kind = storyKind(ws);
    if (!kind) return null;
    const pick = shuffle(ws.filter((w) => w.kind === kind)).slice(0, 4);
    let pool = STORY[kind].filter(([th]) => V.theme === 'any' || th === V.theme);
    if (!pool.length) pool = STORY[kind];
    const fresh = pool.filter(([, t]) => t !== V.lastStory);
    const t = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length || pool.length))][1];
    V.lastStory = t;
    const first = t.startsWith('{List}');
    const items = pick.map((w, i) => {
      const text = w.phrase || w.marked + (w.note ? ' ' + w.note : '');
      return first && i === 0 ? capMarked(text) : text;
    });
    return { text: t.replace('{List}', joinList(items)).replace('{list}', joinList(items)).replace('{song}', group.song), kind, fix: null };
  }
  function capMarked(m) {
    return m.startsWith('[') ? '[' + m.charAt(1).toUpperCase() + m.slice(2) : cap(m);
  }

  /** История в режиме «Почини»: трудные буквы — кнопки-пропуски. */
  function fixHtml(key, st) {
    const parts = parseMarked(st.text);
    const f = st.fix;
    return parts.map((p, i) => {
      if (!p.t) return esc(p.s);
      const ans = f.answers[i];
      let cls = 'sgap';
      if (f.checked) cls += ans === p.s ? ' right' : ' wrong';
      return `<button class="${cls}" data-act="fixTap" data-k="${esc(key)}" data-i="${i}" aria-label="Пропуск">${ans == null ? '?' : ans === '' ? '·' : esc(ans)}</button>`;
    }).join('');
  }

  function selectedGroups() {
    const map = new Map();
    selectedWords().forEach((w) => groupsOf(w).forEach((g) => {
      if (!map.has(g.key)) map.set(g.key, { g, ws: [] });
      map.get(g.key).ws.push(w);
    }));
    return [...map.values()].sort((a, b) => b.ws.length - a.ws.length);
  }

  /** Подсветка трудных букв в тексте ребёнка: ищем выбранные слова по началу. */
  function highlightOwn(text, ws) {
    const used = new Set();
    let html = '';
    const re = /[А-Яа-яЁё]+/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      html += esc(text.slice(last, m.index));
      const token = m[0];
      let out = esc(token);
      for (const w of ws) {
        if (w.id.includes(' ')) continue;
        const stemLen = w.id.length <= 4 ? w.id.length : Math.max(3, w.id.length - 2);
        const stem = norm(w.id.slice(0, stemLen));
        if (norm(token).startsWith(stem)) {
          used.add(w.id);
          const cs = chars(w);
          out = [...token].map((ch, i) => (i < stemLen && cs[i] && cs[i].t ? `<span class="t">${esc(ch)}</span>` : esc(ch))).join('');
          break;
        }
      }
      html += out;
      last = m.index + token.length;
    }
    html += esc(text.slice(last));
    ws.filter((w) => w.id.includes(' ') && norm(text).includes(norm(w.id))).forEach((w) => used.add(w.id));
    return { html, used };
  }

  function viewStories() {
    const ws = selectedWords();
    const groups = selectedGroups().filter((x) => x.ws.length >= 2);
    const ready = (window.SLOVARIK_STORIES || {})[S.grade] || [];
    const mine = S.stories.filter((s) => String(s.g) === String(S.grade));
    const own = highlightOwn(V.draft, ws);
    return `
      <h2>Смешные истории</h2>
      <p class="lead">Слова с одной и той же трудной буквой собираются в одну смешную историю. Чем нелепее картинка в голове, тем лучше запомнится буква.</p>
      ${ws.length ? `
      <section class="panel">
        <div class="group" style="margin-bottom:6px">
          <span class="label">Тема истории</span>
          <div class="chips">${THEMES.map(([k, n]) => `<button class="chip" data-act="theme" data-k="${k}" aria-pressed="${V.theme === k}">${n}</button>`).join('')}</div>
        </div>
        ${groups.length ? groups.map(({ g, ws: gw }) => {
          const ex = V.excl[g.key] || {};
          const on = gw.filter((w) => !ex[w.id]);
          const kind = storyKind(on);
          const st = V.story[g.key];
          return `<div class="group">
            <div class="row"><span class="letter" ${g.mark.length > 2 ? 'style="font-size:28px"' : ''}>${esc(g.mark)}</span><b>${esc(g.title)}</b><span class="muted">· ${gw.length} ${plural(gw.length, 'слово', 'слова', 'слов')}</span></div>
            <div class="chips">${gw.map((w) => `<button class="chip pick ${kind && w.kind !== kind && !ex[w.id] ? 'faded' : ''}" data-act="exclTog" data-k="${esc(g.key)}" data-id="${esc(w.id)}" aria-pressed="${!ex[w.id]}">${marked(w.parts)}${noteHtml(w)}</button>`).join('')}</div>
            <p class="muted" style="margin:0">${kind ? `Нажми на слово, чтобы убрать его из истории. Сочиняем из ${KIND_NAMES[kind]} — разные виды слов не смешиваем.` : 'Для истории нужно хотя бы два слова одного вида: два предмета или два действия.'}</p>
            ${st ? `<p class="story">${st.fix ? fixHtml(g.key, st) : markedText(st.text)}</p>` : ''}
            <div class="row">
              <button class="btn small ${st ? 'ghost' : ''}" data-act="gen" data-k="${esc(g.key)}" ${kind ? '' : 'disabled'}>${st ? '🎲 Ещё смешнее' : '🎲 Сочинить историю'}</button>
              ${st && !st.fix ? `<button class="btn small" data-act="fixStart" data-k="${esc(g.key)}">🧩 Почини историю</button>
                <button class="btn small ghost" data-act="saveGen" data-k="${esc(g.key)}">💾 В мои истории</button>` : ''}
              ${st && st.fix ? `<button class="btn small" data-act="fixCheck" data-k="${esc(g.key)}">Проверить</button>
                <button class="btn small ghost" data-act="fixStop" data-k="${esc(g.key)}">Показать ответ</button>` : ''}
            </div>
            ${st && st.fix ? '<p class="muted" style="margin:0">В истории пропали трудные буквы. Нажимай на «?», чтобы выбрать букву, потом — «Проверить».</p>' : ''}
          </div>`;
        }).join('') : '<p class="muted">Среди выбранных слов нет двух с одинаковой трудной буквой. Выбери ещё слова — и появятся группы.</p>'}
      </section>
      <section class="panel" style="display:flex;flex-direction:column;gap:10px">
        <span class="label">Сочини сам</span>
        <p class="muted" style="margin:0">Напиши предложение, где встретятся твои слова. Например: «Игорь пришёл на работу, поприветствовал коллег и приготовил торт». Слова, которые ты использовал, загорятся зелёным.</p>
        <div class="chips" id="ownChips">${ws.map((w) => `<span class="chip ${own.used.has(w.id) ? 'on' : ''}" data-chip="${esc(w.id)}">${marked(w.parts)}</span>`).join('')}</div>
        <textarea id="draft" placeholder="Сорока и ворона пили молоко…" spellcheck="false">${esc(V.draft)}</textarea>
        <p class="story" id="ownPreview" ${V.draft.trim() ? '' : 'hidden'}>${own.html}</p>
        <div class="row"><button class="btn small" data-act="saveStory">Сохранить историю</button><span class="muted" id="ownCount">${own.used.size ? `Использовано слов: ${own.used.size}` : ''}</span></div>
      </section>` : needSelection('Истории собираются из твоих выбранных слов.')}
      ${mine.length ? `<section class="panel" style="display:flex;flex-direction:column;gap:12px">
        <span class="label">Мои истории</span>
        ${mine.map((s) => `<div class="saved row between"><p class="story" style="flex:1 1 240px">${s.gen ? markedText(s.text) : highlightOwn(s.text, words()).html}</p><button class="btn small ghost" data-act="delStory" data-t="${s.t}">Удалить</button></div>`).join('')}
      </section>` : ''}
      ${ready.length ? `<section class="panel" style="display:flex;flex-direction:column;gap:12px">
        <span class="label">Готовые истории для ${S.grade} класса</span>
        ${ready.map((s) => `<div class="row" style="align-items:flex-start;flex-wrap:nowrap;gap:12px"><span class="letter">${esc(s.letter)}</span><p class="story">${markedText(s.text)}</p></div>`).join('')}
      </section>` : ''}`;
  }

  // ---------- Вкладка «Тренировка» ----------
  const MODES = {
    fill: { e: '🧩', name: 'Вставь букву', about: 'В слове пропущена трудная буква. Выбери правильную.' },
    choose: { e: '🔍', name: 'Найди верное', about: 'Слово написано по-разному. Только один вариант правильный.' },
    write: { e: '✍️', name: 'Напиши сам', about: 'Послушай слово или посмотри на картинку и напиши его целиком.' },
    look: { e: '👀', name: 'Посмотри и напиши', about: 'Слово видно 5 секунд. Запомни его и напиши по памяти.' },
    bolt: { e: '⚡', name: 'Молния', about: '60 секунд: жми на правильное написание как можно быстрее. Побей свой рекорд!' },
  };

  // ---------- «Молния»: игра на время ----------
  let boltTimer = 0;
  function startBolt() {
    const pool = trainPool().filter((w) => wrongVariants(w).length);
    if (!pool.length) { toast('Нет слов для игры'); return; }
    clearInterval(boltTimer);
    V.bolt = { pool, end: Date.now() + 60000, score: 0, miss: 0, cur: null, flash: null, done: false, record: false };
    nextBolt();
    boltTimer = setInterval(tickBolt, 200);
  }
  function nextBolt() {
    const B = V.bolt;
    let w;
    do { w = B.pool[Math.floor(Math.random() * B.pool.length)]; } while (B.pool.length > 1 && B.cur && w.id === B.cur.w.id);
    B.cur = { w, opts: shuffle([w.id, wrongVariants(w)[0]]) };
    B.flash = null;
    render();
  }
  function tickBolt() {
    const B = V.bolt;
    if (!B || B.done) { clearInterval(boltTimer); return; }
    const left = Math.max(0, B.end - Date.now());
    const clock = document.getElementById('boltClock');
    const bar = document.getElementById('boltBar');
    if (clock) clock.textContent = Math.ceil(left / 1000);
    if (bar) bar.style.width = (left / 600) + '%';
    if (left <= 0) {
      clearInterval(boltTimer);
      B.done = true;
      const best = S.best[S.grade] || 0;
      if (B.score > best) { S.best[S.grade] = B.score; B.record = best > 0 || B.score > 0; }
      save();
      addStars(Math.floor(B.score / 2));
      render();
      if (B.record) confetti();
      react(B.score > B.miss);
    }
  }
  function stopBolt() { clearInterval(boltTimer); V.bolt = null; }
  function viewBolt() {
    const B = V.bolt;
    if (B.done) {
      return `<article class="panel card">
        <div class="result">⚡ ${B.score}</div>
        <h2>${B.record ? 'Новый рекорд!' : 'Время вышло!'}</h2>
        <p class="lead">Правильных ответов: <b>${B.score}</b>, ошибок: <b>${B.miss}</b>. Рекорд ${S.grade} класса: <b>${S.best[S.grade] || 0}</b>.</p>
        <div class="row" style="justify-content:center">
          <button class="btn" data-act="start" data-mode="bolt">Ещё раз</button>
          <button class="btn ghost" data-act="stopBolt">Другой режим</button>
        </div>
      </article>`;
    }
    const w = B.cur.w;
    const left = Math.max(0, B.end - Date.now());
    return `<div class="row between"><span class="label">⚡ Молния · очки: <b style="font-size:18px;color:var(--pen)">${B.score}</b> · рекорд: ${S.best[S.grade] || 0}</span>
        <button class="btn small ghost" data-act="stopBolt">Стоп</button></div>
      <div class="progress" aria-hidden="true"><div id="boltBar" style="width:${left / 600}%;background:var(--pencil)"></div></div>
      <article class="panel card bolt">
        <div class="clock" id="boltClock">${Math.ceil(left / 1000)}</div>
        <div class="pic" aria-hidden="true">${pic(w)}</div>
        ${w.note ? `<p class="muted" style="margin:0">(${esc(w.note)})</p>` : ''}
        <div class="opts">${B.cur.opts.map((v) => {
          let cls = '';
          if (B.flash) { if (v === w.id) cls = 'right'; else if (v === B.flash) cls = 'wrong'; }
          const len = Math.max(...B.cur.opts.map((o) => o.length));
          const fs = len > 16 ? 20 : len > 12 ? 23 : 28;
          return `<button class="opt wide boltopt ${cls}" style="font-size:${fs}px" data-act="boltPick" data-v="${esc(v)}">${esc(v)}</button>`;
        }).join('')}</div>
      </article>`;
  }


  function trainPool() {
    if (V.trainSet === 'mistakes') return words().filter((w) => stat(w.id).bad > 0 && status(w.id) !== 'learned');
    if (V.trainSet === 'all') return words();
    return selectedWords();
  }

  function startTrain(mode, pool) {
    const list = shuffle(pool || trainPool()).slice(0, 15);
    if (!list.length) { toast('Нет слов для тренировки'); return; }
    V.train = { mode, queue: list.map((w) => w.id), total: list.length, pos: 0, firstTry: 0, mistakes: [], repeated: new Set(), task: null };
    nextTask();
  }

  function nextTask() {
    const T = V.train;
    if (T.pos >= T.queue.length) {
      T.task = null; T.done = true; render();
      if (T.total && T.firstTry / T.total >= 0.9) confetti();
      return;
    }
    const w = byId(T.queue[T.pos]);
    const task = { id: w.id, w, wrong: false, solved: false };
    if (T.mode === 'fill') {
      task.gaps = w.parts.map((p, i) => (p.t ? i : -1)).filter((i) => i >= 0);
      task.gi = 0;
      task.orders = {};
      task.gaps.forEach((i) => { task.orders[i] = shuffle(w.parts[i].alts); });
      task.filled = {};
      task.bad = {};
    } else if (T.mode === 'choose') {
      task.variants = shuffle([w.id].concat(wrongVariants(w)));
      task.picked = null;
    } else if (T.mode === 'look') {
      task.showing = true;
    }
    T.task = task;
    render();
    if ((T.mode === 'write') && canSpeak()) speak(w.id);
    if (T.mode === 'look') {
      clearTimeout(V.lookTimer);
      V.lookTimer = setTimeout(() => { if (V.train && V.train.task === task && task.showing) { task.showing = false; render(); } }, 5000);
    }
  }

  function wrongVariants(w) {
    const out = new Set();
    const tIdx = w.parts.map((p, i) => (p.t ? i : -1)).filter((i) => i >= 0);
    const build = (repl) => w.parts.map((p, i) => (i in repl ? repl[i] : p.s)).join('');
    tIdx.forEach((i) => w.parts[i].alts.forEach((a) => { if (a !== w.parts[i].s) out.add(build({ [i]: a })); }));
    // Две ошибки сразу — если одиночных вариантов мало.
    if (out.size < 3 && tIdx.length > 1) {
      for (let x = 0; x < tIdx.length; x++) for (let y = x + 1; y < tIdx.length; y++) {
        const i = tIdx[x], j = tIdx[y];
        w.parts[i].alts.filter((a) => a !== w.parts[i].s).forEach((a) =>
          w.parts[j].alts.filter((b) => b !== w.parts[j].s).forEach((b) => out.add(build({ [i]: a, [j]: b }))));
      }
    }
    out.delete(w.id);
    return shuffle([...out]).slice(0, 3);
  }

  function finishTask(ok) {
    const T = V.train;
    const t = T.task;
    if (t.solved) return;
    t.solved = true;
    const again = T.repeated.has(t.id);
    if (!again) {
      record(t.id, ok);
      if (ok) { T.firstTry++; addStars(1); }
      react(ok);
    }
    if (!ok && !again) {
      T.mistakes.push(t.id);
      T.repeated.add(t.id);
      T.queue.push(t.id); // слово с ошибкой вернётся в конце
    }
  }

  function goNext() {
    V.train.pos++;
    nextTask();
  }

  /** Сравнение ответа с образцом: какие буквы образца потеряны, какие лишние. */
  function diff(correct, answer) {
    const a = [...correct], b = [...answer];
    const n = a.length, m = b.length;
    const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      L[i][j] = norm(a[i]) === norm(b[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const lostA = new Set(), extraB = new Set();
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (norm(a[i]) === norm(b[j])) { i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) lostA.add(i++);
      else extraB.add(j++);
    }
    while (i < n) lostA.add(i++);
    while (j < m) extraB.add(j++);
    return { lostA, extraB };
  }

  function viewTrain() {
    if (V.bolt) return viewBolt();
    const T = V.train;
    if (T && T.done) return viewTrainResult();
    if (T && T.task) return viewTask();
    const sel = selectedWords().length;
    const mist = words().filter((w) => stat(w.id).bad > 0 && status(w.id) !== 'learned').length;
    if (V.trainSet === 'selected' && !sel) V.trainSet = mist ? 'mistakes' : 'all';
    const sets = [
      ['selected', `Выбранные (${sel})`, sel],
      ['mistakes', `С ошибками (${mist})`, mist],
      ['all', `Все слова ${S.grade} класса`, words().length],
    ];
    return `
      <h2>Тренировка</h2>
      <p class="lead">Начни с «Вставь букву», а когда будет получаться — пиши слова целиком. Слово считается выученным, когда ты напишешь его правильно 3 раза подряд.</p>
      <div class="row" role="group" aria-label="Какие слова">
        <span class="label">Какие слова:</span>
        ${sets.map(([k, name, n]) => `<button class="chip" data-act="set" data-k="${k}" aria-pressed="${V.trainSet === k}" ${n ? '' : 'disabled'}>${name}</button>`).join('')}
      </div>
      <div class="modes">
        ${Object.entries(MODES).map(([k, m]) => `<button class="mode" data-act="start" data-mode="${k}">
          <span class="e" aria-hidden="true">${m.e}</span><b>${m.name}</b><span class="muted">${m.about}</span></button>`).join('')}
      </div>
      <details class="panel">
        <summary>🐱 Коты-реакции и свои картинки</summary>
        <div style="display:flex;flex-direction:column;gap:12px;margin-top:12px">
          <div class="row"><button class="chip" data-act="cats" aria-pressed="${S.cats !== false}">${S.cats !== false ? '🐱 Коты включены' : '🙈 Коты выключены'}</button>
            <button class="btn small ghost" data-act="catTest" data-ok="1">Показать доброго кота</button>
            <button class="btn small ghost" data-act="catTest" data-ok="">Показать кота в шоке</button></div>
          <p class="muted" style="margin:0">После ответа в углу выскакивает кот с подписью. Можно добавить свои картинки — например, фото вашего кота или смешные рисунки. Они будут показываться вместе с нарисованными котами. Хранятся только на этом устройстве.</p>
          ${['good', 'bad'].map((k) => `<div style="display:flex;flex-direction:column;gap:8px">
            <span class="label">${k === 'good' ? 'Когда правильно' : 'Когда ошибка'}</span>
            <div class="row">${ownReacts(k).map((id) => `<span class="ownreact"><img src="${PICS.get(id)}" alt=""><button data-act="delReact" data-id="${id}" aria-label="Удалить">✕</button></span>`).join('')}
              <label class="btn small ghost" for="react-${k}" style="display:inline-flex;align-items:center">＋ Добавить картинку</label>
              <input type="file" id="react-${k}" accept="image/*" hidden></div>
          </div>`).join('')}
        </div>
      </details>
      ${!canSpeak() ? '<p class="muted">На этом устройстве нет русского голоса, поэтому в режиме «Напиши сам» вместо озвучки будет картинка и подсказка.</p>' : ''}`;
  }

  function taskTop() {
    const T = V.train;
    const pct = Math.round((T.pos / T.queue.length) * 100);
    return `<div class="row between"><span class="label">${MODES[T.mode].e} ${MODES[T.mode].name} · слово ${Math.min(T.pos + 1, T.queue.length)} из ${T.queue.length}</span>
      <button class="btn small ghost" data-act="stopTrain">Закончить</button></div>
      <div class="progress" aria-hidden="true"><div style="width:${pct}%"></div></div>`;
  }

  function viewTask() {
    const T = V.train, t = T.task, w = t.w;
    let inner = '';
    if (T.mode === 'fill') {
      const cur = t.gaps[t.gi];
      inner = `
        <div class="pic" aria-hidden="true">${pic(w)}</div>
        <div class="gapword">${w.parts.map((p, i) => {
          if (!p.t) return `<span>${esc(p.s)}</span>`;
          if (i in t.filled) return `<span class="gap filled">${esc(p.s) || '·'}</span>`;
          return `<span class="gap ${i === cur ? 'now' : ''}">&nbsp;</span>`;
        }).join('')}</div>
        ${t.solved ? verdictGood(w) : `<div class="opts">${t.orders[cur].map((a) =>
          `<button class="opt ${a === '' ? 'wide' : ''} ${t.bad[cur + ':' + a] ? 'wrong' : ''}" data-act="fillPick" data-a="${esc(a)}">${a === '' ? 'ничего' : esc(a)}</button>`).join('')}</div>`}
        ${t.wrong && !t.solved && w.hint ? `<div class="hint"><span class="label">Подсказка</span>${esc(w.hint)}</div>` : ''}`;
    } else if (T.mode === 'choose') {
      inner = `
        <div class="pic" aria-hidden="true">${pic(w)}</div>
        <p class="lead">Какое слово написано правильно?</p>
        <div class="opts">${t.variants.map((v) => {
          let cls = '';
          if (t.picked !== null) { if (v === w.id) cls = 'right'; else if (v === t.picked) cls = 'wrong'; }
          return `<button class="opt wide ${cls}" data-act="choosePick" data-v="${esc(v)}" ${t.picked !== null ? 'disabled' : ''}>${esc(v)}</button>`;
        }).join('')}</div>
        ${t.picked !== null ? (t.picked === w.id ? verdictGood(w) : verdictBad(w, t.picked, true)) : ''}`;
    } else if (T.mode === 'look' && t.showing) {
      inner = `
        <div class="pic" aria-hidden="true">${pic(w)}</div>
        <div class="big">${marked(w.parts)}</div>
        <p class="muted">Запоминай! Особенно красные буквы.</p>
        <div class="progress" style="width:100%;max-width:320px"><div class="shrink"></div></div>
        <button class="btn" data-act="lookHide">Я запомнил(а)</button>`;
    } else {
      const speakable = canSpeak();
      const masked = w.parts.map((p) => (p.t ? '<span class="gap">&nbsp;</span>' : esc(p.s))).join('');
      inner = `
        <div class="pic" aria-hidden="true">${pic(w)}</div>
        ${T.mode === 'write' ? (speakable
          ? `<button class="speak" data-act="say" data-text="${esc(w.id)}" aria-label="Послушать слово">🔊</button><p class="muted">Нажми, чтобы послушать ещё раз</p>`
          : `<div class="gapword" style="font-size:32px">${masked}</div><p class="muted">Напиши слово целиком, вставив пропущенные буквы</p>`) : '<p class="muted">Какое слово ты видел(а)? Напиши его.</p>'}
        ${t.solved && !t.copy ? verdictGood(w, t.caseNote) : ''}
        ${t.copy ? verdictBad(w, t.answer) : ''}
        ${!t.solved || t.copy ? `
        <form id="writeForm" class="row" style="justify-content:center;width:100%">
          <input type="text" id="answer" class="answer" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="${t.copy ? 'Перепиши правильно' : 'Пиши здесь'}" aria-label="Ответ">
          <button class="btn" type="submit">${t.copy ? 'Готово' : 'Проверить'}</button>
        </form>` : ''}`;
    }
    const canNext = t.solved && !t.copy;
    const note = w.note ? `<p class="muted" style="margin:0">(${esc(w.note)})</p>` : '';
    return `${taskTop()}
      <article class="panel card">${inner.replace('</div>', '</div>' + note)}</article>
      ${canNext ? '<div class="row" style="justify-content:center"><button class="btn" data-act="next" id="nextBtn">Дальше →</button></div>' : ''}`;
  }

  function verdictGood(w, note) {
    const praise = ['Верно!', 'Молодец!', 'Точно!', 'Супер!', 'Так держать!'][Math.floor(Math.random() * 5)];
    return `<div class="verdict good">✓ ${praise} <span class="your">${marked(w.parts)}${note ? ` — ${esc(note)}` : ''}</span></div>`;
  }
  function verdictBad(w, answer, simple) {
    const correct = w.id;
    const d = diff(correct, answer || '');
    const cs = chars(w);
    const right = cs.map((c, i) => {
      const cls = [c.t ? 't' : '', d.lostA.has(i) ? 'lost' : ''].join(' ').trim();
      return cls ? `<span class="${cls}">${esc(c.ch)}</span>` : esc(c.ch);
    }).join('');
    const yours = [...(answer || '')].map((ch, j) => (d.extraB.has(j) ? `<span class="miss">${esc(ch)}</span>` : esc(ch))).join('');
    return `<div class="verdict bad">✗ Ошибка. Правильно: <span style="font-size:26px;color:var(--ink)">${right}</span>
      <span class="your">Ты ${simple ? 'выбрал(а)' : 'написал(а)'}: ${yours || '—'}</span>
      ${w.hint ? `<span class="your" style="font-weight:600">💡 ${esc(w.hint)}</span>` : ''}
      ${simple ? '' : '<span class="your" style="font-weight:600">Перепиши слово правильно — так рука тоже запомнит.</span>'}</div>`;
  }

  function viewTrainResult() {
    const T = V.train;
    const total = T.total;
    const good = T.firstTry;
    const ratio = total ? good / total : 0;
    const stars = ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : ratio > 0 ? 1 : 0;
    const mist = T.mistakes.map(byId).filter(Boolean);
    return `
      <article class="panel card">
        <div class="result">${'★'.repeat(stars)}<span style="color:var(--line)">${'★'.repeat(3 - stars)}</span></div>
        <h2>${stars === 3 ? 'Отлично!' : stars === 2 ? 'Хорошо!' : 'Надо ещё потренироваться'}</h2>
        <p class="lead">Без ошибок с первого раза: <b>${good} из ${total}</b></p>
        ${mist.length ? `<div style="display:flex;flex-direction:column;gap:8px;align-items:center"><span class="label">Повтори эти слова</span>
          <div class="chips" style="justify-content:center">${mist.map((w) => `<span class="chip">${w.emoji} ${marked(w.parts)}</span>`).join('')}</div></div>` : ''}
        <div class="row" style="justify-content:center">
          ${mist.length ? '<button class="btn" data-act="retryMistakes">Потренировать ошибки</button>' : ''}
          <button class="btn ${mist.length ? 'ghost' : ''}" data-act="start" data-mode="${T.mode}">Ещё раз</button>
          <button class="btn ghost" data-act="stopTrain">Другой режим</button>
        </div>
      </article>`;
  }

  function afterRender() {
    const input = document.getElementById('answer');
    if (input) input.focus();
    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn && !input) nextBtn.focus({ preventScroll: true });
  }

  // ---------- События ----------
  document.addEventListener('click', (e) => {
    const d = e.target.closest('[data-dact]');
    if (d) { drawAction(d); return; }
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const T = V.train;
    switch (act) {
      case 'tab': V.draw = null; if (V.bolt) stopBolt(); V.tab = el.dataset.tab; if (V.tab !== 'train' && T && T.done) V.train = null; window.scrollTo(0, 0); break;
      case 'grade': V.draw = null; stopBolt(); S.grade = el.dataset.g; V.learn = 0; V.train = null; V.story = {}; V.excl = {}; save(); break;
      case 'toggle': {
        const ids = selectedIds();
        const id = el.dataset.id;
        const i = ids.indexOf(id);
        if (i >= 0) ids.splice(i, 1); else ids.push(id);
        S.selected[S.grade] = ids; save();
        if (i < 0 && ids.length === 11) toast('Больше 10 слов за раз — трудновато. Но можно!');
        break;
      }
      case 'pick10': {
        const cur = new Set(selectedIds());
        const fresh = words().filter((w) => status(w.id) !== 'learned' && !cur.has(w.id));
        const take = fresh.slice(0, 10);
        if (!take.length) { toast('Все слова этого класса уже выучены!'); return; }
        S.selected[S.grade] = take.map((w) => w.id); save(); V.learn = 0;
        toast(`Выбрано ${take.length} ${plural(take.length, 'слово', 'слова', 'слов')}`);
        break;
      }
      case 'clearSel': S.selected[S.grade] = []; save(); break;
      case 'addWord': {
        const inp = document.getElementById('newWord');
        const val = (inp.value || '').trim();
        if (!val) return;
        if (!/\[[^\]]+\]/.test(val)) { toast('Отметь трудную букву скобками: к[о]рова'); return; }
        (S.custom[S.grade] = S.custom[S.grade] || []).push(val);
        save(); toast('Слово добавлено');
        break;
      }
      case 'delWord': S.custom[S.grade].splice(+el.dataset.i, 1); save(); break;
      case 'say': speak(el.dataset.text); return;
      case 'cats': S.cats = S.cats === false; save(); break;
      case 'catTest': react(!!el.dataset.ok); return;
      case 'delReact': delPic(el.dataset.id); break;
      case 'draw': V.draw = el.dataset.id; D.ghost = !PICS.has(V.draw); D.eraser = false; window.scrollTo(0, 0); break;
      case 'unpic': delPic(el.dataset.id); toast('Вернули эмодзи'); break;
      case 'learnPrev': V.learn = Math.max(0, V.learn - 1); break;
      case 'learnNext': V.learn++; break;
      case 'learnGo': V.learn = +el.dataset.i; break;
      case 'gen': {
        const grp = selectedGroups().find((x) => x.g.key === el.dataset.k);
        if (grp) {
          const ex = V.excl[grp.g.key] || {};
          V.story[grp.g.key] = makeStory(grp.g, grp.ws.filter((w) => !ex[w.id]));
        }
        break;
      }
      case 'theme': V.theme = el.dataset.k; break;
      case 'exclTog': {
        const ex = (V.excl[el.dataset.k] = V.excl[el.dataset.k] || {});
        ex[el.dataset.id] = !ex[el.dataset.id];
        break;
      }
      case 'fixStart': {
        const st = V.story[el.dataset.k];
        const parts = parseMarked(st.text);
        const orders = {};
        parts.forEach((p, i) => { if (p.t) orders[i] = shuffle(p.alts); });
        st.fix = { answers: {}, orders, checked: false };
        break;
      }
      case 'fixTap': {
        const f = V.story[el.dataset.k].fix;
        const i = +el.dataset.i;
        const ord = f.orders[i];
        const cur = f.answers[i];
        f.answers[i] = cur == null ? ord[0] : ord[(ord.indexOf(cur) + 1) % ord.length];
        f.checked = false;
        break;
      }
      case 'fixCheck': {
        const st = V.story[el.dataset.k];
        const parts = parseMarked(st.text);
        const gaps = parts.map((p, i) => [p, i]).filter(([p]) => p.t);
        if (gaps.some(([, i]) => st.fix.answers[i] == null)) { toast('Заполни все пропуски'); return; }
        st.fix.checked = true;
        const bad = gaps.filter(([p, i]) => st.fix.answers[i] !== p.s).length;
        if (!bad) {
          st.fix = null; addStars(3); render(); confetti(); react(true); toast('История починена! +3 ⭐'); return;
        }
        toast(`Ошибок: ${bad}. Красные пропуски — нажми на них ещё раз`);
        break;
      }
      case 'fixStop': V.story[el.dataset.k].fix = null; break;
      case 'saveGen': {
        const st = V.story[el.dataset.k];
        S.stories.unshift({ g: S.grade, text: st.text, t: Date.now(), gen: true }); save();
        toast('История сохранена');
        break;
      }
      case 'saveStory': {
        const text = V.draft.trim();
        if (!text) { toast('Сначала напиши историю'); return; }
        S.stories.unshift({ g: S.grade, text, t: Date.now() }); save();
        V.draft = ''; toast('История сохранена');
        break;
      }
      case 'delStory': S.stories = S.stories.filter((s) => String(s.t) !== el.dataset.t); save(); break;
      case 'set': V.trainSet = el.dataset.k; break;
      case 'start': if (el.dataset.mode === 'bolt') { V.train = null; startBolt(); } else startTrain(el.dataset.mode); return;
      case 'stopBolt': stopBolt(); break;
      case 'boltPick': {
        const B = V.bolt;
        if (!B || B.flash || B.done) return;
        if (el.dataset.v === B.cur.w.id) { B.score++; nextBolt(); return; }
        B.miss++; B.flash = el.dataset.v;
        render();
        setTimeout(() => { if (V.bolt === B && !B.done) nextBolt(); }, 900);
        return;
      }
      case 'retryMistakes': startTrain(T.mode, T.mistakes.map(byId).filter(Boolean)); return;
      case 'stopTrain': V.train = null; break;
      case 'next': goNext(); return;
      case 'lookHide': T.task.showing = false; break;
      case 'fillPick': {
        const t = T.task;
        const cur = t.gaps[t.gi];
        const a = el.dataset.a;
        if (a === t.w.parts[cur].s) {
          t.filled[cur] = true;
          t.gi++;
          if (t.gi >= t.gaps.length) finishTask(!t.wrong);
        } else {
          t.wrong = true;
          t.bad[cur + ':' + a] = true;
        }
        break;
      }
      case 'choosePick': {
        const t = T.task;
        t.picked = el.dataset.v;
        finishTask(t.picked === t.w.id);
        break;
      }
      default: return;
    }
    render();
  });

  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'writeForm') return;
    e.preventDefault();
    const t = V.train && V.train.task;
    if (!t) return;
    const val = document.getElementById('answer').value;
    if (!val.trim()) return;
    const ok = norm(val) === norm(t.id);
    if (t.copy) {
      if (ok) { t.copy = false; render(); } else toast('Сверь с образцом и попробуй ещё раз');
      return;
    }
    if (ok) {
      if (val.trim().charAt(0) !== t.id.charAt(0) && t.id.charAt(0) !== t.id.charAt(0).toLowerCase()) t.caseNote = 'пишется с большой буквы!';
      finishTask(true);
    } else {
      t.answer = val.trim();
      t.copy = true;
      finishTask(false);
    }
    render();
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'photo') loadPhoto(e.target.files && e.target.files[0]);
    if (e.target.id === 'react-good' || e.target.id === 'react-bad') loadReact(e.target.files && e.target.files[0], e.target.id.slice(6));
  });

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'mine') {
      const v = el.value;
      if (v.trim()) S.mine[el.dataset.id] = v; else delete S.mine[el.dataset.id];
      save();
    } else if (el.id === 'draft') {
      V.draft = el.value;
      const own = highlightOwn(V.draft, selectedWords());
      const prev = document.getElementById('ownPreview');
      prev.innerHTML = own.html; prev.hidden = !V.draft.trim();
      document.querySelectorAll('#ownChips [data-chip]').forEach((c) => c.classList.toggle('on', own.used.has(c.dataset.chip)));
      document.getElementById('ownCount').textContent = own.used.size ? `Использовано слов: ${own.used.size}` : '';
    }
  });

  // Enter = «Дальше» после ответа.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const btn = document.getElementById('nextBtn');
    if (btn && document.activeElement && document.activeElement.tagName !== 'TEXTAREA' && document.activeElement !== btn) { e.preventDefault(); btn.click(); }
  });

  render();
})();
