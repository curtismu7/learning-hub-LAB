// The six pages. All pack text is rendered as React text nodes; links come from safeHref/ExtLink or from internal ids.
import { useEffect, useMemo, useState } from "react";
import Highlight from "./Highlight";
import { useHub } from "./data";
import { usePresent } from "./present";
import WirePanel from "./Wire";
import { ExtLink, Link, navigate, safeHref } from "./router";

const byTerm = (a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: "base" });
const demoUrl = (hub, packId, href) => {
  const base = hub.packs.find((p) => p.id === packId)?.demo.baseUrl;
  return base && safeHref(base) ? base.replace(/\/+$/, "") + href : null;
};
const groupBy = (items, key) => [...items.reduce((m, x) => m.set(x[key], [...(m.get(x[key]) || []), x]), new Map())];

const n = (k, w) => `${k} ${w}${k === 1 ? "" : "s"}`;

export function SearchBox({ initial = "", label = "Search terms, sources and cards" }) {
  const [q, setQ] = useState(initial);
  useEffect(() => setQ(initial), [initial]);
  return (
    <form className="searchbox" role="search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`); }}>
      <label htmlFor="home-q">{label}</label>
      <div className="searchbox__row">
        <input id="home-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        <button type="submit" className="btn">Search</button>
      </div>
    </form>
  );
}

export function HomePage() {
  const { hub, packs } = useHub();
  return (
    <>
      <h1>Learning Hub</h1>
      <p className="lede">What each loaded demo teaches, in one place.</p>
      <SearchBox />
      <h2>Loaded packs</h2>
      {packs.length === 0 ? <p>No packs registered.</p> : (
        <ul className="grid">
          {packs.map((s) => {
            const p = s.status === "ok" ? hub.packs.find((x) => x.id === s.packId) : null;
            return (
              <li key={s.id} className="card" data-status={s.status}>
                <h3>{p ? p.title : s.id}</h3>
                <p><span className={`badge ${s.status}`}>{s.status === "ok" ? "ok" : "invalid"}</span>{p && <> <span className="muted">v{p.version} · {p.demo.name}</span></>}</p>
                {p && p.demo.baseUrl && safeHref(p.demo.baseUrl) && <p><ExtLink href={p.demo.baseUrl}>Open the demo</ExtLink></p>}
                {p ? (
                  <dl className="counts">
                    {[["glossary", "Terms", "/glossary"], ["sources", "Sources", "/sources"], ["cards", "Cards", "/cards"], ["diagrams", "Diagrams", "/cards"], ["stories", "Stories", "/cards"]].map(([k, name, to]) => (
                      <div key={k}><dt>{name}</dt><dd><Link href={to}>{p.counts[k]}</Link></dd></div>
                    ))}
                  </dl>
                ) : <p className="err">{s.problems[0]}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export function GlossaryPage() {
  const { hub } = useHub();
  const [filter, setFilter] = useState("");
  const terms = useMemo(() => [...hub.glossary].sort(byTerm), [hub]);
  const f = filter.trim().toLowerCase();
  const shown = f ? terms.filter((g) => [g.term, ...g.definitions.flatMap((d) => [d.term, d.definition, ...d.aliases])].some((s) => s.toLowerCase().includes(f))) : terms;
  return (
    <>
      <h1>Glossary</h1>
      <div className="searchbox">
        <label htmlFor="gloss-f">Filter terms</label>
        <input id="gloss-f" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} autoComplete="off" />
      </div>
      <p role="status" className="muted">{shown.length} of {terms.length} terms</p>
      <dl className="glossary">
        {shown.map((g) => {
          const d = g.definitions.find((x) => x.id === g.display) || g.definitions[0];
          return (
            <div key={g.id} id={`term-${g.id}`} className="gloss" tabIndex={-1}>
              <dt><Link href={`/glossary/${encodeURIComponent(g.id)}`}>{g.term}</Link>{g.definitions.length > 1 && <span className="muted"> · {g.definitions.length} demos</span>}</dt>
              <dd>{d.definition}</dd>
            </div>
          );
        })}
      </dl>
      {shown.length === 0 && <p>No term matches "{filter}".</p>}
    </>
  );
}

export function TermPage({ id }) {
  const { hub, packTitle } = useHub();
  const g = hub.glossary.find((x) => x.id === id || x.definitions.some((d) => d.id === id));
  if (!g) return <><h1>Term not found</h1><p><Link href="/glossary">Back to the glossary</Link></p></>;
  const cards = g.cards.map((cid) => hub.cards.find((c) => c.id === cid)).filter(Boolean);
  const packIds = [...new Set(g.definitions.map((d) => d.packId))];
  const diagrams = hub.diagrams.filter((d) => packIds.includes(d.packId));
  return (
    <>
      <p><Link href="/glossary">Glossary</Link></p>
      <h1 id={`term-${g.id}`}>{g.term}</h1>
      <h2>Definitions</h2>
      <ul className="side">
        {g.definitions.map((d) => (
          <li key={d.id} className="card" data-chosen={d.id === g.display ? "" : undefined}>
            <h3>{packTitle(d.packId)} {d.id === g.display && <span className="badge ok">shown by default</span>}</h3>
            <p>{d.definition}</p>
            {d.aliases.length > 0 && <p className="muted">Also called: {d.aliases.join(", ")}</p>}
          </li>
        ))}
      </ul>
      <h2>Used in</h2>
      {cards.length === 0 && diagrams.length === 0 ? <p className="muted">No card or diagram uses this term.</p> : (
        <ul>
          {cards.map((c) => <li key={c.id}>Card: <Link href={`/cards#card-${c.id}`}>{c.label}</Link> <span className="muted">({packTitle(c.packId)})</span></li>)}
          {diagrams.map((d) => {
            const u = demoUrl(hub, d.packId, d.href);
            return <li key={d.id}>Diagram: {u ? <ExtLink href={u}>{d.label}</ExtLink> : d.label} <span className="muted">({packTitle(d.packId)})</span></li>;
          })}
        </ul>
      )}
    </>
  );
}

export function SourcesPage() {
  const { hub, packTitle } = useHub();
  const groups = groupBy([...hub.sources].sort((a, b) => a.title.localeCompare(b.title)), "kind").sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <>
      <h1>Sources</h1>
      <p role="status" className="muted">{hub.sources.length} sources in {groups.length} groups</p>
      {groups.map(([kind, items]) => (
        <section key={kind} aria-labelledby={`k-${kind}`}>
          <h2 id={`k-${kind}`}>{kind}</h2>
          <ul className="plain">
            {items.map((s) => (
              <li key={s.id} id={`source-${s.id}`} className="src" tabIndex={-1}>
                <ExtLink href={s.url}>{s.title}</ExtLink>
                <p>{s.use}</p>
                <p className="muted">{s.status} · checked {s.checked} · {s.packIds.map(packTitle).join(", ")}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

export function CardsPage() {
  const { hub, packTitle } = useHub();
  const story = (id) => hub.stories.find((s) => s.id === id);
  const term = (id) => hub.glossary.find((g) => g.definitions.some((d) => d.id === id));
  return (
    <>
      <h1>Cards</h1>
      {hub.packs.map((p) => {
        const cards = hub.cards.filter((c) => c.packId === p.id);
        const diagrams = hub.diagrams.filter((d) => d.packId === p.id);
        return (
          <section key={p.id} aria-labelledby={`p-${p.id}`}>
            <h2 id={`p-${p.id}`}>{p.title}</h2>
            {p.demo.baseUrl && safeHref(p.demo.baseUrl) && <p><ExtLink href={p.demo.baseUrl}>Open the demo</ExtLink> <span className="muted">({p.demo.urlSource === "shelf" ? "address from the demo shelf" : "address from the pack"})</span></p>}
            {groupBy(cards, "group").map(([group, items]) => (
              <div key={group}>
                <h3>{group}</h3>
                <ul className="grid">
                  {items.map((c) => {
                    const st = c.story && story(c.story);
                    return (
                      <li key={c.id} id={`card-${c.id}`} className="card" tabIndex={-1}>
                        <h4>{c.label}</h4>
                        <p>{c.description}</p>
                        {st && <p className="step"><strong>{st.title}.</strong> {st.say}</p>}
                        {c.wire && <WirePanel wire={c.wire} />}
                        {c.terms.length > 0 && <p className="muted">Terms: {c.terms.map((t, i) => { const g = term(t); return <span key={t}>{i > 0 && ", "}{g ? <Link href={`/glossary/${encodeURIComponent(g.id)}`}>{g.term}</Link> : t}</span>; })}</p>}
                        <p>{c.url ? <ExtLink href={c.url}>Open in the demo</ExtLink> : <span className="muted">Route {c.action.href} in {packTitle(c.packId)} (no base URL in the pack)</span>}</p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {diagrams.length > 0 && (
              <>
                <h3>Diagrams</h3>
                <ul>{diagrams.map((d) => { const u = demoUrl(hub, d.packId, d.href); return <li key={d.id}>{u ? <ExtLink href={u}>{d.label}</ExtLink> : <>{d.label} <span className="muted">({d.href})</span></>}</li>; })}</ul>
              </>
            )}
          </section>
        );
      })}
      {hub.packs.length === 0 && <p>No packs loaded.</p>}
    </>
  );
}

const DEST = { term: (r) => `/glossary/${encodeURIComponent(r.id)}`, card: (r) => `/cards#card-${r.id}`, source: (r) => `/sources#source-${r.id}` };

export function SearchPage({ q }) {
  const [state, setState] = useState({ q: "", results: null, error: "" });
  useEffect(() => {
    if (!q.trim()) { setState({ q, results: [], error: "" }); return undefined; }
    let live = true;
    fetch(`/api/search?q=${encodeURIComponent(q)}&limit=30`).then((r) => r.json()).then((d) => live && setState({ q, results: d.results, error: "" }))
      .catch(() => live && setState({ q, results: [], error: "Search failed." }));
    return () => { live = false; };
  }, [q]);
  const { results } = state;
  return (
    <>
      <h1>Search</h1>
      <SearchBox initial={q} />
      <p role="status" aria-live="polite" className="muted">
        {!q.trim() ? "Type to search." : results === null || state.q !== q ? "Searching" : state.error || `${results.length} result${results.length === 1 ? "" : "s"} for "${q}"`}
      </p>
      <ol className="results">
        {state.q === q && (results || []).map((r) => (
          <li key={`${r.kind}-${r.id}`}>
            <span className="kind">{r.kind}</span> <Link href={DEST[r.kind](r)}><Highlight text={r.title} matches={r.titleMatches} /></Link>
            {r.snippet.text && <p>{r.snippet.truncatedStart && "…"}<Highlight text={r.snippet.text} matches={r.snippet.matches} />{r.snippet.truncatedEnd && "…"}</p>}
          </li>
        ))}
      </ol>
    </>
  );
}

export function PacksPage() {
  const { packs, registryProblems, hub, reload, reloading, reloadError, mockOnly } = useHub();
  const { present } = usePresent();
  if (present) return <><h1>Packs</h1><p>The Packs admin table is hidden in presenter mode. Press p to leave it.</p></>;
  return (
    <>
      <h1>Packs</h1>
      {!mockOnly && <p><button type="button" className="btn" onClick={reload} disabled={reloading}>{reloading ? "Reloading" : "Reload packs"}</button></p>}
      {reloadError && <p role="alert" className="err">{reloadError}</p>}
      {registryProblems.map((p) => <p key={p} role="alert" className="err">{p}</p>)}
      <div className="tablewrap">
        <table>
          <caption className="sr">Pack status</caption>
          <thead><tr><th scope="col">Registry id</th><th scope="col" className="nowrap">Status</th><th scope="col" className="nowrap">Version</th><th scope="col">Counts</th><th scope="col">Problems</th></tr></thead>
          <tbody>
            {packs.map((s) => {
              const c = s.counts;
              return (
                <tr key={s.id} data-status={s.status}>
                  <th scope="row">{s.id}</th>
                  <td className="nowrap"><span className={`badge ${s.status}`}>{s.status === "ok" ? "ok" : "invalid"}</span></td>
                  <td className="nowrap">{s.version || "-"}</td>
                  <td>{c ? `${n(c.glossary, "term")}, ${n(c.sources, "source")}, ${n(c.cards, "card")}, ${n(c.diagrams, "diagram")}` : "-"}</td>
                  <td>{s.problems.length ? <ul className="plain">{s.problems.map((p) => <li key={p}>{p}</li>)}</ul> : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hub && <p className="muted">{hub.packs.length} of {packs.length} registered packs are merged.</p>}
    </>
  );
}
