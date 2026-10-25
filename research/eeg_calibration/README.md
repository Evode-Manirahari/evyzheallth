# EVYZ research: cross-participant EEG calibration (BCI Competition IV 2a)

This is an isolated research module. It does not share code, a database or participant IDs with the clinic app. Its namespace is `bci_iv_2a/A01..A09`. Results are classification research on motor-imagery EEG only. They make no claim of clinical validation, health outcomes or alert reduction, and they are not linked to wearable-event detection.

## Data
- **Source:** BNCI Horizon 2020 data set 001-2014, the official re-release of BCI Competition IV 2a (Graz). Licensed CC BY-ND 4.0. Cite Tangermann et al. 2012, doi:10.3389/fnins.2012.00055 and Brunner et al., "BCI Competition 2008 – Graz data set A".
- **Labels cross-checked:** evaluation-session labels are checked against the official `true_labels.zip` from bbci.de/competition/iv. All 18 files match.
- **Raw files:** these live in `$EVYZ_BCI2A_DIR` (default `/app/data/bci_iv_2a`, git-ignored). They are never committed.

## Setup
```
python3 -m venv ~/evyz-research-venv && ~/evyz-research-venv/bin/pip install -r requirements.lock.txt
# download A01T.mat..A09E.mat from https://bnci-horizon-2020.eu/database/data-sets (001-2014) into $EVYZ_BCI2A_DIR
# optional label check: unzip https://www.bbci.de/competition/iv/results/ds2a/true_labels.zip into $EVYZ_BCI2A_DIR/true_labels
python run.py inspect      # schema report -> results/inspection.json
python run.py fold A01     # single held-out participant
python run.py all          # leave-one-participant-out, all 9
```

## Protocol
All settings are fixed a priori and recorded in each results JSON under `settings`. Nothing is tuned on any target participant.
- **Preprocessing:**
  - Signals: the 22 EEG channels only; EOG is excluded, as the official rules require.
  - Filter: 8–30 Hz, 4th-order Butterworth, zero-phase, applied per run.
  - Epochs: 0.5–2.5 s after cue onset (cue is at t = 2 s of each trial).
  - Covariance: OAS estimator.
  - Exclusions: trials flagged as artifacts by experts are excluded in both sessions. Counts are in `epoch_counts`.
- **Splits:** leave one participant out.
  - Sources are the 8 other participants' **training (T)** sessions, labelled.
  - The target's T session is **calibration data**: unlabelled, used only to estimate its Riemannian reference mean.
  - The target's **evaluation (E)** session is used only for final scoring.
- **Pipeline A:** a single shared `MDM(metric='riemann')` trained on the pooled source covariances, with no alignment.
- **Pipeline B:** the same MDM, with participant-specific Riemannian recentering, C ↦ M^{-1/2} C M^{-1/2}.
  - For each source, M is the Riemannian mean of its own T covariances.
  - For the target, M comes from its T calibration covariances, and the E test covariances are recentered with that M.
  - Target calibration labels are never read.
- **Reproducibility:** seed 0 is recorded; MDM itself is deterministic. Library versions are recorded in every results JSON.

This is calibration (unsupervised reference estimation), not fine-tuning. No classifier parameters are refit on target data.
