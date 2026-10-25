import { NavLink, Link } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { UserButton } from "@clerk/react";
import { useMe } from "./AccessGate";
import { EvyzMark } from "./Micro";

const navCls = ({ isActive }) =>
  `relative px-2 sm:px-3 py-2 rounded-md whitespace-nowrap text-[13px] sm:text-sm transition-colors ${isActive ? "text-foreground font-semibold bg-[var(--teal-soft)]" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`;

export default function AppShell({ children }) {
  const me = useMe();
  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-screen flex flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:bg-card focus:px-3 focus:py-2 focus:rounded-md" data-testid="skip-to-content">Skip to content</a>
      <header className="bg-[hsl(42_30%_95%)] sticky top-0 z-20 border-b border-[var(--line)] shadow-[0_1px_0_hsl(38_20%_85%)]">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-8 min-h-16 py-2 sm:py-0 sm:h-16 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 sm:gap-8">
          <Link to="/" className="flex items-center gap-2.5 shrink-0" data-testid="brand-home-link">
            <EvyzMark />
            <span className="display text-2xl text-foreground">EVYZ</span>
            <span className="hidden md:inline text-xs text-muted-foreground">between-visit change review</span>
          </Link>
          <nav className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto min-w-0 max-sm:order-last max-sm:w-full max-sm:-mx-2" aria-label="Main">
            <NavLink to="/" end className={navCls} data-testid="nav-patients">Patients</NavLink>
            <NavLink to="/import" className={navCls} data-testid="nav-import">Import</NavLink>
            <NavLink to="/settings" className={navCls} data-testid="nav-settings">Detector</NavLink>
            <NavLink to="/lab" className={navCls} data-testid="nav-lab">
              <span className="sm:hidden">Lab</span><span className="hidden sm:inline">EEG Lab</span>
              <span className="hidden sm:inline ml-1.5 text-[10px] font-semibold tracking-wide text-[var(--teal)] align-middle">RESEARCH</span>
            </NavLink>
            {me?.role === "admin" && <NavLink to="/team" className={navCls} data-testid="nav-team">Team</NavLink>}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden xl:inline text-xs text-muted-foreground" data-testid="current-user-email">{me?.email}</span>
            <UserButton />
          </div>
        </div>
      </header>
      <main id="main" className="flex-1 w-full max-w-[1360px] mx-auto px-4 sm:px-8 py-8 sm:py-10 enter">{children}</main>
      <footer className="border-t border-[var(--line)] text-xs text-muted-foreground">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-8 py-5 flex flex-wrap gap-x-6 gap-y-1">
          <span>Demonstration software — not clinically validated, not a medical device.</span>
          <span>Detected changes are for human review, not diagnoses.</span>
        </div>
      </footer>
    </div>
    </MotionConfig>
  );
}
