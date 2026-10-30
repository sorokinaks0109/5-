# -*- coding: utf-8 -*-
"""Собирает интерактивные упражнения к тренингу по ИСМ.

Запуск: python3 build.py
Тексты заданий лежат ниже в EXERCISES. Поменяли текст — запустите скрипт заново,
HTML-файлы в папке uprazhneniya пересоберутся.
"""
import base64
import html
import json
from pathlib import Path

ROOT = Path(__file__).parent
OUT = ROOT / "uprazhneniya"

REBUS = "data:image/png;base64," + base64.b64encode((ROOT / "rebus.png").read_bytes()).decode()

SQUARE = '<svg viewBox="0 0 60 60" width="70"><rect x="8" y="8" width="44" height="44" fill="#0097D8"/></svg>'
TRIANGLE = '<svg viewBox="0 0 60 60" width="70"><polygon points="30,6 56,54 4,54" fill="#0097D8"/></svg>'

EXERCISES = [
    {
        "file": "01-oblast.html", "type": "sort", "slide": 4,
        "title": "Область применения",
        "task": "Какие виды деятельности входят в область применения системы менеджмента ГПН-Снабжения?",
        "cols": [
            {"id": "in", "name": "Входит", "color": "#48A044"},
            {"id": "out", "name": "Не входит", "color": "#CD242C"},
        ],
        "items": [
            {"t": "Услуги складской логистики", "c": "in", "why": "Это основа деятельности Общества: приёмка, хранение и выдача МТР."},
            {"t": "Управление транспортной логистикой", "c": "in", "why": "Входит: доставка МТР до объектов заказчика."},
            {"t": "Управление закупками", "c": "in", "why": "Входит: закупка материально-технических ресурсов."},
            {"t": "Перевозка грузов авиационным, речным и морским транспортом", "c": "in", "why": "Входит: особенно важно для северных месторождений, куда нет дорог."},
            {"t": "Инспекционные услуги и технические аудиты", "c": "in", "why": "Входит: контроль качества МТР у поставщиков."},
            {"t": "Инженерные изыскания в строительстве", "c": "in", "why": "Входит в область применения, хотя об этом часто забывают."},
            {"t": "Добыча нефти", "c": "out", "why": "Это делают добывающие дочерние общества, а не ГПН-Снабжение."},
            {"t": "Переработка нефти на НПЗ", "c": "out", "why": "Этим занимаются нефтеперерабатывающие заводы группы."},
            {"t": "Продажа топлива на АЗС", "c": "out", "why": "Это сбытовой бизнес, к снабжению отношения не имеет."},
            {"t": "Бурение скважин", "c": "out", "why": "Бурение выполняют сервисные и добывающие компании. Мы им только поставляем МТР."},
        ],
    },
    {
        "file": "02-processy.html", "type": "sort", "slide": 12,
        "title": "Типы процессов",
        "task": "Разложите процессы ГПН-Снабжения по четырём типам.",
        "cols": [
            {"id": "upr", "name": "Управляющие", "color": "#003196", "hint": "цели, стратегия, требования к остальным"},
            {"id": "osn", "name": "Основные", "color": "#48A044", "hint": "услуга для заказчика, приносят доход"},
            {"id": "pod", "name": "Поддерживающие", "color": "#0097D8", "hint": "обеспечивают работу остальных"},
            {"id": "raz", "name": "Развития", "color": "#7957B2", "hint": "совершенствование, прибыль в будущем"},
        ],
        "items": [
            {"t": "Стратегическое планирование", "c": "upr", "why": "Задаёт цели всему Обществу: классический управляющий процесс."},
            {"t": "Бюджетирование", "c": "upr", "why": "Распределяет ресурсы и задаёт рамки для остальных процессов."},
            {"t": "Управление интегрированной системой менеджмента", "c": "upr", "why": "Определяет требования и правила для всех процессов."},
            {"t": "Управление закупками МТР", "c": "osn", "why": "Это услуга для заказчиков: часть цепочки создания стоимости."},
            {"t": "Складская логистика", "c": "osn", "why": "Хранение и выдача МТР: то, за что платит заказчик."},
            {"t": "Транспортная логистика", "c": "osn", "why": "Доставка МТР на объекты: основная услуга."},
            {"t": "Организация авиаперевозок", "c": "osn", "why": "Основной процесс: в реестре процессов он стоит под номером 02."},
            {"t": "Управление персоналом", "c": "pod", "why": "Его потребители внутри компании: все остальные процессы."},
            {"t": "ИТ-обеспечение", "c": "pod", "why": "Заказчику ИТ не продаём, но без него остальные процессы встанут."},
            {"t": "Бухгалтерский учёт", "c": "pod", "why": "Внутренний процесс, который обеспечивает работу остальных."},
            {"t": "Внедрение цифровых решений на складах", "c": "raz", "why": "Нацелено на рост эффективности в будущем."},
            {"t": "Развитие производственной системы и бережливого производства", "c": "raz", "why": "Совершенствует деятельность: процесс развития."},
        ],
    },
    {
        "file": "03-sreda.html", "type": "sort", "slide": 14,
        "title": "Среда организации",
        "task": "Какие факторы внутренние, а какие внешние для ГПН-Снабжения?",
        "cols": [
            {"id": "vn", "name": "Внутренние факторы", "color": "#48A044", "hint": "мы можем на них влиять"},
            {"id": "ex", "name": "Внешние факторы", "color": "#0097D8", "hint": "приходится учитывать"},
        ],
        "items": [
            {"t": "Организационная структура", "c": "vn", "why": "Структуру Общество определяет само."},
            {"t": "Правила и процедуры", "c": "vn", "why": "Наши регламенты и стандарты: внутренний фактор."},
            {"t": "Корпоративная культура", "c": "vn", "why": "Ценности и привычки сотрудников формируются внутри."},
            {"t": "Применяемые технологии", "c": "vn", "why": "Какие технологии внедрить, решаем мы сами."},
            {"t": "Информационные системы", "c": "vn", "why": "Наши ИТ-системы: внутренний фактор."},
            {"t": "Организационные знания", "c": "vn", "why": "Опыт и знания сотрудников: внутренний ресурс."},
            {"t": "Законодательство", "c": "ex", "why": "Законы меняются без нашего участия, мы обязаны их выполнять."},
            {"t": "Экономические условия (курс, инфляция, ставка)", "c": "ex", "why": "Влияют на цены МТР, но управлять ими мы не можем."},
            {"t": "Конкурентная среда", "c": "ex", "why": "Конкуренты действуют независимо от нас."},
            {"t": "Политическая обстановка и санкции", "c": "ex", "why": "Влияют на цепочки поставок, но управлять ими мы не можем."},
            {"t": "Климат и природные условия (зимники, ледостав)", "c": "ex", "why": "Северный завоз зависит от погоды, и это внешний фактор."},
            {"t": "Социальная среда", "c": "ex", "why": "Рынок труда и местные сообщества: внешний фактор."},
        ],
    },
    {
        "file": "04-zainteresovannye.html", "type": "sort", "slide": 17,
        "title": "Заинтересованные стороны",
        "task": "Какие заинтересованные стороны внутренние, а какие внешние?",
        "cols": [
            {"id": "vn", "name": "Внутренние ЗС", "color": "#48A044"},
            {"id": "ex", "name": "Внешние ЗС", "color": "#0097D8"},
        ],
        "items": [
            {"t": "Работники Общества", "c": "vn", "why": "Главная внутренняя заинтересованная сторона."},
            {"t": "Высшее руководство", "c": "vn", "why": "Отвечает за систему менеджмента и ждёт от неё результата."},
            {"t": "ПАО «Газпром нефть»", "c": "vn", "why": "Это головная компания, поэтому в ГПН-Снабжении её относят к внутренним ЗС."},
            {"t": "Клиенты (дочерние общества группы)", "c": "ex", "why": "Получают наши услуги: внешняя ЗС."},
            {"t": "Поставщики МТР", "c": "ex", "why": "Внешняя сторона: от них зависят качество и сроки."},
            {"t": "Подрядчики и перевозчики", "c": "ex", "why": "Выполняют работы по договору: внешняя ЗС."},
            {"t": "Органы государственной власти", "c": "ex", "why": "Ростехнадзор, Росприроднадзор и другие надзорные органы: внешние ЗС."},
            {"t": "Местные сообщества", "c": "ex", "why": "Жители регионов, где расположены склады и базы."},
            {"t": "Конкуренты", "c": "ex", "why": "Тоже заинтересованная сторона, и тоже внешняя."},
        ],
    },
    {
        "file": "05-zapisi.html", "type": "sort", "slide": 27,
        "title": "Записи",
        "task": "Что из этого запись, а что документ, который устанавливает требования?",
        "cols": [
            {"id": "zap", "name": "Запись", "color": "#48A044", "hint": "фиксирует, что сделано"},
            {"id": "doc", "name": "Документ", "color": "#7957B2", "hint": "говорит, как надо делать"},
        ],
        "items": [
            {"t": "Подписанный акт приёмки МТР", "c": "zap", "why": "Подтверждает, что приёмка состоялась."},
            {"t": "Журнал регистрации инструктажей с подписями", "c": "zap", "why": "Доказывает, что инструктаж проведён."},
            {"t": "Отчёт по внутреннему аудиту", "c": "zap", "why": "Фиксирует результаты проверки."},
            {"t": "Протокол совещания", "c": "zap", "why": "Свидетельствует о принятых решениях."},
            {"t": "Заполненный чек-лист обхода склада", "c": "zap", "why": "Фиксирует результат проверки."},
            {"t": "Политика в области ИСМ", "c": "doc", "why": "Задаёт принципы. Ничего не подтверждает."},
            {"t": "Регламент процесса закупок", "c": "doc", "why": "Описывает, как нужно работать."},
            {"t": "Должностная инструкция", "c": "doc", "why": "Устанавливает обязанности и требования."},
            {"t": "Пустой бланк акта приёмки", "c": "doc", "why": "Подвох: пока бланк не заполнен, это шаблон, а не запись."},
        ],
    },
    {
        "file": "06-risk-ili-net.html", "type": "sort", "slide": 31,
        "title": "Риск или не риск?",
        "task": "Какие из этих событий относятся к рискам, а какие нет?",
        "cols": [
            {"id": "r", "name": "Риск", "color": "#E65907"},
            {"id": "n", "name": "Не риск", "color": "#7E7E7E"},
        ],
        "items": [
            {"t": "Задержка поставки МТР из-за раннего закрытия зимника", "c": "r", "why": "Возможное будущее событие, которое влияет на цель. Начинается с отглагольного существительного."},
            {"t": "Отказ погрузчика на складе в пиковый период", "c": "r", "why": "Может произойти и сорвать сроки отгрузки."},
            {"t": "Срыв сроков поставки поставщиком", "c": "r", "why": "Вероятное событие, которое влияет на цель по своевременности поставок."},
            {"t": "Нарушение условий хранения МТР с особыми требованиями", "c": "r", "why": "Может привести к порче продукции."},
            {"t": "Склад в прошлом месяце затопило", "c": "n", "why": "Событие уже произошло. Это инцидент, а не риск."},
            {"t": "1 января начнётся новый финансовый год", "c": "n", "why": "Вероятность 100%. Это плановое событие."},
            {"t": "«Я переживаю, что всё пойдёт не так»", "c": "n", "why": "Беспокойство и эмоции рисками не считаются."},
            {"t": "В столовой поменяют меню", "c": "n", "why": "На цели Общества не влияет."},
        ],
    },
    {
        "file": "07-strategii.html", "type": "quiz", "slide": 34, "timer": 0,
        "title": "Стратегии управления риском",
        "task": "Какая стратегия управления риском применяется в каждой ситуации?",
        "questions": [
            {"q": "Права я получила вчера. Прежде чем ехать из А в Б, беру пять занятий с инструктором.", "opts": ["Снижение", "Передача", "Принятие", "Уклонение"], "a": 0, "why": "Вероятность аварии становится меньше. Это снижение риска."},
            {"q": "Оформляю КАСКО на машину.", "opts": ["Снижение", "Передача", "Принятие", "Уклонение"], "a": 1, "why": "Последствия ДТП берёт на себя страховая компания. Это передача риска."},
            {"q": "Еду на такси, а машину оставляю дома.", "opts": ["Снижение", "Передача", "Принятие", "Уклонение"], "a": 3, "why": "Вероятность попасть в ДТП за своим рулём теперь 0%. Это уклонение."},
            {"q": "Сажусь и еду: будь что будет.", "opts": ["Снижение", "Передача", "Принятие", "Уклонение"], "a": 2, "why": "Никаких действий, принимаем любые последствия. Это принятие."},
            {"q": "Страхуем груз при морской перевозке в Арктику.", "opts": ["Снижение", "Передача", "Принятие", "Уклонение"], "a": 1, "why": "Финансовые последствия гибели груза ложатся на страховщика."},
            {"q": "Создаём страховой запас критичных МТР на складе.", "opts": ["Снижение", "Передача", "Принятие", "Уклонение"], "a": 0, "why": "Сбой поставки по-прежнему возможен, но последствия будут меньше."},
            {"q": "Отказываемся от доставки по зимнику, который уже начал таять, и переносим доставку на навигацию.", "opts": ["Снижение", "Передача", "Принятие", "Уклонение"], "a": 3, "why": "Поменяли план и исключили сам риск. Это уклонение."},
            {"q": "Возможна задержка поставки канцелярии на 1 день. Ничего не делаем.", "opts": ["Снижение", "Передача", "Принятие", "Уклонение"], "a": 2, "why": "Последствия незначительны, тратить на них ресурсы невыгодно. Это принятие."},
            {"q": "Подключаем второго поставщика по критичной позиции.", "opts": ["Снижение", "Передача", "Принятие", "Уклонение"], "a": 0, "why": "Вероятность срыва поставки снижается."},
        ],
    },
    {
        "file": "08-opasnosti-aspekty.html", "type": "sort", "slide": 37,
        "title": "Опасности и экологические аспекты",
        "task": "Что относится к опасностям в области ПБОЗ, а что к экологическим аспектам?",
        "cols": [
            {"id": "op", "name": "Опасность (ПБОЗ)", "color": "#E65907", "hint": "может навредить человеку"},
            {"id": "ek", "name": "Экологический аспект", "color": "#48A044", "hint": "взаимодействует с природой"},
        ],
        "items": [
            {"t": "Работа на высоте на стеллажах", "c": "op", "why": "Падение с высоты может привести к травме работника."},
            {"t": "Движущийся погрузчик в зоне работы людей", "c": "op", "why": "Риск наезда на человека."},
            {"t": "Груз, подвешенный на крюке крана", "c": "op", "why": "Падение груза может травмировать людей."},
            {"t": "Скользкий пол зимой у ворот склада", "c": "op", "why": "Риск падения и травмы."},
            {"t": "Выхлопные газы техники", "c": "ek", "why": "Выбросы в атмосферу."},
            {"t": "Образование отходов упаковки и поддонов", "c": "ek", "why": "Размещение отходов."},
            {"t": "Пролив ГСМ на грунт при заправке", "c": "ek", "why": "Сбросы в воду и на грунт."},
            {"t": "Потребление электроэнергии на освещение складов", "c": "ek", "why": "Использование природных ресурсов."},
        ],
    },
    {
        "file": "09-proverka.html", "type": "sort", "slide": 39,
        "title": "Мониторинг, измерение, анализ, оценка",
        "task": "Разложите примеры по четырём действиям на этапе проверки (Check).",
        "cols": [
            {"id": "mon", "name": "Мониторинг", "color": "#003196", "hint": "статус: да/нет, в норме/не в норме"},
            {"id": "izm", "name": "Измерение", "color": "#0097D8", "hint": "число"},
            {"id": "an", "name": "Анализ", "color": "#7957B2", "hint": "взаимосвязи и тенденции"},
            {"id": "oc", "name": "Оценка", "color": "#48A044", "hint": "достигли ли результата"},
        ],
        "items": [
            {"t": "Ежедневный обход склада: порядок соблюдается или нет", "c": "mon", "why": "Определяем статус, а не число."},
            {"t": "Отслеживание статуса заявки на МТР в системе", "c": "mon", "why": "Статус: в работе, отгружено, доставлено."},
            {"t": "Контроль статуса мероприятий плана: выполнено / не выполнено", "c": "mon", "why": "Качественная характеристика, поэтому мониторинг."},
            {"t": "Замер температуры и влажности на складе", "c": "izm", "why": "Получаем конкретное значение в °C и %."},
            {"t": "Расчёт доли поставок в срок за месяц (%)", "c": "izm", "why": "Количественный показатель."},
            {"t": "Взвешивание груза перед отправкой", "c": "izm", "why": "Получаем значение в тоннах."},
            {"t": "Сравнение срывов поставок за 3 года и поиск закономерностей", "c": "an", "why": "Ищем тенденции и причины, поэтому анализ."},
            {"t": "Разбор, у каких поставщиков чаще всего брак", "c": "an", "why": "Ищем взаимосвязи в данных."},
            {"t": "Вывод на анализе со стороны руководства: цели ИСМ на год достигнуты", "c": "oc", "why": "Оцениваем достигнутый результат."},
            {"t": "Заключение аудитора о результативности процесса", "c": "oc", "why": "Делаем вывод: процесс результативен или нет."},
        ],
    },
    {
        "file": "10-nesootvetstviya.html", "type": "sort", "slide": 41,
        "title": "Коррекция или корректирующее действие",
        "task": "Для двух несоответствий с аудита: что из предложенного будет коррекцией, а что корректирующим действием (КРД)?",
        "note": "<b>Несоответствие 1.</b> В должностных инструкциях в качестве количественных показателей масштаба деятельности указаны должностные обязанности.<br><b>Несоответствие 2.</b> Графики ППР подъёмных сооружений на 2025 год не актуализированы с учётом вывода ПС из эксплуатации.",
        "cols": [
            {"id": "kor", "name": "Коррекция", "color": "#E65907", "hint": "убираем само несоответствие"},
            {"id": "krd", "name": "КРД", "color": "#48A044", "hint": "убираем причину, чтобы не повторилось"},
        ],
        "items": [
            {"t": "№1: Переписать ДИ, указав реальные количественные показатели", "c": "kor", "why": "Исправляем конкретные ДИ, то есть само несоответствие."},
            {"t": "№1: Добавить в стандарт по разработке ДИ требование и пример показателей масштаба", "c": "krd", "why": "Устраняем причину: люди не знали, что писать."},
            {"t": "№1: Включить проверку раздела показателей в маршрут согласования ДИ", "c": "krd", "why": "Ошибка больше не пройдёт согласование."},
            {"t": "№2: Актуализировать графики ППР и исключить выведенные ПС", "c": "kor", "why": "Исправляем конкретные графики."},
            {"t": "№2: Закрепить в регламенте срок актуализации графика ППР после вывода ПС", "c": "krd", "why": "Устраняем причину: не было правила."},
            {"t": "№2: Назначить ответственного за ежеквартальную сверку перечня ПС и графика ППР", "c": "krd", "why": "Не даём несоответствию повториться."},
        ],
    },
    {
        "file": "11-velosiped.html", "type": "sort", "slide": 45,
        "title": "Верификация или валидация",
        "task": "Вы производите велосипеды. Какие проверки относятся к верификации, а какие к валидации?",
        "cols": [
            {"id": "ver", "name": "Верификация", "color": "#003196", "hint": "сделали по требованиям?"},
            {"id": "val", "name": "Валидация", "color": "#48A044", "hint": "работает так, как ждали?"},
        ],
        "items": [
            {"t": "Педали есть?", "c": "ver", "why": "Проверяем по спецификации, что деталь на месте."},
            {"t": "Руль есть?", "c": "ver", "why": "Сверяем с чертежом."},
            {"t": "Колёса 26 дюймов, как в чертеже?", "c": "ver", "why": "Проверяем соответствие требованию."},
            {"t": "Тормоза установлены по спецификации", "c": "ver", "why": "Сверяем с документом."},
            {"t": "Тестовый райдер проехал 20 км по лесу, велосипед не развалился", "c": "val", "why": "Проверяем в реальных условиях."},
            {"t": "Ребёнок 8 лет достаёт до педалей и уверенно едет", "c": "val", "why": "Подходит ли велосипед своему пользователю."},
            {"t": "Курьер целый день развозил заказы, и ему удобно", "c": "val", "why": "Продукт работает так, как от него ожидали."},
        ],
    },
    {
        "file": "12-pit-stop.html", "type": "quiz", "slide": 46, "timer": 20,
        "title": "Пит-стоп: итоговый квиз",
        "task": "20 секунд на вопрос. Отвечаем хором или командами.",
        "questions": [
            {"q": "Каких процессов НЕ существует в ГПН-Снабжении?", "opts": ["Основных", "Развития", "Коррекции", "Управляющих"], "a": 2, "why": "Типов всего четыре: управляющие, основные, поддерживающие и процессы развития. Коррекция — это действие."},
            {"q": "Какую процедуру обязательно проходят особо ответственные процессы?", "opts": ["Верификацию", "Валидацию", "Сертификацию", "Инвентаризацию"], "a": 1, "why": "Валидация подтверждает, что процесс даёт ожидаемый результат в реальных условиях."},
            {"q": "Отгадайте ребус", "img": REBUS, "opts": ["Прогресс", "Процесс", "Продукт", "Протокол"], "a": 1, "why": "ПР(ах) + ОЦ + ЕСС = ПРОЦЕСС."},
            {"q": "Стратегия управления риском, при которой последствия передаются третьему участнику, называется…", "opts": ["Снижение", "Принятие", "Передача риска", "Уклонение"], "a": 2, "why": "Например, страхование груза."},
            {"q": "Действие, предпринятое для устранения ПРИЧИНЫ несоответствия, — это…", "opts": ["Коррекция", "Корректирующее действие", "Анализ"], "a": 1, "why": "Коррекция устраняет само несоответствие, а корректирующее действие — его причину."},
            {"q": "Документация, содержащая требования к специальным характеристикам, обозначается значком…", "opts": ["квадрат", "треугольник"], "optsHtml": [SQUARE, TRIANGLE], "a": 1, "why": "Треугольник — специальные характеристики, квадрат — особо ответственные процессы."},
            {"q": "Что идёт после этапа «Do» в цикле PDCA?", "opts": ["Plan", "Check", "Act"], "a": 1, "why": "Планируй, делай, проверяй, действуй."},
            {"q": "Что из этого НЕ риск?", "opts": ["Срыв поставки поставщиком", "Новый год наступит 1 января", "Отказ погрузчика"], "a": 1, "why": "Событие со 100% вероятностью — это плановое событие, а не риск."},
        ],
    },
]

CSS = """
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{font-family:"Segoe UI",Arial,sans-serif;background:#F2F2F2;color:#1B1B1B;font-size:20px;display:flex;flex-direction:column}
header{background:#48A044;color:#fff;display:flex;align-items:center;gap:18px;padding:14px 28px}
header h1{margin:0;font-size:30px;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
header .slide{margin-left:auto;font-size:16px;opacity:.9}
header a{color:#fff;text-decoration:none;font-size:16px;border:1px solid rgba(255,255,255,.6);padding:6px 12px;border-radius:6px}
main{flex:1;padding:20px 28px;display:flex;flex-direction:column;gap:16px;max-width:1500px;width:100%;margin:0 auto}
.task{background:#fff;border-left:6px solid #48A044;padding:14px 18px;font-size:22px}
.note{background:#fff;padding:12px 18px;font-size:17px;line-height:1.45;color:#333}
.pool{display:flex;flex-wrap:wrap;gap:10px;min-height:64px;padding:12px;background:#fff;border:2px dashed #C8C8C8;border-radius:8px}
.pool:empty::after{content:"Все карточки разложены. Нажмите «Проверить»";color:#888;align-self:center}
.card{background:#fff;border:2px solid #0097D8;border-radius:8px;padding:10px 14px;cursor:pointer;user-select:none;font-size:18px;line-height:1.25;box-shadow:0 1px 3px rgba(0,0,0,.12);transition:transform .12s}
.card:hover{transform:translateY(-2px)}
.card.sel{background:#FFF6B3;border-color:#E6A800;box-shadow:0 0 0 4px rgba(230,168,0,.3)}
.card.ok{border-color:#48A044;background:#E6F4E5}
.card.bad{border-color:#CD242C;background:#FBE4E5}
.cols{display:grid;gap:14px;flex:1}
.col{background:#fff;border-radius:8px;display:flex;flex-direction:column;min-height:180px;cursor:pointer;border:2px solid transparent}
.col.hot{border-color:#E6A800}
.col h2{margin:0;color:#fff;font-size:20px;text-transform:uppercase;padding:10px 14px;border-radius:6px 6px 0 0}
.col h2 small{display:block;font-size:14px;text-transform:none;font-weight:400;opacity:.9}
.col .drop{flex:1;padding:10px;display:flex;flex-direction:column;gap:8px}
.bar{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
button{font:inherit;font-size:18px;padding:10px 22px;border-radius:8px;border:0;cursor:pointer;background:#003196;color:#fff}
button.sec{background:#fff;color:#003196;border:2px solid #003196}
button:disabled{opacity:.4;cursor:default}
.score{font-size:20px;font-weight:600}
.why{background:#003196;color:#fff;padding:12px 18px;border-radius:8px;font-size:18px;min-height:48px}
.why:empty{display:none}
.big{font-size:30px;line-height:1.3;background:#fff;padding:26px 30px;border-radius:10px}
.big img{display:block;margin:14px 0 0;max-height:220px}
.opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.opt{background:#fff;color:#003196;border:3px solid #003196;font-size:24px;padding:20px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:12px;min-height:90px}
.opt.ok{background:#48A044;border-color:#48A044;color:#fff}
.opt.bad{background:#CD242C;border-color:#CD242C;color:#fff}
.progress{display:flex;gap:6px}
.progress i{flex:1;height:8px;border-radius:4px;background:#D0D0D0}
.progress i.ok{background:#48A044}.progress i.bad{background:#CD242C}.progress i.cur{background:#E6A800}
.timer{font-size:36px;font-weight:700;color:#E65907;min-width:70px;text-align:right}
.final{text-align:center;font-size:34px;background:#fff;padding:40px;border-radius:10px}
.final b{font-size:80px;color:#48A044;display:block}
.hub{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
.hub a{background:#fff;border-radius:10px;padding:18px 20px;text-decoration:none;color:#1B1B1B;border-top:6px solid #48A044;box-shadow:0 1px 3px rgba(0,0,0,.1)}
.hub a:hover{box-shadow:0 4px 12px rgba(0,0,0,.18)}
.hub small{color:#777;font-size:15px;display:block;margin-bottom:6px}
.hub span{font-size:22px;font-weight:600}
.help{font-size:15px;color:#666}
"""

SORT_JS = r"""
const D = DATA;
const score = document.getElementById('score'), count = document.getElementById('count');
const pool = document.getElementById('pool'), colsEl = document.getElementById('cols'), why = document.getElementById('why');
let selected = null, checked = false;
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
colsEl.style.gridTemplateColumns = `repeat(${D.cols.length},1fr)`;
D.cols.forEach(c=>{
  const col=document.createElement('div');col.className='col';col.dataset.id=c.id;
  col.innerHTML=`<h2 style="background:${c.color}">${c.name}${c.hint?`<small>${c.hint}</small>`:''}</h2><div class="drop"></div>`;
  col.addEventListener('click',e=>{if(e.target.closest('.card'))return;if(selected){put(selected,col.querySelector('.drop'))}});
  col.addEventListener('dragover',e=>{e.preventDefault();col.classList.add('hot')});
  col.addEventListener('dragleave',()=>col.classList.remove('hot'));
  col.addEventListener('drop',e=>{e.preventDefault();col.classList.remove('hot');const el=document.getElementById(e.dataTransfer.getData('text'));if(el)put(el,col.querySelector('.drop'))});
  colsEl.appendChild(col);
});
pool.addEventListener('dragover',e=>e.preventDefault());
pool.addEventListener('drop',e=>{e.preventDefault();const el=document.getElementById(e.dataTransfer.getData('text'));if(el)put(el,pool)});
pool.addEventListener('click',e=>{if(!e.target.closest('.card')&&selected)put(selected,pool)});
function build(){
  pool.innerHTML='';document.querySelectorAll('.drop').forEach(d=>d.innerHTML='');
  shuffle(D.items.map((it,i)=>({...it,i}))).forEach(it=>{
    const c=document.createElement('div');c.className='card';c.id='c'+it.i;c.textContent=it.t;c.draggable=true;c.dataset.c=it.c;c.dataset.why=it.why||'';
    c.addEventListener('dragstart',e=>e.dataTransfer.setData('text',c.id));
    c.addEventListener('click',()=>{
      if(checked){why.textContent=c.textContent+' — '+c.dataset.why;return}
      if(selected===c){c.classList.remove('sel');selected=null;return}
      if(selected)selected.classList.remove('sel');selected=c;c.classList.add('sel');
    });
    pool.appendChild(c);
  });
  checked=false;selected=null;why.textContent='';score.textContent='';update();
}
function put(card,target){
  if(checked)return;
  card.classList.remove('sel');selected=null;target.appendChild(card);update();
}
function update(){
  const left=pool.children.length;
  count.textContent=`Разложено ${D.items.length-left} из ${D.items.length}`;
}
function check(){
  let ok=0;
  document.querySelectorAll('.card').forEach(c=>{
    const col=c.closest('.col');c.classList.remove('ok','bad','sel');
    if(!col)return;
    if(col.dataset.id===c.dataset.c){c.classList.add('ok');ok++}else c.classList.add('bad');
  });
  checked=true;selected=null;
  score.textContent=`Верно: ${ok} из ${D.items.length}`;
  why.textContent='Нажмите на любую карточку, чтобы увидеть пояснение.';
}
function answers(){
  document.querySelectorAll('.card').forEach(c=>document.querySelector(`.col[data-id="${c.dataset.c}"] .drop`).appendChild(c));
  update();
  check();
}
function again(){
  if(checked){checked=false;document.querySelectorAll('.card').forEach(c=>c.classList.remove('ok','bad'));why.textContent='';score.textContent='';}
  else build();
}
document.getElementById('bCheck').onclick=check;
document.getElementById('bAns').onclick=answers;
document.getElementById('bRe').onclick=()=>{checked=false;build()};
document.getElementById('bFix').onclick=again;
build();
"""

QUIZ_JS = r"""
const D = DATA;
let n=0, ok=0, res=[], timerId=null, left=0, done=false;
const box=document.getElementById('q'), opts=document.getElementById('opts'), why=document.getElementById('why'),
      next=document.getElementById('next'), prog=document.getElementById('prog'), tm=document.getElementById('tm');
function drawProg(){prog.innerHTML=D.questions.map((_,i)=>`<i class="${res[i]||(i===n?'cur':'')}"></i>`).join('')}
function show(){
  done=false;why.textContent='';next.disabled=true;
  const q=D.questions[n];
  box.innerHTML=`<div style="font-size:18px;color:#777">Вопрос ${n+1} из ${D.questions.length}</div>${q.q}${q.img?`<img src="${q.img}" alt="">`:''}`;
  opts.innerHTML='';
  q.opts.forEach((o,i)=>{
    const b=document.createElement('button');b.className='opt';
    b.innerHTML=q.optsHtml?q.optsHtml[i]:o;b.title=o;
    b.onclick=()=>answer(i);opts.appendChild(b);
  });
  drawProg();
  clearInterval(timerId);tm.textContent='';
  if(D.timer){left=D.timer;tm.textContent=left;timerId=setInterval(()=>{left--;tm.textContent=left;if(left<=0){clearInterval(timerId);answer(-1)}},1000)}
}
function answer(i){
  if(done)return;done=true;clearInterval(timerId);
  const q=D.questions[n];
  [...opts.children].forEach((b,k)=>{b.disabled=true;b.style.opacity=1;if(k===q.a)b.classList.add('ok');else if(k===i)b.classList.add('bad')});
  if(i===q.a){ok++;res[n]='ok';why.textContent='Верно! '+q.why}
  else{res[n]='bad';why.textContent=(i<0?'Время вышло. ':'Неверно. ')+'Правильный ответ: '+q.opts[q.a]+'. '+q.why}
  drawProg();next.disabled=false;
  next.textContent=n===D.questions.length-1?'Итог':'Дальше →';
}
next.onclick=()=>{n++;if(n<D.questions.length)show();else finish()};
function finish(){
  clearInterval(timerId);tm.textContent='';
  document.getElementById('play').style.display='none';
  const f=document.getElementById('final');f.style.display='block';
  const p=ok/D.questions.length;
  f.innerHTML=`Правильных ответов<b>${ok} из ${D.questions.length}</b>${p>=.8?'Отличный результат!':p>=.5?'Хорошо, но есть что повторить.':'Есть повод вернуться к материалу.'}<br><br><button onclick="location.reload()">Пройти ещё раз</button>`;
}
show();
"""


def page(title, body, script=""):
    return f"""<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title><style>{CSS}</style></head>
<body>{body}{script}</body></html>
"""


def header(ex):
    return (f'<header><h1>{html.escape(ex["title"])}</h1>'
            f'<span class="slide">к слайду {ex["slide"]}</span><a href="index.html">Все упражнения</a></header>')


def build_sort(ex):
    data = {k: ex[k] for k in ("cols", "items")}
    body = header(ex) + f"""<main>
<div class="task">{html.escape(ex["task"])}</div>
{f'<div class="note">{ex["note"]}</div>' if ex.get("note") else ''}
<div class="pool" id="pool"></div>
<div class="cols" id="cols"></div>
<div class="why" id="why"></div>
<div class="bar"><button id="bCheck">Проверить</button><button class="sec" id="bFix">Исправить ошибки</button><button class="sec" id="bAns">Показать ответы</button><button class="sec" id="bRe">Заново</button>
<span class="score" id="score"></span><span class="help" id="count" style="margin-left:auto"></span></div>
<div class="help">Нажмите на карточку, потом на колонку. Или перетащите карточку мышкой.</div>
</main>"""
    script = f"<script>const DATA={json.dumps(data, ensure_ascii=False)};{SORT_JS}</script>"
    return page(ex["title"], body, script)


def build_quiz(ex):
    data = {"timer": ex.get("timer", 0), "questions": ex["questions"]}
    body = header(ex) + f"""<main>
<div class="task">{html.escape(ex["task"])}</div>
<div id="play" style="display:flex;flex-direction:column;gap:16px">
<div class="bar"><div class="progress" id="prog" style="flex:1"></div><div class="timer" id="tm"></div></div>
<div class="big" id="q"></div>
<div class="opts" id="opts"></div>
<div class="why" id="why"></div>
<div class="bar"><button id="next" disabled>Дальше →</button></div>
</div>
<div class="final" id="final" style="display:none"></div>
</main>"""
    script = f"<script>const DATA={json.dumps(data, ensure_ascii=False)};{QUIZ_JS}</script>"
    return page(ex["title"], body, script)


def build_hub():
    cards = "".join(
        f'<a href="{e["file"]}"><small>Слайд {e["slide"]}</small><span>{html.escape(e["title"])}</span></a>'
        for e in EXERCISES)
    body = ('<header><h1>Упражнения к тренингу по ИСМ</h1></header>'
            f'<main><div class="hub">{cards}</div></main>')
    return page("Упражнения ИСМ", body)


def main():
    OUT.mkdir(exist_ok=True)
    for ex in EXERCISES:
        text = build_sort(ex) if ex["type"] == "sort" else build_quiz(ex)
        (OUT / ex["file"]).write_text(text, encoding="utf-8")
    (OUT / "index.html").write_text(build_hub(), encoding="utf-8")
    print(f"Готово: {len(EXERCISES)} упражнений + меню в {OUT}")


if __name__ == "__main__":
    main()
