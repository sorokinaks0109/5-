@echo off
cd /d "%~dp0"
where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo ffmpeg not found. Install it: winget install Gyan.FFmpeg  and restart the computer.
  pause
  exit /b
)
if not exist .venv (
  echo First start: preparing, wait 1-2 minutes...
  python -m venv .venv
)
call .venv\Scripts\activate.bat
python -m pip install -q -r requirements.txt
if not exist .env (
  copy .env.example .env >nul
  echo Paste the bot token into .env file, save it and run this file again.
  notepad .env
  pause
  exit /b
)
echo.
echo BOT IS RUNNING. Do not close this window while you work with orders.
echo.
python bot.py
pause
