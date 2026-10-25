import axios from "axios";
import { useAuth } from "@clerk/react";
import { useCallback, useEffect, useMemo, useState } from "react";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function useApi() {
  const { getToken } = useAuth();
  return useMemo(() => {
    const inst = axios.create({ baseURL: API });
    inst.interceptors.request.use(async (cfg) => {
      const t = await getToken();
      if (t) cfg.headers.Authorization = `Bearer ${t}`;
      return cfg;
    });
    return inst;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function errMsg(e) {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x.msg).join("; ");
  if (e?.response?.status === 0 || !e?.response) return "Cannot reach the EVYZ server. Check your connection and retry.";
  return e?.message || "Something went wrong.";
}

export function useFetch(path) {
  const api = useApi();
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { data } = await api.get(path);
      setState({ data, error: null, loading: false });
    } catch (e) {
      setState({ data: null, error: errMsg(e), loading: false });
    }
  }, [api, path]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { ...state, reload };
}
