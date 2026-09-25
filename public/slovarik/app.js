/* Словарик «Школы России»: выбор класса, запоминание, истории, тренировка. */
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
  const S = Object.assign({ grade: 1, selected: {}, stats: {}, mine: {}, stories: [], custom: {} }, load() || {});
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
          parts.push({ s: alts[0], t: true, alts });
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
    const [marked, emoji, hint, flag] = splitFields(line);
    const parts = parseMarked(marked);
    return {
      id: parts.map((p) => p.s).join(''),
      marked,
      parts,
      emoji: emoji || '📘',
      hint: hint || '',
      noun: !(flag && flag.trim().toLowerCase() === 'н'),
    };
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
  const GRADES = Object.keys(BUILTIN).sort();

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
  function groupOf(p) {
    const s = p.s;
    if (p.alts && p.alts.includes('')) return { key: 'тихие', title: 'Тихие буквы', song: 'тихие буквы', tip: 'Эта буква тихоня: её не слышно, но она есть. Произнеси слово по слогам так, как пишется.' };
    if (s.length === 2 && s[0].toLowerCase() === s[1].toLowerCase()) return { key: 'двойные', title: 'Двойные буквы', song: 'двойные буквы', tip: 'Две одинаковые буквы стоят рядом, как близнецы. Не разлучай их!' };
    const L = s.toUpperCase();
    if (VOWELS.includes(s.toLowerCase())) return { key: L, title: 'Буква ' + L, song: 'букву ' + L, tip: LETTER_TIPS[L] || '' };
    return { key: 'согласные', title: 'Хитрые согласные', song: 'хитрые согласные', tip: 'Проговори слово так, как пишется, чётко выговаривая эту букву.' };
  }
  function groupsOf(w) {
    const m = new Map();
    w.parts.filter((p) => p.t).forEach((p) => { const g = groupOf(p); m.set(g.key, g); });
    return [...m.values()];
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
  const V = { tab: 'words', learn: 0, train: null, storyGen: {}, draft: '', trainSet: 'selected' };
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
      <h1 class="logo">Слов<b>а</b>рик</h1>
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
    if (V.tab === 'words') body = viewWords();
    else if (V.tab === 'learn') body = viewLearn();
    else if (V.tab === 'stories') body = viewStories();
    else body = viewTrain();
    app.innerHTML = header() + body;
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
          <span class="e" aria-hidden="true">${w.emoji}</span><span>${marked(w.parts)}</span><span class="dot ${status(w.id)}"></span>
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
      <p class="muted">Списки взяты из словариков учебника «Русский язык» (УМК «Школа России»). Если в вашем учебнике другие слова, добавьте их выше.</p>`;
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
        <div class="pic" aria-hidden="true">${w.emoji}</div>
        <div class="big">${marked(w.parts)}</div>
        <div class="row" style="justify-content:center">
          ${canSpeak() ? `<button class="btn small ghost" data-act="say" data-text="${esc(w.id)}">🔊 Послушать</button>` : ''}
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

  // ---------- Вкладка «Истории» ----------
  const TEMPLATES = [
    'Жили-были {list}. Однажды они все вместе полетели на Луну на воздушном шаре!',
    'Представь: {list} стоят в очереди за мороженым и спорят, кто тут самый главный.',
    'Мне приснилось, что {list} танцуют на крыше и поют песню про {song}.',
    'Пошёл дождь. Под одним зонтиком спрятались {list}. Тесно, зато весело!',
    'В цирке выступали {list}. Зрители так хохотали, что попадали со стульев.',
    '{List} сели в один автобус и поехали к бабушке на блины.',
    'На физкультуре {list} прыгали через скакалку. Победила дружба!',
    '{List} решили стать космонавтами и первым делом надели шлемы задом наперёд.',
    'В классе новенькие: {list}. Учительница удивилась, но поставила всем пятёрки.',
  ];
  function joinList(arr) {
    return arr.length === 1 ? arr[0] : arr.slice(0, -1).join(', ') + ' и ' + arr[arr.length - 1];
  }
  function makeStory(group, ws) {
    const pick = shuffle(ws.filter((w) => w.noun)).slice(0, 4);
    if (pick.length < 2) return '';
    const t = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
    const first = t.startsWith('{List}');
    const items = pick.map((w, i) => (first && i === 0 ? capMarked(w.marked) : w.marked));
    return t.replace('{List}', joinList(items)).replace('{list}', joinList(items)).replace('{song}', group.song);
  }
  function capMarked(m) {
    return m.startsWith('[') ? '[' + m.charAt(1).toUpperCase() + m.slice(2) : cap(m);
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
      <p class="lead">Собери слова с одной и той же трудной буквой в одну смешную историю. Чем смешнее, тем лучше запомнится: мозг любит нелепые картинки.</p>
      ${ws.length ? `
      <section class="panel">
        <div class="group" style="margin-bottom:6px"><span class="label">Твои слова по трудным буквам</span></div>
        ${groups.length ? groups.map(({ g, ws: gw }) => {
          const story = V.storyGen[g.key];
          return `<div class="group">
            <div class="row"><span class="letter">${g.key.length === 1 ? esc(g.key) : '★'}</span><b>${esc(g.title)}</b><span class="muted">· ${gw.length} ${plural(gw.length, 'слово', 'слова', 'слов')}</span></div>
            <div class="chips">${gw.map((w) => `<span class="chip">${w.emoji} ${marked(w.parts)}</span>`).join('')}</div>
            ${story ? `<p class="story">${markedText(story)}</p>` : ''}
            <div class="row"><button class="btn small ${story ? 'ghost' : ''}" data-act="gen" data-k="${esc(g.key)}">${story ? '🎲 Другая история' : '🎲 Придумай историю'}</button>
            ${gw.filter((w) => w.noun).length < 2 ? '<span class="muted">Для истории нужно хотя бы два слова-предмета</span>' : ''}</div>
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
        ${mine.map((s) => `<div class="saved row between"><p class="story" style="flex:1 1 240px">${highlightOwn(s.text, words()).html}</p><button class="btn small ghost" data-act="delStory" data-t="${s.t}">Удалить</button></div>`).join('')}
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
  };

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
    if (T.pos >= T.queue.length) { T.task = null; T.done = true; render(); return; }
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
      if (ok) T.firstTry++;
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
        <div class="pic" aria-hidden="true">${w.emoji}</div>
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
        <div class="pic" aria-hidden="true">${w.emoji}</div>
        <p class="lead">Какое слово написано правильно?</p>
        <div class="opts">${t.variants.map((v) => {
          let cls = '';
          if (t.picked !== null) { if (v === w.id) cls = 'right'; else if (v === t.picked) cls = 'wrong'; }
          return `<button class="opt wide ${cls}" data-act="choosePick" data-v="${esc(v)}" ${t.picked !== null ? 'disabled' : ''}>${esc(v)}</button>`;
        }).join('')}</div>
        ${t.picked !== null ? (t.picked === w.id ? verdictGood(w) : verdictBad(w, t.picked, true)) : ''}`;
    } else if (T.mode === 'look' && t.showing) {
      inner = `
        <div class="pic" aria-hidden="true">${w.emoji}</div>
        <div class="big">${marked(w.parts)}</div>
        <p class="muted">Запоминай! Особенно красные буквы.</p>
        <div class="progress" style="width:100%;max-width:320px"><div class="shrink"></div></div>
        <button class="btn" data-act="lookHide">Я запомнил(а)</button>`;
    } else {
      const speakable = canSpeak();
      const masked = w.parts.map((p) => (p.t ? '<span class="gap">&nbsp;</span>' : esc(p.s))).join('');
      inner = `
        <div class="pic" aria-hidden="true">${w.emoji}</div>
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
    return `${taskTop()}
      <article class="panel card">${inner}</article>
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
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const T = V.train;
    switch (act) {
      case 'tab': V.tab = el.dataset.tab; if (V.tab !== 'train' && T && T.done) V.train = null; window.scrollTo(0, 0); break;
      case 'grade': S.grade = el.dataset.g; V.learn = 0; V.train = null; V.storyGen = {}; save(); break;
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
      case 'learnPrev': V.learn = Math.max(0, V.learn - 1); break;
      case 'learnNext': V.learn++; break;
      case 'learnGo': V.learn = +el.dataset.i; break;
      case 'gen': {
        const grp = selectedGroups().find((x) => x.g.key === el.dataset.k);
        if (grp) V.storyGen[grp.g.key] = makeStory(grp.g, grp.ws);
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
      case 'start': startTrain(el.dataset.mode); return;
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
