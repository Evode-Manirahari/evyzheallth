import "./App.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Show, SignIn, SignUp } from "@clerk/react";
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

const AuthLayout = ({ children }) => (
  <div className="min-h-screen grid lg:grid-cols-2">
    <div className="hidden lg:flex flex-col justify-between p-12 bg-[var(--navy)] text-white">
      <div className="font-bold text-xl tracking-tight">EVYZ</div>
      <div className="space-y-4 max-w-md">
        <h1 className="text-4xl font-semibold leading-tight">Between-visit changes, grounded in each patient's own history.</h1>
        <p className="text-white/70 text-sm">Import home glucose data, compare readings with a personal baseline and review sustained changes with evidence-linked summaries.</p>
      </div>
      <div className="text-xs text-white/50">Demonstration software. Not clinically validated.</div>
    </div>
    <div className="flex items-center justify-center p-6">{children}</div>
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  </AccessGate>
);

function App() {
  return (
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
  );
}

export default App;
