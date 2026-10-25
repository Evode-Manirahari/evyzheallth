import { motion } from "framer-motion";

export const EASE = [0.23, 1, 0.32, 1];

export const EvyzMark = ({ className = "h-7 w-7" }) => (
  <svg viewBox="0 0 28 28" className={className} aria-hidden>
    <rect x="0.5" y="0.5" width="27" height="27" rx="6" fill="var(--ink)" />
    <rect x="5" y="11" width="18" height="6" rx="1" fill="var(--teal)" opacity="0.55" />
    <path d="M5 14h6.5l2-5 2.5 10 1.5-3H23" fill="none" stroke="var(--surface)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="16" cy="19" r="1.6" fill="var(--amber-line)" />
  </svg>
);

export const SectionRule = ({ index, label, meta, testid }) => (
  <div className="mg-rule" data-testid={testid}>
    <span className="mg-index">{index}</span>
    <span className="mg-label">{label}</span>
    <span className="mg-ticks" aria-hidden />
    {meta && <span className="mg-meta">{meta}</span>}
  </div>
);

export const DeltaBar = ({ value, max, label, testid }) => {
  const w = Math.min(Math.abs(value) / max, 1) * 50;
  const neg = value < 0;
  return (
    <div className="relative h-3 w-full" role="img" aria-label={label} data-testid={testid}>
      <span className="absolute inset-y-0 left-1/2 w-px bg-[var(--ink)]/40" aria-hidden />
      <motion.span
        className={`absolute top-0.5 bottom-0.5 rounded-[2px] ${neg ? "bg-[var(--regress)] mg-hatch" : "bg-[var(--teal)]"}`}
        style={{ width: `${w}%`, left: neg ? `${50 - w}%` : "50%", transformOrigin: neg ? "right" : "left" }}
        initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.28, ease: EASE }}
      />
    </div>
  );
};
