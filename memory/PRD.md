# EVYZ (evyzhealth) — PRD

## Original problem statement
Build EVYZ, an AI-assisted web app for specialist clinics monitoring patients between visits. Workflow: CSV import → patient timeline → personal baseline → sustained-change event → AI explanation → saved human review. Start with glucose from BIG IDEAs Dexcom CSV (multiple participants), import preview (columns, units, date range, accepted/rejected/duplicates), idempotent reimport, no invented timezones/values. Baseline: preceding 72 h, ≥48 h history, ≥70 % coverage, median ± max(3×1.4826×MAD, 20 mg/dL); events = same-direction runs ≥30 min, broken by return/direction change/gap >2× cadence; idempotent recompute preserving reviews, versioned evidence, outdated summaries. Server-side LLM brief with validated structured output, template fallback, caching. Views: overview, patient detail chart, event review. Clinical workspace design (off-white, navy, teal, amber). Extensible schema (HR, skin temp later). No diagnoses, no clinical-safety claims. Repo: https://github.com/Evode-Manirahari/evyzheallth (full statement in conversation).

## User choices
- LLM: Claude Opus 5.5 (claude-opus-5-5) via Emergent LLM key (configurable LLM_PROVIDER/LLM_MODEL)
- Sign-in: Emergent-managed (Clerk) email/password + Google; admin = admin@example.com; new users pending until approved
- No CSV attached; user will upload real Dexcom files later

## Architecture
FastAPI (server.py, importer.py, detector.py, brief.py, clerk_auth.py) + MongoDB (patients, measurements, evaluations, events, reviews, summaries, imports, import_staging[TTL 6h], settings, users) + React (Overview, Import, PatientDetail, EventReview, Settings, Team).

## Implemented (2026-10-24)
- CSV import w/ auto-detect + manual mapping, mmol/L conversion, unsupported-unit rejection, preview stats, deterministic IDs + unique index (no duplicates)
- Transparent MAD detector, stored per-reading evaluations, run grouping, evidence versioning, reviews preserved on recompute, configurable settings page
- AI brief: Claude, schema/ref/number/banned-language validation, labelled template fallback, cache per evidence version
- Overview (search, unreviewed filter, sort by newest unreviewed), chart (band, median, gaps, flags, event areas, date range), event review w/ persistent notes/status
- Role gate (admin/clinician/pending) + Team page
- Tested: testing agent iteration 1 (all features pass); fixes applied for remap validation, import double-click, settings race, review label, staging TTL

## 2026-10-24 (later) — real data
- User uploaded Dexcom_001.csv, HR_001.csv, TEMP_001.csv (stored in /app/data, git-ignored)
- Dexcom_001 imported as participant 001: 2561 readings, 0 rejected, 12 metadata/alert rows skipped (identity rows not stored), reimport 0 new, 1 gap (190 min), 2 events (16 Feb 21:08 55 min; 17 Feb 21:28 205 min, both above baseline)
- Tightened AI prompt after validator correctly rejected a brief mentioning "medication"; both briefs now valid AI output
- HR_001 (`datetime, hr`, M/D/YY H:MM, minute precision, many rows per minute) and TEMP_001 (`datetime, temp`, 4 Hz, 78 MB) NOT imported — out of current scope

## 2026-10-24 — HR + skin temperature context (participant 001)
- backend/wearables.py: streaming CSV parser (constant memory), explicit M/D/YY (YY→20YY) for HR, ISO sub-second for TEMP; one-minute mean/min/max/count with source line ranges; unit basis recorded (bpm; °C skin surface, not core)
- Collection measurement_aggregates (id = sha1(patient|metric|file SHA-256|minute)); import record per file SHA; identical-file reimport short-circuits
- Endpoints: GET /api/server-files, POST /api/server-files/import (files from SERVER_DATA_DIR only), GET /api/patients/{pid}/context/{metric}
- UI: aligned glucose/HR/temp charts (shared range, identical ticks, synced cursor, focused event interval, gap tooltips, sample counts), server-files panel on Import page
- Verified: HR 634,188 raw → 10,578 minutes, TEMP 2,537,040 raw → 10,580 minutes, 0 invalid, 7 gaps each; spot-checks exact; reimport 0 new; glucose events/AI briefs/reviews intact (testing iteration 2)

## 2026-10-25 — Increment hardening
- Units checked against official docs. TEMP °C is documented by Empatica (E4 data guide 2021) and not stated in the file. HR unit is UNVERIFIED: it is not stated in the file, in Empatica's HR.csv description or in PhysioNet v1.1.3 (doi 10.13026/aw6y-fc44). Provenance is shown in the UI.
- Overlap protection:
  - unique (patient, metric, source, minute);
  - identical summaries are skipped;
  - differing ones are flagged in aggregate_conflicts without overwriting;
  - re-importing the same file returns the original counts.
- Fixes: initial range race; "From later than To" toast; badge wrap; header email at 768px; README citation corrected.
- Testing iteration 3: all 10 targeted checks pass. Glucose events, summaries and reviews match the pre-change snapshot.

## 2026-10-25 — Demo freeze
- Final E2E (testing iteration 4) passed: patient 001 → event → cached AI brief → review save → refresh persists; the temporary review was restored exactly; DB matches the snapshot.
- UI labels "Glucose · change detection applied" and "Contextual wearable data · no change detection" added.
- README updated with setup, demo walkthrough and limitations.
- .gitignore now excludes test_reports, snapshots, test_credentials, data/, .env.
- GitHub push is done by the user via Save to GitHub (agent has no GitHub tool).

## 2026-10-25 — EEG calibration research module (separate namespace bci_iv_2a)
- /app/research/eeg_calibration: data.py, pipeline.py, run.py, README, requirements.lock.txt, results/*.json. Uses the venv at /root/evyz-research-venv (MNE 1.13.2, pyRiemann 0.12, sklearn 1.9.1).
- Data: BNCI 001-2014 .mat for all 18 files (in /app/data/bci_iv_2a, git-ignored). E labels match the official bbci.de true_labels.
- LOSO, MDM (A) vs MDM + Riemannian recentering (B):
  - mean accuracy 0.358 → 0.472, macro-F1 0.274 → 0.445;
  - regressions: A02, A07.

## 2026-10-25 — Personalization Lab page
- Code audit:
  - each source is recentered with its own T session only;
  - the target reference is target T only, without labels;
  - no target E data is used for fitting;
  - both pipelines score identical test trials (checked programmatically).
  - Disclosed: zero-phase filtering per E run, and expert artifact flags used for exclusion.
- GET /api/research/eeg-calibration (staff only) serves the results file named in RESEARCH_RESULTS_PATH; it returns 503 if unavailable. No DB writes.
- /lab page: means, 9 folds, selector with confusion matrices, regressions A02/A07, method notes. Testing iteration 5: all pass.

## 2026-10-25 — Demo handoff
- Lab: pp-rounding note + "Offline evaluation conditions" panel (zero-phase filtering, expert artifact exclusions, full-session calibration)
- README: "What runs from this export alone vs what needs more" table + Lab section + RESEARCH_RESULTS_PATH
- Clean export refreshed: /root/evyz-clean-export (1 commit 05a7414, 123 files), bundle + tar.gz in /app/exports and public download links (frontend/public/evyz-handoff-527ca1f8d348.*, git-ignored)

## 2026-10-25 — Online EEG personalization demo (/lab)
- research/eeg_calibration/demo_cli.py: prepare (per-session covariances with labels in separate files), status, calibrate (reference from T covs only; computed_now vs loaded), compare (trains A/B on the 8 source T sessions, predicts target E, loads labels only after for scoring; benchmark check ±1e-4; reference-unchanged check)
- Artifacts are in /app/data/bci_iv_2a/artifacts (git-ignored). pipeline.epochs gained return_ids (protocol unchanged).
- API: GET /api/research/demo/{pid}/status, POST …/calibrate?recompute, POST …/compare (subprocess in the research venv, one compare at a time, 429 if busy)
- UI: LiveDemo.jsx above the saved benchmark section
- All 9 participants match the benchmark with diff 0.0 (results/demo_equivalence_check.txt). Testing iteration 6 passed. Fixed afterwards: missing-artifacts crash, stale-response race, "No change" label, trial legend.

## 2026-10-25 — Demo handoff finalization
- Renamed to "Interactive EEG personalization demo" and added the note "Runs calibration and inference on prerecorded EEG processed offline." The existing limitations are still shown.
- README: new "Fresh installation" section covering both venvs, pinned versions, env vars, start commands, and which files the demo needs vs which files regenerate them. The research README has a new demo_cli section.
- Clean export updated: a new commit on top of d0f74cf, branch `update`. Prepared EEG artifacts, raw .mat files, the database, .env files and credentials are excluded.

## Backlog
- P1: real BIG IDEAs CSV import validation once user uploads; multi-file batch import
- P2: heart-rate / skin-temperature importers; export of reviewed events; GitHub push (via platform "Save to GitHub")
