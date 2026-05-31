@echo off
setlocal
set "ROOT=%~dp0"
set "WORKER_URL=https://purerss-worker.heiphaistos44.workers.dev"

echo [PureRSS] Deploy v1.0.0
echo ========================

:: ── 1. Worker ─────────────────────────────────────────
echo [1/3] Deploiement Worker...
cd /d "%ROOT%worker"
call wrangler deploy
if %ERRORLEVEL% neq 0 (
    echo [ERREUR] Worker deploy echoue.
    pause & exit /b 1
)
echo [OK] Worker deploye sur %WORKER_URL%

:: ── 2. Build Frontend ─────────────────────────────────
echo.
echo [2/3] Build frontend...
cd /d "%ROOT%frontend"
set VITE_API_URL=%WORKER_URL%
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERREUR] Build frontend echoue.
    pause & exit /b 1
)
echo [OK] Build OK ^(dist/^)

:: ── 3. Deploy Pages ───────────────────────────────────
echo.
echo [3/3] Deploiement CF Pages...
call wrangler pages deploy dist --project-name purerss-web --branch main --commit-dirty=true
if %ERRORLEVEL% neq 0 (
    echo [ERREUR] Pages deploy echoue.
    pause & exit /b 1
)

echo.
echo ========================
echo [OK] Deploy complet !
echo   Frontend : https://purerss-web.pages.dev
echo   Worker   : %WORKER_URL%
echo ========================
pause
