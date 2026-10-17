@echo off
set PORT=COM11
if not "%1"=="" set PORT=%1

echo ================================================================
echo   Opening ESP32 Serial Monitor on %PORT% (115200 baud)
echo   Press Ctrl+] or Ctrl+C to exit.
echo ================================================================

C:\Espressif\tools\python\v6.0.1\venv\Scripts\python.exe -m serial.tools.miniterm %PORT% 115200 --rts 0 --dtr 0
pause
