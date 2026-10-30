@echo off
setlocal
cd /d "%~dp0"
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo File .env dibuat dari .env.example.
  echo Pilih LLM_PROVIDER ^(ollama atau deepseek^) dan isi pengaturannya, simpan, lalu jalankan start_windows.bat lagi.
  start notepad ".env"
  pause
  exit /b
)
if not exist ".venv\Scripts\python.exe" (
  py -m venv .venv
  if errorlevel 1 (
    echo Gagal membuat virtual environment. Pastikan Python terpasang dan dikenali oleh perintah py.
    pause
    exit /b 1
  )
)
call ".venv\Scripts\activate.bat"
python -m pip install -r requirements.txt
if errorlevel 1 (
  echo Instalasi dependensi gagal. Periksa koneksi internet dan versi Python.
  pause
  exit /b 1
)
python app.py
pause
