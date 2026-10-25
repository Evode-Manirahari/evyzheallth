// Timestamps are stored as recorded (no timezone). We treat them as wall-clock values and format with UTC getters
// so the browser's timezone never shifts them.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => String(n).padStart(2, "0");

export const toMs = (ts) => Date.parse(ts + "Z");

export function fmtMs(ms, withYear = true) {
  if (ms == null || Number.isNaN(ms)) return "—";
  const d = new Date(ms);
  const date = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${withYear ? ` ${d.getUTCFullYear()}` : ""}`;
  return `${date}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export const fmtTs = (ts, withYear = true) => (ts ? fmtMs(toMs(ts), withYear) : "—");

export function fmtDur(min) {
  if (min == null) return "—";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const msToInput = (ms) => new Date(ms).toISOString().slice(0, 16);

// Identical tick positions for every aligned chart.
export const makeTicks = (range, n = 7) => Array.from({ length: n }, (_, i) => Math.round(range[0] + ((range[1] - range[0]) * i) / (n - 1)));
export const inputToMs = (s) => Date.parse(s + ":00Z");

export const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);

export const DIRECTION = {
  above_baseline: "Above personal baseline",
  below_baseline: "Below personal baseline",
};

export const END_REASON = {
  returned_to_band: "Ended — returned inside band",
  direction_change: "Ended — direction changed",
  data_gap: "Ended — data gap",
  insufficient_history: "Ended — baseline unavailable",
  ongoing_at_end_of_data: "Not ended — still outside band at end of data",
};

export const SETTING_LABELS = {
  baseline_hours: ["Baseline window", "hours of preceding readings"],
  min_history_hours: ["Minimum prior history", "hours"],
  min_coverage: ["Minimum baseline coverage", "fraction of expected readings"],
  mad_multiplier: ["MAD multiplier", "× scaled MAD"],
  mad_scale: ["MAD scale factor", "normal-consistency constant"],
  min_band_mgdl: ["Minimum band half-width", "mg/dL"],
  min_event_minutes: ["Minimum sustained duration", "minutes"],
  gap_factor: ["Gap threshold", "× expected cadence"],
};
