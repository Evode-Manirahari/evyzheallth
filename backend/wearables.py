"""Server-side streaming importer for contextual wearable data (heart rate, skin temperature).
Aggregates raw rows into one-minute summaries. No thresholds or change detection are applied."""
import csv
import hashlib
import re
from datetime import datetime
from pathlib import Path

EMPATICA_DOC = ("Empatica, 'Decoding wearable sensor signals - what to expect from your E4 data' (vendor documentation, 20 Jul 2021)",
                "https://www.empatica.com/en-us/blog/decoding-wearable-sensor-signals-what-to-expect-from-your-e4-data/")
PHYSIONET_DOC = ("Cho, Kim, Bent & Dunn. BIG IDEAs Lab Glycemic Variability and Wearable Device Data, PhysioNet v1.1.3 (2026)",
                 "https://doi.org/10.13026/aw6y-fc44")

METRICS = {
    "heart_rate": {
        "prefix": "HR", "label": "Heart rate", "unit": "bpm", "value_col": "hr", "plausible": (20.0, 250.0),
        "source": "Empatica E4 wristband (BIG IDEAs export)",
        "unit_in_file": None,
        "unit_status": "unverified",
        "unit_note": "UNVERIFIED: neither the file header ('hr') nor the official documentation states a unit. 'bpm' is an assumption.",
        "documentation": [
            {"source": EMPATICA_DOC[0], "url": EMPATICA_DOC[1], "states": "HR.csv - This file contains the average heart rate values, computed in spans of 10 seconds (no unit stated)"},
            {"source": PHYSIONET_DOC[0], "url": PHYSIONET_DOC[1], "states": "PPG was sampled at 64 Hz, providing heart rate (HR) values every second (no unit stated)"},
        ],
        "timestamp_rule": "M/D/YY H:MM (minute precision); two-digit year YY interpreted as 20YY (20 → 2020). No seconds invented.",
    },
    "skin_temperature": {
        "prefix": "TEMP", "label": "Skin temperature", "unit": "°C", "value_col": "temp", "plausible": (10.0, 45.0),
        "source": "Empatica E4 wristband (BIG IDEAs export)",
        "unit_in_file": None,
        "unit_status": "documented",
        "unit_note": "Documented by the device vendor for E4 TEMP.csv (°C, 4 Hz). Not stated in this file's header ('temp'). PhysioNet notes the E4 output was reformatted for the dataset. Skin surface, not core body temperature.",
        "documentation": [
            {"source": EMPATICA_DOC[0], "url": EMPATICA_DOC[1], "states": "TEMP.csv - Data from temperature sensor expressed in degrees on the Celsius (°C) scale (sampled at 4 Hz)"},
            {"source": PHYSIONET_DOC[0], "url": PHYSIONET_DOC[1], "states": "EDA and skin temperature were sampled at 4 Hz (no unit stated)"},
        ],
        "timestamp_rule": "YYYY-MM-DD HH:MM:SS.fff (sub-second); grouped by minute.",
    },
}
UNIT_FIELDS = ("unit", "unit_in_file", "unit_status", "unit_note", "documentation")
FILE_RE = re.compile(r"^(HR|TEMP)_([A-Za-z0-9\-]+)\.csv$")
HR_TS = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{2}) (\d{1,2}):(\d{2})$")
ISO_TS = re.compile(r"^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d+)?$")


def metric_for_file(name: str):
    m = FILE_RE.match(name)
    if not m:
        return None, None
    return ("heart_rate" if m.group(1) == "HR" else "skin_temperature"), m.group(2)


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _minute(metric: str, raw: str, cache: dict):
    key = raw if metric == "heart_rate" else raw[:16]
    if key in cache:
        return cache[key]
    out = None
    if metric == "heart_rate":
        m = HR_TS.match(raw)
        if m:
            mo, d, yy, h, mi = map(int, m.groups())
            out = _valid(2000 + yy, mo, d, h, mi)
    else:
        m = ISO_TS.match(raw)
        if m:
            out = _valid(*map(int, m.groups()[:5]))
    cache[key] = out
    return out


def _valid(y, mo, d, h, mi):
    try:
        return datetime(y, mo, d, h, mi).isoformat()
    except ValueError:
        return None


def aggregate_file(path: Path, metric: str) -> dict:
    """Stream the CSV row by row (constant memory except per-minute buckets)."""
    spec = METRICS[metric]
    lo, hi = spec["plausible"]
    buckets, cache, reasons, samples = {}, {}, {}, []
    raw_rows = valid = 0
    first_raw = last_raw = None
    vmin, vmax = float("inf"), float("-inf")

    def reject(line, reason, row):
        reasons[reason] = reasons.get(reason, 0) + 1
        if len(samples) < 20:
            samples.append({"line": line, "reason": reason, "raw": ",".join(row)[:120]})

    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        header = [c.strip().lower() for c in next(reader, [])]
        if header != ["datetime", spec["value_col"]]:
            raise ValueError(f"Unexpected header {header}; expected ['datetime', '{spec['value_col']}']")
        for row in reader:
            line = reader.line_num
            if not row or not any(c.strip() for c in row):
                continue
            raw_rows += 1
            if len(row) != 2:
                reject(line, "Malformed row", row)
                continue
            ts_raw, v_raw = row[0].strip(), row[1].strip()
            minute = _minute(metric, ts_raw, cache)
            if minute is None:
                reject(line, "Unrecognized timestamp", row)
                continue
            if not v_raw:
                reject(line, "Missing value", row)
                continue
            try:
                v = float(v_raw)
            except ValueError:
                reject(line, "Non-numeric value", row)
                continue
            if not (lo <= v <= hi):
                reject(line, f"Outside plausible range {lo:g}–{hi:g} {spec['unit']}", row)
                continue
            valid += 1
            first_raw = first_raw or ts_raw
            last_raw = ts_raw
            vmin, vmax = min(vmin, v), max(vmax, v)
            b = buckets.get(minute)
            if b is None:
                buckets[minute] = [v, v, v, 1, [[line, line]]]
            else:
                b[0] += v
                b[1] = min(b[1], v)
                b[2] = max(b[2], v)
                b[3] += 1
                if b[4][-1][1] == line - 1:
                    b[4][-1][1] = line
                else:
                    b[4].append([line, line])

    aggs = [{"ts": k, "mean": round(b[0] / b[3], 3), "min": b[1], "max": b[2], "count": b[3], "source_line_ranges": b[4]}
            for k, b in sorted(buckets.items())]
    return {
        "metric": metric, "label": spec["label"], **{k: spec[k] for k in UNIT_FIELDS}, "source": spec["source"],
        "plausibility_check": f"Rows outside {lo:g}–{hi:g} rejected (data validation only, not unit verification)",
        "timestamp_rule": spec["timestamp_rule"], "timezone": "Not specified in source — kept as recorded",
        "raw_rows": raw_rows, "valid_rows": valid, "invalid_rows": sum(reasons.values()), "invalid_reasons": reasons,
        "invalid_samples": samples, "first_raw_timestamp": first_raw, "last_raw_timestamp": last_raw,
        "observed_value_range": [vmin, vmax] if valid else None, "aggregates": aggs,
    }


def minute_gaps(aggs: list, max_step_minutes: float = 2.0):
    out = []
    for a, b in zip(aggs, aggs[1:]):
        d = (datetime.fromisoformat(b["ts"]) - datetime.fromisoformat(a["ts"])).total_seconds() / 60
        if d > max_step_minutes:
            out.append({"start": a["ts"], "end": b["ts"], "minutes": round(d, 1)})
    return out
