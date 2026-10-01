Set-Location "c:\Users\GIGABYTE\OneDrive\Desktop\pes tgm\backend"
$env:Path += ";C:\Program Files\PostgreSQL\17\bin"

Write-Host "=== Generating migration: add_admin_role ==="
python -m alembic revision --autogenerate -m "add_admin_role_must_change_password"

Write-Host "=== Applying migration ==="
python -m alembic upgrade head

Write-Host "=== Done ==="
