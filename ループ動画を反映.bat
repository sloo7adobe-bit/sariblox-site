@echo off
cd /d "%~dp0"
echo ループ動画を変換しています...
python toolsuild-loops.py
if errorlevel 1 goto end
echo.
echo サイトに公開しています...
call npx vercel --prod --yes
echo.
echo 完了しました。https://sariblox.com を再読み込みして確認してください。
:end
pause
