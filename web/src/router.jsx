// A tiny path router (no dependency). The URL is the state: path, ?query and #hash. Every link is a real <a href>.
import { useEffect, useState } from "react";
import { useHub } from "./data";

const read = () => ({ path: window.location.pathname, query: new URLSearchParams(window.location.search), hash: window.location.hash.slice(1) });
const EVENT = "hub:navigate";

/** decodeURIComponent that never throws: a malformed %-escape (a mistyped or crafted link) is kept as typed. */
export const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

export function navigate(href, { replace = false } = {}) {
  window.history[replace ? "replaceState" : "pushState"](null, "", href);
  window.dispatchEvent(new Event(EVENT));
}

export function useRoute() {
  const [loc, setLoc] = useState(read);
  useEffect(() => {
    const sync = () => setLoc(read());
    window.addEventListener("popstate", sync);
    window.addEventListener(EVENT, sync);
    return () => { window.removeEventListener("popstate", sync); window.removeEventListener(EVENT, sync); };
  }, []);
  return loc;
}

export function Link({ href, children, ...rest }) {
  const go = (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={go} {...rest}>{children}</a>;
}

/** Only http(s) URLs become links; anything else in pack data stays plain text. */
export const safeHref = (u) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : null);

const isLocalUrl = (u) => { try { const h = new URL(u).hostname; return h === "localhost" || h === "[::1]" || /^127(\.\d+){3}$/.test(h); } catch { return false; } };

export function ExtLink({ href, children }) {
  const mockOnly = useHub()?.mockOnly;
  const h = safeHref(href);
  // Hosted mock: a localhost target cannot work for a visitor, so it is text with a note, never a link.
  if (h && mockOnly && isLocalUrl(h)) return <span>{children} <span className="muted">(local demo only)</span></span>;
  return h ? <a href={h} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>;
}
