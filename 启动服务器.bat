@echo off
chcp 65001 >nul
echo 正在启动开发服务器...
echo.
cd /d "%~dp0"
npm run dev
pause




