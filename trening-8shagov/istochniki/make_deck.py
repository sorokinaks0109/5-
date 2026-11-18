# -*- coding: utf-8 -*-
"""Собирает «Тренинг_8_шагов.html»: движок (deck_engine_*.html), стиль ГПН (gpn.css), слайды (slides.html), QR (qrcode.js, MIT)."""
import os, sys
H = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(H, '..', 'Тренинг_8_шагов.html')
rd = lambda n: open(os.path.join(H, n), encoding='utf-8').read()
head = rd('deck_engine_head.html').replace('</style>', rd('gpn.css') + '\n</style>')
tail = rd('deck_engine_tail.html').replace('</body>', '<script src="nastroiki.js"></script>\n<script>/* qrcode-generator 1.4.4, (c) Kazuhiko Arase, MIT */\n'
       + rd('qrcode.js') + '\n</script>\n<script>\n' + rd('qr_render.js') + '\n</script>\n</body>')
html = head + '\n<body>\n<div id="stage">\n' + rd('slides.html') + '\n</div>\n' + tail
open(OUT, 'w', encoding='utf-8').write(html)
print('Готово:', os.path.abspath(OUT), html.count('<section'), 'слайдов')
