# -*- coding: utf-8 -*-
"""Собирает сценарий .docx: scenarij.md + ответы из data.py. Оформление из reference.docx."""
import os, re, subprocess, sys
H = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, H)
from data import POTERI, W5H1, FISH, MATRIX, ORDER, TEST
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(H, '..', 'Сценарий_тренинга_8_шагов.docx')
cl = lambda t: re.sub(r'<[^>]+>', '', t).replace('|', '/')
L = ['', '# Ответы к упражнениям', '', 'Карточки в упражнениях перемешиваются, ищите их по тексту.', '']
B = {b['k']: b['t'] for b in POTERI['bins']}
L += ['## Слайд 20 · Найди потерю', '', '| Ситуация | Вид потерь |', '|---|---|'] + [f'| {i["t"]} | {B[i["a"]]} |' for i in POTERI['items']] + ['']
B = {b['k']: b['t'] for b in W5H1['bins']}
L += ['## Слайд 24 · 5W1H', '', '| Факт | Вопрос |', '|---|---|'] + [f'| {i["t"]} | {B[i["a"]]} |' for i in W5H1['items']] + ['', cl(W5H1['summary']), '']
L += ['## Слайд 29 · Диаграмма Исикавы', '', f'Проблема: {FISH["problem"]}.', '', '| Кость | Причины |', '|---|---|']
for c in FISH['cats'] + [{'k': 'none', 't': 'Не причина'}]:
    L += [f'| {c["t"]} | ' + '; '.join(x['t'] for x in FISH['cards'] if x['a'] == c['k']) + ' |']
L += ['', '## Слайд 33 · Матрица 2×2', '', '| Квадрант | Решения |', '|---|---|']
for q in MATRIX['quads']:
    L += [f'| {q["name"]} | ' + '; '.join(x['t'] for x in MATRIX['items'] if x['c'] == q['id']) + ' |']
L += ['', '## Слайд 38 · Соберите 8 шагов', ''] + [f'{k}. {s["t"]}: {s["why"]}' for k, s in enumerate(ORDER['steps'], 1)]
L += ['', '## Слайд 39 · Итоговый тест', ''] + [f'{k}. {q["q"]} **{q["opts"][q["a"]]}.** {q["why"]}' for k, q in enumerate(TEST['questions'], 1)]
md = open(os.path.join(H, 'scenarij.md'), encoding='utf-8').read() + '\n'.join(L) + '\n'
tmp = os.path.join(H, '_full.md'); open(tmp, 'w', encoding='utf-8').write(md)
subprocess.run(['pandoc', tmp, '-f', 'markdown', '-o', OUT, '--reference-doc', os.path.join(H, 'reference.docx')], check=True)
os.remove(tmp); print('Готово:', os.path.abspath(OUT))
