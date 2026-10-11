'use strict';
/*
  «Учу играя»: функция для Yandex Cloud Functions.
  Получает фото страниц учебника, распознаёт текст (Vision OCR),
  просит YandexGPT разложить материал для игр и проверяет ответ:
  в игры попадает только то, что действительно есть на странице.

  Переменные окружения функции:
    YC_API_KEY      — API-ключ сервисного аккаунта (роли ai.vision.user и ai.languageModels.user);
    YC_FOLDER_ID    — идентификатор каталога в Яндекс Облаке;
    YC_MODEL        — модель, по умолчанию yandexgpt/latest (можно yandexgpt-lite/latest — дешевле);
    ALLOWED_ORIGIN  — адрес сайта, которому можно обращаться к функции (по умолчанию *).
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

async function askModel(fetchFn, env, pageText) {
  const model = env.YC_MODEL || 'yandexgpt/latest';
  const data = await callJson(fetchFn, LLM_URL, {
    modelUri: `gpt://${env.YC_FOLDER_ID}/${model}`,
    completionOptions: { stream: false, temperature: 0.1, maxTokens: '4000' },
    messages: [{ role: 'system', text: SYSTEM_PROMPT }, { role: 'user', text: pageText }],
  }, env);
  const alt = data.result && data.result.alternatives && data.result.alternatives[0];
  return alt && alt.message ? alt.message.text : '';
}

/* ---------- Главная функция ---------- */
async function buildLesson({ images, env, fetchFn = fetch }) {
  const texts = [];
  for (const img of images) texts.push(await recognize(fetchFn, env, img));
  const pageText = texts.join('\n\n').trim();
  if (pageText.length < 40) throw new Error('На фото не видно текста. Сними страницу ровно и при хорошем свете');
  const answer = await askModel(fetchFn, env, pageText.slice(0, 12000));
  return cleanLesson(parseModelJson(answer), pageText);
}

module.exports.handler = async function handler(event) {
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
  try {
    const lesson = await buildLesson({ images, env });
    return reply(200, { lesson }, origin);
  } catch (e) {
    return reply(422, { error: e.message }, origin);
  }
};

module.exports._test = { parseModelJson, cleanLesson, mentioned, buildLesson };
