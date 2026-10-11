'use strict';
// Проверки без настоящего Яндекса: ответы OCR и модели подменены.
const test = require('node:test');
const assert = require('node:assert');
const { handler, _test } = require('./index.js');
const { parseModelJson, cleanLesson, buildLesson } = _test;

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

function fakeFetch(pages, answer) {
  let ocr = 0;
  return async (url, opts) => {
    const body = JSON.parse(opts.body);
    assert.match(opts.headers.Authorization, /^Api-Key /);
    if (url.includes('ocr')) {
      assert.equal(body.mimeType, 'JPEG');
      return { ok: true, text: async () => JSON.stringify({ result: { textAnnotation: { fullText: pages[ocr++] } } }) };
    }
    assert.match(body.modelUri, /^gpt:\/\/folder1\//);
    return { ok: true, text: async () => JSON.stringify({ result: { alternatives: [{ message: { text: '```json\n' + JSON.stringify(answer) + '\n```' } }] } }) };
  };
}
const env = { YC_API_KEY: 'k', YC_FOLDER_ID: 'folder1' };

test('JSON достаётся из ответа с markdown и лишними словами', () => {
  assert.deepEqual(parseModelJson('Вот ответ:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => parseModelJson('нет json'));
});

test('стих: текст и сцены с диапазонами строк', async () => {
  const lesson = await buildLesson({ images: ['x'], env, fetchFn: fakeFetch([POEM_PAGE], POEM_ANSWER) });
  assert.equal(lesson.kind, 'poem');
  assert.equal(lesson.text.split('\n').filter(Boolean).length, 14);
  assert.deepEqual(lesson.scenes.map((s) => [s.a, s.b]), [[0, 7], [8, 13]]);
});

test('стих с выдуманными строками отклоняется', () => {
  const fake = { ...POEM_ANSWER, text: POEM_ANSWER.text + '\nА это строка, которой нет\nИ ещё одна выдуманная\nИ третья лишняя строка' };
  assert.throws(() => cleanLesson(fake, POEM_PAGE), /не совпадает/);
});

test('параграф: выдуманные люди и годы выбрасываются', async () => {
  const lesson = await buildLesson({ images: ['x'], env, fetchFn: fakeFetch([HISTORY_PAGE], HISTORY_ANSWER) });
  assert.equal(lesson.kind, 'paragraph');
  assert.deepEqual(lesson.persons.map((p) => p.name), ['Борис Годунов']);
  assert.deepEqual(lesson.events.map((e) => e.year), [1598, 1605, 1612]);
  assert.equal(lesson.terms.length, 1);
  assert.equal(lesson.facts.length, 0, 'утверждение без отличия — не игра');
  assert.deepEqual(lesson.questions, ['Почему началась Смута?']);
});

test('пустое фото — понятная ошибка', async () => {
  await assert.rejects(buildLesson({ images: ['x'], env, fetchFn: fakeFetch(['  '], {}) }), /не видно текста/);
});

test('обработчик: проверки запроса и CORS', async () => {
  const old = { ...process.env };
  Object.assign(process.env, env);
  try {
    const opt = await handler({ httpMethod: 'OPTIONS' });
    assert.equal(opt.statusCode, 204);
    assert.equal(opt.headers['Access-Control-Allow-Origin'], '*');
    const none = await handler({ httpMethod: 'POST', body: '{"images":[]}' });
    assert.equal(none.statusCode, 400);
    const bad = await handler({ httpMethod: 'POST', body: 'не json' });
    assert.equal(bad.statusCode, 400);
  } finally {
    process.env = old;
  }
});
