// Наполнение демо-режима: коды для входа и «боты»-участники, чтобы на горе были флажки.
import { buildItems, perfectAnswer } from './items.ts';
import { createRng, shuffle, type Rng } from './random.ts';
import { GameService } from './service.ts';
import { IDEA_STAGE, type Account, type AnswerKey, type AnswerValue, type Content, type StageNo, type Store } from './types.ts';

export const DEMO_CODES = {
  organizer: 'ORG-2027',
  jury: ['JURY-0001', 'JURY-0002', 'JURY-0003'],
  participants: ['DEMO-0001', 'DEMO-0002', 'DEMO-0003', 'DEMO-0004', 'DEMO-0005'],
};

const BOT_NICKS = [
  'Снежный барс', 'Ледоруб', 'Полярная сова', 'Северный ветер', 'Кайдзен-Кот', 'Штурман зимника',
  'Бережливый як', 'Кладовщик-альпинист', 'Аврора', 'Тундра', 'Пятый элемент', 'Логист на вершине',
  'Горный козёл', 'Метель',
];

const IDEAS: Record<string, string>[] = [
  {
    problem: 'Машины с МТР подолгу ждут разгрузки на Складе № 3.',
    current: 'В среднем машина ждёт 40 минут, в пиковые дни — до 2 часов. Время приезда не согласовано.',
    root: 'Нет графика приёма машин: все приезжают с утра.',
    solution: 'Ввести запись на слоты разгрузки по 30 минут через общую таблицу, закрепить за слотом кладовщика.',
    effectTime: 'Минус 30 минут ожидания на машину.',
    effectMoney: 'Меньше простоя транспорта, условно 200 тыс. руб. в год.',
    effectSafety: 'Меньше машин одновременно на площадке.',
    effectQuality: 'Приёмка без спешки — меньше ошибок.',
    resources: 'Шаблон таблицы, согласование с перевозчиками, 2 недели на пилот.',
  },
  {
    problem: 'Перчатки и ветошь хранятся в дальнем конце склада.',
    current: 'За смену кладовщик ходит за расходниками 6–8 раз, около 300 м каждый раз.',
    root: 'Размещение не пересматривали по частоте использования.',
    solution: 'Перенести ходовые расходники в шкаф у входа, остальное — по частоте.',
    effectTime: 'Около 25 минут в смену на человека.',
    effectMoney: '',
    effectSafety: 'Меньше работы на высоте с лестницей.',
    effectQuality: '',
    resources: 'Один шкаф, 1 день работы.',
  },
  {
    problem: 'Данные о поступлении вводятся трижды.',
    current: 'Журнал, таблица Excel и учётная система — около 15 минут на каждую машину.',
    root: 'Требование вести журнал осталось со времён до учётной системы.',
    solution: 'Отменить бумажный журнал и таблицу, настроить отчёт из учётной системы.',
    effectTime: '10 минут на машину.',
    effectMoney: '',
    effectSafety: '',
    effectQuality: 'Меньше расхождений между источниками.',
    resources: 'Решение начальника склада, настройка отчёта.',
  },
];

function wrongAnswer(key: AnswerKey, rng: Rng): AnswerValue {
  switch (key.kind) {
    case 'choice':
      return `${key.answer}-нет`;
    case 'multi':
    case 'flags':
      return key.answers.slice(0, Math.max(1, key.answers.length - 1));
    case 'order':
      return shuffle(key.order, rng);
    case 'hotspots':
      return key.zones.slice(0, Math.ceil(key.zones.length / 2)).map((z) => ({ x: z.x + 1, y: z.y + 1 }));
    case 'fishbone': {
      const ids = Object.keys(key.placement);
      return Object.fromEntries(ids.map((id, i) => [id, i < 3 ? 'none-x' : key.placement[id]]));
    }
    case 'match': {
      const ids = Object.keys(key.pairs);
      const v = Object.values(key.pairs);
      return Object.fromEntries(ids.map((id, i) => [id, i < 2 ? v[(i + 1) % v.length] : key.pairs[id]]));
    }
    case 'number':
      return key.answer + 40;
  }
}

export async function seedDemo(store: Store, content: Content): Promise<void> {
  const rng = createRng('demo-seed');
  const realNow = Date.now();
  let t = realNow - 2 * 86_400_000;
  const svc = new GameService(store, content, () => new Date(t), rng);

  const org = await svc.ensureOrganizer(DEMO_CODES.organizer);
  await svc.orgTour(org, 'open');

  const norm = (c: string) => c.replace(/[^A-Z0-9]/g, '');
  const jury = await store.createAccounts(
    DEMO_CODES.jury.map((c, i) => ({ code: norm(c), role: 'jury' as const, number: i + 1, nick: null, department: null })),
  );
  await store.createAccounts(
    DEMO_CODES.participants.map((c, i) => ({
      code: norm(c),
      role: 'participant' as const,
      number: i + 1,
      nick: null,
      department: null,
    })),
  );
  const bots = await svc.orgGenerateCodes(org, 'participant', BOT_NICKS.length);

  for (let b = 0; b < bots.length; b++) {
    let bot: Account = bots[b];
    const skill = 0.45 + rng() * 0.5;
    const stagesToPlay = 1 + Math.floor(rng() * IDEA_STAGE);
    t = realNow - 2 * 86_400_000 + Math.floor(rng() * 40) * 3_600_000;
    await svc.setProfile(bot, BOT_NICKS[b], content.departments[b % content.departments.length]);
    bot = (await store.getAccount(bot.id))!;

    for (let st = 1 as StageNo; st <= stagesToPlay; st = (st + 1) as StageNo) {
      await svc.startStage(bot, st);
      if (st === IDEA_STAGE) {
        t += 25 * 60_000;
        await svc.saveIdea(bot, IDEAS[b % IDEAS.length], true);
        break;
      }
      const run = (await store.getRun(bot.id, st))!;
      for (const it of buildItems(st, content, run.assignment)) {
        t += (20 + Math.floor(rng() * 60)) * 1000;
        const value = rng() < skill ? perfectAnswer(it.key) : wrongAnswer(it.key, rng);
        await svc.answer(bot, st, it.item.id, value);
      }
      t += 3_600_000;
    }
  }

  // Двое судей уже оценили часть работ
  t = realNow - 3_600_000;
  const ideas = (await store.listIdeas()).filter((i) => i.submittedAt);
  for (const idea of ideas.slice(0, 2)) {
    for (const j of jury.slice(0, 2)) {
      const scores = Object.fromEntries(content.idea.criteria.map((c) => [c.id, 80 + Math.floor(rng() * 12) * 10]));
      await svc.juryScore(j, idea.workNo, scores, 'Демо-оценка');
    }
  }
}
