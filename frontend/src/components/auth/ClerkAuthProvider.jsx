import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClerkProvider } from "@clerk/react";

const appearance = {
  variables: {
    colorPrimary: "#087d73",
    colorForeground: "#14283e",
    colorBackground: "#ffffff",
    fontFamily: "IBM Plex Sans, system-ui, sans-serif",
    borderRadius: "10px",
  },
};

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Starts Clerk from the backend's runtime config, so deploy's live keys need no rebuild.
export default function ClerkAuthProvider({ children }) {
  const navigate = useNavigate();
  const [config, setConfig] = useState(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async (attempt = 0) => {
      try {
        const cfg = await (await fetch(`${BACKEND_URL}/api/clerk/config`)).json();
        if (cfg.enabled) return cancelled || setConfig(cfg);
      } catch {}
      if (cancelled) return;
      if (attempt >= 20) return setUnavailable(true);
      setTimeout(() => load(attempt + 1), 1500);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  if (unavailable) return <div className="auth-boot" role="alert"><div className="auth-boot-mark">EVYZ<span>.</span></div><h1>Sign-in is unavailable</h1><p>We could not connect to the sign-in service. Refresh the page to try again.</p><button type="button" onClick={() => window.location.reload()}>Refresh page</button></div>;
  if (!config) return <div className="auth-boot" role="status"><div className="auth-boot-mark">EVYZ<span>.</span></div><div className="auth-boot-progress" aria-hidden="true" /><p>Opening workspace…</p></div>;
  return (
    <ClerkProvider
      publishableKey={config.publishable_key}
      proxyUrl={config.proxy_url || undefined}
      appearance={appearance}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      afterSignOutUrl="/"
    >
      {children}
    </ClerkProvider>
  );
}
