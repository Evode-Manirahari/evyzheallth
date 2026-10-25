# EVYZ — between-visit monitoring for specialist clinics (hackathon MVP, project: evyzhealth)

EVYZ turns imported home glucose readings into patient timelines. It compares each new reading with that patient's own recent history, groups sustained changes into **changes for review**, and gives care teams an evidence-grounded brief of what changed. Reviewers then save a note and a review status.

> Demonstration software. It is not clinically validated, not a medical device, and makes no HIPAA-compliance claim. Detected changes are not diagnoses. If no change is detected, that does not mean a patient is clinically safe.

## Workflow
CSV import → patient timeline → personal baseline → sustained-change event → AI brief → saved human review.

## Stack
FastAPI + MongoDB (backend) and React + Recharts + shadcn/ui (frontend). Sign-in uses Emergent-managed auth (email/password or Google). New accounts stay **pending** until an admin approves them. Admins are set with `ADMIN_EMAIL`.

## Import
- Upload one participant's CSV. The BIG IDEAs Dexcom layout is detected automatically: the header row has `Timestamp (YYYY-MM-DDThh:mm:ss)` and `Glucose Value (mg/dL)`, and only `Event Type = EGV` rows are kept. Metadata rows are skipped and counted. For other files you can map the columns manually.
- The participant ID is suggested from the filename (`Dexcom_001.csv` → `001`) and you confirm it before import. The ID is stored as a string, so leading zeros stay.
- The preview shows: detected columns, the unit and any conversion, the date range, accepted and rejected rows with reasons, duplicates within the file, and readings already stored.
- Units are read from the header. mg/dL is stored as-is. mmol/L is converted (× 18.0182). Other units are rejected.
- Timestamps are kept exactly as recorded. No timezone is assigned.
- Missing values stay missing and show up as gaps.
- Measurement IDs are deterministic: `sha1(patient|metric|timestamp)`. A unique index means reimporting a file never duplicates readings.

## Change detection (`backend/detector.py`, no AI)
Defaults are unvalidated and can be changed on the **Detector** page:
- Each reading is compared with the preceding 72 h of the same participant's readings. The current reading and all later ones are excluded.
- A baseline needs ≥ 48 h of prior history and ≥ 70 % of the readings expected in the available window. The expected cadence is the median interval between source readings. Without this, the reading is marked **Insufficient history**.
- Band = median ± max(3 × 1.4826 × MAD, 20 mg/dL).
- An event is a run of consecutive flagged readings in the same direction that spans ≥ 30 min. A run ends when readings return inside the band, change direction, or a gap exceeds 2× the cadence.
- Each reading's evaluation (median, MAD, band, coverage, window) is stored. Each event stores its baseline and observed statistics, supporting measurement IDs, the detector settings and the detector version.
- Recomputation is idempotent:
  - Event IDs come from participant + start time + direction.
  - Reviews are stored separately and kept.
  - When an event's evidence changes, its `evidence_version` goes up and older summaries are marked outdated.

## AI brief (`backend/brief.py`)
- Generated on the server, on demand, when an event is opened. Model: Claude (`LLM_MODEL`, default `claude-opus-5-5`) via the Emergent LLM key.
- Only that event's computed statistics and supporting readings are sent. Uploaded text is treated as data.
- The output must be JSON: what changed, timing, baseline comparison, data gaps, evidence refs and limitations. It is validated in four ways:
  - schema;
  - evidence reference IDs must come from the supplied evidence;
  - every number must appear in the evidence;
  - no diagnostic, causal, treatment or urgency language.
- If validation fails, the API fails or no key is set, a deterministic **Template summary** is shown and labelled as such.
- Results are cached per event and evidence version. A failed brief never blocks charts, events or reviews.

## Setup
You need Python 3.11, Node 18+ with yarn, and MongoDB.

Backend `.env`:
- required: `MONGO_URL`, `DB_NAME`, `EMERGENT_LLM_KEY`, `SERVER_DATA_DIR` (a folder outside Git holding `HR_<id>.csv` / `TEMP_<id>.csv`) and `RESEARCH_RESULTS_PATH` (e.g. `/path/to/research/eeg_calibration/results/loso_all.json`);
- optional: `LLM_PROVIDER` / `LLM_MODEL`;
- `ADMIN_EMAIL` (comma-separated first admins);
- the Clerk keys, which the Emergent platform provisions.

Frontend `.env`: `REACT_APP_BACKEND_URL`. None of these files are committed.

```
pip install -r backend/requirements.txt
uvicorn server:app --app-dir backend --host 0.0.0.0 --port 8001
cd frontend && yarn install && yarn start
```

Load the data:
1. Sign in with the `ADMIN_EMAIL` account.
2. Go to **Import** and upload `Dexcom_<id>.csv`.
3. Place `HR_<id>.csv` / `TEMP_<id>.csv` in `SERVER_DATA_DIR` and use **Files already on the server**.

The synthetic test fixture (`backend/tests/fixtures/SYNTHETIC_Dexcom_900.csv`, from `make_synthetic_fixture.py`) is **not real data**. It is labelled "Synthetic test fixture" in the app.

## What runs from this export alone vs what needs more

| Component | Runs from the export | Needs separately |
|---|---|---|
| Clinic app code (FastAPI + React) | Yes, after `pip install` / `yarn install` | MongoDB; the auth keys (Clerk publishable + secret; Emergent provisions these, self-hosting needs your own Clerk app); `ADMIN_EMAIL` |
| Glucose import, baseline, events, reviews | Yes, with the synthetic fixture | Real Dexcom CSVs from PhysioNet BIG IDEAs (not included) |
| Heart-rate / skin-temperature context | Code only | `HR_<id>.csv` / `TEMP_<id>.csv` from PhysioNet, placed in `SERVER_DATA_DIR` |
| AI event briefs | Template fallback always works | `EMERGENT_LLM_KEY` (Emergent Universal Key) for Claude briefs |
| Personalization Lab page | Yes: the saved results (`research/eeg_calibration/results/*.json`) are included | Sign-in (above), with `RESEARCH_RESULTS_PATH` pointing at `loso_all.json` |
| Re-running the EEG experiment | Code + `requirements.lock.txt` | The 18 BNCI 001-2014 `.mat` files (about 780 MB) and the optional official `true_labels.zip`; see `research/eeg_calibration/README.md` |

Not included: clinic database contents (participant 001's imported readings, events, AI briefs, reviews), raw recordings, `.env` files, credentials and test reports.

## Personalization Lab (exploratory EEG benchmark)
The `/lab` page reads `RESEARCH_RESULTS_PATH` through `GET /api/research/eeg-calibration` (sign-in required, read-only, no database).
- Comparison: a minimum-distance-to-mean classifier with no alignment versus the same classifier with participant-specific Riemannian recentering.
- Evaluation: leave one participant out, on BCI IV 2a.
- Offline conditions:
  - zero-phase filtering over complete runs;
  - expert artifact exclusions;
  - each held-out participant's full training session needed for calibration.
- Percentage-point changes use unrounded values.

This is calibration, not fine-tuning, with no clinical validation and no significance testing. It is not linked to the clinic data.

## Demo walkthrough (participant 001)
1. **Patients**: 001 is listed with its latest glucose, coverage and unreviewed changes. The list is sorted by newest unreviewed change; there is no risk ranking.
2. **Participant 001**: the glucose chart shows the personal baseline band, readings outside the band, changes for review and missing-data gaps.
   - The heart-rate and skin-temperature charts below share the same date range and are labelled context only.
   - Heart rate shows "bpm, unverified".
3. Click a change in the list. All charts focus on that interval. Then click **Open review & AI brief**.
4. **Event review**: the AI brief (or a labelled template fallback), baseline vs observed statistics, supporting readings and the detector settings.
5. Add a note, mark **Reviewed**, save, then refresh. The review persists.

## Current limitations
- **Data:** historical, deidentified research data only (BIG IDEAs, PhysioNet). Timestamps have no timezone. No live wearable or EHR connection.
- **Detection:** the rules (72 h median/MAD baseline, 30-min runs) are unvalidated demonstration settings. They are not clinical criteria. A participant without detected changes is not "safe".
- **Heart-rate unit:** UNVERIFIED. bpm is assumed because no unit is stated in the file or the official documentation. Skin temperature °C is documented by the vendor but not stated in the file.
- **Overlapping imports:** conflicting summaries are flagged and kept out of the charts, but there is **no conflict-resolution screen** yet.
- **Other:**
  - browser uploads are limited to 15 MB and one participant per file;
  - AI briefs are glucose-only and depend on the Emergent LLM key; a template is used otherwise;
  - not a medical device, no HIPAA claim.

## Dataset attribution
BIG IDEAs Lab Glycemic Variability and Wearable Device Data (PhysioNet): Cho, P., Kim, J., Bent, B., & Dunn, J. Version 1.1.3 (2026), https://doi.org/10.13026/aw6y-fc44 (v1.1.2: https://doi.org/10.13026/zthx-5212). Please follow the PhysioNet license terms. Raw CSVs and ZIPs are git-ignored and must not be committed. Imported records are labelled "Historical research data".

## Contextual heart rate and skin temperature (`backend/wearables.py`)
`HR_<id>.csv` and `TEMP_<id>.csv` files placed in `SERVER_DATA_DIR` (git-ignored `/app/data`) are processed on the server from the Import page.
- They are streamed row by row and summarised per minute: mean, min, max, sample count and the source line ranges.
- HR timestamps use M/D/YY H:MM, with YY read as 20YY. No seconds are invented.
- These measurements are context only. No thresholds or change detection are applied, and they are never used in AI briefs.
- Units:
  - Skin temperature °C is documented by Empatica for E4 TEMP.csv ("expressed in degrees on the Celsius (°C) scale, sampled at 4 Hz", Empatica E4 data guide, 2021). It is not stated in the file.
  - Heart rate has no unit in the file, in Empatica's HR.csv description ("average heart rate values, computed in spans of 10 seconds") or in PhysioNet. It is labelled **bpm (unverified)**.
- PhysioNet describes the columns as `Timestamp`/`Value`, but the delivered files use `datetime, hr` and `datetime, temp`.
- Overlap protection: summaries are unique per participant + metric + source + minute.
  - An identical overlapping summary is skipped.
  - A differing one is stored in `aggregate_conflicts` for review. Stored data is never overwritten or double-counted.

## Not included
Live wearable connections, EHR integration, billing, patient messaging, autonomous actions, heart-rate and skin-temperature importers. The measurement schema (`metric`, `unit`) is already built to take those metrics later.
