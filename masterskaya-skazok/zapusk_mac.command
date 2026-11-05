#!/bin/bash
cd "$(dirname "$0")"
command -v ffmpeg >/dev/null || { echo "Не найден ffmpeg. Установи: brew install ffmpeg"; read; exit 1; }
[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate
pip install -q -r requirements.txt
[ -f .env ] || { cp .env.example .env; echo "Заполни файл .env и запусти снова"; open -e .env; read; exit 0; }
echo "Бот запущен. Не закрывай это окно, пока работаешь с заказами."
python3 bot.py
