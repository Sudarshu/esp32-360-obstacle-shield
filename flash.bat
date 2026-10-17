@echo off
set PORT=COM11
if not "%1"=="" set PORT=%1

echo ================================================================
echo   Flashing Vehicle Obstacle Shield to ESP32 on %PORT%
echo ================================================================

C:\Espressif\tools\python\v6.0.1\venv\Scripts\python.exe -m esptool --chip esp32 -p %PORT% -b 460800 --before default-reset --after hard-reset write-flash --flash-mode dio --flash-freq 40m --flash-size 2MB 0x1000 firmware\build\bootloader\bootloader.bin 0x8000 firmware\build\partition_table\partition-table.bin 0x10000 firmware\build\vehicle_obstacle_shield.bin

echo.
echo Flash complete!
pause
