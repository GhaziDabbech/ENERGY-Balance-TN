$env:Path += ";C:\Program Files\PostgreSQL\17\bin"
$env:PGPASSWORD = "postgres123"
psql -U postgres -d steg_delestage -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position;"
