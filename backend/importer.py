"""CSV glucose importer: header detection, column mapping, unit handling, row validation."""
import csv
import hashlib
import io
import re
from datetime import datetime
from typing import Optional

MGDL_PER_MMOL = 18.0182
SUPPORTED_UNITS = {"mg/dl": "mg/dL", "mmol/l": "mmol/L"}
MIN_MGDL, MAX_MGDL = 10.0, 1000.0


def measurement_id(patient_id: str, metric: str, ts: str) -> str:
    return hashlib.sha1(f"{patient_id}|{metric}|{ts}".encode()).hexdigest()[:20]


def suggest_participant(filename: str) -> Optional[str]:
    m = re.search(r"(\d{3,})", filename.rsplit("/", 1)[-1])
    return m.group(1) if m else None


def unit_from_header(name: str):
    m = re.search(r"\(([^)]+)\)", name or "")
    if not m:
        return None, None
    raw = m.group(1).strip()
    return raw, SUPPORTED_UNITS.get(raw.lower().replace(" ", ""))


def parse_ts(raw: str):
    s = raw.strip()
    if not re.match(r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}", s):
        return None, None
    try:
        dt = datetime.fromisoformat(s.replace(" ", "T").replace("Z", "+00:00"))
    except ValueError:
        return None, None
    offset = None
    if dt.tzinfo is not None:
        offset = dt.strftime("%z")
        dt = dt.replace(tzinfo=None)
    return dt.replace(microsecond=0).isoformat(), offset


def _find(cols, *needles):
    for i, c in enumerate(cols):
        lc = c.lower()
        if any(n in lc for n in needles):
            return i
    return None


def detect_header(rows):
    for idx, row in enumerate(rows[:50]):
        if _find(row, "timestamp", "date", "time") is not None and _find(row, "glucose") is not None:
            return idx
    return None


def auto_mapping(rows):
    idx = detect_header(rows)
    if idx is None:
        return None
    cols = rows[idx]
    value_col = _find(cols, "glucose value") if _find(cols, "glucose value") is not None else _find(cols, "glucose")
    event_col = _find(cols, "event type")
    raw_unit, unit = unit_from_header(cols[value_col])
    return {
        "header_row": idx,
        "timestamp_col": cols[_find(cols, "timestamp", "date", "time")],
        "value_col": cols[value_col],
        "unit": unit,
        "unit_in_header": raw_unit,
        "event_type_col": cols[event_col] if event_col is not None else None,
        "event_type_value": "EGV" if event_col is not None else None,
        "source_col": cols[_find(cols, "source device", "device info")] if _find(cols, "source device", "device info") is not None else None,
    }


def parse_csv(text: str, mapping: Optional[dict]):
    """Return a preview dict. readings contain only accepted rows."""
    rows = list(csv.reader(io.StringIO(text)))
    auto = auto_mapping(rows)
    m = {**(auto or {}), **{k: v for k, v in (mapping or {}).items() if v not in (None, "")}}
    header_row = int(m.get("header_row", 0)) if rows else 0
    columns = rows[header_row] if rows and header_row < len(rows) else []
    base = {"columns": columns, "mapping": m, "auto_detected": auto is not None, "total_rows": max(len(rows) - header_row - 1, 0)}

    problems = []
    if not rows:
        problems.append("The file is empty.")
    for key in ("timestamp_col", "value_col"):
        if not m.get(key) or m.get(key) not in columns:
            problems.append(f"Choose the {'timestamp' if key == 'timestamp_col' else 'glucose value'} column.")
    if m.get("unit_in_header") and m.get("unit") is None:
        problems.append(f"Unsupported unit '{m['unit_in_header']}'. Supported: mg/dL, mmol/L.")
    if m.get("unit") not in ("mg/dL", "mmol/L"):
        problems.append("Confirm the glucose unit (mg/dL or mmol/L). The unit was not found in the column header.")
    if problems:
        return {**base, "needs_mapping": True, "problems": list(dict.fromkeys(problems)), "readings": []}

    ts_i, v_i = columns.index(m["timestamp_col"]), columns.index(m["value_col"])
    ev_i = columns.index(m["event_type_col"]) if m.get("event_type_col") in columns else None
    src_i = columns.index(m["source_col"]) if m.get("source_col") in columns else None
    factor = MGDL_PER_MMOL if m["unit"] == "mmol/L" else 1.0

    readings, rejected, reason_counts, skipped_types = [], [], {}, {}
    seen, dup_in_file, offsets = set(), 0, set()

    def reject(line, reason, raw):
        reason_counts[reason] = reason_counts.get(reason, 0) + 1
        if len(rejected) < 25:
            rejected.append({"line": line, "reason": reason, "raw": raw[:160]})

    for n, row in enumerate(rows[header_row + 1:], start=header_row + 2):
        if not any(c.strip() for c in row):
            continue
        raw_line = ",".join(row)
        if ev_i is not None and m.get("event_type_value"):
            et = row[ev_i].strip() if ev_i < len(row) else ""
            if et != m["event_type_value"]:
                label = et or "(blank)"
                skipped_types[label] = skipped_types.get(label, 0) + 1
                continue
        if max(ts_i, v_i) >= len(row):
            reject(n, "Malformed row (missing columns)", raw_line)
            continue
        ts, off = parse_ts(row[ts_i]) if row[ts_i].strip() else (None, None)
        if not row[ts_i].strip():
            reject(n, "Missing timestamp", raw_line)
            continue
        if ts is None:
            reject(n, "Unrecognized timestamp (expected ISO 8601 date and time)", raw_line)
            continue
        raw_v = row[v_i].strip()
        if not raw_v:
            reject(n, "Missing measurement (kept as a gap)", raw_line)
            continue
        try:
            v = float(raw_v)
        except ValueError:
            reject(n, f"Non-numeric value '{raw_v[:20]}'", raw_line)
            continue
        mgdl = round(v * factor, 1)
        if not (MIN_MGDL <= mgdl <= MAX_MGDL):
            reject(n, "Value outside plausible range (10–1000 mg/dL)", raw_line)
            continue
        if ts in seen:
            dup_in_file += 1
            continue
        seen.add(ts)
        if off:
            offsets.add(off)
        readings.append({
            "ts": ts, "tz_offset": off, "value": mgdl, "original_value": v, "original_unit": m["unit"],
            "source": (row[src_i].strip() if src_i is not None and src_i < len(row) and row[src_i].strip() else "CSV import"),
            "line": n,
        })

    readings.sort(key=lambda r: r["ts"])
    return {
        **base,
        "needs_mapping": False,
        "problems": [],
        "unit": m["unit"],
        "converted_to": "mg/dL",
        "conversion": f"× {MGDL_PER_MMOL}" if factor != 1.0 else "none",
        "timezone": f"Offsets in source: {', '.join(sorted(offsets))}" if offsets else "Not specified in source — timestamps kept as recorded (device local time)",
        "date_range": {"start": readings[0]["ts"], "end": readings[-1]["ts"]} if readings else None,
        "accepted": len(readings),
        "rejected": sum(reason_counts.values()),
        "rejected_reasons": reason_counts,
        "rejected_samples": rejected,
        "skipped_non_reading_rows": skipped_types,
        "duplicates_in_file": dup_in_file,
        "readings": readings,
    }
