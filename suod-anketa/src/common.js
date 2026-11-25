/* ===== Общие функции ===== */
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function blockName(id) { for (var i = 0; i < BLOCKS.length; i++) if (BLOCKS[i].id === id) return BLOCKS[i].name; return id; }
function catName(id) { for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i].name; return id || "—"; }
function catFromText(t) {
  t = String(t || "").toLowerCase();
  if (t.indexOf("руковод") >= 0) return "R";
  if (t.indexOf("офис") >= 0) return "O";
  if (t.indexOf("производ") >= 0) return "P";
  return "";
}
function qById(id) { for (var i = 0; i < QUESTIONS.length; i++) if (QUESTIONS[i].id === id) return QUESTIONS[i]; return null; }
function lvlClass(p) { if (p == null || isNaN(p)) return ""; return p >= CONFIG.levelHigh ? "lvl-h" : p >= CONFIG.levelMid ? "lvl-m" : "lvl-l"; }
function lvlName(p) { if (p == null || isNaN(p)) return "—"; return p >= CONFIG.levelHigh ? "высокий" : p >= CONFIG.levelMid ? "средний" : "низкий"; }
function fmtPct(p) { return p == null || isNaN(p) ? "—" : Math.round(p) + "%"; }

/* Применим ли вопрос к человеку. ans — {id: балл} */
function isApplicable(q, cat, ans) {
  if (cat && q.cats.indexOf(cat) < 0) return false;
  if (q.sop && ans && ans[19] === 0) return false;
  return true;
}

/* Подсчёт баллов: % по блокам = средний балл / 5; итог = среднее по блокам (как в исходной анкете) */
function computeScores(cat, ans) {
  var sums = {}, cnt = {}, missing = 0, answered = 0;
  QUESTIONS.forEach(function (q) {
    if (q.textOnly || !isApplicable(q, cat, ans)) return;
    var v = ans[q.id];
    if (v === 0 || v === 3 || v === 5) {
      sums[q.block] = (sums[q.block] || 0) + v; cnt[q.block] = (cnt[q.block] || 0) + 1; answered++;
    } else missing++;
  });
  var blocks = {}, tot = 0, n = 0;
  BLOCKS.forEach(function (b) {
    if (cnt[b.id]) { blocks[b.id] = sums[b.id] / cnt[b.id] / 5 * 100; tot += blocks[b.id]; n++; }
    else blocks[b.id] = null;
  });
  return { blocks: blocks, overall: n ? tot / n : null, answered: answered, missing: missing };
}

/* ===== Иконки ===== */
var ICONS = {
  target: '<circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="16" cy="16" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="16" cy="16" r="2.4" fill="currentColor"/>',
  bulb: '<path d="M16 4a8 8 0 0 0-4.6 14.6c.8.6 1.3 1.5 1.3 2.5V22h6.6v-.9c0-1 .5-1.9 1.3-2.5A8 8 0 0 0 16 4z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M12.8 25.5h6.4M13.8 28.5h4.4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  hands: '<circle cx="10" cy="9" r="3.6" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="22" cy="9" r="3.6" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M3.5 26c0-4.5 3-7.5 6.5-7.5s6 2 6 2 2.5-2 6-2 6.5 3 6.5 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  shield: '<path d="M16 3.5 6 7.5v8c0 6.3 4.3 10.8 10 13 5.7-2.2 10-6.7 10-13v-8z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="m11.5 16 3.2 3.2 6-6.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  chart: '<path d="M4 27h24" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M6 21l7-7 5 4 8-10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 8h5v5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  check: '<rect x="5" y="5" width="22" height="22" rx="4" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="m10.5 16.5 4 4 7-8.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
};
function icon(name, color) { return '<svg viewBox="0 0 32 32" style="color:' + (color || "currentColor") + '" aria-hidden="true">' + ICONS[name] + "</svg>"; }
function modelById(id) { for (var i = 0; i < MODELS.length; i++) if (MODELS[i].id === id) return MODELS[i]; return null; }

/* Компактные карточки моделей ("Мы…") */
function renderModelsCompact(el) {
  el.innerHTML = '<div class="models">' + MODELS.map(function (m) {
    return '<div class="model"><div class="mh">' + icon(m.icon, "#f39200") + '<div><b>' + esc(m.name) + '</b><span>' + esc(m.tag) + '</span></div></div><ul>' +
      m.we.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul></div>";
  }).join("") + "</div>";
}

/* ===== Мини-тест ===== */
function startQuiz(el) {
  var order = QUIZ.map(function (_, i) { return i; });
  for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = order[i]; order[i] = order[j]; order[j] = t; }
  var pos = 0, right = 0;
  function draw() {
    if (pos >= order.length) {
      var pct = Math.round(right / order.length * 100);
      var msg = pct >= 90 ? "Отлично: вы уверенно различаете модели." : pct >= 60 ? "Хороший результат. Загляните в памятку по моделям, где были ошибки." : "Стоит перечитать памятку — модели легче запомнить через свои примеры.";
      el.innerHTML = '<div class="quiz"><h3>Результат: ' + right + " из " + order.length + "</h3><p>" + msg + '</p><button class="btn" data-again>Пройти ещё раз</button></div>';
      $("[data-again]", el).onclick = function () { startQuiz(el); };
      return;
    }
    var item = QUIZ[order[pos]];
    el.innerHTML = '<div class="quiz"><div class="qbar"><i style="width:' + (pos / order.length * 100) + '%"></i></div>' +
      '<div class="muted">Ситуация ' + (pos + 1) + " из " + order.length + ' · Какая модель поведения здесь проявляется?</div>' +
      '<div class="qs">' + esc(item.s) + '</div><div class="qopts">' +
      MODELS.map(function (m) { return '<button class="qopt" data-m="' + m.id + '">' + icon(m.icon, "#2d2a7b") + esc(m.name) + "</button>"; }).join("") +
      '</div><div class="qfb hidden"></div></div>';
    var done = false;
    $$(".qopt", el).forEach(function (b) {
      b.onclick = function () {
        if (done) return; done = true;
        var ok = b.getAttribute("data-m") === item.a;
        if (ok) right++;
        b.classList.add(ok ? "ok" : "bad");
        $('.qopt[data-m="' + item.a + '"]', el).classList.add("ok");
        var fb = $(".qfb", el);
        fb.classList.remove("hidden");
        fb.innerHTML = "<b>" + (ok ? "Верно." : "Правильный ответ: " + esc(modelById(item.a).name) + ".") + "</b> В кодексе: " + esc(item.why) +
          '<div style="margin-top:10px"><button class="btn small" data-next>' + (pos + 1 < order.length ? "Дальше" : "Итог") + "</button></div>";
        $("[data-next]", fb).onclick = function () { pos++; draw(); };
      };
    });
  }
  draw();
}

/* ===== Диаграмма-паутина ===== */
function radarSvg(series, opts) {
  // series: [{values:{blockId:pct}, color, label, dash}]
  opts = opts || {};
  var W = opts.size || 420, cx = W / 2, cy = W / 2 + 4, R = W / 2 - 92, n = BLOCKS.length;
  function pt(i, v) { var a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + Math.cos(a) * R * v / 100, cy + Math.sin(a) * R * v / 100]; }
  var s = '<svg viewBox="0 0 ' + W + " " + (W + 8) + '" width="100%" style="max-width:' + W + 'px" role="img" aria-label="Профиль по блокам">';
  [25, 50, 75, 100].forEach(function (lv) {
    s += '<polygon points="' + BLOCKS.map(function (_, i) { return pt(i, lv).join(","); }).join(" ") + '" fill="none" stroke="#dfe2ee" stroke-width="1"/>';
  });
  BLOCKS.forEach(function (b, i) {
    var p = pt(i, 100), l = pt(i, 118);
    s += '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0] + '" y2="' + p[1] + '" stroke="#dfe2ee"/>';
    var anchor = Math.abs(l[0] - cx) < 8 ? "middle" : l[0] > cx ? "start" : "end";
    var words = b.name.split(" "), lines = [], cur = "";
    words.forEach(function (w) { if ((cur + " " + w).trim().length > 14 && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim(); });
    lines.push(cur);
    s += '<text x="' + l[0] + '" y="' + (l[1] - (lines.length - 1) * 7 + 4) + '" text-anchor="' + anchor + '" font-size="12" fill="#4a4f6e">' +
      lines.map(function (ln, k) { return '<tspan x="' + l[0] + '" dy="' + (k ? 14 : 0) + '">' + esc(ln) + "</tspan>"; }).join("") + "</text>";
  });
  series.forEach(function (se) {
    var pts = BLOCKS.map(function (b, i) { var v = se.values[b.id]; return pt(i, v == null ? 0 : v); });
    s += '<polygon points="' + pts.map(function (p) { return p.join(","); }).join(" ") + '" fill="' + se.color + '" fill-opacity="' + (se.dash ? 0.05 : 0.16) + '" stroke="' + se.color + '" stroke-width="2.4"' + (se.dash ? ' stroke-dasharray="5 4"' : "") + "/>";
    pts.forEach(function (p) { s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.4" fill="' + se.color + '"/>'; });
  });
  return s + "</svg>";
}
