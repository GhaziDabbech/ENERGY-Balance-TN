$env:Path += ";C:\Program Files\PostgreSQL\17\bin"
Set-Location "c:\Users\GIGABYTE\OneDrive\Desktop\pes tgm\backend"

Write-Host "=== Generating initial migration ==="
python -m alembic revision --autogenerate -m "initial_schema"

Write-Host "=== Applying migration to database ==="
python -m alembic upgrade head

Write-Host "=== Done ==="
