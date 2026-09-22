# Task 1 Summary — Data Model & Allocation Engine

## What this delivers

A working, tested decision engine for the load-shedding platform: a real local database with realistic synthetic data, and 7 core functions that take a national MW cut target all the way down to a list of specific feeders to cut, with a documented reason for each one.

## Database

Built and running locally via Docker + Supabase (no cloud account). All 7 tables required by the master spec are created (`zones`, `bcc`, `feeders`, `program_schedule`, `execution_log`, `user_roles`, `kpi_snapshots`), with exact column names as agreed with the team.

Synthetic test data currently loaded: **7 BCC, 18 zones, 45 feeders**, spread across the 2 regions (nord/sud), with varied priority levels (0–5) and loads.

## Selection logic

The most important piece is `select_feeders()`, which decides which feeders to cut for a given BCC target. It applies, in order:

1. **Hard exclusion** — priority 0 feeders (critical infrastructure, e.g. hospitals) are never selected, no exceptions.
2. **Cooldown filter** — a feeder cut within the last 4 hours (configurable) is skipped, so the same feeder isn't hit twice in quick succession.
3. **Weighted fairness scoring** — remaining feeders are ranked using:
   - 45% priority level
   - 25% how long since it was last cut (rotation)
   - 20% how many times it's been cut this month (anti-repetition)
   - −10% penalty for the largest feeders (load protection)
4. **Target-based stopping** — feeders are added to the plan until the target MW is met, then selection stops.
5. Every selected feeder is tagged with a 45-minute max duration and a plain-language reason (e.g. *"Priority 4, last cut 10 hours ago"*).

**Why the weighted formula matters:** an earlier version simply sorted by priority first, which meant the same high-priority feeders could theoretically be selected every single day, forever, while lower-priority feeders were never touched. The weighted formula fixes this — priority still dominates short-term decisions, but any feeder's score rises the longer it goes untouched, guaranteeing it eventually re-enters rotation regardless of its priority level. This was verified with a dedicated test: a lower-priority, never-cut feeder correctly outranked a higher-priority feeder that had just been cut recently.

## Other functions delivered

- `split_regional_target()` / `allocate_to_bcc()` — split a national target down to region, then BCC level, proportional to normal load.
- `estimate_national_deficit()` / `build_j1_program()` — compare forecasted demand vs. available supply per time slot, and turn shortfalls into a draft day-ahead plan.
- `compute_kpi()` — calculates real energy-not-supplied (MWh) and a fairness index (based on how evenly cuts are spread across zones), computed strictly from real execution history, never from the plan.
- `explain_selection()` — a structured version of the selection reasoning (priority, days since last cut, load share, cuts this month), designed for the admin chatbot and explainability features.

## Testing

Every function has 3+ tested scenarios (normal case, edge case, and at least one using real database data). A full end-to-end test confirms the entire chain works together: a single national MW target correctly flows through both regions, all 7 BCCs, and produces a real, explainable feeder-level cut plan.

## Known, intentional design decisions

- **Cooldown duration (4 hours)** is not specified in the master brief, so it was chosen as a reasonable default and made fully configurable — not hardcoded — so it can be tuned later based on real operational policy.
- **A BCC with too few real feeders to reach its target** (seen with `BCC_Medenine` in testing) is expected, correct behavior: the function returns whatever it can select and does not invent feeders that don't exist.

## What's needed from other tasks

- `execution_log` is currently empty, since no cuts have actually been executed yet — `compute_kpi()` is fully built and tested, but will only show non-zero results once the system has run for real (Task 2/Task 5 integration).
