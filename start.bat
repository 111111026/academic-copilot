@echo off
REM 研途智伴 - 启动脚本
REM 用法：双击运行，或在命令行中 cd 到项目目录后执行 start.bat

cd /d "%~dp0"

echo ========================================
echo   研途智伴 Academic Copilot
echo   启动服务...
echo ========================================

REM 检查 out 目录是否存在，不存在则先构建
if not exist "out" (
    echo [1/3] 构建静态产物（首次运行或代码变更后需要）...
    node node_modules/next/dist/bin/next build
    if errorlevel 1 (
        echo 构建失败，请检查错误信息
        pause
        exit /b 1
    )
)

echo [2/3] 启动 MCP 代理服务器 (http://localhost:4500) ...
start "MCP 代理" /MIN cmd /c "node mcp-proxy/server.mjs"

echo [3/3] 启动静态服务器 (http://localhost:3000) ...
echo 按 Ctrl+C 停止服务
echo ========================================

node .verify/static-server.mjs
