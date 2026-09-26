// Проверка content.json и выделение публичной части (без заданий и ответов).
import { NOT_A_CAUSE, STAGES, isInbox, type ChoiceQuestion, type Content, type PublicContent } from './types.ts';

export function toPublicContent(c: Content): PublicContent {
  return {
    settings: c.settings,
    stages: c.stages,
    wasteTypes: c.waste.wasteTypes,
    steps: c.fiveS.steps,
    idea: c.idea,
  };
}

/** Возвращает список понятных ошибок. Пустой список — всё в порядке. */
export function validateContent(c: Content): string[] {
  const errors: string[] = [];
  const err = (m: string) => errors.push(m);
  const s = c.settings;
  const max = s.stageMaxAltitude;
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

  const uniq = (where: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (!id) err(`${where}: пустой id`);
      if (seen.has(id)) err(`${where}: id «${id}» повторяется`);
      seen.add(id);
    }
  };
  const choice = (where: string, q: ChoiceQuestion) => {
    uniq(`${where}, варианты`, q.options.map((o) => o.id));
    if (!q.options.some((o) => o.id === q.answer)) err(`${where}: ответ «${q.answer}» не найден среди вариантов`);
    if (q.options.length < 2) err(`${where}: нужно хотя бы 2 варианта`);
  };

  // Настройки
  if (s.stageMinutes?.length !== STAGES.length)
    err(`settings.stageMinutes: нужно ${STAGES.length} чисел, по минутам на каждую вершину`);
  if (s.hintPenalty < 0 || s.hintPenalty > 1) err('settings.hintPenalty: число от 0 до 1 (0.3 = 30 %)');
  if (!(s.fiveSOfficeShare >= 0 && s.fiveSOfficeShare <= 1)) err('settings.fiveSOfficeShare: число от 0 до 1 (0.5 = половина)');
  if (s.juryCount < 1) err('settings.juryCount: нужен хотя бы один судья');
  if (c.stages?.length !== STAGES.length) err(`stages: нужно описание для ${STAGES.length} вершин`);

  // Потери
  const waste = c.waste.wasteTypes.map((w) => w.id);
  uniq('waste.wasteTypes', waste);
  uniq('waste.situations', c.waste.situations.map((x) => x.id));
  c.waste.situations.forEach((x) => {
    if (!waste.includes(x.answer)) err(`waste, ситуация «${x.id}»: вид потерь «${x.answer}» не найден в wasteTypes`);
  });
  uniq('waste.money', c.waste.money.map((x) => x.id));
  c.waste.money.forEach((q) => choice(`waste, вопрос «${q.id}»`, q));
  if (sum(s.points.waste) !== max) err(`settings.points.waste: сумма должна быть ${max}`);
  if (c.waste.situations.length < s.draw.wasteSituations)
    err(`waste: в банке ${c.waste.situations.length} ситуаций, а выдаётся ${s.draw.wasteSituations}`);

  // 5С
  const steps = c.fiveS.steps.map((x) => x.id);
  uniq('fiveS.steps', steps);
  uniq('fiveS.variants', c.fiveS.variants.map((x) => x.id));
  c.fiveS.variants.forEach((v) => {
    const where = `fiveS, вариант «${v.id}»`;
    const violations = isInbox(v) ? v.violations : v.zones;
    uniq(`${where}, нарушения`, violations.map((z) => z.id));
    violations.forEach((z) => {
      if (!steps.includes(z.step)) err(`${where}, «${z.id}»: шаг «${z.step}» не найден в steps`);
    });
    const covered = new Set(violations.map((z) => z.step));
    if (violations.length !== steps.length || covered.size !== steps.length)
      err(`${where}: нужно ровно ${steps.length} нарушений, по одному на каждый шаг 5С`);
    if (isInbox(v)) {
      const folders = v.folders.map((f) => f.id);
      uniq(`${where}, папки`, folders);
      uniq(`${where}, письма`, v.emails.map((e) => e.id));
      if (v.emails.length < 4) err(`${where}: нужно хотя бы 4 письма`);
      v.emails.forEach((e) => {
        if (!folders.includes(e.answer)) err(`${where}, письмо «${e.id}»: папка «${e.answer}» не найдена`);
      });
    } else {
      v.zones.forEach((z) => {
        if (z.x < 0 || z.y < 0 || z.x + z.w > 100 || z.y + z.h > 100)
          err(`${where}, зона «${z.id}»: координаты должны быть в процентах от 0 до 100`);
      });
    }
  });
  if (!c.fiveS.variants.length) err('fiveS: нет ни одного варианта');
  if (sum(s.points.fiveS) !== max) err(`settings.points.fiveS: сумма должна быть ${max}`);

  // Поток
  uniq('flow.processes', c.flow.processes.map((x) => x.id));
  c.flow.processes.forEach((p) => {
    uniq(`flow, процесс «${p.id}»`, p.cards.map((x) => x.id));
    if (p.cards.length < 3) err(`flow, процесс «${p.id}»: нужно хотя бы 3 карточки`);
    if (!p.cards.some((x) => !x.valueAdded)) err(`flow, процесс «${p.id}»: нет операций без ценности`);
    p.cards.forEach((x) => {
      if (!(x.minutes >= 0)) err(`flow, процесс «${p.id}», «${x.id}»: minutes должно быть числом`);
    });
  });
  if (c.flow.processes.length < s.draw.flowProcesses) err('flow: процессов в банке меньше, чем выдаётся');
  uniq('flow.little', c.flow.little.map((x) => x.id));
  if (!c.flow.little.length) err('flow.little: нужна хотя бы одна задача на закон Литтла');
  c.flow.little.forEach((l) => {
    if (!(l.wip > 0 && l.cr > 0 && l.target > 0)) err(`flow.little «${l.id}»: wip, cr и target должны быть больше 0`);
  });
  uniq('flow.littleQuestions', c.flow.littleQuestions.map((x) => x.id));
  if (!c.flow.littleQuestions.length) err('flow.littleQuestions: нужен хотя бы один вопрос');
  c.flow.littleQuestions.forEach((q) => choice(`flow, вопрос «${q.id}»`, q));
  if (sum(s.points.flow) !== max) err(`settings.points.flow: сумма должна быть ${max}`);

  // Восемь шагов
  const e = c.eightSteps;
  const eSteps = e.steps.map((x) => x.id);
  const phases = e.phases.map((x) => x.id);
  uniq('eightSteps.steps', eSteps);
  uniq('eightSteps.phases', phases);
  e.steps.forEach((x) => {
    if (!phases.includes(x.phase)) err(`eightSteps, шаг «${x.id}»: этап «${x.phase}» не найден в phases`);
  });
  uniq('eightSteps.tools', e.tools.map((x) => x.id));
  e.tools.forEach((t) => {
    if (!eSteps.includes(t.answer)) err(`eightSteps, инструмент «${t.id}»: шаг «${t.answer}» не найден`);
  });
  uniq('eightSteps.situations', e.situations.map((x) => x.id));
  e.situations.forEach((t) => {
    if (!eSteps.includes(t.answer)) err(`eightSteps, ситуация «${t.id}»: шаг «${t.answer}» не найден`);
  });
  if (e.situations.length < s.draw.eightStepsSituations) err('eightSteps: ситуаций в банке меньше, чем выдаётся');
  if (e.tools.length < 2) err('eightSteps: нужно хотя бы 2 инструмента');
  choice('eightSteps.loop', e.loop);
  if (sum(s.points.eightSteps) !== max) err(`settings.points.eightSteps: сумма должна быть ${max}`);

  // 5 почему и регулярный менеджмент
  uniq('whys.cases', c.whys.cases.map((x) => x.id));
  uniq('whys.questions', c.whys.questions.map((x) => x.id));
  c.whys.cases.forEach((cs) => {
    if (!cs.whys.length) err(`whys, кейс «${cs.id}»: нет шагов «почему»`);
    cs.whys.forEach((w, i) => choice(`whys, кейс «${cs.id}», почему ${i + 1}`, w));
    choice(`whys, кейс «${cs.id}», корневая причина`, cs.root);
    uniq(`whys, кейс «${cs.id}», меры`, cs.measures.options.map((o) => o.id));
    cs.measures.answers.forEach((a) => {
      if (!cs.measures.options.some((o) => o.id === a)) err(`whys, кейс «${cs.id}», меры: ответ «${a}» не найден`);
    });
    if (!cs.measures.answers.length) err(`whys, кейс «${cs.id}», меры: нет правильных ответов`);
  });
  c.whys.questions.forEach((q) => choice(`whys, вопрос «${q.id}»`, q));
  if (c.whys.cases.length < s.draw.whysCases) err('whys: кейсов в банке меньше, чем выдаётся');
  if (c.whys.questions.length < s.draw.whysQuestions) err('whys: вопросов в банке меньше, чем выдаётся');
  if (sum(s.points.whys) !== max) err(`settings.points.whys: сумма должна быть ${max}`);

  // Диаграмма Исикавы
  const cats = c.fishbone.categories.map((x) => x.id);
  uniq('fishbone.categories', cats);
  if (cats.includes(NOT_A_CAUSE)) err(`fishbone.categories: id «${NOT_A_CAUSE}» занят корзиной «Не причина»`);
  uniq('fishbone.cases', c.fishbone.cases.map((x) => x.id));
  c.fishbone.cases.forEach((fc) => {
    uniq(`fishbone, кейс «${fc.id}», причины`, fc.causes.map((x) => x.id));
    fc.causes.forEach((x) => {
      if (x.category !== NOT_A_CAUSE && !cats.includes(x.category))
        err(`fishbone, кейс «${fc.id}», причина «${x.id}»: категория «${x.category}» не найдена в categories`);
      (x.accept ?? []).forEach((a) => {
        if (a !== NOT_A_CAUSE && !cats.includes(a))
          err(`fishbone, кейс «${fc.id}», причина «${x.id}»: в accept категория «${a}» не найдена`);
      });
    });
    if (fc.causes.length < 4) err(`fishbone, кейс «${fc.id}»: нужно хотя бы 4 причины`);
    choice(`fishbone, кейс «${fc.id}», главная причина`, fc.focus);
  });
  choice('fishbone.next', c.fishbone.next);
  if (c.fishbone.cases.length < s.draw.fishboneCases) err('fishbone: кейсов в банке меньше, чем выдаётся');
  if (sum(s.points.fishbone) !== max) err(`settings.points.fishbone: сумма должна быть ${max}`);

  // Идея
  uniq('idea.fields', c.idea.fields.map((x) => x.id));
  uniq('idea.criteria', c.idea.criteria.map((x) => x.id));
  const critSum = c.idea.criteria.reduce((a, x) => a + x.max, 0);
  if (critSum !== max) err(`idea.criteria: сумма максимумов должна быть ${max}, сейчас ${critSum}`);
  c.idea.fields.forEach((f) => {
    if (!(f.maxLength > 0)) err(`idea, поле «${f.id}»: maxLength должно быть больше 0`);
  });

  return errors;
}
