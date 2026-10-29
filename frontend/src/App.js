import "./App.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Show, SignIn, SignUp } from "@clerk/react";
import { MotionConfig } from "framer-motion";
import ClerkAuthProvider from "@/components/auth/ClerkAuthProvider";
import { Toaster } from "./components/ui/sonner";
import AccessGate from "./components/AccessGate";
import AppShell from "./components/AppShell";
import Overview from "./pages/Overview";
import ImportPage from "./pages/ImportPage";
import PatientDetail from "./pages/PatientDetail";
import EventReview from "./pages/EventReview";
import SettingsPage from "./pages/SettingsPage";
import TeamPage from "./pages/TeamPage";
import PersonalizationLab from "./pages/PersonalizationLab";

const AuthLayout = ({ children }) => (
  <div className="auth-shell">
    <div className="auth-story">
      <div className="auth-brand"><span className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></span>EVYZ<span>.</span></div>
      <div className="auth-story-main">
        <h1>See what changed.<br /><em>Review it in context.</em></h1>
        <p>Bring home measurements into one timeline, compare them with each participant's own history, and review sustained changes with linked evidence.</p>
        <div className="auth-signal" aria-label="Illustrative measurement line">
          <div className="auth-signal-head"><span>PERSONAL BASELINE</span><span>ILLUSTRATIVE SIGNAL</span></div>
          <svg viewBox="0 0 560 130" role="img" aria-label="Illustrative line comparing measurements with a baseline">
            <path className="auth-baseline" d="M0 76 H560" />
            <path className="auth-wave" d="M0 83 L30 81 L56 79 L77 84 L105 80 L132 82 L156 78 L183 84 L208 80 L234 82 L258 79 L283 81 L310 78 L334 75 L355 70 L376 62 L400 56 L425 59 L448 53 L470 57 L498 48 L522 52 L560 43" />
            <circle cx="498" cy="48" r="5" />
          </svg>
          <div className="auth-signal-foot"><span>RECENT HISTORY</span><span>SUSTAINED CHANGE</span></div>
        </div>
      </div>
      <div className="auth-disclaimer">Demonstration software · Not clinically validated · Not a medical device</div>
    </div>
    <div className="auth-form"><div className="auth-form-inner">{children}<p>Designed for human review. Detected changes are not diagnoses.</p></div></div>
  </div>
);

const Workspace = () => (
  <AccessGate>
    <AppShell>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/patients/:pid" element={<PatientDetail />} />
        <Route path="/events/:eid" element={<EventReview />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/lab" element={<PersonalizationLab />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  </AccessGate>
);

function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <ClerkAuthProvider>
          <Toaster position="top-right" />
          <Routes>
            <Route path="/sign-in/*" element={<AuthLayout><SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" withSignUp /></AuthLayout>} />
            <Route path="/sign-up/*" element={<AuthLayout><SignUp routing="path" path="/sign-up" signInUrl="/sign-in" /></AuthLayout>} />
            <Route
              path="/*"
              element={
                <>
                  <Show when="signed-in"><Workspace /></Show>
                  <Show when="signed-out"><Navigate to="/sign-in" replace /></Show>
                </>
              }
            />
          </Routes>
        </ClerkAuthProvider>
      </BrowserRouter>
    </MotionConfig>
  );
}

export default App;
