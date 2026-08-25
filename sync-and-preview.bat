@echo off
echo Installing dependencies if needed...
call npm.cmd install
echo.
echo Pulling real six-week Play Hub results...
call npm.cmd run sync
if errorlevel 1 (
  echo.
  echo Sync failed. See the error above.
  pause
  exit /b 1
)
echo.
echo Starting local preview...
node src\server.js
pause
