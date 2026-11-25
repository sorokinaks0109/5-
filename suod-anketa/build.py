"""Сборка автономных файлов из src/ в dist/.

  python3 build.py          — анкета и сборщик (HTML) + памятка и карточки (PDF)
  python3 build.py --no-pdf — без PDF (если нет Node.js и Playwright)
"""
import base64
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent
SRC, DIST = ROOT / "src", ROOT / "dist"
DIST.mkdir(exist_ok=True)


def font_face():
    # статические начертания: переменный шрифт Chromium печатает в PDF с пропавшими пробелами
    out = []
    ranges = {"cyrillic": "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116",
              "latin": "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"}
    for weight in (400, 600, 700, 800):
        for sub, rng in ranges.items():
            b64 = base64.b64encode((SRC / "fonts" / f"manrope-{sub}-{weight}-normal.woff2").read_bytes()).decode()
            out.append(f"@font-face{{font-family:'Manrope';font-style:normal;font-display:swap;font-weight:{weight};"
                       f"src:url(data:font/woff2;base64,{b64}) format('woff2');unicode-range:{rng}}}")
    return "/* Manrope — SIL Open Font License 1.1 */\n" + "\n".join(out)


css = (SRC / "common.css").read_text(encoding="utf-8").replace("/*FONT*/", font_face())
data = (SRC / "data.js").read_text(encoding="utf-8")
common = (SRC / "common.js").read_text(encoding="utf-8")
xlsx = (SRC / "xlsx.mini.min.js").read_text(encoding="utf-8")
lic = "/*! SheetJS Community Edition 0.18.5 — Apache License 2.0 (см. xlsx.LICENSE) */\n"
exceljs = (SRC / "exceljs.min.js").read_text(encoding="utf-8")
exlic = "/*! ExcelJS 4.4.0 — MIT License (см. exceljs.LICENSE) */\n"


def assemble(src):
    s = (SRC / src).read_text(encoding="utf-8")
    return (s.replace("/*CSS*/", css).replace("/*DATA*/", data)
             .replace("/*COMMON*/", common).replace("/*XLSX*/", lic + xlsx)
             .replace("/*EXCELJS*/", exlic + exceljs))


for src, out in {"anketa.html": "Анкета_СУОД.html", "sborshik.html": "Сборщик_СУОД.html"}.items():
    s = assemble(src)
    (DIST / out).write_text(s, encoding="utf-8")
    print(out, round(len(s.encode("utf-8")) / 1024), "КБ")

# памятка: HTML-заготовка только для печати в PDF
tmp = ROOT / ".pamyatka_build.html"
tmp.write_text(assemble("pamyatka.html"), encoding="utf-8")
if "--no-pdf" not in sys.argv:
    subprocess.run(["node", str(ROOT / "make_pdf.cjs"), str(tmp), str(DIST)], check=True)
tmp.unlink()
