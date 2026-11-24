// Shell conventions copied from the ID-JAG kit's AppShell (Core Dark bar, Ping Red rule, theme switch, presenter toggle).
import { useEffect, useRef, useState } from "react";
import { HubProvider, useHub } from "./data";
import { PresentProvider, inField, usePresent } from "./present";
import { Link, navigate, safeDecode, useRoute } from "./router";
import { CardsPage, GlossaryPage, HomePage, PacksPage, SearchPage, SourcesPage, TermPage } from "./pages";

const THEME_KEY = "learninghub.theme";
const PAGES = [["/", "Home"], ["/glossary", "Glossary"], ["/sources", "Sources"], ["/cards", "Cards"], ["/packs", "Packs", true]];

function initialTheme() {
  try { const t = localStorage.getItem(THEME_KEY); if (t === "light" || t === "dark") return t; } catch { /* storage blocked */ }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
const reduced = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function QuickSearch({ route }) {
  const ref = useRef(null);
  const onSearch = route.path === "/search";
  const [v, setV] = useState(onSearch ? route.query.get("q") || "" : "");
  useEffect(() => { if (onSearch) setV(route.query.get("q") || ""); }, [onSearch, route.query]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || inField(e.target)) return;
      e.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const change = (e) => {
    const next = e.target.value;
    setV(next);
    navigate(`/search?q=${encodeURIComponent(next)}`, { replace: onSearch });
  };
  return <input ref={ref} className="quick" type="search" aria-label="Quick search" placeholder="Search ( / )" value={v} onChange={change} autoComplete="off" />;
}

function MockBanner() {
  const { mockOnly } = useHub();
  return mockOnly ? <div role="status" className="banner">Hosted, simulated mock: sample data only, nothing leaves this server</div> : null;
}

function Banner() {
  const { packs } = useHub();
  const { present } = usePresent();
  const bad = packs.filter((p) => p.status !== "ok");
  if (present || bad.length === 0) return null;
  return (
    <div role="alert" className="banner">
      {bad.length} pack{bad.length === 1 ? "" : "s"} failed validation and {bad.length === 1 ? "is" : "are"} left out: {bad.map((p) => p.id).join(", ")}. <Link href="/packs">See the Packs page</Link>.
    </div>
  );
}

function Page({ route }) {
  const { hub, packs, error } = useHub();
  if (error) return <p role="alert" className="err">{error}</p>;
  if (!hub || !packs) return <p role="status">Loading</p>;
  const { path, query } = route;
  const term = path.startsWith("/glossary/") && safeDecode(path.slice("/glossary/".length));
  return (
    <>
      <MockBanner />
      <Banner />
      {path === "/" ? <HomePage />
        : path === "/glossary" ? <GlossaryPage />
        : term ? <TermPage id={term} />
        : path === "/sources" ? <SourcesPage />
        : path === "/cards" ? <CardsPage />
        : path === "/search" ? <SearchPage q={query.get("q") || ""} />
        : path === "/packs" ? <PacksPage />
        : <><h1>Page not found</h1><p><Link href="/">Back to the hub</Link></p></>}
    </>
  );
}

// #hash deep links (#term-<id>, #card-<id>, #source-<id>): scroll to the element, focus it and mark it.
function useHashFocus(route, ready) {
  useEffect(() => {
    document.querySelectorAll("[data-hl]").forEach((el) => el.removeAttribute("data-hl"));
    if (!ready || !route.hash) return;
    const el = document.getElementById(safeDecode(route.hash));
    if (!el) return;
    el.setAttribute("data-hl", "1");
    el.scrollIntoView?.({ behavior: reduced() ? "auto" : "smooth", block: "center" });
    el.focus?.({ preventScroll: true });
  }, [route.path, route.hash, ready]);
}

function Shell() {
  const [theme, setTheme] = useState(initialTheme);
  const { present, set } = usePresent();
  const route = useRoute();
  const { hub } = useHub();
  useHashFocus(route, !!hub);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const flip = () => {
    const next = theme === "dark" ? "light" : "dark";
    try { localStorage.setItem(THEME_KEY, next); } catch { /* not remembered */ }
    setTheme(next);
  };
  const here = route.path.startsWith("/glossary") ? "/glossary" : route.path;
  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <header className="shell-bar">
        <Link className="shell-brand" href="/"><img src="/branding/ping-logo.png" alt="Ping Identity" /><span>Learning Hub</span></Link>
        <nav aria-label="Site" className="shell-nav">
          {PAGES.filter(([, , admin]) => !(admin && present)).map(([href, label]) => <Link key={href} href={href} aria-current={href === here ? "page" : undefined}>{label}</Link>)}
        </nav>
        <QuickSearch route={route} />
        <button type="button" className="shell-theme" aria-pressed={present} onClick={() => set(!present)} title="Presenter mode (p)">Present</button>
        <button type="button" className="shell-theme" onClick={flip} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>{theme === "dark" ? "Light" : "Dark"}</button>
      </header>
      <main id="main" className="hub" tabIndex={-1}><Page route={route} /></main>
    </div>
  );
}

export default function App() {
  return <HubProvider><PresentProvider><Shell /></PresentProvider></HubProvider>;
}
