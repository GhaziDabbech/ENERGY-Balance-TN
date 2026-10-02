$env:Path += ";C:\Program Files\PostgreSQL\17\bin"
$env:PGPASSWORD = "postgres123"
Set-Location "c:\Users\GIGABYTE\OneDrive\Desktop\pes tgm\backend"

Write-Host "=== Dropping and recreating database ==="
psql -U postgres -c "DROP DATABASE IF EXISTS steg_delestage;"
psql -U postgres -c "CREATE DATABASE steg_delestage OWNER steg_app ENCODING 'UTF8';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE steg_delestage TO steg_app;"
psql -U postgres -d steg_delestage -c "GRANT ALL ON SCHEMA public TO steg_app;"

Write-Host "=== Running all migrations ==="
python -m alembic upgrade head

Write-Host "=== Done — starting server ==="
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
