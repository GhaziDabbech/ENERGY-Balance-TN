# ── STEG — Start all services from final/ ────────────────────────────────────
#
# Opens 4 separate PowerShell windows:
#   1. Backend internal  — http://localhost:8000  (SCADA API)
#   2. Backend public    — http://localhost:8001  (Citizen API)
#   3. SCADA frontend    — http://localhost:5173
#   4. Citizen frontend  — http://localhost:5174
#
# Run from the final/ folder:
#   .\start.ps1

# Resolve the absolute path of the final/ folder reliably
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$backendDir  = "$root\backend"
$scadaDir    = "$root\operators-frontend"
$citizenDir  = "$root\citizen-frontend"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  STEG Delestage - Starting all services" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Backend internal (port 8000) ──────────────────────────────────────────
Write-Host "[1/4] Backend internal  -> http://localhost:8000" -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", `
    "Set-Location '$backendDir'; `
     Write-Host 'Backend Internal - port 8000' -ForegroundColor Cyan; `
     python -m alembic upgrade head; `
     uvicorn app.main:app --host 0.0.0.0 --port 8000"

Start-Sleep -Seconds 3

# ── 2. Backend public (port 8001) ────────────────────────────────────────────
Write-Host "[2/4] Backend public    -> http://localhost:8001" -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", `
    "Set-Location '$backendDir'; `
     Write-Host 'Backend Public (Citizen) - port 8001' -ForegroundColor Green; `
     uvicorn main_public:app --host 0.0.0.0 --port 8001"

Start-Sleep -Seconds 2

# ── 3. SCADA frontend (port 5173) ────────────────────────────────────────────
Write-Host "[3/4] SCADA frontend    -> http://localhost:5173" -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", `
    "Set-Location '$scadaDir'; `
     Write-Host 'SCADA Frontend - port 5173' -ForegroundColor Magenta; `
     npm run dev"

Start-Sleep -Seconds 2

# ── 4. Citizen frontend (port 5174) ──────────────────────────────────────────
Write-Host "[4/4] Citizen frontend  -> http://localhost:5174" -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", `
    "Set-Location '$citizenDir'; `
     Write-Host 'Citizen Frontend - port 5174' -ForegroundColor Blue; `
     npm run dev"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  All services started!" -ForegroundColor Green
Write-Host ""
Write-Host "  SCADA operators  -> http://localhost:5173" -ForegroundColor Magenta
Write-Host "  Citizen portal   -> http://localhost:5174" -ForegroundColor Blue
Write-Host "  Internal API     -> http://localhost:8000/docs" -ForegroundColor Yellow
Write-Host "  Public API       -> http://localhost:8001/docs" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
