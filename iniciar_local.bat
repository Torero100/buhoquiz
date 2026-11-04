@echo off
title BuhoQuiz (local)
cd /d "%~dp0"
set "PATH=%~dp0..\herramientas\node;%PATH%"
if not exist node_modules (
  echo Instalando dependencias...
  call npm install
)
echo.
echo  Maestro:   http://localhost:3000/maestro   (clave: buho2026)
echo  Jugadores: http://localhost:3000
echo  Cierra esta ventana para detener el servidor.
echo.
start "" http://localhost:3000/maestro
node server.js
pause
