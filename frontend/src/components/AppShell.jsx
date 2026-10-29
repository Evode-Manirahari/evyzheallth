import { NavLink, Link, useLocation } from "react-router-dom";
import { UserButton } from "@clerk/react";
import { motion } from "framer-motion";
import { Activity, ArrowUpRight, FlaskConical, LayoutDashboard, Settings2, UploadCloud, UsersRound } from "lucide-react";
import { useMe } from "./AccessGate";

const navigation = [
  { to: "/", label: "Participants", short: "Patients", icon: LayoutDashboard, testId: "nav-patients", end: true },
  { to: "/import", label: "Import data", short: "Import", icon: UploadCloud, testId: "nav-import" },
  { to: "/settings", label: "Detector", short: "Detector", icon: Settings2, testId: "nav-settings" },
  { to: "/lab", label: "Personalization Lab", short: "Lab", icon: FlaskConical, testId: "nav-lab" },
  { to: "/team", label: "Team", short: "Team", icon: UsersRound, testId: "nav-team", admin: true },
];

const pageNames = [
  [/^\/patients\//, "Participant timeline"],
  [/^\/events\//, "Change review"],
  [/^\/import/, "Import data"],
  [/^\/settings/, "Detector settings"],
  [/^\/lab/, "Personalization Lab"],
  [/^\/team/, "Team"],
];

function Brand({ light = false, mobile = false }) {
  return (
    <Link to="/" className={`brand-lockup ${light ? "brand-lockup-light" : ""}`} data-testid={mobile ? "brand-home-link-mobile" : "brand-home-link"} aria-label="EVYZ, participant overview">
      <span className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></span>
      <span className="brand-name">EVYZ<span className="brand-dot">.</span></span>
    </Link>
  );
}

function Navigation({ me, mobile = false }) {
  const location = useLocation();
  const current = (isActive, to) => isActive || (to === "/" && /^\/(patients|events)\//.test(location.pathname));
  return (
    <nav className={mobile ? "mobile-nav" : "side-nav"} aria-label={mobile ? "Mobile navigation" : "Main navigation"}>
      {navigation.filter((item) => !item.admin || me?.role === "admin").map(({ to, label, short, icon: Icon, testId, end }) => (
        <NavLink key={to} to={to} end={end} data-testid={mobile ? `${testId}-mobile` : testId} className={({ isActive }) => `${mobile ? "mobile-nav-link" : "side-nav-link"} ${current(isActive, to) ? "is-active" : ""}`}>
          {({ isActive }) => <>
            {!mobile && current(isActive, to) && <motion.span layoutId="side-nav-active" className="side-nav-active" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
            <span>{mobile ? short : label}</span>
            {!mobile && current(isActive, to) && <ArrowUpRight size={14} className="side-nav-arrow" aria-hidden="true" />}
          </>}
        </NavLink>
      ))}
    </nav>
  );
}

export default function AppShell({ children }) {
  const me = useMe();
  const location = useLocation();
  const pageName = pageNames.find(([match]) => match.test(location.pathname))?.[1] || "Participant overview";

  return (
    <div className="app-layout">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:bg-card focus:px-3 focus:py-2 focus:rounded-md" data-testid="skip-to-content">Skip to content</a>
      <aside className="app-sidebar">
        <div>
          <Brand light />
          <p className="sidebar-caption">Between-visit monitoring</p>
        </div>
        <div className="sidebar-group-label">Workspace</div>
        <Navigation me={me} />
        <div className="sidebar-bottom">
          <div className="sidebar-signal" aria-hidden="true"><Activity size={18} strokeWidth={1.5} /><span className="sidebar-signal-line" /></div>
          <p>Find the change.<br />Follow the evidence.</p>
          <span className="sidebar-disclaimer">Demonstration software · Not clinically validated</span>
        </div>
      </aside>

      <div className="app-content">
        <header className="app-topbar">
          <div className="mobile-brand"><Brand mobile /></div>
          <div className="topbar-context"><span className="topbar-context-dot" /><span>EVYZ WORKSPACE</span><span className="topbar-divider">/</span><strong>{pageName}</strong></div>
          <div className="topbar-account"><span className="topbar-email" data-testid="current-user-email">{me?.email}</span><UserButton /></div>
        </header>
        <Navigation me={me} mobile />
        <motion.main id="main" key={location.pathname} className="app-main" initial={{ opacity: 0.85, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}>
          {children}
        </motion.main>
        <footer className="app-footer"><span>For human review only. Detected changes are not diagnoses.</span><span>EVYZ · Clinical research prototype</span></footer>
      </div>
    </div>
  );
}
