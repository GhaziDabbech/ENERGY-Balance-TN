-- 1. ZONES: each neighborhood/area
create table zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  delegation text,
  crc text check (crc in ('nord', 'sud')),
  bcc_id uuid,
  latitude numeric,
  longitude numeric
);

-- 2. BCC: the 7 local control bureaus
create table bcc (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  crc text check (crc in ('nord', 'sud')),
  avg_load_mw numeric
);

-- 3. FEEDERS: the power lines ("départs MT") that actually get cut
create table feeders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  zone_id uuid references zones(id),
  bcc_id uuid references bcc(id),
  priority_level int check (priority_level between 0 and 5),
  avg_load_mw numeric,
  last_cut_at timestamp,
  total_cuts_month int default 0
);

-- 4. PROGRAM_SCHEDULE: the planned/actual cut schedule
create table program_schedule (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time_slot_start timestamp,
  time_slot_end timestamp,
  national_target_mw numeric,
  crc text check (crc in ('nord', 'sud')),
  bcc_id uuid references bcc(id),
  feeder_id uuid references feeders(id),
  status text check (status in ('planned', 'validated', 'active', 'restored', 'cancelled')),
  created_by uuid
);

-- 5. EXECUTION_LOG: what really happened, typed in by operators
create table execution_log (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references program_schedule(id),
  actual_start timestamp,
  actual_end timestamp,
  actual_mw_shed numeric,
  entered_by uuid,
  notes text
);

-- 6. USER_ROLES: who can log in and what they can see
create table user_roles (
  id uuid primary key default gen_random_uuid(),
  role text check (role in ('dn', 'crc_nord', 'crc_sud', 'bcc', 'citizen', 'admin')),
  bcc_id uuid references bcc(id),
  zone_id uuid references zones(id)
);

-- 7. KPI_SNAPSHOTS: saved performance stats
create table kpi_snapshots (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  region text,
  ens_mwh numeric,
  equity_index numeric,
  computed_at timestamp default now()
);