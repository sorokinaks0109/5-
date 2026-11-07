'use strict';
// Проверки без настоящего Яндекса: ответы распознавания и модели подменены, хранилище — в памяти.
const test = require('node:test');
const assert = require('node:assert');
const { handler, _test } = require('./index.js');
const { parseModelJson, cleanLesson, processRequest, memoryStore, pageWords, similarity } = _test;

const POEM_PAGE = `Ф. Шиллер
Перчатка
Перед своим зверинцем,
С баронами, с наследным принцем,
Король Франциск сидел;
С высокого балкона он глядел
На поприще, сраженья ожидая;
За королем, обворожая
Цветущей прелестию взгляд,
Придворных дам являлся пышный ряд.

Король дал знак рукою —
Со стуком растворилась дверь,
И грозный зверь
С огромной головою,
Косматый лев
Выходит;
стр. 112`;

const POEM_ANSWER = {
  kind: 'poem', title: 'Перчатка', author: 'Ф. Шиллер', translator: '',
  text: POEM_PAGE.split('\n').slice(2, -1).join('\n'),
  scenes: [
    { title: 'Король на балконе', first: 'Перед своим зверинцем,', picture: 'король на балконе' },
    { title: 'Выходит лев', first: 'Король дал знак рукою —', picture: 'лев выходит из ворот' },
  ],
};

const HISTORY_PAGE = `§ 9. Смута. В 1598 году умер царь Фёдор Иоаннович, и династия Рюриковичей пресеклась.
Земский собор избрал царём Бориса Годунова. В 1605 году Лжедмитрий I вступил в Москву.
Ополчение — войско из добровольцев. В 1612 году ополчение Минина и Пожарского освободило Москву.`;

const HISTORY_ANSWER = {
  kind: 'paragraph', subject: 'История', title: 'Смута',
  persons: [
    { name: 'Борис Годунов', text: 'Избран царём Земским собором' },
    { name: 'Иван Сусанин', text: 'Этого человека на странице нет' },
  ],
  terms: [{ term: 'Ополчение', text: 'Войско из добровольцев' }],
  events: [
    { year: 1598, text: 'Пресеклась династия Рюриковичей' },
    { year: 1605, text: 'Лжедмитрий I вступил в Москву' },
    { year: 1613, text: 'Этого года на странице нет' },
    { year: '1612', text: 'Ополчение освободило Москву' },
  ],
  facts: [{ text: 'В 1612 году Москву освободили', false: 'В 1612 году Москву освободили' }],
  questions: ['Почему началась Смута?'],
};

// Подменный Яндекс: pages — что «распознаётся» на каждом фото по очереди,
// answers — что отвечает каждая модель (строка или объект). Считает вызовы.
function fakeYandex(pages, answers) {
  const calls = { ocr: 0, models: [] };
  const fetchFn = async (url, opts) => {
    const body = JSON.parse(opts.body);
    assert.match(opts.headers.Authorization, /^Api-Key /);
    if (url.includes('ocr')) {
      const text = pages[Math.min(calls.ocr++, pages.length - 1)];
      return { ok: true, text: async () => JSON.stringify({ result: { textAnnotation: { fullText: text } } }) };
    }
    const model = body.modelUri.split('/').slice(3).join('/');
    calls.models.push(model);
    const a = answers[model];
    const txt = typeof a === 'string' ? a : '```json\n' + JSON.stringify(a) + '\n```';
    return { ok: true, text: async () => JSON.stringify({ result: { alternatives: [{ message: { text: txt } }] } }) };
  };
  return { fetchFn, calls };
}
const env = { YC_API_KEY: 'k', YC_FOLDER_ID: 'folder1' };
// Подменный ответ модели для любой страницы: термины — длинные слова страницы, события — годы с неё.
function answerFor(page) {
  const terms = [...new Set(page.match(/[А-Яа-яЁё]{8,}/g))].slice(0, 3).map((t) => ({ term: t, text: 'Слово со страницы' }));
  const events = [...new Set(page.match(/1[5-9]\d\d/g))].map((y) => ({ year: +y, text: 'Событие со страницы' }));
  return { kind: 'paragraph', subject: 'История', title: 'Параграф', persons: [], terms, events, facts: [], questions: [] };
}
// Три действительно разные страницы (разные слова), для проверок лимита.
const DIFFERENT_PAGES = [
  HISTORY_PAGE,
  `§ 10. Правление Михаила Романова. В 1613 году Земский собор избрал нового царя. Страна восстанавливалась после разорения,
   возвращались крестьяне, строились города. В 1617 году заключён Столбовский мир со Швецией, в 1618 году — Деулинское перемирие с Польшей.`,
  `§ 11. Внешняя политика. Смоленская война началась в 1632 году. Армия осаждала крепость, но осада закончилась неудачно.
   Поляновский мир подписали в 1634 году. Королевич Владислав отказался от претензий на русский престол навсегда.`,
];
const LITE = 'yandexgpt-lite/latest', PRO = 'yandexgpt/latest';
const req = (y, extra = {}) => processRequest({ images: ['x'], clientId: 'child-0001', ip: '10.0.0.1', env, fetchFn: y.fetchFn, store: memoryStore(), ...extra });

test('JSON достаётся из ответа с markdown и лишними словами', () => {
  assert.deepEqual(parseModelJson('Вот ответ:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => parseModelJson('нет json'));
});

test('стих: текст и сцены с диапазонами строк, работает Lite', async () => {
  const y = fakeYandex([POEM_PAGE], { [LITE]: POEM_ANSWER });
  const r = await req(y);
  assert.equal(r.lesson.kind, 'poem');
  assert.equal(r.model, LITE);
  assert.deepEqual(y.calls.models, [LITE], 'Pro не звали');
  assert.equal(r.lesson.text.split('\n').filter(Boolean).length, 14);
  assert.deepEqual(r.lesson.scenes.map((s) => [s.a, s.b]), [[0, 7], [8, 13]]);
});

test('стих с выдуманными строками отклоняется', () => {
  const fake = { ...POEM_ANSWER, text: POEM_ANSWER.text + '\nА это строка, которой нет\nИ ещё одна выдуманная\nИ третья лишняя строка' };
  assert.throws(() => cleanLesson(fake, POEM_PAGE), /не совпадает/);
});

test('параграф: выдуманные люди и годы выбрасываются', async () => {
  const r = await req(fakeYandex([HISTORY_PAGE], { [LITE]: HISTORY_ANSWER }));
  assert.equal(r.lesson.kind, 'paragraph');
  assert.deepEqual(r.lesson.persons.map((p) => p.name), ['Борис Годунов']);
  assert.deepEqual(r.lesson.events.map((e) => e.year), [1598, 1605, 1612]);
  assert.equal(r.lesson.terms.length, 1);
  assert.equal(r.lesson.facts.length, 0, 'утверждение без отличия — не игра');
  assert.deepEqual(r.lesson.questions, ['Почему началась Смута?']);
});

test('Lite ответил не JSON — зовём Pro', async () => {
  const y = fakeYandex([POEM_PAGE], { [LITE]: 'Извините, не могу', [PRO]: POEM_ANSWER });
  const r = await req(y);
  assert.deepEqual(y.calls.models, [LITE, PRO]);
  assert.equal(r.model, PRO);
});

test('Lite выдумал строки — проверка не прошла, зовём Pro', async () => {
  const bad = { ...POEM_ANSWER, text: POEM_ANSWER.text.replace('Косматый лев', 'Огромный тигр\nИ злая пантера\nИ ещё медведь') };
  const y = fakeYandex([POEM_PAGE], { [LITE]: bad, [PRO]: POEM_ANSWER });
  const r = await req(y);
  assert.deepEqual(y.calls.models, [LITE, PRO]);
  assert.equal(r.model, PRO);
});

test('обе модели не справились — понятная ошибка', async () => {
  const y = fakeYandex([POEM_PAGE], { [LITE]: 'мусор', [PRO]: 'тоже мусор' });
  await assert.rejects(req(y), /JSON/);
});

test('пустое фото — понятная ошибка, модель не зовём', async () => {
  const y = fakeYandex(['  '], {});
  await assert.rejects(req(y), /не видно текста/);
  assert.equal(y.calls.models.length, 0);
});

test('одна и та же страница: второй раз урок берётся готовым, даже если распознавание чуть другое', async () => {
  const store = memoryStore();
  // Второе фото той же страницы: пара слов распознана с ошибками, номер страницы потерялся.
  const second = POEM_PAGE.replace('зверинцем', 'зверинцом').replace('растворилась', 'раств0рилась').replace('стр. 112', '');
  assert.ok(similarity(pageWords(POEM_PAGE), pageWords(second)) >= 0.75, 'страницы похожи');
  const y = fakeYandex([POEM_PAGE, second], { [LITE]: POEM_ANSWER });
  const a = await processRequest({ images: ['x'], clientId: 'child-0001', ip: '1.1.1.1', env, fetchFn: y.fetchFn, store });
  const b = await processRequest({ images: ['x'], clientId: 'child-0002', ip: '2.2.2.2', env, fetchFn: y.fetchFn, store });
  assert.equal(a.cached, false);
  assert.equal(b.cached, true, 'второй ребёнок получил готовый урок');
  assert.deepEqual(y.calls.models, [LITE], 'нейросеть звали один раз');
  assert.deepEqual(b.lesson, a.lesson);
});

test('другая страница — готовый урок не подсовывается', async () => {
  const store = memoryStore();
  const y = fakeYandex([POEM_PAGE, HISTORY_PAGE + ' ' + HISTORY_PAGE.replace(/\d/g, '')], { [LITE]: POEM_ANSWER });
  await processRequest({ images: ['x'], clientId: 'child-0001', ip: '1.1.1.1', env, fetchFn: y.fetchFn, store });
  y.calls.models.length = 0;
  const yy = fakeYandex([HISTORY_PAGE + '\nПовторение. Ополчение собирали добровольцы со всей страны, Москва была освобождена.'], { [LITE]: HISTORY_ANSWER });
  const r = await processRequest({ images: ['x'], clientId: 'child-0001', ip: '1.1.1.1', env, fetchFn: yy.fetchFn, store });
  assert.equal(r.cached, false);
  assert.equal(r.lesson.kind, 'paragraph');
});

test('лимит на человека: новые фото кончились, а готовые уроки работают', async () => {
  const store = memoryStore();
  const lim = { ...env, DAILY_PHOTOS: '2' };
  const pages = DIFFERENT_PAGES;
  const run = (page, clientId = 'child-0001') => {
    const y = fakeYandex([page], { [LITE]: answerFor(page) });
    return processRequest({ images: ['x'], clientId, ip: '3.3.3.3', env: lim, fetchFn: y.fetchFn, store, now: Date.UTC(2026, 10, 7, 10) });
  };
  assert.equal((await run(pages[0])).left, 1);
  assert.equal((await run(pages[1])).left, 0);
  await assert.rejects(run(pages[2]), /закончились/);
  const again = await run(pages[0]);
  assert.equal(again.cached, true, 'уже сфотографированная страница открывается и после лимита');
  const other = await run(pages[2], 'child-0002');
  assert.equal(other.cached, false, 'у другого ребёнка свой лимит');
});

test('лимит на человека обнуляется на следующий день по Москве', async () => {
  const store = memoryStore();
  const lim = { ...env, DAILY_PHOTOS: '1' };
  const run = (n, now) => {
    const page = DIFFERENT_PAGES[n - 1];
    const y = fakeYandex([page], { [LITE]: answerFor(page) });
    return processRequest({ images: ['x'], clientId: 'child-0001', ip: '4.4.4.4', env: lim, fetchFn: y.fetchFn, store, now });
  };
  await run(1, Date.UTC(2026, 10, 7, 20, 30)); // 23:30 по Москве
  await assert.rejects(run(2, Date.UTC(2026, 10, 7, 20, 50)), /закончились/);
  const next = await run(3, Date.UTC(2026, 10, 7, 21, 10)); // 00:10 следующего дня
  assert.equal(next.cached, false);
});

test('лимит по адресу считает и повторные фото', async () => {
  const store = memoryStore();
  const lim = { ...env, DAILY_PHOTOS_IP: '3' };
  const y = fakeYandex([POEM_PAGE], { [LITE]: POEM_ANSWER });
  const run = (id) => processRequest({ images: ['x'], clientId: id, ip: '5.5.5.5', env: lim, fetchFn: y.fetchFn, store });
  await run('child-0001'); await run('child-0002'); await run('child-0003');
  await assert.rejects(run('child-0004'), /адреса/);
  assert.equal(y.calls.ocr, 3, 'на четвёртый запрос даже не распознавали');
});

test('обработчик: проверки запроса, CORS и код 429 на лимит', async () => {
  const old = { ...process.env };
  Object.assign(process.env, env);
  try {
    const opt = await handler({ httpMethod: 'OPTIONS' });
    assert.equal(opt.statusCode, 204);
    assert.equal(opt.headers['Access-Control-Allow-Origin'], '*');
    assert.equal((await handler({ httpMethod: 'POST', body: '{"images":[]}' })).statusCode, 400);
    assert.equal((await handler({ httpMethod: 'POST', body: 'не json' })).statusCode, 400);
    process.env.DAILY_PHOTOS_IP = '0';
    const limited = await handler({ httpMethod: 'POST', body: JSON.stringify({ images: ['x'], clientId: 'child-0001' }), requestContext: { identity: { sourceIp: '9.9.9.9' } } });
    assert.equal(limited.statusCode, 429);
    assert.match(JSON.parse(limited.body).error, /адреса/);
  } finally {
    process.env = old;
  }
});
