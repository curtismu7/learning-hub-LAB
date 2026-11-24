// Presenter mode, as in the ID-JAG kit: larger type, admin clutter (the Packs table, reload, the invalid-pack banner) is not rendered.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const KEY = "learninghub.present";
const Ctx = createContext({ present: false, set: () => {} });
export const usePresent = () => useContext(Ctx);

export const inField = (t) => !!t?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable=false])");
const initial = () => {
  try { if (new URLSearchParams(window.location.search).get("present") === "1") return true; } catch { /* no URL */ }
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
};

export function PresentProvider({ children }) {
  const [present, setPresent] = useState(initial);
  const set = useCallback((on) => {
    setPresent(on);
    try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* not remembered */ }
  }, []);
  useEffect(() => {
    if (present) document.documentElement.dataset.present = "1"; else delete document.documentElement.dataset.present;
  }, [present]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || inField(e.target)) return;
      if (e.key === "p" || e.key === "P") set(!present);
      else if (e.key === "Escape" && present) set(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [present, set]);
  const value = useMemo(() => ({ present, set }), [present, set]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
