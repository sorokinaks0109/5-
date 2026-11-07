'use strict';
const crypto = require('node:crypto');
/*
  «Учу играя»: функция для Yandex Cloud Functions.
  Получает фото страниц учебника, распознаёт текст (Vision OCR),
  просит YandexGPT разложить материал для игр и проверяет ответ:
  в игры попадает только то, что действительно есть на странице.

  Переменные окружения функции:
    YC_API_KEY      — API-ключ сервисного аккаунта (роли ai.vision.user и ai.languageModels.user);
    YC_FOLDER_ID    — идентификатор каталога в Яндекс Облаке;
    YC_MODEL        — основная модель, по умолчанию yandexgpt-lite/latest (дешёвая);
    YC_MODEL_BACKUP — запасная, по умолчанию yandexgpt/latest (Pro): зовём, только если основная
                      ответила криво или её ответ не прошёл проверку на выдумки;
    CACHE_BUCKET    — бакет Object Storage для готовых уроков и счётчиков (без него — память функции);
    DAILY_PHOTOS    — сколько новых фото в день можно одному человеку (по умолчанию 10);
    DAILY_PHOTOS_IP — сколько фото в день с одного адреса, включая повторные (по умолчанию 40);
    ALLOWED_ORIGIN  — адрес сайта, которому можно обращаться к функции (по умолчанию *).

  Порядок работы с одним запросом:
    1) лимит по адресу → 2) распознаём текст → 3) ищем готовый урок по тексту страницы
    (ребёнок ничего не выбирает: если эту страницу уже кто-то фотографировал, урок отдаётся сразу
    и в лимит не считается) → 4) лимит на человека → 5) Lite, при неудаче Pro → 6) сохраняем урок.
*/

const OCR_URL = 'https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText';
const LLM_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion';
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/* ---------- Задание для нейросети ---------- */
const SYSTEM_PROMPT = `Ты помогаешь школьнику готовиться к уроку. Тебе дают текст страниц учебника, распознанный с фото.
Определи, что это: стихотворение (или отрывок) — kind "poem"; параграф учебника (история, обществознание, география,
биология, литература и т. п.) — kind "paragraph".

Главное правило: бери ТОЛЬКО то, что прямо написано в тексте. Ничего не добавляй от себя, не исправляй даты и имена.
Если чего-то в тексте нет — оставь пустой список.

Ответь ТОЛЬКО JSON без пояснений и без markdown.

Для стихотворения:
{"kind":"poem","title":"название","author":"автор или пустая строка","translator":"переводчик или пустая строка",
 "text":"текст стихотворения строка за строкой через \\n, строфы разделены пустой строкой; без номеров страниц и подписей к картинкам",
 "scenes":[{"title":"что происходит, 2–5 слов","first":"первая строка сцены, точно как в тексте","picture":"что нарисовать, одна фраза для художника"}]}
Сцены — смысловые части по 4–8 строк, по порядку, без пропусков.

Для параграфа:
{"kind":"paragraph","subject":"предмет","title":"тема параграфа",
 "persons":[{"name":"имя как в тексте","text":"что сделал, по тексту, до 15 слов"}],
 "terms":[{"term":"термин как в тексте","text":"определение по тексту, до 15 слов"}],
 "events":[{"year":1612,"text":"событие по тексту, до 12 слов"}],
 "facts":[{"text":"верное утверждение по тексту","false":"то же утверждение, но с одной неверной деталью"}],
 "questions":["вопросы из конца параграфа, если они есть на фото"]}
Не больше 10 элементов в каждом списке.`;

/* ---------- Вспомогательное ---------- */
function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  };
}
function reply(status, data, origin) {
  return { statusCode: status, headers: cors(origin), body: JSON.stringify(data) };
}
const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
const clip = (s, n) => String(s || '').trim().slice(0, n);

// JSON из ответа модели: модель иногда оборачивает его в ``` или добавляет фразу.
function parseModelJson(text) {
  const t = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const start = t.indexOf('{'), end = t.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Модель не вернула JSON');
  return JSON.parse(t.slice(start, end + 1));
}

/* ---------- Проверка ответа: только то, что есть в тексте страницы ---------- */
// Имя/термин считаем найденным, если в тексте есть его основа (первые 5 букв каждого слова длиннее 3 букв).
function mentioned(source, phrase) {
  const words = norm(phrase).split(' ').filter((w) => w.length > 3);
  if (!words.length) return norm(source).includes(norm(phrase));
  const src = ' ' + norm(source) + ' ';
  return words.every((w) => src.includes(' ' + w.slice(0, Math.min(5, w.length))));
}

function cleanPoem(raw, source) {
  const text = String(raw.text || '').replace(/\r/g, '').split('\n').map((l) => l.trim())
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const lines = text.split('\n').filter((l) => l);
  if (lines.length < 2) throw new Error('Не нашёл текст стихотворения');
  // Строки, которых нет на фото, — признак выдумки: если таких больше 10 %, лучше честно отказать.
  const missing = lines.filter((l) => !mentioned(source, l)).length;
  if (missing / lines.length > 0.1) throw new Error('Текст стихотворения не совпадает с фото');
  // Сцены: находим первую строку каждой сцены в тексте, получаем диапазоны строк.
  const firsts = (Array.isArray(raw.scenes) ? raw.scenes : [])
    .map((sc) => ({ sc, at: lines.findIndex((l) => norm(l) === norm(sc.first)) }))
    .filter((x) => x.at >= 0)
    .sort((x, y) => x.at - y.at)
    .filter((x, k, arr) => k === 0 || x.at !== arr[k - 1].at);
  if (!firsts.length || firsts[0].at !== 0) firsts.unshift({ sc: { title: clip(raw.title, 40) || 'Начало', picture: '' }, at: 0 });
  const scenes = firsts.map((x, k) => ({
    title: clip(x.sc.title, 50),
    picture: clip(x.sc.picture, 200),
    a: x.at,
    b: k < firsts.length - 1 ? firsts[k + 1].at - 1 : lines.length - 1,
  }));
  return {
    kind: 'poem',
    title: clip(raw.title, 80) || 'Стихотворение',
    author: clip(raw.author, 80),
    translator: clip(raw.translator, 80),
    text,
    scenes,
  };
}

function cleanParagraph(raw, source) {
  const list = (x) => (Array.isArray(x) ? x : []);
  const src = String(source);
  const persons = list(raw.persons)
    .filter((p) => p && p.name && p.text && mentioned(src, p.name))
    .slice(0, 10).map((p) => ({ name: clip(p.name, 60), text: clip(p.text, 160) }));
  const terms = list(raw.terms)
    .filter((t) => t && t.term && t.text && mentioned(src, t.term))
    .slice(0, 10).map((t) => ({ term: clip(t.term, 60), text: clip(t.text, 160) }));
  // Год обязан встречаться в тексте страницы, иначе событие выбрасываем.
  const seen = new Set();
  const events = list(raw.events)
    .map((e) => ({ year: parseInt(e && e.year, 10), text: clip(e && e.text, 140) }))
    .filter((e) => e.year && e.text && src.includes(String(e.year)) && !seen.has(e.year) && seen.add(e.year))
    .sort((a, b) => a.year - b.year).slice(0, 10);
  const facts = list(raw.facts)
    .filter((f) => f && f.text && f.false && norm(f.text) !== norm(f.false))
    .slice(0, 10).map((f) => ({ text: clip(f.text, 200), false: clip(f.false, 200) }));
  const questions = list(raw.questions).map((q) => clip(q, 200)).filter(Boolean).slice(0, 10);
  if (persons.length + terms.length + events.length < 3) throw new Error('В тексте мало материала для игр');
  return {
    kind: 'paragraph',
    subject: clip(raw.subject, 60),
    title: clip(raw.title, 100) || 'Параграф',
    persons, terms, events, facts, questions,
  };
}

function cleanLesson(raw, source) {
  if (!raw || typeof raw !== 'object') throw new Error('Пустой ответ модели');
  if (raw.kind === 'poem') return cleanPoem(raw, source);
  if (raw.kind === 'paragraph') return cleanParagraph(raw, source);
  throw new Error('Не понял, что на фото');
}

/* ---------- Вызовы Яндекса ---------- */
async function callJson(fetchFn, url, body, env) {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Api-Key ' + env.YC_API_KEY, 'x-folder-id': env.YC_FOLDER_ID },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Яндекс ответил ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function recognize(fetchFn, env, imageB64) {
  const data = await callJson(fetchFn, OCR_URL, { mimeType: 'JPEG', languageCodes: ['ru', 'en'], model: 'page', content: imageB64 }, env);
  const ann = (data.result && data.result.textAnnotation) || data.textAnnotation || {};
  return String(ann.fullText || '');
}

async function askModel(fetchFn, env, pageText, model) {
  const data = await callJson(fetchFn, LLM_URL, {
    modelUri: `gpt://${env.YC_FOLDER_ID}/${model}`,
    completionOptions: { stream: false, temperature: 0.1, maxTokens: '4000' },
    messages: [{ role: 'system', text: SYSTEM_PROMPT }, { role: 'user', text: pageText }],
  }, env);
  const alt = data.result && data.result.alternatives && data.result.alternatives[0];
  return alt && alt.message ? alt.message.text : '';
}

// Основная модель — Lite. Если её ответ не разобрался или не прошёл проверку на выдумки, пробуем Pro.
async function generate(fetchFn, env, pageText) {
  const models = [env.YC_MODEL || 'yandexgpt-lite/latest', env.YC_MODEL_BACKUP || 'yandexgpt/latest']
    .filter((m, k, all) => m && all.indexOf(m) === k);
  let lastError;
  for (const model of models) {
    try {
      const answer = await askModel(fetchFn, env, pageText.slice(0, 12000), model);
      return { lesson: cleanLesson(parseModelJson(answer), pageText), model };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

/* ---------- Хранилище: готовые уроки и счётчики ---------- */
// Object Storage с токеном сервисного аккаунта функции; без бакета — память (живёт, пока функция «тёплая»).
function memoryStore() {
  const m = new Map();
  return { async get(k) { return m.has(k) ? m.get(k) : null; }, async put(k, v) { m.set(k, v); } };
}
function bucketStore(fetchFn, bucket, token) {
  const url = (k) => `https://storage.yandexcloud.net/${bucket}/${k.split('/').map(encodeURIComponent).join('/')}`;
  const headers = { 'X-YaCloud-SubjectToken': token };
  return {
    async get(k) {
      const res = await fetchFn(url(k), { headers });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Хранилище ответило ${res.status}`);
      return res.text();
    },
    async put(k, v) {
      const res = await fetchFn(url(k), { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: v });
      if (!res.ok) throw new Error(`Хранилище ответило ${res.status}`);
    },
  };
}
const fallbackStore = memoryStore();

/* ---------- Узнаём страницу по тексту ---------- */
// Два фото одной страницы распознаются чуть по-разному, поэтому точного совпадения текста не ждём:
// сравниваем наборы слов. Чтобы быстро найти кандидатов, берём «отпечаток» MinHash и делим его на полосы:
// достаточно совпасть одной полосе, потом проверяем сходство слов честно.
const SIG = 16, BANDS = 8, SAME_PAGE = 0.75, MIN_WORDS = 15;
function pageWords(text) {
  return [...new Set(norm(text).split(' ').filter((w) => w.length >= 5))];
}
function fnv(str, seed) {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
function bandKeys(words) {
  const sig = [];
  for (let k = 0; k < SIG; k++) sig.push(Math.min(...words.map((w) => fnv(w, k * 0x9e3779b1))));
  const per = SIG / BANDS, keys = [];
  for (let b = 0; b < BANDS; b++) keys.push(`index/${b}-${sig.slice(b * per, (b + 1) * per).map((x) => x.toString(36)).join('-')}`);
  return keys;
}
function similarity(a, b) {
  const A = new Set(a); let common = 0;
  for (const w of b) if (A.has(w)) common++;
  return common / (A.size + b.length - common || 1);
}
async function findLesson(store, words) {
  if (words.length < MIN_WORDS) return null;
  const tried = new Set();
  for (const key of bandKeys(words)) {
    const id = await store.get(key);
    if (!id || tried.has(id)) continue;
    tried.add(id);
    const saved = await store.get(`lessons/${id}.json`);
    if (!saved) continue;
    const rec = JSON.parse(saved);
    if (similarity(rec.words, words) >= SAME_PAGE) return rec.lesson;
  }
  return null;
}
async function saveLesson(store, words, lesson) {
  if (words.length < MIN_WORDS) return;
  const id = crypto.createHash('sha1').update(words.slice().sort().join(' ')).digest('hex').slice(0, 20);
  await store.put(`lessons/${id}.json`, JSON.stringify({ words: words.slice(0, 600), lesson, saved: new Date().toISOString() }));
  for (const key of bandKeys(words)) await store.put(key, id);
}

/* ---------- Лимиты на день ---------- */
const moscowDay = (now) => new Date(now + 3 * 3600e3).toISOString().slice(0, 10);
async function counter(store, key) {
  const v = await store.get(key);
  return v ? parseInt(v, 10) || 0 : 0;
}
class LimitError extends Error {}

/* ---------- Обработка одного запроса ---------- */
async function processRequest({ images, clientId, ip, env, fetchFn = fetch, store = fallbackStore, now = Date.now() }) {
  const day = moscowDay(now);
  const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Math.max(0, Math.floor(Number(v))));
  const perPerson = num(env.DAILY_PHOTOS, 10);
  const perIp = num(env.DAILY_PHOTOS_IP, 40);
  // Сам адрес не храним — только его хеш: для лимита достаточно отличать одних от других.
  const ipId = crypto.createHash('sha256').update('murmemo:' + (ip || 'unknown')).digest('hex').slice(0, 16);
  const who = /^[A-Za-z0-9_-]{8,64}$/.test(clientId || '') ? clientId : 'ip-' + ipId;
  const ipKey = `limits/${day}/ip-${ipId}`;
  const personKey = `limits/${day}/${who}`;

  // 1. Адрес: считаем все фото, даже повторные, — это защита от перебора и лишних трат на распознавание.
  const ipUsed = await counter(store, ipKey);
  if (ipUsed + images.length > perIp) throw new LimitError('С этого адреса сегодня уже прислали много фото. Попробуй завтра');
  await store.put(ipKey, String(ipUsed + images.length));

  // 2. Распознаём текст.
  const texts = [];
  for (const img of images) texts.push(await recognize(fetchFn, env, img));
  const pageText = texts.join('\n\n').trim();
  if (pageText.length < 40) throw new Error('На фото не видно текста. Сними страницу ровно и при хорошем свете');

  // 3. Эту страницу уже фотографировали — отдаём готовый урок, в лимит не считаем.
  const words = pageWords(pageText);
  const used = await counter(store, personKey);
  const cached = await findLesson(store, words).catch(() => null);
  if (cached) return { lesson: cached, cached: true, left: Math.max(0, perPerson - used) };

  // 4. Новая страница: проверяем лимит человека.
  if (used + images.length > perPerson) throw new LimitError(`На сегодня новые фото закончились (${perPerson} в день). Готовые уроки работают, новые — завтра`);
  await store.put(personKey, String(used + images.length));

  // 5–6. Собираем урок и сохраняем, чтобы следующий раз отдать без нейросети.
  const { lesson, model } = await generate(fetchFn, env, pageText);
  await saveLesson(store, words, lesson).catch(() => {});
  return { lesson, cached: false, model, left: Math.max(0, perPerson - used - images.length) };
}

module.exports.handler = async function handler(event, context) {
  const env = process.env, origin = env.ALLOWED_ORIGIN || '*';
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(origin), body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Нужен POST' }, origin);
  if (!env.YC_API_KEY || !env.YC_FOLDER_ID) return reply(500, { error: 'Функция не настроена: нет ключа или каталога' }, origin);
  let body;
  try {
    body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
  } catch (e) {
    return reply(400, { error: 'Не получилось прочитать запрос' }, origin);
  }
  const images = Array.isArray(body && body.images) ? body.images : [];
  if (!images.length || images.length > MAX_IMAGES) return reply(400, { error: `Нужно от 1 до ${MAX_IMAGES} фото` }, origin);
  if (images.some((x) => typeof x !== 'string' || x.length * 0.75 > MAX_IMAGE_BYTES)) return reply(400, { error: 'Фото слишком большое' }, origin);
  const token = context && context.token && context.token.access_token;
  const store = env.CACHE_BUCKET && token ? bucketStore(fetch, env.CACHE_BUCKET, token) : fallbackStore;
  const ip = event.requestContext && event.requestContext.identity && event.requestContext.identity.sourceIp;
  try {
    const result = await processRequest({ images, clientId: body.clientId, ip, env, store });
    return reply(200, result, origin);
  } catch (e) {
    return reply(e instanceof LimitError ? 429 : 422, { error: e.message }, origin);
  }
};

module.exports._test = { parseModelJson, cleanLesson, mentioned, processRequest, memoryStore, pageWords, similarity, bandKeys };
