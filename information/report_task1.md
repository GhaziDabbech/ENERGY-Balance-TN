# Data Model & Selection Rules

## 1. Data Model

The platform's data is stored in a local PostgreSQL database, run via Docker and Supabase (no cloud dependency, fully reproducible offline). The schema consists of 7 tables, organized around the real hierarchy of Tunisia's electrical grid management structure:

```
DN (national)
 └── CRC (regional: nord / sud)
       └── BCC (local control bureau, 7 total)
             └── Feeders (individual power lines)
```

| Table | Purpose |
|---|---|
| `zones` | Geographic areas (neighborhoods/delegations), each linked to one BCC |
| `bcc` | The 7 local control bureaus, each linked to a region (nord/sud) |
| `feeders` | Individual power lines ("départs MT"), each linked to a zone and a BCC, with a priority level (0–5) and average load |
| `program_schedule` | The planned cut schedule (what is intended to happen) |
| `execution_log` | The real, confirmed record of what happened (actual start/end time, actual MW shed) |
| `user_roles` | Login roles and their data-access scope |
| `kpi_snapshots` | Stored performance statistics over time |

**Design principle — separating plan from reality:** `program_schedule` and `execution_log` are deliberately kept as two separate tables. A cut can be planned but later cancelled, delayed, or shortened, so any statistic reported to citizens or used for grading fairness (KPIs) is calculated strictly from `execution_log`, never from `program_schedule`.

For testing and demonstration, the database is populated with a synthetic dataset: 7 BCC, 18 zones, and 45 feeders, spread realistically across both regions with varied priority levels and loads.

## 2. Allocation Logic

Before any individual feeder is selected, the national cut target is broken down in two stages:

1. **`split_regional_target(national_target_mw, ratio)`** — splits the national MW target between the North and South regions. The split ratio (default 66% North / 34% South) is a configurable parameter, not a hardcoded value, so it can be adjusted based on real operational policy.
2. **`allocate_to_bcc(crc_target_mw, bcc_list)`** — splits each region's target across its BCCs, proportional to each BCC's average load. A BCC that normally carries more load is assigned a proportionally larger share of the required cut.

## 3. Selection Rules (`select_feeders`)

This is the core decision function: given one BCC's MW target and its list of feeders, it decides exactly which feeders to cut. It applies the following rules, in order:

**Rule 1 — Hard exclusion.** Feeders with `priority_level = 0` (critical infrastructure, e.g. hospitals) are never selected under any circumstance.

**Rule 2 — Cooldown filter.** A feeder that was cut within the last N hours (default: 4, configurable) is excluded from this round, to prevent hitting the same area twice in quick succession.

**Rule 3 — Weighted fairness scoring.** Every remaining feeder is assigned a score:

```
Score = 0.45 × (priority_level / 5)
      + 0.25 × min(days_since_last_cut / 30, 1)
      + 0.20 × max(0, 1 - cuts_this_month / 5)
      - 0.10 × (avg_load_mw / max_load_in_group)
```

- **Priority (45%)** — the dominant factor in normal, day-to-day decisions.
- **Rotation (25%)** — a feeder's score increases the longer it has gone without being cut, capped at 30 days.
- **Anti-repetition (20%)** — a feeder that has already been cut many times this month receives a reduced score.
- **Load protection (−10%)** — the single largest feeder in the group receives a small penalty, discouraging the algorithm from repeatedly concentrating cuts on the highest-impact feeder.

Feeders are then ranked highest-score-first.

*Design rationale:* an earlier version of this function simply sorted by priority level alone. This produced a real fairness problem: if the highest-priority feeders in a BCC had enough combined capacity to meet the target on their own, they would be selected every single day, indefinitely, while lower-priority feeders were never touched — regardless of how long they went without a cut. The weighted formula corrects this: priority still governs the vast majority of day-to-day decisions, but no feeder's score can be permanently suppressed. Any feeder will eventually outrank even a high-priority one if it has gone significantly longer without being cut. This was directly verified in testing: a low-priority feeder that had never been cut correctly outranked a high-priority feeder that had been cut two days prior.

**Rule 4 — Target-based stopping.** Feeders are added to the selection list, highest-scoring first, until their combined `avg_load_mw` meets or exceeds the BCC's target. Selection then stops immediately — no more feeders than necessary are ever included.

**Rule 5 — Duration cap.** Every selected feeder is tagged with a maximum outage duration of 45 minutes.

**Rule 6 — Explainability.** Every selected feeder is tagged with a plain-language reason string (e.g. *"Priority 4, last cut 10 hours ago"*), generated automatically and reused by the admin chatbot's explainability feature.

## 4. Explainability

A parallel function, `explain_selection(feeder_id)`, returns the same underlying decision factors as structured data rather than a sentence — `priority_level`, `days_since_last_cut`, `load_weight`, and `cuts_this_month` — so that the admin chatbot and dashboard can query and display each factor individually (e.g. as a badge, a chart, or a natural-language explanation generated by the local LLM).

## 5. Known, Intentional Design Decisions

- **Cooldown duration (4 hours)** is not specified in the challenge brief; it was chosen as a reasonable operational default and made fully configurable rather than hardcoded.
- **A BCC without enough real feeders to reach its full target** is treated as a legitimate outcome, not an error: the system selects whatever is genuinely available and does not fabricate feeders that don't exist, surfacing the true capacity constraint instead of hiding it.
