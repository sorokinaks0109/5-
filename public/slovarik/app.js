/* Школьный словарик: выбор класса, запоминание, истории, тренировка. */
(function () {
  'use strict';

  /** Название с выделенной частью: «Мур» в «Мурфографии», «а» в «Словарике». */
  const logoHtml = (n) => (n === 'Мурфография' ? '<b>Мур</b>фография' : n === 'Словарик' ? 'Слов<b>а</b>рик' : String(n).replace(/[&<>"']/g, ''));
  const CFG = Object.assign({ appName: 'Мурфография', author: '', blogUrl: '', blogTitle: '', blogSub: '', feedbackUrl: '', metrikaId: '' }, window.SLOVARIK_CONFIG || {});

  // ---------- Хранение ----------
  const KEY = 'slovarik:v1';
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && typeof s === 'object') return s;
    } catch (e) { /* хранилище недоступно — работаем без него */ }
    return null;
  }
  // Перенос прогресса со старого адреса (sorokinaks0109.github.io/5-/slovarik/): ссылка вида #import=<данные>.
  (function importFromLink() {
    const m = location.hash.match(/^#import=([\w-]+)/);
    if (!m) return;
    history.replaceState(null, '', location.pathname + location.search);
    try {
      const data = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')))));
      if (!data || typeof data !== 'object') return;
      const cur = load();
      if (cur && cur.setup && !confirm('На этом устройстве уже есть прогресс. Заменить его прогрессом со старого адреса?')) return;
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) { /* ссылка повреждена — просто начинаем заново */ }
  })();
  const S = Object.assign({ grade: 1, selected: {}, stats: {}, mine: {}, stories: [], custom: {}, stars: 0, best: {}, cnt: {} }, load() || {});
  // Остатки старого кабинета родителя больше не нужны.
  ['role', 'assign', 'goal', 'kids', 'kid'].forEach((k) => { delete S[k]; });
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

  // 'all' — режим для взрослых: все слова с 1 по 8 класс одним списком.
  function gradeWords(g) {
    const custom = (S.custom[g] || []).map(parseLine);
    const base = g === 'all' ? GRADES.flatMap((k) => BUILTIN[k]) : BUILTIN[g] || [];
    const all = base.concat(custom);
    const seen = new Set();
    return all.filter((w) => (seen.has(w.id) ? false : seen.add(w.id)))
      .sort((a, b) => a.id.localeCompare(b.id, 'ru'));
  }
  function words() { return gradeWords(S.grade); }
  // «3 класс» / «3 класса» или «все классы» / «всех классов» для взрослого.
  function gradeName(gen) {
    if (S.grade === 'all') return gen ? 'всех классов' : 'все классы';
    return S.grade + (gen ? ' класса' : ' класс');
  }
  const DEFS = window.SLOVARIK_DEFS || {};
  const defOf = (w) => DEFS[w.id] || '';
  function byId(id) { return words().find((w) => w.id === id); }
  function selectedIds() {
    const all = new Set(words().map((w) => w.id));
    return (S.selected[S.grade] || []).filter((id) => all.has(id));
  }
  function selectedWords() { return selectedIds().map(byId).filter(Boolean); }

  // ---------- Достижения ----------
  // Значки за настоящие успехи. Открываются один раз; при открытии — конфетти и кот.
  const ACH = [
    ['first', '👣', 'Первый шаг', 'Ответить правильно в первый раз', (c) => c.ok >= 1],
    ['learn1', '🌱', 'Первое слово', 'Выучить первое слово', (c) => c.learned >= 1],
    ['learn10', '🌿', 'Десятка', 'Выучить 10 слов', (c) => c.learned >= 10],
    ['learn50', '🌳', 'Полсотни', 'Выучить 50 слов', (c) => c.learned >= 50],
    ['learn100', '🏆', 'Сотня', 'Выучить 100 слов', (c) => c.learned >= 100],
    ['streak3', '🔥', 'Три дня подряд', 'Заниматься 3 дня подряд', (c) => c.streak >= 3],
    ['streak7', '📅', 'Неделя без пропусков', 'Заниматься 7 дней подряд', (c) => c.streak >= 7],
    ['streak30', '🌟', 'Месяц подряд', 'Заниматься 30 дней подряд', (c) => c.streak >= 30],
    ['combo5', '⚡', 'Пять подряд', '5 правильных ответов подряд', (c) => c.combo >= 5],
    ['combo15', '🚀', 'Пятнадцать подряд', '15 правильных ответов подряд', (c) => c.combo >= 15],
    ['perfect', '💯', 'Без единой ошибки', 'Тренировка из 10+ слов без ошибок', (c) => c.perfect >= 1],
    ['train10', '🎯', 'Упорство', 'Пройти 10 тренировок', (c) => c.trains >= 10],
    ['fix1', '🩹', 'Работа над ошибками', 'Исправить первую ошибку', (c) => c.fixes >= 1],
    ['fix10', '🛠️', 'Мастер исправлений', 'Исправить 10 ошибок', (c) => c.fixes >= 10],
    ['story', '📖', 'Сказочник', 'Сохранить свою историю', (c) => c.stories >= 1],
    ['storyfix', '🔧', 'Ремонт историй', 'Починить историю', (c) => c.storyFix >= 1],
    ['bolt10', '⚡', 'Молния', 'Набрать 10 очков в «Молнии»', (c) => c.bolt >= 10],
    ['bolt25', '🌩️', 'Гроза', 'Набрать 25 очков в «Молнии»', (c) => c.bolt >= 25],
    ['stars100', '⭐', 'Сто звёзд', 'Собрать 100 звёзд', (c) => c.stars >= 100],
    ['stars500', '🌠', 'Звездопад', 'Собрать 500 звёзд', (c) => c.stars >= 500],
  ];
  function achCtx() {
    const k = S.cnt || {};
    const days = Object.values(S.days || {});
    return {
      ok: days.reduce((a, d) => a + d.ok, 0),
      learned: Object.keys(S.stats).filter((id) => stat(id).box >= 3).length,
      streak: streakDays(),
      combo: k.bestCombo || 0, perfect: k.perfect || 0, trains: k.trains || 0, fixes: k.fixes || 0,
      storyFix: k.storyFix || 0, stories: (S.stories || []).length,
      bolt: Math.max(0, ...Object.values(S.best || {})), stars: S.stars || 0,
    };
  }
  /** Проверяет новые достижения. При первом запуске новой версии открывает заработанные раньше молча. */
  function checkAch() {
    const silent = !S.ach;
    S.ach = S.ach || {};
    const c = achCtx();
    const fresh = ACH.filter(([id, , , , test]) => !S.ach[id] && test(c));
    if (!fresh.length) { if (silent) save(); return; }
    fresh.forEach(([id]) => { S.ach[id] = Date.now(); });
    save();
    if (silent) return;
    const [, e, name] = fresh[0];
    setTimeout(() => {
      confetti();
      react(true, 'НОВОЕ ДОСТИЖЕНИЕ: ' + name.toUpperCase() + ' ' + e);
      toast(`${e} Новое достижение: «${name}»${fresh.length > 1 ? ` и ещё ${fresh.length - 1}` : ''}! Смотри в «Итогах»`);
    }, 1200);
  }
  function achHtml() {
    const got = S.ach || {};
    const n = ACH.filter(([id]) => got[id]).length;
    return `<section class="panel" style="display:flex;flex-direction:column;gap:10px">
      <span class="label">Достижения · ${n} из ${ACH.length}</span>
      <div class="achs">${ACH.map(([id, e, name, how]) => `<div class="ach ${got[id] ? 'on' : ''}" title="${esc(how)}">
        <span class="ae" aria-hidden="true">${got[id] ? e : '🔒'}</span><b>${esc(name)}</b><small>${esc(how)}</small></div>`).join('')}</div>
    </section>`;
  }

  // ---------- Счётчики для достижений ----------
  function cnt(k, n = 1) { S.cnt = S.cnt || {}; S.cnt[k] = (S.cnt[k] || 0) + n; }

  // ---------- Прогресс ----------
  // Интервальное повторение: у слова есть «коробка» 0–5. Правильный ответ в день, когда слово
  // пора повторять, переводит его в следующую коробку, и следующий повтор — через 1, 3, 7, 14, 30 дней.
  // Ошибка возвращает слово в коробку 0. Выучено — коробка 3 и выше (правильно в разные дни).
  const DAY = 86400000;
  const INTERVALS = [0, 1, 3, 7, 14, 30];
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const dayKey = (t) => { const d = new Date(t || Date.now()); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  function stat(id) {
    const st = Object.assign({ s: 0, ok: 0, bad: 0 }, S.stats[id]);
    if (st.box === undefined) {
      // Прогресс из старой версии: 3 правильных подряд считаем почти выученным.
      st.box = st.s >= 3 ? 3 : st.ok > 0 ? 1 : 0;
      st.due = today() + INTERVALS[st.box] * DAY;
    }
    return st;
  }
  // Открытая ошибка: слово ошиблись и ещё не ответили правильно после этого.
  // Правильный ответ в следующей тренировке «исправляет» ошибку — слово уходит из «С ошибками».
  function hasMistake(id) {
    const st = stat(id);
    return st.err !== undefined ? !!st.err : st.bad > 0 && st.s === 0;
  }
  function status(id) {
    const st = stat(id);
    if (st.ok + st.bad === 0) return 'new';
    if (st.box >= 1 && st.due <= today()) return 'due';
    if (st.box >= 3) return 'learned';
    return 'learning';
  }
  function record(id, ok) {
    const st = stat(id);
    const t = today();
    if (ok) {
      if (hasMistake(id)) { st.fixedAt = Date.now(); cnt('fixes'); V.justFixed = id; }
      st.err = false;
      st.ok++; st.s++;
      if (st.box === 0 || st.due <= t) { st.box = Math.min(5, st.box + 1); st.due = t + INTERVALS[st.box] * DAY; }
      if (st.box >= 3 && !st.learnedAt) st.learnedAt = Date.now();
    } else {
      st.bad++; st.s = 0; st.box = 0; st.due = t; st.err = true;
    }
    st.last = Date.now();
    S.stats[id] = st;
    const k = dayKey();
    S.days = S.days || {};
    const d = (S.days[k] = S.days[k] || { ok: 0, bad: 0 });
    if (ok) d.ok++; else d.bad++;
    addTime();
    save();
  }
  /** Время занятий: промежуток между ответами (не больше минуты — вдруг ребёнок отвлёкся). */
  let lastAnswerAt = 0;
  function addTime() {
    const now = Date.now();
    const gap = lastAnswerAt ? Math.min(now - lastAnswerAt, 60000) : 10000;
    lastAnswerAt = now;
    S.days = S.days || {};
    const k = dayKey();
    const d = (S.days[k] = S.days[k] || { ok: 0, bad: 0 });
    d.sec = (d.sec || 0) + gap / 1000;
  }
  /** Сколько дней подряд были занятия (сегодня или вчера — серия ещё жива). */
  function streakDays() {
    const days = S.days || {};
    let n = 0, t = today();
    if (!days[dayKey(t)]) t -= DAY;
    while (days[dayKey(t)]) { n++; t -= DAY; }
    return n;
  }

  // ---------- Помощники ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Варианты буквы всегда в одном порядке (по алфавиту): кнопки не прыгают между пропусками.
  const stableAlts = (alts) => alts.slice().sort((a, b) => a.localeCompare(b, 'ru'));
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
    if (p.alts && p.alts.length === 2 && p.alts[0] !== p.alts[1] && p.alts[0].toLowerCase() === p.alts[1].toLowerCase()) return {
      key: 'заглавная', mark: 'Аа', title: 'Большая или маленькая буква?', song: 'большую букву',
      tip: 'С большой буквы пишутся имена, названия городов и улиц, праздников (Новый год, День Победы) и главные места страны: Кремль, Красная площадь.',
    };
    if (p.alts && p.alts.some((a) => a === ' ' || a === '-')) return {
      key: 'слитно', mark: '✂', title: 'Слитно, раздельно или через дефис?', song: 'слитно и раздельно',
      tip: 'Слитно — одно слово (вмиг, зато, чтобы). Раздельно — если между словами можно вставить другое слово или задать вопрос (на ходу, за границей). Через дефис — повторы и пары слов (давным-давно, из-за, точь-в-точь).',
    };
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
    const ink = '#2b2320';
    const line = o.dark ? '#fff1d6' : ink; // черты мордочки на тёмном коте — светлые
    const fur = o.fur, muzzle = o.muzzle || '#fff8ee';
    const eyeCol = o.dark ? '#f7d046' : ink;
    const sparkle = (cx, cy, dx = 0, dy = 0, big = 1) => `<g class="blink" style="transform-origin:${cx}px ${cy}px">
      <ellipse cx="${cx}" cy="${cy}" rx="${7 * big}" ry="${9 * big}" fill="${eyeCol}"/>
      ${o.dark ? `<ellipse cx="${cx + dx}" cy="${cy + dy}" rx="${3 * big}" ry="${7 * big}" fill="#15151a"/>` : ''}
      <circle cx="${cx + 2.5 * big + dx}" cy="${cy - 3.5 * big + dy}" r="${3 * big}" fill="#fff"/>
      <circle cx="${cx - 2.5 * big + dx}" cy="${cy + 3.5 * big + dy}" r="${1.4 * big}" fill="#fff"/></g>`;
    const arc = (x) => `<path d="M${x - 8} 64 q8 -10 16 0" stroke="${line}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
    const heart = (x, y, k, c) => `<path transform="translate(${x} ${y}) scale(${k})" d="M0 6 C-9 -1 -6 -9 0 -4 C6 -9 9 -1 0 6z" fill="${c}"/>`;
    const star = (x, y) => `<path transform="translate(${x} ${y})" d="M0 -10 l3 6.5 7 1 -5 5 1.2 7 -6.2 -3.3 -6.2 3.3 1.2 -7 -5 -5 7 -1z" fill="#ffd23f" stroke="#e79a00" stroke-width="1.5" stroke-linejoin="round"/>`;
    const eyes = {
      sparkle: sparkle(42, 62) + sparkle(78, 62),
      up: sparkle(42, 62, 0, -3) + sparkle(78, 62, 0, -3),
      happy: arc(42) + arc(78),
      wink: arc(42) + sparkle(78, 62),
      love: heart(42, 62, 1.35, '#ff4f7b') + heart(78, 62, 1.35, '#ff4f7b') + '<circle cx="37" cy="58" r="2" fill="#fff"/><circle cx="73" cy="58" r="2" fill="#fff"/>',
      star: star(42, 62) + star(78, 62),
      cool: `<path d="M28 55 h28 v7 q-2 10 -14 10 q-12 0 -14 -10z M64 55 h28 v7 q-2 10 -14 10 q-12 0 -14 -10z M56 58 h8" fill="#1b1b22" stroke="#1b1b22" stroke-width="3" stroke-linejoin="round"/><path d="M34 60 l7 -3 M70 60 l7 -3" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".8"/>`,
      laugh: `<path d="M34 56 l12 7 -12 7 M86 56 l-12 7 12 7" stroke="${line}" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
      cry: sparkle(42, 63, 0, 0, 1.2) + sparkle(78, 63, 0, 0, 1.2) + `<path d="M36 73 q-3 10 1 20 q4 -6 2 -20z M84 73 q3 10 -1 20 q-4 -6 -2 -20z" fill="#7cc7ff" opacity=".9"/>`,
      shock: `<circle cx="42" cy="61" r="11" fill="#fff" stroke="${ink}" stroke-width="2.5"/><circle cx="78" cy="61" r="11" fill="#fff" stroke="${ink}" stroke-width="2.5"/><circle cx="42" cy="61" r="3.2" fill="${ink}"/><circle cx="78" cy="61" r="3.2" fill="${ink}"/><path d="M32 45 q9 -6 18 -1 M70 44 q9 -5 18 1" stroke="${line}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
      side: `<ellipse cx="44" cy="63" rx="7" ry="6" fill="${eyeCol}"/><ellipse cx="80" cy="63" rx="7" ry="6" fill="${eyeCol}"/><path d="M32 58 h22 M68 58 h22" stroke="${line}" stroke-width="3.5" stroke-linecap="round"/><circle cx="47" cy="62" r="1.8" fill="#fff"/><circle cx="83" cy="62" r="1.8" fill="#fff"/>`,
    }[o.eyes];
    const mouth = {
      w: `<path d="M51 80 q4.5 5 9 0 q4.5 5 9 0" stroke="${line}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
      grin: `<path d="M49 79 q11 17 22 0z" fill="#9c2a3a" stroke="${line}" stroke-width="2.5" stroke-linejoin="round"/><path d="M54 86 q6 5 12 0 q-6 -4 -12 0" fill="#ff8aa5"/>`,
      o: `<ellipse cx="60" cy="84" rx="5" ry="6.5" fill="#9c2a3a" stroke="${line}" stroke-width="2.5"/>`,
      flat: `<path d="M53 82 h14" stroke="${line}" stroke-width="3" stroke-linecap="round"/>`,
      wobble: `<path d="M49 84 q2.75 -3 5.5 0 q2.75 3 5.5 0 q2.75 -3 5.5 0 q2.75 3 5.5 0" stroke="${line}" stroke-width="2.8" fill="none" stroke-linecap="round"/>`,
      frown: `<path d="M52 86 q8 -7 16 0" stroke="${line}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    }[o.mouth];
    const extra = {
      none: '',
      hi: `<g class="wave" style="transform-origin:94px 104px"><path d="M92 104 q8 -12 10 -26" fill="none" stroke="${ink}" stroke-width="13" stroke-linecap="round"/><path d="M92 104 q8 -12 10 -26" fill="none" stroke="${fur}" stroke-width="8" stroke-linecap="round"/><ellipse cx="103" cy="72" rx="11" ry="12" fill="${fur}" stroke="${ink}" stroke-width="2.5"/><ellipse cx="103" cy="76" rx="4.5" ry="4" fill="#ff8fab"/><circle cx="97.5" cy="67.5" r="2.3" fill="#ff8fab"/><circle cx="103" cy="65" r="2.3" fill="#ff8fab"/><circle cx="108.5" cy="67.5" r="2.3" fill="#ff8fab"/></g>`,
      hat: `<path d="M60 0 l15 30 h-30z" fill="#8e5bd6" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/><circle cx="60" cy="1" r="5" fill="#ffd23f" stroke="${ink}" stroke-width="2"/><circle cx="55" cy="20" r="2.5" fill="#ffd23f"/><circle cx="64" cy="13" r="2.5" fill="#6fe0ff"/>`,
      sweat: `<path d="M97 34 q-7 11 0 16 q7 -5 0 -16z" fill="#8fd3ff" stroke="${ink}" stroke-width="1.5"/>`,
      q: `<text x="96" y="30" font-size="30" font-weight="900" fill="#2451c7" font-family="Nunito, sans-serif" class="bob">?</text>`,
      crown: `<path d="M38 30 l7 -20 9 12 6 -16 6 16 9 -12 7 20z" fill="#ffd23f" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/><circle cx="60" cy="22" r="3" fill="#ff4f7b"/>`,
      paws: `<ellipse cx="38" cy="104" rx="12" ry="8" fill="${fur}" stroke="${ink}" stroke-width="2.5"/><ellipse cx="82" cy="104" rx="12" ry="8" fill="${fur}" stroke="${ink}" stroke-width="2.5"/><path d="M33 102 v4 M38 102 v4 M43 102 v4 M77 102 v4 M82 102 v4 M87 102 v4" stroke="${ink}" stroke-width="1.5" stroke-linecap="round"/>`,
      hearts: `<g class="floaty">${heart(100, 22, 1, '#ff4f7b')}${heart(88, 10, .7, '#ff8aa5')}${heart(20, 18, .8, '#ff8aa5')}</g>`,
      sparkles: `<g class="floaty"><path d="M100 18 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z M18 26 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5z" fill="#ffd23f"/></g>`,
      rain: `<g class="bob"><ellipse cx="60" cy="10" rx="20" ry="8" fill="#c9d3e3"/><ellipse cx="48" cy="12" rx="10" ry="7" fill="#c9d3e3"/><ellipse cx="72" cy="12" rx="10" ry="7" fill="#c9d3e3"/><path d="M50 22 l-2 5 M60 22 l-2 5 M70 22 l-2 5" stroke="#7cc7ff" stroke-width="2.5" stroke-linecap="round"/></g>`,
      think: `<g><ellipse cx="86" cy="96" rx="11" ry="9" fill="${fur}" stroke="${ink}" stroke-width="2.5"/><text x="94" y="34" font-size="22" font-weight="900" fill="#2451c7" font-family="Nunito, sans-serif" class="bob">…</text></g>`,
    }[o.extra || 'none'];
    const stripes = o.stripes ? `<path d="M52 33 q8 5 16 0 M49 41 q11 5 22 0 M20 62 q6 1 9 4 M100 62 q-6 1 -9 4" stroke="${o.stripes}" stroke-width="4" fill="none" stroke-linecap="round"/>` : '';
    return `<svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden="true" class="kitty">
      <ellipse cx="60" cy="112" rx="30" ry="12" fill="${fur}" stroke="${ink}" stroke-width="3"/>
      <g class="ears">
        <path d="M22 52 Q15 14 30 11 Q41 14 55 34z" fill="${fur}" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M98 52 Q105 14 90 11 Q79 14 65 34z" fill="${fur}" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M28 42 Q25 22 32 19 Q39 22 46 33z M92 42 Q95 22 88 19 Q81 22 74 33z" fill="#ffb3c4"/>
      </g>
      <ellipse cx="60" cy="66" rx="46" ry="38" fill="${fur}" stroke="${ink}" stroke-width="3"/>
      ${stripes}
      <ellipse cx="60" cy="81" rx="17" ry="12" fill="${muzzle}"/>
      <ellipse cx="30" cy="77" rx="8" ry="4.5" fill="#ff8fab" opacity=".55"/>
      <ellipse cx="90" cy="77" rx="8" ry="4.5" fill="#ff8fab" opacity=".55"/>
      ${eyes}
      <path d="M56.5 73 q3.5 -2 7 0 q-1 3.5 -3.5 4.5 q-2.5 -1 -3.5 -4.5z" fill="#ff7f9c" stroke="${ink}" stroke-width="1.2"/>
      ${mouth}
      <path d="M8 70 q12 0 22 4 M8 80 q12 -2 22 -1 M112 70 q-12 0 -22 4 M112 80 q-12 -2 -22 -1" stroke="${o.dark ? '#d9d2c4' : '#6b5d57'}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      ${extra}</svg>`;
  }
  const GINGER = { fur: '#f7a54b', stripes: '#e07f22', muzzle: '#fff1dc' };
  const GREY = { fur: '#b3bdcc', stripes: '#8e9aad', muzzle: '#f1f4f8' };
  const WHITE = { fur: '#fffaf3', muzzle: '#ffffff' };
  const BLACK = { fur: '#3d3e48', muzzle: '#5b5d69', dark: true };
  const CREAM = { fur: '#f3dfc1', stripes: '#dcbb8c', muzzle: '#fffaf0' };
  const CATS_GOOD = [
    ['', { ...GINGER, eyes: 'happy', mouth: 'w', extra: 'hi' }],
    ['', { ...WHITE, eyes: 'love', mouth: 'w', extra: 'hearts' }],
    ['', { ...GREY, eyes: 'star', mouth: 'grin', extra: 'sparkles' }],
    ['', { ...BLACK, eyes: 'cool', mouth: 'w' }],
    ['', { ...GINGER, eyes: 'laugh', mouth: 'grin', extra: 'hat' }],
    ['', { ...GREY, eyes: 'happy', mouth: 'w', extra: 'crown' }],
    ['', { ...CREAM, eyes: 'wink', mouth: 'grin', extra: 'hi' }],
    ['', { ...WHITE, eyes: 'sparkle', mouth: 'grin', extra: 'paws' }],
    ['', { ...BLACK, eyes: 'love', mouth: 'w', extra: 'hearts' }],
    ['', { ...CREAM, eyes: 'star', mouth: 'w', extra: 'crown' }],
  ];
  const CATS_BAD = [
    ['', { ...WHITE, eyes: 'shock', mouth: 'o', extra: 'sweat' }],
    ['', { ...GINGER, eyes: 'side', mouth: 'flat', extra: 'q' }],
    ['', { ...GREY, eyes: 'cry', mouth: 'wobble', extra: 'rain' }],
    ['', { ...BLACK, eyes: 'shock', mouth: 'o' }],
    ['', { ...CREAM, eyes: 'up', mouth: 'flat', extra: 'think' }],
    ['', { ...GINGER, eyes: 'cry', mouth: 'wobble' }],
    ['', { ...GREY, eyes: 'side', mouth: 'wobble', extra: 'sweat' }],
    ['', { ...WHITE, eyes: 'sparkle', mouth: 'frown', extra: 'paws' }],
  ];
  // Подписи: {n} — имя ребёнка. Только настоящее время, чтобы не зависеть от рода.
  const CAPS_GOOD = [
    '{n}, ТЫ {БОЛЬШОЙ МОЛОДЕЦ/БОЛЬШАЯ УМНИЦА}!', '{МОЛОДЕЦ/УМНИЧКА}, {n}!', 'ТЫ {ОТЛИЧНО ПОСТАРАЛСЯ/ОТЛИЧНО ПОСТАРАЛАСЬ}!',
    '{n}, ТЫ {СПРАВИЛСЯ/СПРАВИЛАСЬ} НА ОТЛИЧНО!', 'ТЫ {НАСТОЯЩИЙ ГРАМОТЕЙ/НАСТОЯЩАЯ ГРАМОТЕЙКА}!', 'УМНИЦА, {n}!', 'ПРЕВОСХОДНО!', 'ВЕЛИКОЛЕПНО, {n}!', 'БЛЕСТЯЩЕ!',
    'ЗАМЕЧАТЕЛЬНО!', '{n}, Я ТОБОЙ ГОРЖУСЬ', 'БЕЗУПРЕЧНО!', 'ЧУДЕСНО, {n}!', 'ТАК ДЕРЖАТЬ, {n}!',
    'ОТЛИЧНО! ПЯТЁРКА С ПЛЮСОМ', 'КОТ АПЛОДИРУЕТ СТОЯ', 'ЛУЧШЕ И НЕ НАПИСАТЬ', 'ВОТ ЭТО ЗНАНИЯ!',
    'ПРЕКРАСНЫЙ ОТВЕТ', 'ЗОЛОТАЯ ГОЛОВА, {n}!', 'КОТ МУРЛЫЧЕТ ОТ СЧАСТЬЯ', 'РУССКИЙ ЯЗЫК ГОРДИТСЯ ТОБОЙ',
    'ТАЛАНТ! ПРОДОЛЖАЙ', '{n}, ТЫ ПРОСТО ЧУДО', 'ВЕРНО! УМ ДА СТАРАНИЕ', 'ЛЕГКО И КРАСИВО',
    'ГРАМОТНО, КАК В КНИГЕ', 'КОТ ГОВОРИТ: «БРАВО!»', 'ВОТ ЭТО ВНИМАТЕЛЬНОСТЬ!', 'УЧИТЕЛЬ БЫ ПОСТАВИЛ ПЯТЬ',
  ];
  const CAPS_BAD = [
    'НИЧЕГО СТРАШНОГО, {n}', 'ТЫ ПОЧТИ {УГАДАЛ/УГАДАЛА}!', 'ОШИБКА — ЭТО ШАГ К УСПЕХУ', 'ДАВАЙ ЕЩЁ РАЗ, Я ВЕРЮ В ТЕБЯ', 'ПОЧТИ! ЕЩЁ ЧУТЬ-ЧУТЬ',
    'НЕ СДАЁМСЯ, {n}!', 'ДАЖЕ У ВЕЛИКИХ БЫЛИ ОШИБКИ', 'ПОДУМАЙ ЕЩЁ НЕМНОЖКО', 'ТЕРПЕНИЕ И ТРУД ВСЁ ПЕРЕТРУТ',
    'ПОВТОРЕНИЕ — МАТЬ УЧЕНИЯ', 'КОТ ВЕРИТ В ТЕБЯ, {n}', 'НЕ БЕДА! ЗАПОМНИМ ВМЕСТЕ', 'НА ОШИБКАХ УЧАТСЯ',
    'ТИШЕ ЕДЕШЬ — ДАЛЬШЕ БУДЕШЬ', 'ПОСМОТРИ НА КРАСНУЮ БУКВУ', 'В СЛЕДУЮЩИЙ РАЗ ПОЛУЧИТСЯ',
  ];
  const CAPS_COMBO = {
    3: ['{n}, ТРИ ИЗ ТРЁХ — ВЕЛИКОЛЕПНО!', 'ТРИ ПОДРЯД! КОТ В ВОСХИЩЕНИИ'],
    5: ['ПЯТЬ ПОДРЯД! {n}, ЭТО БЛЕСТЯЩЕ', 'ПЯТЬ ИЗ ПЯТИ — {НАСТОЯЩИЙ ЗНАТОК/НАСТОЯЩАЯ УМНИЦА}'],
    10: ['ДЕСЯТЬ ПОДРЯД! {n} — ГОРДОСТЬ КЛАССА', 'ДЕСЯТЬ ПОДРЯД! КОТ СНИМАЕТ ШЛЯПУ'],
  };
  const pickOne = (a) => a[Math.floor(Math.random() * a.length)];
  /** Слово в нужном роде: g('постарался', 'постаралась'). Пока пол не выбран — мужской. */
  const g = (m, f) => (S.gender === 'f' ? f : m);
  /** Подпись кота: {n} — имя, {мужской/женский} — вариант по роду. */
  const withName = (c) => c
    .replace(/\{([^{}\/]+)\/([^{}]+)\}/g, (x, m, f) => g(m, f))
    .replace(/\{n\}/g, (S.name || 'друг').toUpperCase());
  const ownReacts = (kind) => [...PICS.keys()].filter((k) => k.startsWith('react:' + kind + ':'));
  let reactTimer = 0;
  /** Кот выскакивает в углу. caption — своя подпись (например, за серию ответов). */
  function react(ok, caption) {
    if (S.cats === false) return;
    const kind = ok ? 'good' : 'bad';
    const own = ownReacts(kind);
    const img = own.length && Math.random() < 0.6
      ? `<img src="${PICS.get(pickOne(own))}" alt="">`
      : catSvg(pickOne(ok ? CATS_GOOD : CATS_BAD)[1]);
    const cap = withName(caption || pickOne(ok ? CAPS_GOOD : CAPS_BAD));
    let el = document.getElementById('react');
    if (!el) { el = document.createElement('div'); el.id = 'react'; document.body.appendChild(el); }
    el.className = 'react ' + kind;
    el.innerHTML = `<div class="rimg ${ok ? 'happy' : 'sad'}">${img}</div><div class="rcap">${esc(cap)}</div>`;
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

  // ---------- Своя клавиатура для письма ----------
  // Клавиатура телефона подсказывает и исправляет слова (и печатает свайпом) — в диктанте это подсказка.
  // Поэтому на сенсорных экранах буквы вводятся с кнопок приложения, системная клавиатура не открывается.
  const TOUCH = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  const KBD_ROWS = ['йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбюё'];
  function keyboardHtml() {
    const row = (r) => `<div class="kbdrow">${[...r].map((c) => `<button type="button" class="key" data-act="key" data-k="${c}">${c}</button>`).join('')}</div>`;
    return `<div class="kbd" aria-label="Клавиатура">${KBD_ROWS.map(row).join('')}
      <div class="kbdrow"><button type="button" class="key wide" data-act="key" data-k="-">-</button><button type="button" class="key space" data-act="key" data-k=" ">пробел</button><button type="button" class="key wide" data-act="key" data-k="back" aria-label="Стереть">⌫</button></div></div>`;
  }

  // ---------- Яндекс Метрика (только если в config.js указан номер счётчика) ----------
  // Цели: setup_kid / setup_adult (знакомство), words_pick (выбрали слова), tab_learn / tab_stories / tab_train / tab_me,
  // train_start / train_done, bolt_start / bolt_done, story_save, story_fixed, open_installed, install, share.
  function goal(name, params) {
    try { if (CFG.metrikaId && window.ym) window.ym(+CFG.metrikaId, 'reachGoal', name, params); } catch (e) { /* ничего */ }
  }
  if (/^\d+$/.test(String(CFG.metrikaId))) {
    try {
      window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
      window.ym.l = +new Date();
      const sc = document.createElement('script');
      sc.async = true; sc.src = 'https://mc.yandex.ru/metrika/tag.js';
      document.head.appendChild(sc);
      window.ym(+CFG.metrikaId, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true });
    } catch (e) { /* без статистики */ }
  }

  // ---------- Установка на телефон ----------
  let installEvt = null;
  const isStandalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  if (isStandalone()) goal('open_installed');
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; if (V.tab === 'me') render(); });
  if ('serviceWorker' in navigator && location.protocol === 'https:' && /github\.io$|\.ru$|\.рф$|\.com$/.test(location.hostname)) {
    // Новая версия скачивается фоном. Если она пришла в первые секунды после запуска (пока идёт заставка) —
    // сразу перезагружаемся на неё, иначе она откроется при следующем запуске.
    const hadController = !!navigator.serviceWorker.controller, bootAt = Date.now();
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading || Date.now() - bootAt > 8000) return;
      reloading = true; location.reload();
    });
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* без офлайна */ }); });
  }
  async function shareApp() {
    const url = location.href.split('#')[0];
    const text = `${CFG.appName}: словарные слова с котами, смешными историями и тренировкой. Попробуй!`;
    try {
      if (navigator.share) { await navigator.share({ title: CFG.appName, text, url }); goal('share'); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text + ' ' + url); toast('Ссылка скопирована — отправьте её другу'); goal('share'); } catch (e) { toast(url); }
  }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); toast('Текст скопирован'); } catch (e) {
      const ta = document.getElementById('reportText');
      if (ta) { ta.focus(); ta.select(); toast('Выделите текст и скопируйте'); }
    }
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
    ['learn', '💡', 'Учу'],
    ['stories', '😂', 'Истории'],
    ['train', '✍️', 'Тренировка'],
    ['me', '📊', 'Итоги'],
  ];

  function header() {
    return `<header class="top">
      <div class="row" style="gap:12px"><h1 class="logo">${logoHtml(CFG.appName)}</h1><span class="stars" title="Звёзды за успехи">⭐ <b id="starCount">${S.stars || 0}</b></span>
      </div>
      ${S.setup ? `<div class="row" style="gap:8px">
        <button class="hi" data-act="editName" title="Настройки">${S.grade === 'all' ? '🧑 Все слова' : '📘 ' + S.grade + ' класс'}</button>
        ${S.name ? `<button class="hi" data-act="editName" title="Поменять имя">👋 ${esc(S.name)}</button>` : ''}
      </div>` : ''}
    </header>`;
  }

  function render() {
    if (S.grade !== 'all' && !BUILTIN[S.grade]) S.grade = GRADES[0];
    if (S.setup) checkAch();
    tabs.innerHTML = TABS.map(([id, ic, name]) =>
      `<button class="tab" data-act="tab" data-tab="${id}" ${V.tab === id ? 'aria-current="page"' : ''}><i aria-hidden="true">${ic}</i>${name}</button>`).join('');
    let body = '';
    if (!S.setup || V.editName) body = viewHello();
    else if (V.draw && byId(V.draw)) body = viewDraw();
    else if (V.tab === 'words') body = viewWords();
    else if (V.tab === 'learn') body = viewLearn();
    else if (V.tab === 'stories') body = viewStories();
    else if (V.tab === 'me') body = viewMe();
    else body = viewTrain();
    if (V.report) body = viewReport() + body;
    app.innerHTML = header() + body;
    if (V.draw && byId(V.draw)) setupCanvas();
    afterRender();
  }

  function viewHello() {
    const who = V.hWho !== undefined ? V.hWho : S.setup ? (S.grade === 'all' ? 'adult' : 'kid') : '';
    const gen = V.hGender !== undefined ? V.hGender : S.gender;
    const gr = V.hGrade !== undefined ? V.hGrade : S.setup && S.grade !== 'all' ? String(S.grade) : '';
    const name = V.hName !== undefined ? V.hName : S.name || '';
    return `<section class="panel card hello">
      <div class="hellocat">${catSvg({ ...GINGER, eyes: 'happy', mouth: 'grin', extra: 'paws' })}</div>
      <h2>${S.setup ? 'Настройки' : 'Привет! Я Кот-Словарик'}</h2>
      <p class="lead">${S.setup ? 'Здесь можно поменять имя и класс.' : 'Буду болеть за тебя на каждом слове. Давай познакомимся!'}</p>
      <form id="nameForm" class="setup">
        <label class="label" for="nameInput">Как тебя зовут?</label>
        <input type="text" id="nameInput" class="answer" maxlength="20" autocomplete="off" inputmode="text" enterkeyhint="done" placeholder="Твоё имя" value="${esc(name)}">
        <span class="label">Кто будет заниматься?</span>
        <div class="row" style="justify-content:center">
          <button type="button" class="pickbig" data-act="hWho" data-v="kid" aria-pressed="${who === 'kid'}">🎒 Школьник</button>
          <button type="button" class="pickbig" data-act="hWho" data-v="adult" aria-pressed="${who === 'adult'}">🧑 Взрослый</button>
        </div>
        ${who ? `<span class="label">${who === 'adult' ? 'Как к вам обращаться?' : 'Ты…'}</span>
        <div class="row" style="justify-content:center">
          <button type="button" class="pickbig" data-act="hGender" data-v="m" aria-pressed="${gen === 'm'}">${who === 'adult' ? '👨 Мужчина' : '👦 Мальчик'}</button>
          <button type="button" class="pickbig" data-act="hGender" data-v="f" aria-pressed="${gen === 'f'}">${who === 'adult' ? '👩 Женщина' : '👧 Девочка'}</button>
        </div>` : ''}
        ${who === 'kid' ? `<span class="label">В каком ты классе?</span>
        <div class="gradepick">${GRADES.map((x) => `<button type="button" class="grade" data-act="hGrade" data-v="${x}" aria-pressed="${gr === x}">${x}</button>`).join('')}</div>` : ''}
        ${who === 'adult' ? '<p class="muted" style="margin:0">Для взрослых — все словарные слова с 1 по 8 класс, без деления по классам. Выбирайте любые и тренируйтесь.</p>' : ''}
        <button class="btn" type="submit" style="align-self:center">${S.setup ? 'Сохранить' : 'Начнём!'}</button>
      </form>
      ${S.setup ? '<button class="btn small ghost" data-act="setupClose">Отмена</button>' : ''}
    </section>`;
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
          <h2>Словарные слова · ${S.grade === 'all' ? 'все классы' : S.grade + ' класс'}</h2>
          <p class="lead">${S.grade === 'all' ? 'Нажмите на слова, которые хотите выучить. Лучше брать по 5–10 штук.' : 'Нажми на слова, которые нужно выучить сейчас. Лучше брать по 5–10 штук.'}</p>
        </div>
      </section>
      <div class="stats">
        <div class="stat"><b>${ws.length}</b><span class="muted">${plural(ws.length, 'слово', 'слова', 'слов')}${S.grade === 'all' ? ' всего' : ' за год'}</span></div>
        <div class="stat sel"><b>${sel.size}</b><span class="muted">выбрано сейчас</span></div>
        <div class="stat ok"><b>${learned}</b><span class="muted">уже ${plural(learned, 'выучено', 'выучены', 'выучено')}</span></div>
      </div>
      ${(() => {
        const due = ws.filter((w) => status(w.id) === 'due').length;
        return due ? `<div class="duebanner"><span>🔁 Пора повторить: <b>${due}</b> ${plural(due, 'слово', 'слова', 'слов')}. Так они не забудутся.</span>
          <button class="btn small" data-act="reviewDue">Повторить</button></div>` : '';
      })()}
      <div class="row">
        <button class="btn" data-act="pick10">Взять 10 новых</button>
        <button class="btn ghost" data-act="selAll" ${sel.size === ws.length ? 'disabled' : ''}>Выбрать все</button>
        <button class="btn ghost" data-act="clearSel" ${sel.size ? '' : 'disabled'}>Снять выбор</button>
        <button class="btn ghost" data-act="tab" data-tab="learn" ${sel.size ? '' : 'disabled'}>Учить выбранные →</button>
      </div>
      <div class="legend">
        <span><i style="background:var(--line)"></i>новое</span>
        <span><i style="background:var(--pencil)"></i>учу</span>
        <span><i style="background:var(--green)"></i>выучено</span>
        <span><i style="background:var(--orange)"></i>пора повторить</span>
      </div>
      ${(() => {
        const byLetter = new Map();
        ws.forEach((w) => {
          const L = w.id.charAt(0).toUpperCase().replace('Ё', 'Е');
          if (!byLetter.has(L)) byLetter.set(L, []);
          byLetter.get(L).push(w);
        });
        const letters = [...byLetter.keys()];
        return `<nav class="abc" aria-label="Буквы">${letters.map((L) => `<button data-act="jump" data-l="${L}">${L}</button>`).join('')}</nav>
        ${letters.map((L) => `<section class="letterblock" id="L-${L}">
          <h3 class="alpha">${L}<span>${byLetter.get(L).length}</span></h3>
          <div class="words">${byLetter.get(L).map((w) => `<button class="word" data-act="toggle" data-id="${esc(w.id)}" aria-pressed="${sel.has(w.id)}">
            ${thumb(w)}<span>${marked(w.parts)}${noteHtml(w)}</span><span class="dot ${status(w.id)}"></span>
          </button>`).join('')}</div>
        </section>`).join('')}`;
      })()}
      <details class="panel">
        <summary>Добавить слово, которого нет в списке</summary>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">
          <p class="muted" style="margin:0">Трудную букву возьми в квадратные скобки. Через « | » можно добавить картинку-эмодзи и подсказку.<br>Например: <b>в[о]кзал | 🚉 | На вокзале круглые часы — О</b></p>
          <input type="text" id="newWord" inputmode="text" placeholder="к[о]р[о]ва | 🐄 | Корова мычит «Мо-о-о»" autocomplete="off" spellcheck="false">
          <div class="row"><button class="btn small" data-act="addWord">${S.grade === 'all' ? 'Добавить слово' : 'Добавить в ' + S.grade + ' класс'}</button></div>
          ${custom.length ? `<div class="chips">${custom.map((c, i) => `<span class="chip">${marked(parseLine(c).parts)} <button class="btn small ghost" style="min-height:0;padding:0 6px;border:0" data-act="delWord" data-i="${i}" aria-label="Удалить">✕</button></span>`).join('')}</div>` : ''}
        </div>
      </details>
      <p class="muted">${S.grade === 'all'
        ? 'Слова из орфографических словарей учебников «Русский язык»: 1–4 класс — Канакина, Горецкий (УМК «Школа России»), 5–8 класс — Ладыженская, Баранов, Тростенцова.'
        : +S.grade <= 4
        ? `Слова из орфографического словаря учебника «Русский язык. ${S.grade} класс» Канакиной, Горецкого (УМК «Школа России»).`
        : +S.grade <= 4
        ? 'Списки взяты из словариков учебника «Русский язык» (УМК «Школа России»).'
        : +S.grade >= 5
          ? `Слова из орфографического словаря учебника «Русский язык. ${S.grade} класс» Ладыженской, Баранова, Тростенцовой (${{ 5: 'с. 235–237', 6: 'ФГОС, 2023', 7: '2-е издание, 2020', 8: '5-е издание, 2023' }[S.grade]}).`
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
          <button class="btn small ghost" data-act="report" data-id="${esc(w.id)}">⚠️ Ошибка?</button>
        </div>
        <div class="muted">Скажи по слогам так, как пишется:<br><b style="font-size:24px;color:var(--ink)">${syllables(w)}</b></div>
        ${defOf(w) ? `<div class="hint"><span class="label">Что значит</span>${esc(defOf(w))}</div>` : ''}
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

  // ---------- Вкладка «Прогресс» (для ребёнка и родителей) ----------
  function viewMe() {
    const streak = streakDays();
    const days = S.days || {};
    const last = [];
    for (let i = 13; i >= 0; i--) { const k = dayKey(today() - i * DAY); last.push([k, days[k] || { ok: 0, bad: 0 }]); }
    const maxN = Math.max(5, ...last.map(([, d]) => d.ok + d.bad));
    const totalAns = Object.values(days).reduce((a, d) => a + d.ok + d.bad, 0);
    const gradeRows = GRADES.map((g) => {
      const ws = gradeWords(g);
      const c = { learned: 0, learning: 0, due: 0, new: 0 };
      ws.forEach((w) => { c[status(w.id)]++; });
      return { g, total: ws.length, ...c };
    }).filter((r) => r.learned + r.learning + r.due > 0 || String(r.g) === String(S.grade));
    const hard = words().filter((w) => hasMistake(w.id)).map((w) => [w, stat(w.id)])
      .sort((a, b) => b[1].bad - a[1].bad).slice(0, 12);
    const fixes = (S.cnt && S.cnt.fixes) || 0;
    const wd = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
    return `
      <h2>${S.name ? esc(S.name) + ', твой прогресс' : 'Прогресс'}</h2>
      <div class="stats">
        <div class="stat"><b>🔥 ${streak}</b><span class="muted">${plural(streak, 'день', 'дня', 'дней')} подряд</span></div>
        <div class="stat"><b>⭐ ${S.stars || 0}</b><span class="muted">звёзд</span></div>
        <div class="stat"><b>${totalAns}</b><span class="muted">${plural(totalAns, 'ответ', 'ответа', 'ответов')} всего</span></div>
      </div>
      ${achHtml()}
      <section class="panel" style="display:flex;flex-direction:column;gap:10px">
        <span class="label">Занятия за 2 недели</span>
        <div class="chart" role="img" aria-label="Ответы по дням">
          ${last.map(([k, d]) => {
            const dt = new Date(k + 'T12:00:00');
            const hOk = Math.round((d.ok / maxN) * 100), hBad = Math.round((d.bad / maxN) * 100);
            return `<div class="bar" title="${dt.getDate()}.${dt.getMonth() + 1}: верно ${d.ok}, ошибок ${d.bad}">
              <div class="stack"><i class="b" style="height:${hBad}%"></i><i class="g" style="height:${hOk}%"></i></div>
              <span>${wd[dt.getDay()]}</span></div>`;
          }).join('')}
        </div>
        <div class="legend"><span><i style="background:var(--green)"></i>верно</span><span><i style="background:var(--red)"></i>ошибки</span></div>
      </section>
      <section class="panel" style="display:flex;flex-direction:column;gap:10px">
        <span class="label">Слова по классам</span>
        <div class="tablewrap"><table class="gtable">
          <thead><tr><th>Класс</th><th>Выучено</th><th>Учу</th><th>Повтор.</th><th>Всего</th></tr></thead>
          <tbody>${gradeRows.map((r) => `<tr><td>${r.g}</td><td class="ok">${r.learned}</td><td>${r.learning}</td><td class="due">${r.due}</td><td>${r.total}</td></tr>`).join('')}</tbody>
        </table></div>
        ${hard.length ? `<span class="label">Работа над ошибками · ${gradeName()}</span>
          <div class="chips">${hard.map(([w, st]) => `<span class="chip">${marked(w.parts)} <small class="muted">×${st.bad}</small></span>`).join('')}</div>
          <div class="row"><button class="btn small" data-act="fixMistakes">🩹 Исправить ошибки</button>
          <span class="muted">Ответь правильно — и слово уйдёт из этого списка.</span></div>`
          : fixes ? `<p style="margin:0">🩹 Все ошибки исправлены! Исправлено ошибок: <b>${fixes}</b>.</p>` : ''}
        <p class="muted" style="margin:0">Прогресс хранится только на этом устройстве. Слово считается выученным, когда ребёнок ответил правильно в разные дни.</p>
      </section>
      <section class="panel" style="display:flex;flex-direction:column;gap:10px">
        <span class="label">Приложение</span>
        <div class="row">
          ${isStandalone() ? '<span class="chip on">📲 Установлено на телефон</span>' : `<button class="btn small" data-act="install">📲 Установить на телефон</button>`}
          <button class="btn small ghost" data-act="share">🔗 Поделиться с другом</button>
          <button class="btn small ghost" data-act="report" data-id="">⚠️ Нашли ошибку?</button>
          <button class="btn small ghost" data-act="editName">✏️ Изменить имя</button>
        </div>
        ${V.installHelp ? `<p class="hint" style="margin:0">${isIOS()
          ? 'На iPhone: нажмите кнопку «Поделиться» внизу Safari (квадрат со стрелкой) → «На экран Домой».'
          : 'Откройте меню браузера (три точки) → «Установить приложение» или «Добавить на главный экран».'}</p>` : ''}
      </section>
      <details class="panel" id="catsBox">
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
      ${CFG.blogUrl ? `<a class="panel blog" href="${esc(CFG.blogUrl)}" target="_blank" rel="noopener">
        <span style="font-size:30px" aria-hidden="true">✉️</span>
        <span><b>${esc(CFG.blogTitle || 'Написать автору')}</b>${CFG.blogSub ? `<br><span class="muted">${esc(CFG.blogSub)}</span>` : ''}</span></a>` : ''}
      ${CFG.author ? `<p class="muted" style="text-align:center">Сделано с любовью: ${esc(CFG.author)}</p>` : ''}`;
  }

  // ---------- «Нашли ошибку?» ----------
  function viewReport() {
    const w = V.report.id ? byId(V.report.id) : null;
    const text = w
      ? `Ошибка в словаре «${CFG.appName}»: слово «${w.id}», ${gradeName()}. Что не так: `
      : `Сообщение для «${CFG.appName}» (${gradeName()}): `;
    return `<section class="panel report" role="dialog" aria-label="Сообщить об ошибке">
      <div class="row between"><h2>Нашли ошибку?</h2><button class="btn small ghost" data-act="reportClose">Закрыть</button></div>
      <p class="muted" style="margin:0">Спасибо, что помогаете! Допишите, что не так, скопируйте текст и отправьте автору${CFG.feedbackUrl ? ' через форму' : CFG.blogUrl ? ' в Telegram' : ''}.</p>
      <textarea id="reportText" spellcheck="true">${esc(text)}</textarea>
      <div class="row">
        <button class="btn small" data-act="reportCopy">📋 Скопировать текст</button>
        ${CFG.feedbackUrl ? `<a class="btn small ghost" href="${esc(CFG.feedbackUrl)}" target="_blank" rel="noopener">Открыть форму</a>` : ''}
        ${!CFG.feedbackUrl && CFG.blogUrl ? `<a class="btn small ghost" href="${esc(CFG.blogUrl)}" target="_blank" rel="noopener">Написать в Telegram</a>` : ''}
      </div>
    </section>`;
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
      const text = w.phrase || w.marked;
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
      return `<button class="${cls}" data-act="fixTap" data-k="${esc(key)}" data-i="${i}" aria-label="Пропуск">${ans == null ? '?' : ans === '' ? '·' : ans === ' ' ? '␣' : esc(ans)}</button>`;
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
    const RS = window.SLOVARIK_STORIES || {};
    const ready = S.grade === 'all' ? GRADES.flatMap((g) => RS[g] || []) : RS[S.grade] || [];
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
        <span class="label">Готовые истории для ${gradeName(true)}</span>
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
    goal('bolt_start');
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
      B.done = true; goal('bolt_done');
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
        <p class="lead">Правильных ответов: <b>${B.score}</b>, ошибок: <b>${B.miss}</b>. Рекорд ${gradeName(true)}: <b>${S.best[S.grade] || 0}</b>.</p>
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
    if (V.trainSet === 'due') return words().filter((w) => status(w.id) === 'due');
    if (V.trainSet === 'mistakes') return words().filter((w) => hasMistake(w.id));
    if (V.trainSet === 'all') return words();
    return selectedWords();
  }

  function startTrain(mode, pool) {
    goal('train_' + mode);
    const list = shuffle(pool || trainPool()).slice(0, 15);
    if (!list.length) { toast('Нет слов для тренировки'); return; }
    V.combo = 0;
    goal('train_start', { mode });
    V.train = { mode, queue: list.map((w) => w.id), total: list.length, pos: 0, firstTry: 0, mistakes: [], repeated: new Set(), task: null };
    nextTask();
  }

  function nextTask() {
    const T = V.train;
    if (T.pos >= T.queue.length) {
      T.task = null; T.done = true; goal('train_done', { mode: T.mode });
      cnt('trains'); if (T.total >= 10 && !T.mistakes.length) cnt('perfect');
      save(); render();
      if (T.total && T.firstTry / T.total >= 0.9) confetti();
      return;
    }
    const w = byId(T.queue[T.pos]);
    const task = { id: w.id, w, wrong: false, solved: false };
    if (T.mode === 'fill') {
      task.gaps = w.parts.map((p, i) => (p.t ? i : -1)).filter((i) => i >= 0);
      task.gi = 0;
      task.orders = {};
      task.gaps.forEach((i) => { task.orders[i] = stableAlts(w.parts[i].alts); });
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
    t.ok = ok;
    const again = T.repeated.has(t.id);
    if (!again) {
      record(t.id, ok);
      if (ok) { T.firstTry++; addStars(1); }
      V.combo = ok ? (V.combo || 0) + 1 : 0;
      if (ok && V.justFixed === t.id) { V.justFixed = null; react(true, 'ОШИБКА ИСПРАВЛЕНА! ТАК ДЕРЖАТЬ'); }
      else react(ok, ok && CAPS_COMBO[V.combo] ? pickOne(CAPS_COMBO[V.combo]) : null);
      if (ok) S.cnt.bestCombo = Math.max(S.cnt.bestCombo || 0, V.combo);
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
    const mist = words().filter((w) => hasMistake(w.id)).length;
    const due = words().filter((w) => status(w.id) === 'due').length;
    if (V.trainSet === 'selected' && !sel) V.trainSet = due ? 'due' : mist ? 'mistakes' : 'all';
    if (V.trainSet === 'due' && !due) V.trainSet = sel ? 'selected' : 'all';
    const sets = [
      ['due', `🔁 Пора повторить (${due})`, due],
      ['selected', `Выбранные (${sel})`, sel],
      ['mistakes', `С ошибками (${mist})`, mist],
      ['all', `Все слова ${gradeName(true)}`, words().length],
    ];
    return `
      <h2>Тренировка</h2>
      <p class="lead">Начни с «Вставь букву», а когда будет получаться — пиши слова целиком. Слово выучено, когда ты ответишь правильно в разные дни: сегодня, завтра, через 3 дня. Потом кот сам напомнит его повторить.</p>
      <div class="row" role="group" aria-label="Какие слова">
        <span class="label">Какие слова:</span>
        ${sets.map(([k, name, n]) => `<button class="chip" data-act="set" data-k="${k}" aria-pressed="${V.trainSet === k}" ${n ? '' : 'disabled'}>${name}</button>`).join('')}
      </div>
      ${V.trainSet === 'selected' ? `<div class="row" style="gap:8px">
        <span class="muted">Будем тренировать: ${selectedWords().slice(0, 12).map((w) => '<b>' + esc(w.id) + '</b>').join(', ')}${sel > 12 ? ' и ещё ' + (sel - 12) : ''}.</span>
        ${sel < 5 ? `<button class="btn small" data-act="topUp">➕ Добавить до 10 слов</button>` : ''}
        <button class="btn small ghost" data-act="tab" data-tab="words">Выбрать другие</button></div>` : ''}
      <div class="modes">
        ${Object.entries(MODES).map(([k, m]) => `<button class="mode" data-act="start" data-mode="${k}">
          <span class="e" aria-hidden="true">${m.e}</span><b>${m.name}</b><span class="muted">${m.about}</span></button>`).join('')}
      </div>
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
          if (i in t.filled) return `<span class="gap filled">${p.s === ' ' ? '&nbsp;' : esc(p.s) || '·'}</span>`;
          return `<span class="gap ${i === cur ? 'now' : ''}">&nbsp;</span>`;
        }).join('')}</div>
        ${t.solved ? verdictGood(w) : `<div class="opts">${t.orders[cur].map((a) =>
          `<button class="opt ${a.length !== 1 || a === ' ' || a === '-' ? 'wide' : ''} ${t.bad[cur + ':' + a] ? 'wrong' : ''}" data-act="fillPick" data-a="${esc(a)}">${altLabel(a, w.parts[cur].alts)}</button>`).join('')}</div>`}
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
        <button class="btn" data-act="lookHide">Я ${g('запомнил', 'запомнила')}</button>`;
    } else {
      const speakable = canSpeak();
      const masked = w.parts.map((p) => (p.t ? '<span class="gap">&nbsp;</span>' : esc(p.s))).join('');
      inner = `
        <div class="pic" aria-hidden="true">${pic(w)}</div>
        ${T.mode === 'write' ? (speakable
          ? `<button class="speak" data-act="say" data-text="${esc(w.id)}" aria-label="Послушать слово">🔊</button><p class="muted">Нажми, чтобы послушать ещё раз</p>`
          : `<div class="gapword" style="font-size:32px">${masked}</div><p class="muted">Напиши слово целиком, вставив пропущенные буквы</p>`) : `<p class="muted">Какое слово ты ${g('видел', 'видела')}? Напиши его.</p>`}
        ${T.mode === 'write' && defOf(w) && !t.solved ? (t.showDef ? defBox(w) : '<button class="btn small ghost" data-act="showDef">❓ Что это за слово?</button>') : ''}
        ${t.solved && !t.copy ? verdictGood(w, t.caseNote) : ''}
        ${t.copy ? verdictBad(w, t.answer) : ''}
        ${!t.solved || t.copy ? `
        <form id="writeForm" class="row" style="justify-content:center;width:100%">
          <input type="text" id="answer" class="answer" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" ${TOUCH ? 'readonly' : ''} placeholder="${t.copy ? 'Перепиши правильно' : 'Пиши здесь'}" aria-label="Ответ">
          <button class="btn" type="submit">${t.copy ? 'Готово' : 'Проверить'}</button>
        </form>
        ${TOUCH ? keyboardHtml() : ''}` : ''}`;
    }
    const canNext = t.solved && !t.copy;
    const note = w.note ? `<p class="muted" style="margin:0">(${esc(w.note)})</p>` : '';
    return `${taskTop()}
      <article class="panel card">${inner.replace('</div>', '</div>' + note)}</article>
      ${canNext ? '<div class="row" style="justify-content:center"><button class="btn nextbtn" data-act="next" id="nextBtn">Дальше →<span class="nextbar" id="nextBar"></span></button></div>' : ''}`;
  }

  const defBox = (w) => `<div class="hint defbox"><span class="label">Что это за слово</span>${esc(defOf(w))}</div>`;

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
      <span class="your">Ты ${simple ? g('выбрал', 'выбрала') : g('написал', 'написала')}: ${yours || '—'}</span>
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
        <div class="resultcat">${catSvg(stars === 3 ? { ...BLACK, eyes: 'cool', mouth: 'grin', extra: 'crown' } : stars === 2 ? { ...GINGER, eyes: 'happy', mouth: 'w', extra: 'hi' } : { ...WHITE, eyes: 'side', mouth: 'flat', extra: 'paws' })}</div>
        <div class="meme">${esc(withName(stars === 3 ? pickOne(['{n}, ТЫ {БОЛЬШОЙ МОЛОДЕЦ/БОЛЬШАЯ УМНИЦА}!', 'ТЫ {ОТЛИЧНО ПОСТАРАЛСЯ/ОТЛИЧНО ПОСТАРАЛАСЬ}!', 'ВЕЛИКОЛЕПНО! КОТ ГОРДИТСЯ ТОБОЙ', 'БЕЗ ЕДИНОЙ ОШИБКИ — БЛЕСТЯЩЕ!']) : stars === 2 ? pickOne(['{n}, ХОРОШО! ЕЩЁ НЕМНОГО — И БУДЕТ ОТЛИЧНО', 'ХОРОШАЯ РАБОТА! ПРОДОЛЖАЕМ']) : pickOne(['НЕ БЕДА, {n}. ПОВТОРЕНИЕ — МАТЬ УЧЕНИЯ', 'КОТ ВЕРИТ В ТЕБЯ. ПОПРОБУЕМ ЕЩЁ РАЗ'])))}</div>
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

  /** Подпись варианта: пробел и дефис показываем словами. */
  function altLabel(a, alts) {
    if (a === ' ') return 'раздельно';
    if (a === '-') return 'через дефис';
    if (a === '') return alts.some((x) => x === ' ' || x === '-') ? 'слитно' : 'ничего';
    return esc(a);
  }

  /** После ответа следующее слово появляется само: быстро, если верно, и чуть позже, если была ошибка. */
  function scheduleNext() {
    const T = V.train;
    const t = T && T.task;
    if (!t || !t.solved || t.copy || t.autoSet || V.tab !== 'train') return;
    t.autoSet = true;
    const delay = t.ok ? 1300 : 3200;
    const bar = document.getElementById('nextBar');
    if (bar) bar.style.animationDuration = delay + 'ms';
    setTimeout(() => { if (V.train === T && T.task === t && V.tab === 'train') goNext(); }, delay);
  }

  function afterRender() {
    scheduleNext();
    const input = document.getElementById('answer');
    if (input && !TOUCH) input.focus();
    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn && !input) nextBtn.focus({ preventScroll: true });
  }

  // ---------- События ----------
  document.addEventListener('click', (e) => {
    const j = e.target.closest('[data-act="jump"]');
    if (j) {
      const sec = document.getElementById('L-' + j.dataset.l);
      if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const d = e.target.closest('[data-dact]');
    if (d) { drawAction(d); return; }
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const T = V.train;
    const keepY = window.scrollY;
    switch (act) {
      case 'key': {
        const inp = document.getElementById('answer');
        if (!inp) return;
        const k = el.dataset.k;
        inp.value = k === 'back' ? inp.value.slice(0, -1) : inp.value + k;
        return;
      }
      case 'topUp': {
        const cur = selectedIds();
        const have = new Set(cur);
        const add = words().filter((w) => status(w.id) !== 'learned' && !have.has(w.id)).slice(0, Math.max(0, 10 - cur.length));
        if (!add.length) { toast('Новых слов больше нет'); return; }
        S.selected[S.grade] = cur.concat(add.map((w) => w.id)); save(); V.trainSet = 'selected'; goal('words_pick');
        toast(`Добавлено ${add.length} ${plural(add.length, 'слово', 'слова', 'слов')}`);
        break;
      }
      case 'tab': V.draw = null; if (V.bolt) stopBolt(); V.tab = el.dataset.tab; goal('tab_' + V.tab); if (V.tab !== 'train' && T && T.done) V.train = null; window.scrollTo(0, 0); break;
      case 'toggle': {
        const ids = selectedIds();
        const id = el.dataset.id;
        const i = ids.indexOf(id);
        if (i >= 0) ids.splice(i, 1); else { ids.push(id); goal('words_pick'); }
        S.selected[S.grade] = ids;
        if (i < 0 && !S.hintSel) {
          // Первый выбор слова: объясняем, что нажатие — это выбор для тренировки.
          S.hintSel = true;
          react(true, 'СЛОВО ВЫБРАНО ✓ ОНО ПОЙДЁТ В ТРЕНИРОВКУ. ВЫБЕРИ ЕЩЁ!');
          toast('✓ Слово выбрано для «Учу» и «Тренировки». Нажми ещё раз, чтобы убрать');
        }
        save();
        if (i < 0 && ids.length === 11) toast('Больше 10 слов за раз — трудновато. Но можно!');
        break;
      }
      case 'pick10': {
        // Новая порция: сначала слова, которые ещё ни разу не тренировали, в случайном порядке
        // (не только на «А»); если их не хватает — недоученные. Выбранные сейчас не повторяем.
        const cur = new Set(selectedIds());
        const rest = words().filter((w) => !cur.has(w.id));
        const take = shuffle(rest.filter((w) => status(w.id) === 'new'))
          .concat(shuffle(rest.filter((w) => status(w.id) !== 'new' && status(w.id) !== 'learned')))
          .slice(0, 10);
        if (!take.length) { toast(S.grade === 'all' ? 'Все слова уже выучены!' : 'Все слова этого класса уже выучены!'); return; }
        S.selected[S.grade] = take.map((w) => w.id); save(); V.learn = 0; goal('words_pick');
        toast(`Выбрано ${take.length} ${plural(take.length, 'слово', 'слова', 'слов')}`);
        break;
      }
      case 'install':
        if (installEvt) { installEvt.prompt(); installEvt.userChoice.then(() => { installEvt = null; render(); }); goal('install'); return; }
        V.installHelp = true; break;
      case 'share': shareApp(); return;
      case 'report': V.report = { id: el.dataset.id }; window.scrollTo(0, 0); break;
      case 'reportClose': V.report = null; break;
      case 'reportCopy': copyText(document.getElementById('reportText').value); return;
      case 'reviewDue': V.trainSet = 'due'; V.tab = 'train'; V.train = null; window.scrollTo(0, 0); break;
      case 'showDef': {
        // Без перерисовки, чтобы не стереть уже набранные буквы.
        const t = V.train && V.train.task;
        if (!t) return;
        t.showDef = true;
        el.insertAdjacentHTML('afterend', defBox(t.w));
        el.remove();
        return;
      }
      case 'fixMistakes': V.trainSet = 'mistakes'; V.tab = 'train'; V.train = null; window.scrollTo(0, 0); break;
      case 'clearSel': S.selected[S.grade] = []; save(); break;
      case 'selAll':
        S.selected[S.grade] = words().map((w) => w.id); save(); goal('words_pick');
        toast(`Выбраны все слова: ${words().length}. В тренировке каждый раз будет 15 случайных из них`);
        break;
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
      case 'editName': V.editName = true; V.hWho = V.hGender = V.hGrade = V.hName = undefined; window.scrollTo(0, 0); break;
      case 'setupClose': V.editName = false; break;
      case 'hWho': V.hWho = el.dataset.v; break;
      case 'hGender': V.hGender = el.dataset.v; break;
      case 'hGrade': V.hGrade = el.dataset.v; break;
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
        parts.forEach((p, i) => { if (p.t) orders[i] = stableAlts(p.alts); });
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
          st.fix = null; addStars(3); goal('story_fixed'); cnt('storyFix'); save(); render(); confetti(); react(true); toast('История починена! +3 ⭐'); return;
        }
        toast(`Ошибок: ${bad}. Красные пропуски — нажми на них ещё раз`);
        break;
      }
      case 'fixStop': V.story[el.dataset.k].fix = null; break;
      case 'saveGen': {
        const st = V.story[el.dataset.k];
        S.stories.unshift({ g: S.grade, text: st.text, t: Date.now(), gen: true }); save(); goal('story_save');
        toast('История сохранена');
        break;
      }
      case 'saveStory': {
        const text = V.draft.trim();
        if (!text) { toast('Сначала напиши историю'); return; }
        S.stories.unshift({ g: S.grade, text, t: Date.now() }); save(); goal('story_save');
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
        addTime(); save();
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
    if (act === 'toggle' || act === 'exclTog' || act === 'fixTap') window.scrollTo(0, keepY);
  });

  document.addEventListener('submit', (e) => {
    if (e.target.id === 'nameForm') {
      e.preventDefault();
      const who = V.hWho !== undefined ? V.hWho : S.setup ? (S.grade === 'all' ? 'adult' : 'kid') : '';
      const gen = V.hGender !== undefined ? V.hGender : S.gender;
      const gr = who === 'adult' ? 'all' : V.hGrade !== undefined ? V.hGrade : S.setup && S.grade !== 'all' ? String(S.grade) : '';
      if (!who) { toast('Выбери: школьник или взрослый'); return; }
      if (!gen) { toast(who === 'adult' ? 'Выберите, как к вам обращаться' : 'Выбери: мальчик или девочка'); return; }
      if (!gr) { toast('Выбери свой класс'); return; }
      const first = !S.setup;
      if (String(S.grade) !== gr) { stopBolt(); V.learn = 0; V.train = null; V.story = {}; V.excl = {}; V.draw = null; }
      S.name = document.getElementById('nameInput').value.trim().slice(0, 20);
      S.gender = gen; S.grade = gr; S.setup = true;
      if (first) goal(who === 'adult' ? 'setup_adult' : 'setup_kid', { grade: gr });
      save(); V.editName = false; V.hWho = V.hGender = V.hGrade = V.hName = undefined; V.tab = 'words'; render(); window.scrollTo(0, 0);
      react(true, first ? (S.name ? 'ПРИВЕТ, {n}! ДАВАЙ УЧИТЬ СЛОВА' : 'ПРИВЕТ! ДАВАЙ УЧИТЬ СЛОВА') : 'ГОТОВО! ВПЕРЁД К ЗНАНИЯМ');
      return;
    }
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
    if (el.id === 'nameInput') { V.hName = el.value; return; }
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

  // ---------- Заставка при открытии: оранжевый экран, кот и название ----------
  (function splash() {
    // Заставка уже нарисована в index.html, чтобы появиться мгновенно. Здесь только прячем её.
    const el = document.getElementById('splash');
    if (!el) return;
    let done = false;
    const hide = (delay) => {
      if (done) return;
      done = true;
      setTimeout(() => { el.classList.add('hide'); setTimeout(() => { el.remove(); document.getElementById('boot')?.remove(); }, 450); }, delay);
    };
    el.addEventListener('click', (e) => {
      // Нажатие: котик подпрыгивает, разлетаются сердечки — и сразу в приложение.
      el.classList.add('tap');
      ['❤️', '⭐', '💛', '✨', '🧡', '⭐'].forEach((c, i) => {
        const s = document.createElement('span');
        const ang = (i / 6) * Math.PI * 2;
        s.className = 'splashpop';
        s.textContent = c;
        s.style.left = e.clientX - 14 + 'px';
        s.style.top = e.clientY - 14 + 'px';
        s.style.setProperty('--dx', Math.round(Math.cos(ang) * 90) + 'px');
        s.style.setProperty('--dy', Math.round(Math.sin(ang) * 90) + 'px');
        el.appendChild(s);
      });
      hide(380);
    });
    setTimeout(() => hide(0), 2300);
  })();
})();
