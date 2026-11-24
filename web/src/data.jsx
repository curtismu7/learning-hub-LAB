// Loads the three read-only API documents once and on reload. Everything in them is data: it is only ever rendered as text.
import { createContext, useCallback, useContext, useEffect, useState } from "react";

const Ctx = createContext(null);
export const useHub = () => useContext(Ctx);

const getJson = (url, init) => fetch(url, init).then((r) => { if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status }); return r.json(); });

export function HubProvider({ children }) {
  const [state, setState] = useState({ hub: null, packs: null, registryProblems: [], error: "" });
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState("");
  const [mockOnly, setMockOnly] = useState(false);

  const load = useCallback(async () => {
    try {
      const [hub, status] = await Promise.all([getJson("/api/hub"), getJson("/api/packs")]);
      setState({ hub, packs: status.packs, registryProblems: status.registryProblems || [], error: "" });
    } catch { setState((s) => ({ ...s, error: "The hub API is not reachable." })); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { getJson("/api/health").then((h) => setMockOnly(h.mode === "mock-only")).catch(() => {}); }, []);

  const reload = useCallback(async () => {
    setReloading(true); setReloadError("");
    try { await getJson("/api/reload", { method: "POST" }); await load(); }
    catch (e) { setReloadError(e.status === 429 ? "Reload is limited to 5 per minute. Try again shortly." : "Reload failed."); }
    setReloading(false);
  }, [load]);

  const packTitle = useCallback((id) => state.hub?.packs.find((p) => p.id === id)?.title || id, [state.hub]);
  return <Ctx.Provider value={{ ...state, load, reload, reloading, reloadError, packTitle, mockOnly }}>{children}</Ctx.Provider>;
}
