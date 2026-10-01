"""Перенос старого общего отчёта (один файл, вкладка на человека) в новую схему.

Делает:
  <out>/Реестр.xlsx                    — Мемо, План УПЦ, Руководители, Показатели УПЦ
  <out>/Руководители/<Фамилия>.xlsx    — пока только лист «Приложения» (если были доп. таблицы)
  <out>/../migr.json                   — РОС, текущие проекты и статусы для make-personal.mjs

Запуск: python3 migrate.py старый.xlsx "папка/Отчёт первой линейки"
"""
import copy
import datetime as dt
import json
import os
import re
import sys

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

SRC, OUT = sys.argv[1], sys.argv[2]
MAX_COLS = 12

wb = openpyxl.load_workbook(SRC, data_only=True)
wb_styles = openpyxl.load_workbook(SRC)  # для копирования оформления приложений

FIRST_LINE = [n for n in wb.sheetnames if n not in ('Как заполнять', 'Мемо', 'План мероприятий для УПЦ', 'УПЦ справочно')]

thin = Side(style='thin', color='BFBFBF')
BORDER = Border(top=thin, bottom=thin, left=thin, right=thin)
HEAD_FILL = PatternFill('solid', fgColor='DCE6F1')
TITLE_FILL = PatternFill('solid', fgColor='1F3A5F')
WRAP = Alignment(wrap_text=True, vertical='top')


def clean(v):
    if isinstance(v, str):
        v = v.replace('\xa0', ' ')
        return v if v.strip() else None
    return v


def jsonable(v):
    if isinstance(v, dt.datetime):
        return {'$d': v.strftime('%Y-%m-%d')}
    return v


def table_sheet(ws, title, note, headers, widths, rows, date_cols=()):
    ws['A1'] = title
    ws['A1'].font = Font(bold=True, size=14)
    ws['A2'] = note
    ws['A2'].font = Font(italic=True, size=9, color='595959')
    ws['A2'].alignment = Alignment(wrap_text=True, vertical='top')
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=len(headers))
    ws.row_dimensions[2].height = 42
    for i, (h, w) in enumerate(zip(headers, widths), 1):
        c = ws.cell(3, i, h)
        c.font = Font(bold=True)
        c.fill = HEAD_FILL
        c.border = BORDER
        c.alignment = WRAP
        ws.column_dimensions[get_column_letter(i)].width = w
    for r, vals in enumerate(rows, 4):
        for i, v in enumerate(vals, 1):
            c = ws.cell(r, i, v)
            c.border = BORDER
            c.alignment = WRAP
            if i in date_cols and isinstance(v, dt.datetime):
                c.number_format = 'DD.MM.YYYY'
    ws.freeze_panes = 'A4'


# ---------- Реестр ----------
os.makedirs(os.path.join(OUT, 'Руководители'), exist_ok=True)
reg = openpyxl.Workbook()

people = [{'fio': n, 'file': n.split()[0] + '.xlsx'} for n in FIRST_LINE]

ws_m = wb['Мемо']
memo_rows = []
for r in range(5, ws_m.max_row + 1):
    if not ws_m.cell(r, 1).value:
        continue
    memo_rows.append([clean(ws_m.cell(r, c).value) for c in (1, 2, 3, 4, 5, 6, 8)])
ws = reg.active
ws.title = 'Мемо'
table_sheet(
    ws, 'РЕЕСТР ПОРУЧЕНИЙ (МЕМО) СОВЕЩАНИЯ ПЕРВОЙ ЛИНЕЙКИ',
    'Ведёт помощник. Новые поручения добавляйте вниз. Ответственный — ровно как на листе «Руководители». '
    'Соисполнители — «Фамилия И.О.» через запятую. Чтобы закрыть поручение, напишите в «Отметке секретаря» «выполнено» '
    '(или проведено, исполнено, завершено, снято, закрыто) — оно уйдёт из личного файла при следующей рассылке. '
    'Статусы сюда не пишутся: их показывает Сборщик.',
    ['ID', 'Дата совещания', 'Поручение', 'Ответственный', 'Соисполнители', 'Срок', 'Отметка секретаря'],
    [8, 14, 70, 20, 30, 14, 24], memo_rows, date_cols=(6,))
dv = DataValidation(type='list', formula1="='Руководители'!$A$4:$A$40", allow_blank=True, showErrorMessage=False)
ws.add_data_validation(dv)
dv.add('D4:D2000')

ws_u = wb['План мероприятий для УПЦ']
upc_rows, block, kpi_full = [], '', ''
for r in range(7, ws_u.max_row + 1):
    a, b, c, d, e, f, g, h, i = [clean(ws_u.cell(r, k).value) for k in range(1, 10)]
    if h:
        upc_rows.append([block, i or kpi_full, a, h, b, c, d, e, g, None if g else f])
    elif a and not b and isinstance(a, str) and not re.fullmatch(r'\d+\.?', a.strip()):
        if a.strip().lower().startswith('блок'):
            block = a.strip()
        else:
            kpi_full = a.strip()
ws = reg.create_sheet('План УПЦ')
table_sheet(
    ws, 'ПЛАН МЕРОПРИЯТИЙ ПО ДОСТИЖЕНИЮ ЦЕЛЕВЫХ ПОКАЗАТЕЛЕЙ (УПЦ)',
    'Докладчик — тот, в чей личный файл уходит мероприятие и кто заполняет по нему статус. '
    'Если докладчика нет (лидер не из первой линейки), статус пишется здесь, в последней колонке.',
    ['Блок', 'Показатель', '№', 'ID', 'Мероприятие', 'Ответственный исполнитель', 'Срок', 'Примечания', 'Докладчик',
     'Статус (только если нет докладчика)'],
    [10, 24, 5, 8, 60, 30, 14, 20, 18, 40], upc_rows, date_cols=(7,))
dv2 = DataValidation(type='list', formula1="='Руководители'!$A$4:$A$40", allow_blank=True, showErrorMessage=False)
ws.add_data_validation(dv2)
dv2.add('I4:I2000')

ws = reg.create_sheet('Руководители')
table_sheet(
    ws, 'РУКОВОДИТЕЛИ ПЕРВОЙ ЛИНЕЙКИ',
    'Порядок строк = порядок докладов на совещании. Файл — имя личного файла в папке «Руководители». '
    'Новый человек: добавьте строку, Сборщик сам создаст ему файл при рассылке.',
    ['ФИО', 'Файл'], [24, 24], [[p['fio'], p['file']] for p in people])

ws_k = wb['УПЦ справочно']
kpi_rows = []
for r in range(9, ws_k.max_row + 1):
    vals = [clean(ws_k.cell(r, c).value) for c in range(1, 12)]
    if vals[3]:
        kpi_rows.append(vals)
ws = reg.create_sheet('Показатели УПЦ')
table_sheet(
    ws, 'КАРТА УПЦ НА ГОД (справочно)', 'Обновляйте при новой выгрузке карты. Нужен для экрана «Показатели на год».',
    [clean(ws_k.cell(8, c).value) or '' for c in range(1, 12)], [11, 7, 6, 45, 12, 14, 50, 28, 10, 8, 20], kpi_rows)

reg.save(os.path.join(OUT, 'Реестр.xlsx'))


# ---------- Личные файлы ----------
def is_heading(vals):
    a = vals[0]
    return isinstance(a, str) and not re.fullmatch(r'\s*\d+\.?\s*', a) and all(v is None for v in vals[1:5])


def is_title(a, word):
    return isinstance(a, str) and a.strip().upper().startswith(word)


migr = []
for name in FIRST_LINE:
    ws = wb[name]
    ws_st = wb_styles[name]
    rows = {r: [clean(ws.cell(r, c).value) for c in range(1, MAX_COLS + 1)] for r in range(1, ws.max_row + 1)}
    memo_start = next(r for r, v in rows.items() if is_title(v[0], 'ПОРУЧЕНИЯ ПО МЕМО'))
    upc_start = next(r for r, v in rows.items() if is_title(v[0], 'МЕРОПРИЯТИЯ УПЦ'))

    ros, proj, cur = [], [], None
    for r in range(2, memo_start):
        vals = rows[r]
        while vals and vals[-1] is None:
            vals = vals[:-1]
        if not vals or vals[0] in ('№ ', '№'):
            continue
        # служебный маркер «•» в колонке F не переносим
        vals = [None if v == '•' else v for v in vals]
        while vals and vals[-1] is None:
            vals = vals[:-1]
        if r == 1 or (is_heading(vals + [None] * 5) and len([v for v in vals if v is not None]) == 1
                      and vals[0].strip().upper() == name.upper()):
            continue
        if is_heading(vals + [None] * 5):
            h = vals[0].strip()
            if h.upper() == 'РОС':
                cur = ros
                continue
            if h.lower().startswith('текущие проекты'):
                cur = proj
                continue
            (cur if cur is not None else proj).append([h])
            continue
        if all(v is None for v in vals[1:]):  # пустая заготовка «1.», «11»
            continue
        (cur if cur is not None else proj).append(vals)

    def ids_status(start):
        out, r = {}, start + 2
        while r <= ws.max_row:
            v = rows[r]
            if isinstance(v[0], str) and re.fullmatch(r'[МУ]-\d+', v[0].strip()):
                if v[2]:
                    out[v[0].strip()] = v[2]
            elif v[0] and r > start + 2 and not re.fullmatch(r'[МУ]-\d+', str(v[0])):
                break
            r += 1
        return out

    memo_st = ids_status(memo_start)
    upc_st = ids_status(upc_start)

    # всё, что ниже блока УПЦ и не является строкой УПЦ, — приложения
    app_start = None
    for r in range(upc_start + 2, ws.max_row + 1):
        v = rows[r]
        if any(x is not None for x in v) and not (isinstance(v[0], str) and re.fullmatch(r'У-\d+', v[0].strip())):
            app_start = r
            break

    person_file = os.path.join(OUT, 'Руководители', name.split()[0] + '.xlsx')
    has_app = False
    if app_start:
        out_wb = openpyxl.Workbook()
        app = out_wb.active
        app.title = 'Приложения'
        last = max(r for r in range(app_start, ws.max_row + 1) if any(x is not None for x in rows[r]))
        for r in range(app_start, last + 1):
            nr = r - app_start + 1
            for c in range(1, MAX_COLS + 1):
                src = ws_st.cell(r, c)
                dst = app.cell(nr, c, clean(ws.cell(r, c).value))
                if src.has_style:
                    dst.font = copy.copy(src.font)
                    dst.fill = copy.copy(src.fill)
                    dst.border = copy.copy(src.border)
                    dst.alignment = copy.copy(src.alignment)
                    dst.number_format = src.number_format
            if ws_st.row_dimensions[r].height:
                app.row_dimensions[nr].height = ws_st.row_dimensions[r].height
        for mr in ws_st.merged_cells.ranges:
            if mr.min_row >= app_start and mr.max_row <= last and mr.max_col <= MAX_COLS:
                app.merge_cells(start_row=mr.min_row - app_start + 1, start_column=mr.min_col,
                                end_row=mr.max_row - app_start + 1, end_column=mr.max_col)
        for c in range(1, MAX_COLS + 1):
            w = ws_st.column_dimensions[get_column_letter(c)].width
            if w:
                app.column_dimensions[get_column_letter(c)].width = w
        out_wb.save(person_file)
        has_app = True
    elif os.path.exists(person_file):
        os.remove(person_file)

    migr.append({
        'fio': name, 'file': name.split()[0] + '.xlsx', 'hasAppendix': has_app,
        'ros': [[jsonable(v) for v in row] for row in ros],
        'proj': [[jsonable(v) for v in row] for row in proj],
        'memo': {k: jsonable(v) for k, v in memo_st.items()},
        'upc': {k: jsonable(v) for k, v in upc_st.items()},
    })
    print(f'{name}: РОС {len(ros)}, проекты {len(proj)}, статусов мемо {len(memo_st)}, УПЦ {len(upc_st)}, '
          f'приложения {"да" if has_app else "нет"}')

with open(os.path.join(os.path.dirname(os.path.abspath(OUT)), 'migr.json'), 'w', encoding='utf-8') as f:
    json.dump(migr, f, ensure_ascii=False, indent=1)
print('Реестр: мемо', len(memo_rows), ', УПЦ', len(upc_rows), ', показателей', len(kpi_rows))
