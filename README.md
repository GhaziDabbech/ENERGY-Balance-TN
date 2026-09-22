# Task 1 — Data Model & Allocation Engine

This is the core decision engine for the PESTGM 7.0 Load Shedding Management Platform (Track 2). It owns the database schema and all the logic that decides **which feeders get cut, in what order, and why**.

## Where things are

**Code (repo root):**

| File | Purpose |
|---|---|
| `create_tables.sql` | Creates the 7 core tables in Supabase (run once, in Supabase Studio's SQL Editor) |
| `generate_data.py` | Generates and inserts synthetic test data: 7 BCC, 18 zones, 45 feeders |
| `functions.py` | All 7 decision-logic functions, fully tested with 3+ scenarios each |

**Documentation (`information/` folder):**

| File | Purpose |
|---|---|
| `information/task1_summary1.md` | Short summary of what was built, for teammates |
| `information/report_task1.md` | Detailed report section (data model + selection rules) for the team's official technical report |

## Setup (local, no cloud account needed)

1. Install Docker Desktop and the Supabase CLI.
2. From this folder, run:
   ```
   supabase init
   supabase start
   ```
3. Open Supabase Studio (usually `http://127.0.0.1:54323`) → SQL Editor → paste and run `create_tables.sql`.
4. Install the Python dependency:
   ```
   pip install supabase
   ```
5. Generate and load the test data:
   ```
   python generate_data.py
   ```
6. Run and test all functions:
   ```
   python functions.py
   ```

**Note:** `functions.py` currently connects to Supabase using a hardcoded local URL and publishable key. These are safe (local-only, not real credentials), but if your local Supabase instance generates different keys, update the `url` and `key` variables at the top of `functions.py` and `generate_data.py` to match your own `supabase start` output.

## Database schema (7 tables)

- **`zones`** — every neighborhood/area (name, region, coordinates, linked BCC)
- **`bcc`** — the 7 local control bureaus (name, region, average load)
- **`feeders`** — the power lines that actually get cut (priority, load, cut history)
- **`program_schedule`** — the planned cut schedule
- **`execution_log`** — what actually happened (filled in by operators, used for real KPIs)
- **`user_roles`** — login roles and access scope
- **`kpi_snapshots`** — saved performance stats over time

## Core functions (in `functions.py`)

| Function | What it does |
|---|---|
| `split_regional_target(national_target_mw, ratio=0.66)` | Splits a national MW target between North/South |
| `allocate_to_bcc(crc_target_mw, bcc_list)` | Splits a region's target across its BCCs, proportional to load |
| `select_feeders(bcc_target_mw, feeder_list, cooldown_hours=4)` | **The core function.** Decides which feeders to cut — see "Selection logic" below |
| `estimate_national_deficit(load_forecast, available_resources, time_step_minutes=30)` | Compares demand vs. supply, per time slot |
| `build_j1_program(deficit_per_slot, date)` | Turns the deficit list into a draft day-ahead schedule |
| `compute_kpi(region, period_start, period_end)` | Computes real energy-not-supplied and fairness stats from `execution_log` |
| `explain_selection(feeder_id)` | Structured (non-sentence) explanation of a feeder's selection factors — built for the chatbot/UI |

### Selection logic (`select_feeders`)

Feeders are filtered and scored using a weighted fairness formula:

```
Score = 0.45 × (priority / 5)
      + 0.25 × min(days_since_last_cut / 30, 1)
      + 0.20 × max(0, 1 - cuts_this_month / 5)
      - 0.10 × (load / max_load_in_group)
```

- **Priority never fully excludes any level** — lower-priority feeders can outscore higher-priority ones if they've gone a long time without being cut. This was a deliberate fix to prevent the same high-priority feeders from being cut every single day, forever.
- Feeders inside their cooldown window (default 4 hours, configurable) are skipped entirely.
- Feeders with `priority_level = 0` (critical infrastructure) are never selected.
- Every selected feeder is tagged with a 45-minute max duration and a human-readable reason string.

## Testing

Run `python functions.py` directly — it executes every function with 3+ test scenarios each, plus a full end-to-end chain test (national target → regions → BCCs → real feeders from the database).
