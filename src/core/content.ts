// Проверка content.json и выделение публичной части (без заданий и ответов).
import { NOT_A_CAUSE, STAGES, type ChoiceQuestion, type Content, type PublicContent } from './types.ts';

export function toPublicContent(c: Content): PublicContent {
  return {
    settings: c.settings,
    departments: c.departments,
    stages: c.stages,
    wasteTypes: c.stage1.wasteTypes,
    steps: c.stage2.steps,
    idea: c.idea,
  };
}

/** Возвращает список понятных ошибок. Пустой список — всё в порядке. */
export function validateContent(c: Content): string[] {
  const errors: string[] = [];
  const err = (m: string) => errors.push(m);
  const s = c.settings;
  const max = s.stageMaxAltitude;

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
    err(`settings.stageMinutes: нужно ${STAGES.length} чисел — минуты на каждую вершину`);
  if (s.hintPenalty < 0 || s.hintPenalty > 1) err('settings.hintPenalty: число от 0 до 1 (0.3 = 30 %)');
  if (s.juryCount < 1) err('settings.juryCount: нужен хотя бы один судья');
  if (c.stages?.length !== STAGES.length) err(`stages: нужно описание для ${STAGES.length} вершин`);
  if (!c.departments?.length) err('departments: список подразделений пуст');

  // Этап 1
  const waste = c.stage1.wasteTypes.map((w) => w.id);
  uniq('stage1.wasteTypes', waste);
  uniq('stage1.situations', c.stage1.situations.map((x) => x.id));
  c.stage1.situations.forEach((x) => {
    if (!waste.includes(x.answer)) err(`stage1, ситуация «${x.id}»: вид потерь «${x.answer}» не найден в wasteTypes`);
  });
  if (c.stage1.situations.length < s.draw.stage1Situations)
    err(`stage1: в банке ${c.stage1.situations.length} ситуаций, а выдаётся ${s.draw.stage1Situations}`);

  // Этап 2
  const steps = c.stage2.steps.map((x) => x.id);
  uniq('stage2.steps', steps);
  uniq('stage2.images', c.stage2.images.map((x) => x.id));
  c.stage2.images.forEach((img) => {
    uniq(`stage2, картинка «${img.id}», zones`, img.zones.map((z) => z.id));
    uniq(`stage2, картинка «${img.id}», match`, img.match.map((z) => z.id));
    if (!img.zones.length) err(`stage2, картинка «${img.id}»: нет зон с нарушениями`);
    img.zones.forEach((z) => {
      if (z.x < 0 || z.y < 0 || z.x + z.w > 100 || z.y + z.h > 100)
        err(`stage2, картинка «${img.id}», зона «${z.id}»: координаты должны быть в процентах от 0 до 100`);
    });
    img.match.forEach((m) => {
      if (!steps.includes(m.answer)) err(`stage2, картинка «${img.id}», «${m.id}»: шаг «${m.answer}» не найден в steps`);
    });
  });
  if (c.stage2.images.length < s.draw.stage2Images) err('stage2: картинок в банке меньше, чем выдаётся');
  const p2 = s.points.stage2;
  if (p2.order + p2.hotspots + p2.match !== max) err(`settings.points.stage2: сумма должна быть ${max}`);

  // Этап 3
  uniq('stage3.processes', c.stage3.processes.map((x) => x.id));
  c.stage3.processes.forEach((p) => {
    uniq(`stage3, процесс «${p.id}»`, p.cards.map((x) => x.id));
    if (p.cards.length < 3) err(`stage3, процесс «${p.id}»: нужно хотя бы 3 карточки`);
    if (!p.cards.some((x) => !x.valueAdded)) err(`stage3, процесс «${p.id}»: нет операций без ценности`);
    p.cards.forEach((x) => {
      if (!(x.minutes >= 0)) err(`stage3, процесс «${p.id}», «${x.id}»: minutes должно быть числом`);
    });
  });
  if (c.stage3.processes.length < s.draw.stage3Processes) err('stage3: процессов в банке меньше, чем выдаётся');
  const p3 = s.points.stage3;
  if (p3.order + p3.flags + p3.number !== max) err(`settings.points.stage3: сумма должна быть ${max}`);

  // Этап 4
  uniq('stage4.cases', c.stage4.cases.map((x) => x.id));
  uniq('stage4.questions', c.stage4.questions.map((x) => x.id));
  c.stage4.cases.forEach((cs) => {
    if (!cs.whys.length) err(`stage4, кейс «${cs.id}»: нет шагов «почему»`);
    cs.whys.forEach((w, i) => choice(`stage4, кейс «${cs.id}», почему ${i + 1}`, w));
    choice(`stage4, кейс «${cs.id}», корневая причина`, cs.root);
    uniq(`stage4, кейс «${cs.id}», меры`, cs.measures.options.map((o) => o.id));
    cs.measures.answers.forEach((a) => {
      if (!cs.measures.options.some((o) => o.id === a)) err(`stage4, кейс «${cs.id}», меры: ответ «${a}» не найден`);
    });
    if (!cs.measures.answers.length) err(`stage4, кейс «${cs.id}», меры: нет правильных ответов`);
  });
  c.stage4.questions.forEach((q) => choice(`stage4, вопрос «${q.id}»`, q));
  if (c.stage4.cases.length < s.draw.stage4Cases) err('stage4: кейсов в банке меньше, чем выдаётся');
  if (c.stage4.questions.length < s.draw.stage4Questions) err('stage4: вопросов в банке меньше, чем выдаётся');
  const p4 = s.points.stage4;
  if (p4.whys + p4.root + p4.measures + p4.questions !== max) err(`settings.points.stage4: сумма должна быть ${max}`);

  // Этап 5 — диаграмма Исикавы
  const cats = c.stage5.categories.map((x) => x.id);
  uniq('stage5.categories', cats);
  if (cats.includes(NOT_A_CAUSE)) err(`stage5.categories: id «${NOT_A_CAUSE}» зарезервирован для корзины «Не причина»`);
  uniq('stage5.cases', c.stage5.cases.map((x) => x.id));
  c.stage5.cases.forEach((fc) => {
    uniq(`stage5, кейс «${fc.id}», причины`, fc.causes.map((x) => x.id));
    fc.causes.forEach((x) => {
      if (x.category !== NOT_A_CAUSE && !cats.includes(x.category))
        err(`stage5, кейс «${fc.id}», причина «${x.id}»: категория «${x.category}» не найдена в categories`);
    });
    if (fc.causes.length < 4) err(`stage5, кейс «${fc.id}»: нужно хотя бы 4 причины`);
    choice(`stage5, кейс «${fc.id}», главная причина`, fc.focus);
  });
  choice('stage5.next', c.stage5.next);
  if (c.stage5.cases.length < s.draw.stage5Cases) err('stage5: кейсов в банке меньше, чем выдаётся');
  const p5 = s.points.stage5;
  if (p5.fishbone + p5.focus + p5.next !== max) err(`settings.points.stage5: сумма должна быть ${max}`);

  // Вершина с идеей
  uniq('idea.fields', c.idea.fields.map((x) => x.id));
  uniq('idea.criteria', c.idea.criteria.map((x) => x.id));
  const critSum = c.idea.criteria.reduce((a, x) => a + x.max, 0);
  if (critSum !== max) err(`idea.criteria: сумма максимумов должна быть ${max}, сейчас ${critSum}`);
  c.idea.fields.forEach((f) => {
    if (!(f.maxLength > 0)) err(`idea, поле «${f.id}»: maxLength должно быть больше 0`);
  });

  return errors;
}
