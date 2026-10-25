import { NavLink, Link } from "react-router-dom";
import { UserButton } from "@clerk/react";
import { useMe } from "./AccessGate";

const navCls = ({ isActive }) =>
  `px-2 sm:px-3 py-1.5 rounded-md whitespace-nowrap text-sm transition-colors ${isActive ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`;

export default function AppShell({ children }) {
  const me = useMe();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-white/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 h-14 flex items-center gap-3 sm:gap-6">
          <Link to="/" className="flex items-baseline gap-2" data-testid="brand-home-link">
            <span className="font-bold tracking-tight text-lg text-[var(--navy)]">EVYZ</span>
            <span className="hidden sm:inline text-xs text-muted-foreground">between-visit monitoring</span>
          </Link>
          <nav className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto min-w-0" aria-label="Main">
            <NavLink to="/" end className={navCls} data-testid="nav-patients">Patients</NavLink>
            <NavLink to="/import" className={navCls} data-testid="nav-import">Import</NavLink>
            <NavLink to="/settings" className={navCls} data-testid="nav-settings">Detector</NavLink>
            {me?.role === "admin" && <NavLink to="/team" className={navCls} data-testid="nav-team">Team</NavLink>}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden lg:inline text-xs text-muted-foreground mono" data-testid="current-user-email">{me?.email}</span>
            <UserButton />
          </div>
        </div>
      </header>
      <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-8 py-8">{children}</main>
      <footer className="border-t text-xs text-muted-foreground">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-4 flex flex-wrap gap-x-6 gap-y-1">
          <span>Demonstration software — not clinically validated, not a medical device.</span>
          <span>Detected changes are for human review, not diagnoses.</span>
        </div>
      </footer>
    </div>
  );
}
