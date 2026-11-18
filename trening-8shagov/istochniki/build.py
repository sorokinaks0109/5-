# -*- coding: utf-8 -*-
"""Сборка упражнений тренинга «8 шагов решения проблем».
Тексты лежат в data.py. Поменяйте текст и запустите:  python3 build.py
Файлы упражнений появятся в папке ../uprazhneniya рядом с презентацией."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
MECH = os.path.join(HERE, 'mech')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'uprazhneniya')
rd = lambda n: open(os.path.join(MECH, n), encoding='utf-8').read()
HEAD = rd('head.html').replace('</style>', rd('extra.css') + '\n</style>')
COMMON = rd('common.js')

def header(ex):
    return (f'<header><h1>{ex["title"]}</h1><span class="mech">{ex["mech"]}</span>'
            f'<span class="slide">к слайду {ex["slide"]}</span><a href="index.html">Все упражнения</a></header>')

BODY = {
 'sortn': lambda ex: f'''<main><div class="task">{ex["task"]}</div><div id="play" style="display:flex;flex-direction:column;gap:12px"><div class="bar"><div class="progress" id="prog" style="flex:1"></div><span class="score" id="score"></span></div><div class="casebox" id="case"></div><div class="act" id="act"></div><div class="bins" id="bins"></div><div class="why" id="why"></div><div class="bar"><button id="next" style="visibility:hidden">Дальше →</button></div></div><div class="final" id="final" style="display:none"></div></main>''',
 'fish': lambda ex: f'''<main><div class="task">{ex["task"]}</div><div class="fishtop"><div class="fcard" id="fcard"></div><div class="trash" data-zone="none">Не причина<small>сама проблема или «кто виноват»</small><div class="chips"></div></div></div><div class="fish" id="fish"></div><div class="why" id="why"></div><div class="bar"><span class="score" id="score"></span><button class="sec" id="again" style="display:none">Собрать заново</button></div><div class="help">Нажмите на кость, куда положить карточку. Если ошиблись, правильная кость подсветится, и карточка ляжет туда сама.</div></main>''',
 'matrix': lambda ex: f'''<main><div class="task">{ex["task"]}</div><div class="mxwrap"><div class="pool" id="pool"></div><div class="mx" id="mx"></div></div><div class="why" id="why"></div><div class="bar"><button id="bCheck">Проверить</button><button class="sec" id="bFix">Исправить ошибки</button><button class="sec" id="bAns">Показать ответы</button><button class="sec" id="bRe">Заново</button><span class="score" id="score"></span></div></main>''',
 'order': lambda ex: f'''<main><div class="task">{ex["task"]}</div><div class="order" id="order"></div><div class="why" id="why"></div><div class="bar"><button id="bCheck">Проверить</button><button class="sec" id="bAns">Показать ответы</button><button class="sec" id="bRe">Заново</button><span class="score" id="score"></span></div></main>''',
 'quiz': lambda ex: f'''<main><div class="task">{ex["task"]}</div><div class="teams" id="teams" style="display:none"><div class="team">Команда 1 <button data-team="0">+1</button><b id="t0">0</b></div><div class="team">Команда 2 <button data-team="1">+1</button><b id="t1">0</b></div></div><div id="play" style="display:flex;flex-direction:column;gap:16px"><div class="bar"><div class="progress" id="prog" style="flex:1"></div><div class="timer" id="tm"></div></div><div class="big" id="q"></div><div class="opts" id="opts"></div><div class="why" id="why"></div><div class="bar"><button id="next" disabled>Дальше →</button></div></div><div class="final" id="final" style="display:none"></div><span id="score"></span></main>''',
}

def script(ex):
    k = ex['kind']
    if k in ('quiz', 'order'):
        return rd(k + '.js')
    return COMMON + rd(k + '.js')

def page(ex):
    return (HEAD.replace('{{TITLE}}', ex['title']) + '\n<body>' + header(ex) + BODY[ex['kind']](ex)
            + '<script>const DATA=' + json.dumps(ex['data'], ensure_ascii=False) + ';\n' + script(ex) + '</script></body></html>')

def hub(exs):
    links = ''.join(f'<a href="{e["file"]}"><small>Слайд {e["slide"]}</small><span>{e["title"]}</span><em>{e["mech"]}</em></a>' for e in exs)
    return (HEAD.replace('{{TITLE}}', 'Упражнения: 8 шагов') + '\n<body><header><h1>Упражнения к тренингу «8 шагов решения проблем»</h1></header>'
            f'<main><div class="hub">{links}</div></main></body></html>')

from data import EXERCISES
if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for ex in EXERCISES:
        open(os.path.join(OUT, ex['file']), 'w', encoding='utf-8').write(page(ex))
    open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(hub(EXERCISES))
    print('Готово:', len(EXERCISES), 'упражнений в', os.path.abspath(OUT))
