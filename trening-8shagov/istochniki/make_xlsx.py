# -*- coding: utf-8 -*-
"""Свод чек-листа «Бережливое производство» до/после тренинга по выгрузке Oprosso.
Только обычные формулы (без макросов и динамических массивов): работает в Excel и Р7-Офис.
Запуск: python3 make_xlsx.py [путь] [--demo]"""
import sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.formatting.rule import ColorScaleRule
from openpyxl.chart import BarChart, Reference
from openpyxl.worksheet.datavalidation import DataValidation

OUT = next((a for a in sys.argv[1:] if not a.startswith('--')), 'Свод_чек-листа_до_после.xlsx')
DEMO = '--demo' in sys.argv
BLUE, LBLUE, NAVY, SOFT = '00478D', '0094DF', '042746', 'EEF4FA'
H = Font(bold=True, color='FFFFFF'); HF = PatternFill('solid', fgColor=BLUE)
IN = PatternFill('solid', fgColor='FFF8D6'); CALC = PatternFill('solid', fgColor=SOFT)
thin = Side(style='thin', color='D5DEE9'); BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
WR = Alignment(wrap_text=True, vertical='top')

Q = [  # раздел, вопрос, [(вариант, балл)] в порядке чек-листа
 ('СОП', 'Что такое СОП (стандартная операционная процедура)?', [
   ('Пошаговое описание лучшего способа выполнить операцию, составленное вместе с исполнителями: «Напиши, как делаешь, делай, как написал»', 5),
   ('Не знаю', 0), ('Документ или инструкция о порядке работы', 3)]),
 ('СОП', 'Как часто вы используете СОП в работе?', [
   ('Постоянно / часто — СОП покрывают большинство ключевых действий', 5), ('Никогда, в моей работе нет СОП', 0),
   ('Иногда / редко — для отдельных задач', 3)]),
 ('СОП', 'Какие разделы должны быть в любой СОП?', [
   ('Цель, область применения и ответственные', 3),
   ('Цель, область применения, ответственные, ресурсы, пошаговое описание, контроль результата', 5),
   ('Техника безопасности и требования к оборудованию', 0)]),
 ('СОП', 'Насколько СОП применимы в вашей работе и доступны в нужный момент?', [
   ('Применимы и легко доступны: точно описывают процесс, всегда под рукой', 5),
   ('Не применимы и недоступны: устарели, не соответствуют процессу, не знаю, где искать', 0),
   ('Частично применимы, найти сложно — использую как ориентир', 3)]),
 ('Потери', 'Как вы охарактеризуете действия, которые не добавляют ценности в вашей работе?', [
   ('Знаю, что это потери, виды потерь знаю частично', 3), ('Так принято, делаю, как сказали (о потерях не знаю)', 0),
   ('Знаю все 8 видов потерь и могу привести примеры из своей работы', 5)]),
 ('Потери', 'Какими инструментами вы выявляете потери в своих процессах?', [
   ('Личный опыт и наблюдение', 3),
   ('Наблюдение, обсуждение с коллегами, КПСЦ, диаграмма «спагетти», чек-листы, фотография рабочего дня и др.', 5),
   ('Не использую / не знаю', 0)]),
 ('5С и ВУ', 'Что вам известно о системе 5С?', [
   ('Не знаю / это когда всё подписывают и раскладывают по цветным квадратикам', 0),
   ('Это инструмент выявления проблем: когда всё на своих местах, сразу видны отклонения', 5),
   ('Это порядок и чистота на рабочем месте', 3)]),
 ('5С и ВУ', 'В чём главная цель внедрения 5С?', [
   ('Чтобы было удобнее работать и меньше искать инструмент', 3),
   ('Снизить потери (поиск, лишние движения, аварии) — основа для улучшений', 5),
   ('Чтобы было чисто к проверке, а для нас — лишняя работа', 0)]),
 ('5С и ВУ', 'Есть ли у вас стенд визуального управления (физический или электронный) и когда его обновляли?', [
   ('Стенда нет', 0), ('Две недели назад и более', 3), ('Не более трёх дней назад', 5)]),
]
NQ, ROWS, PEOPLE = len(Q), 300, 150
COLQ = [chr(ord('C') + i) for i in range(NQ)]          # C..K ответы
COLS = [chr(ord('L') + i) for i in range(NQ)]          # L..T баллы
wb = Workbook()

# ---------- Инструкция
ws = wb.active; ws.title = 'Инструкция'
ws.column_dimensions['A'].width = 120
lines = [
 ('Свод чек-листа «Бережливое производство»: до и после тренинга', Font(bold=True, size=14, color=BLUE)),
 ('', None),
 ('1. В Oprosso создайте анкету: поле «ФИО» (текст), вопрос «Этап» с вариантами «До тренинга» и «После тренинга», затем 9 вопросов с листа «Ключ».', None),
 ('   Тексты вопросов и вариантов копируйте с листа «Ключ» без изменений: по ним считаются баллы.', None),
 ('2. Ссылку на анкету вставьте в файл nastroiki.js рядом с презентацией: QR-код на слайдах построится сам.', None),
 ('3. После тренинга выгрузите ответы из Oprosso в Excel.', None),
 ('4. На листе «Ответы» вставьте в жёлтые столбцы через «Специальная вставка → Только значения»: A — ФИО, B — этап, C–K — ответы на вопросы 1–9.', None),
 ('5. Баллы, процент по каждому ответу и свод по сотрудникам посчитаются сами. Смотрите листы «Свод» и «По вопросам».', None),
 ('', None),
 ('Баллы: каждый вопрос 0, 3 или 5. Итог = сумма баллов / максимум по отвеченным вопросам.', None),
 ('Если в столбце баллов стоит «?», текст ответа не совпал с ключом: проверьте лишние пробелы или исправьте текст на листе «Ключ».', None),
 ('ФИО до и после должно быть написано одинаково: по нему сравниваются результаты.', None),
 ('Можно вместо текста ответа вписать сразу балл 0, 3 или 5.', None),
]
for i, (t, f) in enumerate(lines, 1):
    c = ws.cell(i, 1, t); c.alignment = Alignment(wrap_text=True)
    if f: c.font = f

# ---------- Ключ
k = wb.create_sheet('Ключ')
for j, (h, w) in enumerate([('№ вопроса', 11), ('Раздел', 12), ('Вопрос', 50), ('Вариант ответа', 80), ('Балл', 8)], 1):
    c = k.cell(1, j, h); c.font = H; c.fill = HF; k.column_dimensions[chr(64 + j)].width = w
r = 2
for i, (sec, q, opts) in enumerate(Q, 1):
    for t, b in opts:
        for j, v in enumerate([i, sec, q, t, b], 1):
            c = k.cell(r, j, v); c.alignment = WR; c.border = BOX
        r += 1
KEYN = r - 1

# ---------- Ответы
a = wb.create_sheet('Ответы')
heads = ['ФИО', 'Этап'] + [f'В{i}' for i in range(1, NQ + 1)] + [f'Балл В{i}' for i in range(1, NQ + 1)] + ['Итог, %', 'служ.']
for j, h in enumerate(heads, 1):
    c = a.cell(1, j, h); c.font = H; c.fill = HF if j <= 2 + NQ else PatternFill('solid', fgColor=LBLUE); c.alignment = Alignment(wrap_text=True)
a.column_dimensions['A'].width = 30; a.column_dimensions['B'].width = 16
for col in COLQ: a.column_dimensions[col].width = 22
for col in COLS: a.column_dimensions[col].width = 8
a.column_dimensions['U'].width = 9; a.column_dimensions['V'].width = 6
a.freeze_panes = 'C2'
dv = DataValidation(type='list', formula1='"До тренинга,После тренинга"', allow_blank=True); a.add_data_validation(dv); dv.add(f'B2:B{ROWS + 1}')
for r in range(2, ROWS + 2):
    for j in range(1, 3 + NQ): a.cell(r, j).fill = IN
    for i in range(NQ):
        x = f'{COLQ[i]}{r}'
        f = (f'=IF({x}="","",IF(ISNUMBER({x}),{x},IF(COUNTIFS(Ключ!$A$2:$A${KEYN},{i + 1},Ключ!$D$2:$D${KEYN},TRIM({x}))=0,"?",'
             f'SUMIFS(Ключ!$E$2:$E${KEYN},Ключ!$A$2:$A${KEYN},{i + 1},Ключ!$D$2:$D${KEYN},TRIM({x})))))')
        c = a.cell(r, 12 + i, f); c.fill = CALC; c.alignment = Alignment(horizontal='center')
    c = a.cell(r, 21, f'=IF(COUNT(L{r}:T{r})=0,"",SUM(L{r}:T{r})/(COUNT(L{r}:T{r})*5))'); c.number_format = '0%'; c.fill = CALC
    a.cell(r, 22, f'=IF(A{r}="","",IF(COUNTIF($A$2:A{r},A{r})=1,MAX($V$1:V{r - 1})+1,""))').font = Font(color='999999')

# ---------- Свод по сотрудникам
s = wb.create_sheet('Свод', 1)
s['A1'] = 'Свод по сотрудникам: чек-лист до и после тренинга'; s['A1'].font = Font(bold=True, size=14, color=BLUE)
s['A2'] = 'Заполняется сам по листу «Ответы». Итог: доля от максимума баллов.'; s['A2'].font = Font(italic=True, color='7E7E7F')
for j, (h, w) in enumerate([('№', 5), ('ФИО', 34), ('До тренинга', 14), ('После тренинга', 15), ('Прирост, п.п.', 14)], 1):
    c = s.cell(3, j, h); c.font = H; c.fill = HF; s.column_dimensions[chr(64 + j)].width = w
for i in range(PEOPLE):
    r = 4 + i
    s.cell(r, 1, f'=IF(B{r}="","",{i + 1})')
    s.cell(r, 2, f'=IFERROR(INDEX(Ответы!$A$2:$A${ROWS + 1},MATCH({i + 1},Ответы!$V$2:$V${ROWS + 1},0)),"")')
    for j, st in [(3, 'До тренинга'), (4, 'После тренинга')]:
        c = s.cell(r, j, f'=IF(B{r}="","",IFERROR(AVERAGEIFS(Ответы!$U$2:$U${ROWS + 1},Ответы!$A$2:$A${ROWS + 1},B{r},Ответы!$B$2:$B${ROWS + 1},"{st}"),"—"))')
        c.number_format = '0%'; c.alignment = Alignment(horizontal='center')
    c = s.cell(r, 5, f'=IF(AND(ISNUMBER(C{r}),ISNUMBER(D{r})),ROUND((D{r}-C{r})*100,0),"")'); c.alignment = Alignment(horizontal='center')
s.conditional_formatting.add(f'C4:D{3 + PEOPLE}', ColorScaleRule(start_type='num', start_value=0, start_color='F8D7D3', mid_type='num', mid_value=0.6, mid_color='FFF4C2', end_type='num', end_value=1, end_color='CFE8D0'))
s.conditional_formatting.add(f'E4:E{3 + PEOPLE}', ColorScaleRule(start_type='num', start_value=-20, start_color='F8D7D3', mid_type='num', mid_value=0, mid_color='FFFFFF', end_type='num', end_value=40, end_color='CFE8D0'))
s.freeze_panes = 'C4'
s['G3'] = 'Итого по группе'; s['G3'].font = H; s['G3'].fill = HF; s['H3'].fill = HF; s.column_dimensions['G'].width = 30; s.column_dimensions['H'].width = 12
for r, (t, f) in enumerate([
    ('Заполнили до тренинга', f'=COUNTIF(Ответы!$B$2:$B${ROWS + 1},"До тренинга")'),
    ('Заполнили после тренинга', f'=COUNTIF(Ответы!$B$2:$B${ROWS + 1},"После тренинга")'),
    ('Средний итог до', f'=IFERROR(AVERAGEIFS(Ответы!$U$2:$U${ROWS + 1},Ответы!$B$2:$B${ROWS + 1},"До тренинга"),"—")'),
    ('Средний итог после', f'=IFERROR(AVERAGEIFS(Ответы!$U$2:$U${ROWS + 1},Ответы!$B$2:$B${ROWS + 1},"После тренинга"),"—")'),
    ('Сотрудников с ростом', f'=COUNTIF(E4:E{3 + PEOPLE},">0")'),
], 4):
    s.cell(r, 7, t); c = s.cell(r, 8, f)
    if 'итог' in t: c.number_format = '0%'

# ---------- По вопросам
p = wb.create_sheet('По вопросам', 2)
p['A1'] = 'Средний балл по вопросам, % от максимума'; p['A1'].font = Font(bold=True, size=14, color=BLUE)
for j, (h, w) in enumerate([('№', 5), ('Раздел', 11), ('Вопрос', 62), ('До', 9), ('После', 9), ('Прирост, п.п.', 13)], 1):
    c = p.cell(3, j, h); c.font = H; c.fill = HF; p.column_dimensions[chr(64 + j)].width = w
for i, (sec, q, _) in enumerate(Q):
    r = 4 + i; col = COLS[i]
    p.cell(r, 1, i + 1); p.cell(r, 2, sec); c = p.cell(r, 3, q); c.alignment = WR
    for j, st in [(4, 'До тренинга'), (5, 'После тренинга')]:
        c = p.cell(r, j, f'=IFERROR(AVERAGEIFS(Ответы!${col}$2:${col}${ROWS + 1},Ответы!$B$2:$B${ROWS + 1},"{st}")/5,0)'); c.number_format = '0%'
    p.cell(r, 6, f'=ROUND((E{r}-D{r})*100,0)')
ch = BarChart(); ch.type = 'bar'; ch.title = 'До и после тренинга'; ch.y_axis.number_format = '0%'; ch.y_axis.scaling.min = 0; ch.y_axis.scaling.max = 1
ch.add_data(Reference(p, min_col=4, max_col=5, min_row=3, max_row=3 + NQ), titles_from_data=True)
ch.set_categories(Reference(p, min_col=1, min_row=4, max_row=3 + NQ)); ch.height = 9; ch.width = 18
ch.series[0].graphicalProperties.solidFill = '7E7E7F'; ch.series[1].graphicalProperties.solidFill = BLUE
p.add_chart(ch, 'H3')

if DEMO:
    import random
    random.seed(4)
    names = ['Иванов Иван Иванович', 'Петрова Анна Сергеевна', 'Сидоров Пётр Олегович', 'Козлова Мария Андреевна']
    r = 2
    for st, shift in [('До тренинга', 0), ('После тренинга', 1)]:
        for nm in names:
            a.cell(r, 1, nm); a.cell(r, 2, st)
            for i, (_, _, opts) in enumerate(Q):
                srt = sorted(opts, key=lambda o: o[1]); a.cell(r, 3 + i, srt[min(2, random.randint(0, 1) + shift)][0])
            r += 1
    a.cell(r, 1, 'Новикова Ольга'); a.cell(r, 2, 'До тренинга'); a.cell(r, 3, 'ответ с опечаткой')
wb.save(OUT); print('Готово:', OUT)
