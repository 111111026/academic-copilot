@echo off
REM 研途智伴 - 停止脚本
REM 用法：双击运行，或在命令行中 cd 到项目目录后执行 stop.bat

echo 正在停止研途智伴服务...

REM 停止静态服务器 (3000 端口)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo 停止静态服务器 PID: %%a
    taskkill /PID %%a /F >nul 2>&1
)

REM 停止 MCP 代理 (4500 端口)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4500 ^| findstr LISTENING') do (
    echo 停止 MCP 代理 PID: %%a
    taskkill /PID %%a /F >nul 2>&1
)

echo 已停止所有服务。
pause
