# EVYZ

**EVYZ helps specialist clinics see what changed between patient visits.**

Patients collect health data at home through measurements such as glucose, heart rate, and skin temperature. EVYZ brings these measurements into one timeline, compares them with each person’s recent history, and highlights changes that persist.

For each change, the care team can see what happened, read a short AI summary linked to the supporting data, and record their review.

Our prototype shows glucose, heart rate, and skin temperature, with change detection currently focused on glucose.

**Our goal is to help care teams spend less time sorting through health data and more time reviewing changes that deserve attention.**

## Demo

[Open the EVYZ preview](https://evyz-clinic.preview.emergentagent.com) · [Explore the EEG Lab](https://evyz-clinic.preview.emergentagent.com/lab)

Sign-in is required; new accounts need admin approval.

## What works today

- Patient timelines with glucose, heart rate, and skin temperature.
- Glucose changes compared with each person's recent history.
- AI summaries linked to supporting data, with a labelled template fallback.
- Saved review notes and status.
- A separate EEG research demo comparing predictions before and after personal calibration.

## Documentation

See the [technical guide](docs/technical-guide.md) for setup, data imports, detection rules, AI summaries, EEG methods, and the demo walkthrough. Running locally requires Python, Node/yarn, MongoDB, authentication configuration, and separately downloaded research data.

## Prototype limitations

EVYZ currently uses historical research data, with no live wearable or EHR connection. Glucose detection is experimental; heart rate and skin temperature provide context only. The EEG demo uses prerecorded data processed offline and is separate from clinic change detection.

This prototype is not clinically validated. Changes are for human review, not diagnoses; no detected change does not establish clinical safety.

## Data sources

- [BIG IDEAs Lab Glycemic Variability and Wearable Device Data](https://doi.org/10.13026/aw6y-fc44), PhysioNet.
- [BNCI 001-2014 / BCI Competition IV 2a](https://bnci-horizon-2020.eu/database/data-sets), EEG research.

See the [technical guide](docs/technical-guide.md#dataset-attribution) for attribution and data-handling details.
