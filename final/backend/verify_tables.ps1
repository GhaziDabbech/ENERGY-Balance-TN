$env:Path += ";C:\Program Files\PostgreSQL\17\bin"
$env:PGPASSWORD = "postgres123"
psql -U postgres -d steg_delestage -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"
