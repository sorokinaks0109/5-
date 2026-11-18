# -*- coding: utf-8 -*-
"""Собирает ОДИН файл «Тренинг_8_шагов.html»: слайды, упражнения, логотип, фон, картинки и ссылка на анкету внутри.
Запуск: python3 make_single.py   (картинки берутся из ../kartinki/*.jpg, если они есть)"""
import base64, os, re, sys
H = os.path.dirname(os.path.abspath(__file__)); R = os.path.join(H, '..')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(R, 'Тренинг_8_шагов.html')
rd = lambda p: open(p, encoding='utf-8').read()
b64 = lambda p: base64.b64encode(open(p, 'rb').read()).decode()

# ссылки на анкету берём из nastroiki.js, чтобы не потерять
nast = rd(os.path.join(R, 'nastroiki.js'))
m_do = re.search(r"anketa_do:\s*'([^']*)'", nast); m_po = re.search(r"anketa_posle:\s*'([^']*)'", nast)
url_do = m_do.group(1) if m_do else ''; url_po = m_po.group(1) if m_po else url_do

css = rd(os.path.join(H, 'gpn.css')).replace('url(slaidy/fon.jpg)', 'url(data:image/jpeg;base64,' + b64(os.path.join(R, 'slaidy', 'fon.jpg')) + ')')
head = rd(os.path.join(H, 'deck_engine_head.html')).replace('</style>', css + '\n</style>')
settings = ("<script>\n/* ====== НАСТРОЙКИ: ссылка на анкету Oprosso. Меняйте только текст между кавычками. ====== */\n"
            f"window.NASTROIKI = {{ anketa_do: '{url_do}', anketa_posle: '{url_po}' }};\n</script>\n")
head = head.replace('</head>', settings + '</head>', 1)

slides = rd(os.path.join(H, 'slides.html'))
# логотип: один раз внутри файла, на слайды подставляется скриптом
logo = rd(os.path.join(R, 'slaidy', 'logo.svg'))
slides = slides.replace('src="slaidy/logo.svg"', 'data-logo=""')
# картинки
kdir = os.path.join(R, 'kartinki'); used = []; missing = []
def pic(m):
    name = m.group(2); p = os.path.join(kdir, name + '.jpg')
    if os.path.exists(p):
        used.append(name)
        return m.group(1) + '><img alt="" src="data:image/jpeg;base64,' + b64(p) + '"></div>'
    missing.append(name); return ''
slides = re.sub(r'(<div class="picbox[^"]*"[^>]*?data-img="([a-z0-9-]+)"[^>]*?)\s*></div>', pic, slides)
# упражнения: вшиваем как текст, открываем через srcdoc
ex = {}
def frame(m):
    f = m.group(1); key = f.replace('.html', '')
    html = rd(os.path.join(R, 'uprazhneniya', f)).replace("location.search.indexOf('embed')>=0", 'true')
    ex[key] = base64.b64encode(html.encode('utf-8')).decode()
    return f'<iframe class="frame" data-ex-id="{key}"></iframe>'
slides = re.sub(r'<iframe class="frame" data-src="uprazhneniya/([^"?]+)\?embed"></iframe>', frame, slides)

tail = rd(os.path.join(H, 'deck_engine_tail.html'))
tail = tail.replace("const fr=s.querySelector('iframe[data-src]');if(fr&&!fr.src)fr.src=fr.dataset.src;",
                    "const fr=s.querySelector('iframe[data-ex-id]');if(fr&&!fr.dataset.loaded){fr.dataset.loaded=1;fr.srcdoc=new TextDecoder().decode(Uint8Array.from(atob(window.EX[fr.dataset.exId]),c=>c.charCodeAt(0)))}")
assert 'data-ex-id' in tail, 'не удалось подключить упражнения'
exjs = 'window.EX=' + '{' + ','.join(f'"{k}":"{v}"' for k, v in ex.items()) + '};'
logojs = ("(function(){var u=URL.createObjectURL(new Blob([" + repr(logo).replace('</', '<\\/') +
          "],{type:'image/svg+xml'}));document.querySelectorAll('img[data-logo]').forEach(function(i){i.src=u})})();")
tail = tail.replace('<script>\n(function(){', '<script>\n' + exjs + '\n' + logojs + '\n</script>\n<script>\n(function(){', 1)
tail = tail.replace('</body>', '<script>/* qrcode-generator 1.4.4, (c) Kazuhiko Arase, MIT */\n' + rd(os.path.join(H, 'qrcode.js')) +
                    '\n</script>\n<script>\n' + rd(os.path.join(H, 'qr_render.js')) + '\n</script>\n</body>')
html = head + '\n<body>\n<div id="stage">\n' + slides + '\n</div>\n' + tail
open(OUT, 'w', encoding='utf-8').write(html)
print('Готово:', os.path.abspath(OUT), html.count('<section'), 'слайдов,', len(ex), 'упражнений,',
      f'{len(html.encode())//1024} КБ; картинки: {len(used)} вшито, нет файлов: {", ".join(missing) or "—"}')
