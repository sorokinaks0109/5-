#!/usr/bin/env python3
"""Собирает PDF-инструкцию к Skate Rush.  Запуск: python3 docs/make_guide.py"""
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUT = Path(__file__).resolve().parent.parent / "Инструкция_Skate_Rush.pdf"

FONT_DIR = "/usr/share/fonts/truetype/dejavu/"
pdfmetrics.registerFont(TTFont("Sans", FONT_DIR + "DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("Sans-Bold", FONT_DIR + "DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Mono", FONT_DIR + "DejaVuSansMono.ttf"))
pdfmetrics.registerFontFamily("Sans", normal="Sans", bold="Sans-Bold", italic="Sans", boldItalic="Sans-Bold")

ORANGE = colors.HexColor("#FF8A00")
PINK = colors.HexColor("#E8338F")
DARK = colors.HexColor("#1D1B33")
GREY = colors.HexColor("#5B5A70")
LIGHT = colors.HexColor("#F4F2FA")
TIP_BG = colors.HexColor("#FFF4E0")
WARN_BG = colors.HexColor("#FDE8F1")
CODE_BG = colors.HexColor("#ECEBF3")

st = {
    "title": ParagraphStyle("title", fontName="Sans-Bold", fontSize=30, leading=36, textColor=DARK, alignment=TA_CENTER),
    "subtitle": ParagraphStyle("subtitle", fontName="Sans", fontSize=13, leading=18, textColor=GREY, alignment=TA_CENTER),
    "h1": ParagraphStyle("h1", fontName="Sans-Bold", fontSize=18, leading=23, textColor=PINK, spaceBefore=6, spaceAfter=8, keepWithNext=1),
    "h2": ParagraphStyle("h2", fontName="Sans-Bold", fontSize=13, leading=17, textColor=DARK, spaceBefore=8, spaceAfter=4, keepWithNext=1),
    "body": ParagraphStyle("body", fontName="Sans", fontSize=10.5, leading=15, textColor=DARK, spaceAfter=5),
    "step": ParagraphStyle("step", fontName="Sans", fontSize=10.5, leading=15, textColor=DARK, leftIndent=0),
    "cell": ParagraphStyle("cell", fontName="Sans", fontSize=9.5, leading=13, textColor=DARK),
    "cellb": ParagraphStyle("cellb", fontName="Sans-Bold", fontSize=9.5, leading=13, textColor=colors.white),
    "code": ParagraphStyle("code", fontName="Mono", fontSize=9, leading=13, textColor=DARK),
    "toc": ParagraphStyle("toc", fontName="Sans", fontSize=11, leading=19, textColor=DARK),
}

story = []
W = A4[0] - 36 * mm


def h1(t):
    story.append(Paragraph(t, st["h1"]))


def h2(t):
    story.append(Paragraph(t, st["h2"]))


def p(t):
    story.append(Paragraph(t, st["body"]))


def steps(items):
    rows = []
    for i, t in enumerate(items, 1):
        num = Paragraph(f'<font color="white"><b>{i}</b></font>', ParagraphStyle("n", fontName="Sans-Bold", fontSize=11, alignment=TA_CENTER, leading=14))
        rows.append([num, Paragraph(t, st["step"])])
    tbl = Table(rows, colWidths=[9 * mm, W - 9 * mm])
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (1, 0), (1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    for i in range(len(rows)):
        style.append(("BACKGROUND", (0, i), (0, i), ORANGE))
    tbl.setStyle(TableStyle(style))
    story.append(tbl)
    story.append(Spacer(1, 6))


def box(text, bg=TIP_BG, border=ORANGE, title=None):
    content = []
    if title:
        content.append(Paragraph(f"<b>{title}</b>", st["body"]))
    content.append(Paragraph(text, st["body"]))
    tbl = Table([[content]], colWidths=[W])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LINEBEFORE", (0, 0), (0, -1), 4, border),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 8))


def code(text):
    lines = text.strip("\n").split("\n")
    paras = [Paragraph(l.replace(" ", "&nbsp;").replace("<", "&lt;") or "&nbsp;", st["code"]) for l in lines]
    tbl = Table([[paras]], colWidths=[W])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CODE_BG),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 8))


def table(header, rows, widths, color=DARK):
    data = [[Paragraph(h, st["cellb"]) for h in header]]
    for r in rows:
        data.append([Paragraph(c, st["cell"]) for c in r])
    tbl = Table(data, colWidths=[w * W for w in widths], repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), color),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D6D4E3")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), LIGHT))
    tbl.setStyle(TableStyle(style))
    story.append(tbl)
    story.append(Spacer(1, 10))


# ======================= ОБЛОЖКА =======================
story.append(Spacer(1, 50 * mm))
story.append(Paragraph("SKATE RUSH", st["title"]))
story.append(Spacer(1, 6))
story.append(Paragraph("скейт-симулятор для Roblox", st["subtitle"]))
story.append(Spacer(1, 4))
story.append(Paragraph("Инструкция: как запустить, настроить, заработать и раскрутить", st["subtitle"]))
story.append(Spacer(1, 30 * mm))
toc = [
    "1. Как открыть игру",
    "2. Если что-то не работает",
    "3. Управление и правила",
    "4. Сохранение прогресса",
    "5. Донат: как продавать за робуксы",
    "6. Как менять игру под себя",
    "7. Как открыть игру для всех",
    "8. Как сделать игру популярной",
    "9. Чек-лист перед запуском",
]
toc_tbl = Table([[Paragraph(t, st["toc"])] for t in toc], colWidths=[100 * mm])
toc_tbl.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), LIGHT), ("LEFTPADDING", (0, 0), (-1, -1), 14), ("LINEBEFORE", (0, 0), (0, -1), 4, PINK)]))
toc_tbl.hAlign = "CENTER"
story.append(toc_tbl)
story.append(PageBreak())

# ======================= 1 =======================
h1("1. Как открыть игру")
steps([
    "Открой <b>Roblox Studio</b> и войди в свой аккаунт.",
    "Нажми <b>File → Open from File</b> и выбери скачанный файл <b>SkateRush.rbxlx</b>.",
    "Нажми большую кнопку <b>Play</b> вверху (или клавишу <b>F5</b>). Ты появишься на старте с доской под ногами.",
    "Чтобы остановить игру, нажми <b>Stop</b> (или <b>Shift+F5</b>).",
])
box("До нажатия Play мир в Studio пустой. Это нормально: карту строит скрипт при запуске. "
    "Чтобы карта появилась в Studio и её можно было достраивать руками, смотри раздел 6, "
    "«Как увидеть карту и достраивать её».", title="Не пугайся пустого мира")
box("Сразу сохрани игру к себе: <b>File → Save to File As</b>. А лучше опубликуй её в Roblox "
    "(<b>File → Publish to Roblox</b>), тогда она будет храниться в твоём аккаунте.", title="Совет")

h2("Где что лежит (окно Explorer)")
table(
    ["Где", "Что это"],
    [
        ["ReplicatedStorage → SkateShared → <b>Config</b>", "<b>Все настройки игры.</b> Цены, зоны, доски, трюки, награды. Меняешь в основном здесь."],
        ["ServerScriptService → <b>SkateServer</b>", "Сервер: монеты, уровни, покупки, трюк-битвы"],
        ["SkateServer → <b>World</b>", "Строит карту: трамплины, перила, звёзды, декор"],
        ["SkateServer → <b>Data</b>", "Сохранение прогресса игроков"],
        ["StarterPlayer → StarterPlayerScripts → <b>SkateClient</b>", "Управление скейтом, трюки, падения"],
        ["SkateClient → <b>UI</b>", "Весь интерфейс: кнопки, меню, надписи"],
    ],
    [0.42, 0.58],
)
box("Если окна Explorer не видно: вкладка <b>View → Explorer</b>. Окно свойств: <b>View → Properties</b>.", title="Не видно Explorer?")

# ======================= 2 =======================
h1("2. Если что-то не работает")
p("Эту игру собирали без запуска в Studio, поэтому в первый раз может вылезти ошибка. Это обычное дело в разработке, чинится быстро.")
steps([
    "Открой <b>View → Output</b>. Это окно, куда игра пишет сообщения.",
    "Нажми Play и поиграй минуту.",
    "Если в Output есть <font color='#D0021B'><b>красные строки</b></font>, это ошибки. Выдели их и скопируй (Ctrl+C).",
    "Отправь их нейросети с текстом: «Это ошибка в моей игре Skate Rush в Roblox Studio, вот текст. Как исправить?»",
])
box("Строки, которые начинаются с <b>[SkateRush]</b>, — это подсказки от самой игры. "
    "Например, «DataStore недоступен» значит, что не включено сохранение (смотри раздел 4). Это не поломка.",
    title="Жёлтые строки")
table(
    ["Что видишь", "Что делать"],
    [
        ["Надпись «Studio: сохранение выключено»", "Включи сохранение (раздел 4). Играть можно и без него."],
        ["Нет доски под ногами", "Подожди 2–3 секунды после старта. Если не появилась, смотри Output."],
        ["Не открываются ворота в зону", "Ворота открываются только после покупки зоны в меню «Зоны»."],
        ["Покупка в Studio «не настоящая»", "Так и задумано: пока номера товаров 0, покупки в Studio бесплатные для проверки."],
    ],
    [0.42, 0.58],
)

# ======================= 3 =======================
story.append(PageBreak())
h1("3. Управление и правила")
table(
    ["Действие", "Компьютер", "Телефон"],
    [
        ["Ехать", "W A S D", "джойстик слева"],
        ["Прыжок", "Пробел", "кнопка прыжка"],
        ["Кикфлип", "<b>E</b>", "ФЛИП"],
        ["Спин 360", "<b>Q</b>", "СПИН"],
        ["Грэб", "<b>R</b>", "ГРЭБ"],
        ["Бэкфлип", "<b>F</b>", "БЭК"],
    ],
    [0.34, 0.33, 0.33],
    color=ORANGE,
)
h2("Как устроена игра")
for t in [
    "<b>Трамплины</b> со светящейся стрелкой подбрасывают вверх. В воздухе делаешь трюки.",
    "<b>Не докрутил трюк до приземления — падаешь</b> и теряешь комбо. Бэкфлип самый долгий, его можно делать только с трамплина.",
    "<b>Комбо.</b> Трюки подряд растят множитель: x1.5, x2, x2.5 и так до x12. Разные трюки дают больше, повтор того же трюка — вдвое меньше.",
    "Комбо <b>засчитывается</b>, когда проедешь по земле чуть больше секунды. Жёлтая полоска показывает, сколько осталось.",
    "<b>Перила</b> — это грайнд. Пока едешь по ним, комбо не заканчивается и копятся очки.",
    "<b>Мега-трамплин</b> в середине каждой зоны: самый долгий полёт, можно успеть 3–4 трюка.",
    "<b>Звёзды</b> дают монеты и появляются снова через 45 секунд.",
    "<b>Трюк-битва</b> раз в 4 минуты: 75 секунд все на сервере соревнуются, первые три места получают монеты.",
]:
    p("•&nbsp;&nbsp;" + t)

h2("Лобби и зоны")
p("Игра начинается в <b>лобби</b>: там витрина досок (подойди к подставке и нажми <b>E</b>, чтобы купить или надеть) "
  "и арка <b>СТАРТ</b>. За аркой начинаются зоны.")
table(
    ["Зона", "Уровень", "Цена", "Монеты", "Особенность"],
    [
        ["1. Сакура-парк", "1", "0", "x1", "цветущие деревья, водопады"],
        ["2. Конфетная страна", "4", "600", "x2", "арки-пончики, леденцы"],
        ["3. Солнечный пляж", "9", "5 000", "x3.5", "море, пальмы, зонтики"],
        ["4. Неоновый город", "15", "30 000", "x6", "ночь, неоновые арки"],
        ["5. Ледяной каньон", "23", "200 000", "x10", "кристаллы, снеговики"],
        ["6. Вулкан", "32", "1.5M", "x16", "лава: наступил — упал"],
        ["7. Космос", "45", "12M", "x28", "низкая гравитация, планеты"],
    ],
    [0.27, 0.12, 0.15, 0.12, 0.34],
)
p("<b>Голубые ускорители</b> со стрелками на трассе разгоняют на пару секунд.")
h2("Меню слева на экране")
table(
    ["Кнопка", "Что делает"],
    [
        ["Доски", "7 досок: каждая быстрее и прыгучее. Золотая — за робуксы."],
        ["Скорость", "Прокачка скорости, 50 ступеней. Кнопка МАКС тратит все монеты."],
        ["Зоны", "Открыть новую зону или переместиться в уже открытую."],
        ["Магазин", "Покупки за робуксы."],
        ["Награда", "Ежедневный подарок, 7 дней подряд. Красная точка — подарок ждёт."],
        ["Подарки", "Подарки за время в игре: 1, 3, 6, 10... 60 минут. Красная точка — можно забрать."],
        ["Следы", "Цветной след за доской. Радужный — только в стартовом наборе."],
        ["Коды", "Ввод кодов: SKATE, KICKFLIP, RUSH2026."],
        ["Перерожд.", "Сбросить монеты и скорость ради +50% монет навсегда."],
        ["Настройки", "Музыка, звуки и ограничение скорости, если слишком быстро."],
    ],
    [0.22, 0.78],
)

# ======================= 4 =======================
story.append(PageBreak())
h1("4. Сохранение прогресса")
p("Игра сама сохраняет монеты, уровень, доски и зоны каждого игрока. Чтобы сохранение работало в Studio:")
steps([
    "<b>File → Publish to Roblox</b>. Придумай название, например «Skate Rush». Пока можно оставить игру приватной.",
    "Вкладка <b>Home → Game Settings → Security</b>.",
    "Включи <b>Enable Studio Access to API Services</b> и нажми <b>Save</b>.",
    "Нажми Play. Надписи «сохранение выключено» больше не будет.",
])
box("В опубликованной игре сохранение работает всегда, настраивать ничего не нужно.", title="Хорошая новость")

# ======================= 5 =======================
h1("5. Донат: как продавать за робуксы")
p("В игре уже есть магазин. Пока номера товаров равны 0, <b>в Studio все покупки срабатывают бесплатно</b>, "
  "чтобы ты могла всё проверить. В опубликованной игре такие товары просто не продаются.")
h2("Что продаём")
table(
    ["Товар", "Тип", "Цена", "Название в Config"],
    [
        ["x2 монеты навсегда", "Геймпасс", "199 R$", "Coins2x"],
        ["x3 монеты навсегда", "Геймпасс", "449 R$", "Coins3x"],
        ["Золотая доска (+25% монет)", "Геймпасс", "299 R$", "GoldBoard"],
        ["Спасти комбо после падения", "Товар", "5 R$", "SaveCombo"],
        ["Открыть следующую зону", "Товар", "25 R$", "SkipZone"],
        ["Буст x2 на 15 минут", "Товар", "15 R$", "Boost2x"],
        ["Мешок монет", "Товар", "19 R$", "CoinsSmall"],
        ["Сундук монет", "Товар", "79 R$", "CoinsBig"],
        ["+1 уровень", "Товар", "19 R$", "LevelUp"],
        ["Стартовый набор (для новичков, 20 минут)", "Товар", "5 R$", "StarterPack"],
    ],
    [0.36, 0.17, 0.15, 0.32],
    color=PINK,
)
box("<b>Геймпасс</b> покупается один раз и остаётся навсегда. Поэтому он должен стоить дорого: "
    "за 10 R$ ты бы почти ничего не заработала. <b>Товар</b> (Developer Product) можно покупать сколько угодно раз, "
    "поэтому он дешёвый.", title="Почему такие цены")

h2("Шаг 1. Создай геймпассы")
steps([
    "Опубликуй игру (раздел 4).",
    "Зайди на сайт <b>create.roblox.com</b> → <b>Creations</b> → выбери свою игру.",
    "Слева <b>Monetization → Passes</b> → <b>Create a Pass</b>.",
    "Загрузи картинку (можно любую яркую), напиши название, например «x2 Монеты», нажми <b>Create Pass</b>.",
    "Открой созданный пасс → <b>Sales</b> → включи <b>Item for Sale</b> → поставь цену → <b>Save</b>.",
    "Скопируй <b>номер (ID)</b> пасса: он есть в адресе страницы или в меню из трёх точек → <b>Copy Asset ID</b>.",
    "Повтори для x3 и Золотой доски.",
])
h2("Шаг 2. Создай товары")
steps([
    "Там же слева: <b>Monetization → Developer Products</b> → <b>Create a Developer Product</b>.",
    "Название, картинка, цена → <b>Create</b>.",
    "Скопируй <b>ID</b> товара.",
    "Повтори для всех 7 товаров.",
])
h2("Шаг 3. Впиши номера в игру")
p("Открой в Studio <b>ReplicatedStorage → SkateShared → Config</b> (двойной щелчок). Найди строки с <b>id = 0</b> "
  "и вместо нуля вставь свой номер. Было:")
code('Coins2x = { id = 0, price = 199, name = "x2 Монеты навсегда", ... },')
p("Стало (номер для примера):")
code('Coins2x = { id = 1234567890, price = 199, name = "x2 Монеты навсегда", ... },')
box("Поле <b>price</b> — только надпись на кнопке. Настоящую цену берёт Roblox с сайта, так что цены должны совпадать. "
    "После изменений сохрани игру и снова нажми <b>Publish to Roblox</b>.", bg=WARN_BG, border=PINK, title="Важно")
box("Из каждой покупки Roblox забирает 30%, тебе остаётся 70%. "
    "Вывести робуксы в настоящие деньги можно через программу DevEx: нужно быть старше 13 лет "
    "и заработать минимум 30 000 робуксов. Это примерно 110 долларов.", title="Сколько ты получишь")

# ======================= 6 =======================
story.append(PageBreak())
h1("6. Как менять игру под себя")
p("Почти всё меняется в файле <b>Config</b>. Поменяла цифру — нажала Play — проверила. Код трогать не нужно.")
table(
    ["Что хочешь поменять", "Что искать в Config"],
    [
        ["Цены и уровни зон", "<b>Config.Zones</b> → level, cost, mult"],
        ["Цвета и свет в зоне", "<b>Config.Zones</b> → floor, accent, light"],
        ["Гравитацию в зоне", "<b>gravity</b> (обычная 196.2, в космосе 70)"],
        ["Доски: цена, скорость, цвет", "<b>Config.Boards</b> → price, speed, jump, deck, trail"],
        ["Очки за трюки", "<b>Config.Tricks</b> → points"],
        ["Сложность трюков", "<b>Config.Tricks</b> → duration (больше = дольше крутится = легче упасть)"],
        ["Цену прокачки скорости", "<b>Config.Speed</b> → CostBase, CostGrowth"],
        ["Награды за дни", "<b>Config.Daily</b>"],
        ["Коды", "<b>Config.Codes</b> — добавь строку, например NEWYEAR = 3000,"],
        ["Как часто трюк-битва", "<b>Config.Event</b> → Interval (секунды)"],
        ["Сколько дают звёзды", "<b>Config.Star</b> → Value"],
        ["Звуки и музыку", "<b>Config.Sounds</b> — вставь номер звука из Toolbox"],
        ["Следы", "<b>Config.Trails</b> → name, price, colors"],
        ["Подарки за время", "<b>Config.Gifts</b> → minutes, coins"],
    ],
    [0.38, 0.62],
)
h2("Как добавить звуки и музыку")
steps([
    "В Studio открой <b>Toolbox</b> → вкладка <b>Audio</b> (или <b>Sounds</b>).",
    "Найди звук, например «skateboard», «coin», «whoosh», или музыку.",
    "Правой кнопкой по звуку → <b>Copy Asset ID</b>.",
    "В <b>Config.Sounds</b> вставь его так: <b>Roll = \"rbxassetid://НОМЕР\",</b>",
    "Музыку для зон вставляй в <b>Music</b> по порядку: первая — Сакура-парк, вторая — Конфетная страна и так далее.",
])
box("Звуки, которые стоят сейчас, встроены в Roblox и могут звучать простовато. "
    "Если какой-то не играет, в Output будет жёлтая строка — просто замени его на звук из Toolbox.", title="Про звуки")
h2("Как добавить новый код")
code("""Config.Codes = {
    SKATE = 500,
    KICKFLIP = 1000,
    RUSH2026 = 2500,
    NEWYEAR = 3000,   -- новый код
}""")
p("Код вводят большими или маленькими буквами — неважно. Каждый игрок может ввести код только один раз.")

h2("Как увидеть карту и достраивать её")
steps([
    "Останови игру (красная кнопка <b>Stop</b>). Строить можно только когда игра не запущена.",
    "Внизу экрана есть строка <b>Command Bar</b> (если её нет: <b>View → Command Bar</b>).",
    "Вставь в неё эту команду и нажми <b>Enter</b>:",
])
code('require(game.ServerScriptService.SkateServer.World).build()')
steps([
    "Появится вся карта: в окне Explorer это папка <b>Workspace → SkateWorld</b>.",
    "Теперь её можно менять как угодно: двигать трамплины (инструмент <b>Move</b>), удалять, красить, добавлять детали (<b>Part</b>).",
    "Сохрани игру (<b>Ctrl+S</b>). При запуске скрипт увидит готовую карту и не будет строить её заново.",
])
box("Если захочешь вернуть карту как было: удали папку <b>Workspace → SkateWorld</b> и снова выполни команду.",
    title="Сломала карту?")
h2("Как сделать деталь частью игры")
p("Новые детали из Studio — это просто кубики. Чтобы деталь стала трамплином, перилами или звездой, "
  "выдели её и в окне <b>Properties</b> добавь тег и атрибут:")
table(
    ["Хочешь", "Что сделать с деталью (окно Properties)"],
    [
        ["Трамплин, который подбрасывает", "Добавь тег <b>Kicker</b> (Properties → Tags) и атрибут <b>Power</b> = 80 (число). Наклони деталь как рампу."],
        ["Перила для грайнда", "Добавь тег <b>Rail</b> и атрибут <b>Rail</b> = true (галочка)."],
        ["Лаву", "Добавь тег <b>Lava</b>."],
        ["Звезду с монетами", "Добавь тег <b>Pickup</b> и атрибут <b>Value</b> = 25. Сними галочку CanCollide."],
    ],
    [0.3, 0.7],
)

# ======================= 7 =======================
h1("7. Как открыть игру для всех")
steps([
    "Сначала поиграй сама и дай поиграть друзьям (их можно пригласить в приватную игру: на сайте create.roblox.com → игра → <b>Collaborators</b> или через настройки доступа).",
    "Сделай <b>иконку</b> (квадратная картинка 512×512) и <b>обложку</b> (1920×1080). Загружаются на create.roblox.com → игра → <b>Places → Thumbnails / Icon</b>.",
    "Напиши <b>описание</b>: что это за игра, как играть, коды. Коротко и с эмодзи.",
    "Заполни <b>анкету о содержании</b> (Maturity / Content questionnaire). Без неё игру нельзя открыть.",
    "В Studio: <b>Game Settings → Permissions → Public</b>, или на сайте: игра → <b>Make Public</b>.",
])
box("Иконку и обложку игроки видят раньше всего. Яркий персонаж на скейте в прыжке, крупно и почти без текста. "
    "Можно нарисовать самой или сделать скриншот из игры с красивого ракурса.", title="Совет по иконке")

# ======================= 8 =======================
h1("8. Как сделать игру популярной")
for title, text in [
    ("Тест на друзьях", "Дай поиграть 3–5 друзьям и молча смотри: где им скучно, где непонятно, где они бросают. Исправь это первым делом. Это важнее любых новых функций."),
    ("Английский язык", "Сейчас вся игра на русском. Большинство игроков Roblox не говорят по-русски, поэтому перевод на английский даст в разы больше игроков. Тексты лежат в Config и UI, их можно перевести с помощью нейросети."),
    ("Звуки и музыка", "Стук колёс, звук приземления, музыка в каждой зоне. Бесплатные звуки есть в Studio: <b>Toolbox → Audio</b>."),
    ("Видео в TikTok и YouTube Shorts", "Мега-трамплин и длинные комбо хорошо смотрятся на видео. В конце давай код на монеты: так приходят новые игроки."),
    ("Обновления", "Раз в 1–2 недели что-то новое: зона, доска, трюк, праздничный код. Roblox лучше продвигает игры, которые обновляются и куда игроки возвращаются."),
    ("Реклама внутри Roblox", "Когда игра готова, можно запустить рекламу на create.roblox.com → <b>Ads</b>. Начинай с маленького бюджета и смотри, сколько игроков остаётся."),
]:
    story.append(KeepTogether([Paragraph(title, st["h2"]), Paragraph(text, st["body"])]))
h2("Идеи для следующих версий")
p("Питомцы, которые бегают за скейтером • гонки на время • свой скейт-парк • мировая таблица лучших игроков • "
  "новые трюки (мануал, импоссибл) • анимации персонажа • сезонные события (Новый год, Хэллоуин).")

# ======================= 9 =======================
h1("9. Чек-лист перед запуском")
check = [
    "Игра запускается, в Output нет красных ошибок",
    "Сохранение работает: вышла, зашла — монеты на месте",
    "Все 10 товаров созданы на сайте, их номера вписаны в Config",
    "Цены в Config совпадают с ценами на сайте",
    "Проверила игру на телефоне (кнопки трюков видны и нажимаются)",
    "3–5 друзей поиграли, самые частые жалобы исправлены",
    "Есть иконка, обложка и описание",
    "Заполнена анкета о содержании",
    "Игра переключена в Public",
    "Сняла первое видео с кодом на монеты",
]
rows = [[Paragraph("☐", ParagraphStyle("cb", fontName="Sans", fontSize=14, leading=16)), Paragraph(t, st["step"])] for t in check]
ct = Table(rows, colWidths=[9 * mm, W - 9 * mm])
ct.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.HexColor("#D6D4E3")), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
story.append(ct)
story.append(Spacer(1, 14))
box("Самая частая ошибка начинающих разработчиков — полгода делать «идеальную» игру и так её и не выпустить. "
    "Выпусти как можно раньше, а потом улучшай по отзывам игроков.", bg=WARN_BG, border=PINK, title="Главное")


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Sans", 8.5)
    canvas.setFillColor(GREY)
    if doc.page > 1:
        canvas.drawString(18 * mm, 10 * mm, "Skate Rush — инструкция")
        canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, str(doc.page))
    canvas.setFillColor(ORANGE)
    canvas.rect(0, A4[1] - 5 * mm, A4[0] / 2, 5 * mm, fill=1, stroke=0)
    canvas.setFillColor(PINK)
    canvas.rect(A4[0] / 2, A4[1] - 5 * mm, A4[0] / 2, 5 * mm, fill=1, stroke=0)
    canvas.restoreState()


doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=18 * mm,
                        title="Skate Rush — инструкция", author="Skate Rush")
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print("Готово:", OUT)
