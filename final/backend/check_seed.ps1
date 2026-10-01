$env:Path += ";C:\Program Files\PostgreSQL\17\bin"
$env:PGPASSWORD = "postgres123"
psql -U postgres -d steg_delestage -c "SELECT id, username, role, is_active, must_change_password FROM users ORDER BY id;"
