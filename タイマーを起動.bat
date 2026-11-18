@echo off
chcp 65001 >nul
title サリーぶろっくす タイマー
cd /d "%~dp0"
node local-timer\server.js
pause
