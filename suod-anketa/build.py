"""Сборка трёх автономных HTML-файлов из src/ в dist/.
Запуск: python3 build.py
"""
from pathlib import Path

ROOT = Path(__file__).parent
SRC, DIST = ROOT / "src", ROOT / "dist"
DIST.mkdir(exist_ok=True)

css = (SRC / "common.css").read_text(encoding="utf-8")
data = (SRC / "data.js").read_text(encoding="utf-8")
common = (SRC / "common.js").read_text(encoding="utf-8")
xlsx = (SRC / "xlsx.mini.min.js").read_text(encoding="utf-8")
lic = "/*! SheetJS Community Edition 0.18.5 — Apache License 2.0 (см. xlsx.LICENSE) */\n"

TARGETS = {
    "anketa.html": "Анкета_СУОД.html",
    "pamyatka.html": "Памятка_модели_поведения.html",
    "sborshik.html": "Сборщик_СУОД.html",
}
for src, out in TARGETS.items():
    s = (SRC / src).read_text(encoding="utf-8")
    s = s.replace("/*CSS*/", css).replace("/*DATA*/", data).replace("/*COMMON*/", common)
    s = s.replace("/*XLSX*/", lic + xlsx)
    (DIST / out).write_text(s, encoding="utf-8")
    print(out, round(len(s.encode("utf-8")) / 1024), "КБ")
