import { createContext, useContext, useEffect, useState } from "react";
import { UserButton } from "@clerk/react";
import { useApi, errMsg } from "../lib/api";
import { Loading, ErrorBox } from "./StateViews";

const MeContext = createContext(null);
export const useMe = () => useContext(MeContext);

export default function AccessGate({ children }) {
  const api = useApi();
  const [me, setMe] = useState(null);
  const [error, setError] = useState(null);
  const load = async () => {
    setError(null);
    try {
      setMe((await api.get("/me")).data);
    } catch (e) {
      setError(errMsg(e));
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <div className="max-w-xl mx-auto p-10"><ErrorBox message={error} onRetry={load} /></div>;
  if (!me) return <Loading label="Checking access…" />;
  if (me.role === "pending") {
    return (
      <div data-testid="access-pending" className="max-w-lg mx-auto mt-24 panel p-8 space-y-3">
        <div className="flex justify-between items-center">
          <div className="font-semibold text-lg">Access pending</div>
          <UserButton />
        </div>
        <p className="text-sm text-muted-foreground">
          You are signed in as <span className="mono">{me.email}</span>. An EVYZ admin must approve your account before you can view participant data.
        </p>
      </div>
    );
  }
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}
