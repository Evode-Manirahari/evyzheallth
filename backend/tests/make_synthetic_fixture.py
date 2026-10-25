"""Generates a clearly labelled SYNTHETIC Dexcom-style CSV for testing. Not real patient data."""
import random
from datetime import datetime, timedelta
from pathlib import Path

HEADER = ["Index", "Timestamp (YYYY-MM-DDThh:mm:ss)", "Event Type", "Event Subtype", "Patient Info", "Device Info",
          "Source Device ID", "Glucose Value (mg/dL)", "Insulin Value (u)", "Carb Value (grams)", "Duration (hh:mm:ss)",
          "Glucose Rate of Change (mg/dL/min)", "Transmitter Time (Long Integer)"]


def main():
    rng = random.Random(42)
    rows = [HEADER,
            ["1", "", "FirstName", "", "SYNTHETIC", "", "", "", "", "", "", "", ""],
            ["2", "", "LastName", "", "FIXTURE", "", "", "", "", "", "", "", ""],
            ["3", "", "Device", "", "", "SYNTHETIC G6", "", "", "", "", "", "", ""]]
    start = datetime(2030, 1, 1, 0, 0, 0)
    t, idx = start, 4
    end = start + timedelta(days=4)
    while t < end:
        h = (t - start).total_seconds() / 3600
        v = 110 + rng.gauss(0, 4)
        if 80 <= h < 81.5:       # sustained rise (90 min) -> one event
            v += 90
        if abs(h - 70) < 0.01:   # isolated single spike -> no event
            v += 120
        if 86 <= h < 86.5:       # 30-min rise interrupted by a gap -> no event
            v += 90
        skip = 86.25 <= h < 87.5  # data gap
        if not skip:
            val = f"{v:.0f}"
            if abs(h - 60) < 0.01:
                val = "Low"
            if abs(h - 61) < 0.01:
                val = ""
            rows.append([str(idx), t.strftime("%Y-%m-%d %H:%M:%S"), "EGV", "", "", "", "SYNTHETIC", val, "", "", "", "", ""])
            idx += 1
        t += timedelta(minutes=5)
    rows.append(rows[-1][:])  # duplicate row inside file
    out = Path(__file__).parent / "fixtures" / "SYNTHETIC_Dexcom_900.csv"
    out.parent.mkdir(exist_ok=True)
    out.write_text("\n".join(",".join(r) for r in rows) + "\n")
    print(out)


if __name__ == "__main__":
    main()
