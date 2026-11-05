@echo off
chcp 65001 >nul
cd /d "%~dp0"
where ffmpeg >nul 2>nul || (echo Не найден ffmpeg. Установи: winget install Gyan.FFmpeg & pause & exit /b)
if not exist .venv ( python -m venv .venv )
call .venv\Scripts\activate
pip install -q -r requirements.txt
if not exist .env ( copy .env.example .env >nul & echo Заполни файл .env и запусти снова & notepad .env & pause & exit /b )
echo Бот запущен. Не закрывай это окно, пока работаешь с заказами.
python bot.py
pause
