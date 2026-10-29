# Product

<!-- impeccable:product-schema 1 -->

> Written from the user's explicit brief and the existing codebase. The Impeccable init interview was not run as a separate question round, because the brief already answered its questions. Inferred items are marked (inferred).

## Platform

web

## Users
Specialist clinic care teams (clinicians, reviewers) who check deidentified home and wearable data between visits. Hackathon judges evaluate the demo. (inferred: desktop first, also used on tablets and phones)

## Product Purpose
"EVYZ makes physiological change understandable: who changed, what changed, and what evidence supports review."
The core path:
1. CSV import.
2. Patient timeline.
3. Personal baseline.
4. Sustained-change event.
5. Evidence-grounded AI brief or labelled template.
6. Saved human review.

## Positioning
Each participant is compared with their own recent baseline, using transparent statistics. Changes for review come with their supporting readings. The AI brief may cite only that event's computed evidence.

## Operating Context
- Historical research data only: BIG IDEAs glucose, heart rate and skin temperature.
- Heart and temperature data are context only.
- Timestamps are shown as recorded, with no timezone.
- An isolated EEG Personalization Lab runs on BCI Competition IV 2a; it is a research demonstration.

## Capabilities and Constraints
- Not clinically validated, not a medical device, no HIPAA claim. Changes are not diagnoses.
- No risk scores, no invented patients and no clinical claims.
- The heart-rate unit is unverified.
- EEG work is calibration, not fine-tuning. It is offline, prerecorded processing.
- Backend contracts, algorithms, auth, data and benchmark files are fixed for the UI work.

## Evidence on Hand
- Participant 001 (real research data): 2 detected glucose events, AI briefs and reviews.
- Saved EEG benchmark results: `research/eeg_calibration/results/`.
- No testimonials, customers or outcome metrics exist. Do not fabricate them.

## Product Principles
1. Show who changed and what to do next before anything else.
2. Every claim sits next to its evidence and its caveat.
3. Report status in words and icons, never in colour alone.
4. Present regressions as visibly as improvements.
5. Keep research visibly separate from the clinic.

## Accessibility & Inclusion
- WCAG AA contrast.
- Visible keyboard focus.
- Respect reduced motion.
- Status is never conveyed by colour alone.
