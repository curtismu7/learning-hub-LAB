// Dependency-free BM25 over glossary terms, sources and cards. Case-insensitive, prefix + light stemming, stable ranking.
// Snippets are plain text plus match offsets (UTF-16 code units, like String.slice); the server never returns HTML.
import { MAX_QUERY, MAX_QUERY_TOKENS } from './limits.js';

const TOKEN = /[\p{L}\p{N}]+/gu;
const K1 = 1.2, B = 0.75, TITLE_WEIGHT = 3;
const KIND_ORDER = { term: 0, card: 1, source: 2 };

export function stem(w) {
  if (w.length <= 3 || /^\d+$/.test(w)) return w;
  let s = w;
  if (s.endsWith('sses')) s = s.slice(0, -2);
  else if (s.endsWith('ies') && s.length > 4) s = s.slice(0, -3) + 'y';
  else if (/(ing|ed)$/.test(s) && s.length - (s.endsWith('ing') ? 3 : 2) >= 3) s = s.replace(/(ing|ed)$/, '').replace(/([^aeiou])\1$/, '$1');
  else if (s.endsWith('s') && !/(ss|us|is)$/.test(s)) s = s.slice(0, -1);
  return s.length > 3 && s.endsWith('e') ? s.slice(0, -1) : s;
}

function* tokens(text) {
  for (const m of text.matchAll(TOKEN)) yield { raw: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length };
}

function buildDocs(hub) {
  const docs = [];
  for (const g of hub.glossary) {
    docs.push({ id: g.id, kind: 'term', packId: g.definitions.find((d) => d.id === g.display)?.packId, title: g.term,
      boost: g.definitions.flatMap((d) => d.aliases).join(' '), text: g.definitions.map((d) => d.definition).join('\n') });
  }
  for (const c of hub.cards) docs.push({ id: c.id, kind: 'card', packId: c.packId, title: c.label, boost: '', text: c.description });
  for (const s of hub.sources) docs.push({ id: s.id, kind: 'source', packId: s.packIds[0], title: s.title, boost: s.kind, text: s.use });
  return docs;
}

export function createSearch(hub) {
  const docs = buildDocs(hub);
  const postings = new Map(); // stem -> Map(docIndex -> weighted tf)
  const lens = docs.map((d, i) => {
    let len = 0;
    const add = (text, w) => { for (const t of tokens(text)) { const s = stem(t.raw); let p = postings.get(s); if (!p) postings.set(s, p = new Map()); p.set(i, (p.get(i) || 0) + w); len += w; } };
    add(d.title, TITLE_WEIGHT); add(d.boost, TITLE_WEIGHT); add(d.text, 1);
    return len;
  });
  const avg = lens.reduce((a, b) => a + b, 0) / (docs.length || 1) || 1;
  const vocab = [...postings.keys()].sort();

  function parse(query) {
    const q = String(query ?? '').slice(0, MAX_QUERY);
    const toks = [...tokens(q)].slice(0, MAX_QUERY_TOKENS);
    return toks.map((t, i) => ({ raw: t.raw, stem: stem(t.raw), prefix: t.raw.length >= 3 || i === toks.length - 1 }));
  }

  function search(query, limit = 20) {
    const raw = String(query ?? '');
    const qt = parse(raw);
    const base = { query: raw.slice(0, MAX_QUERY), truncated: raw.length > MAX_QUERY, results: [] };
    if (!qt.length || !docs.length) return base;
    const scores = new Map();
    for (const q of qt) {
      const weights = new Map([[q.stem, 1]]); // term -> weight; exact stem 1, prefix-only expansions 0.5
      if (q.prefix) for (const v of vocab) if (!weights.has(v) && (v.startsWith(q.stem) || v.startsWith(q.raw))) weights.set(v, 0.5);
      for (const [term, w] of weights) {
        const p = postings.get(term);
        if (!p) continue;
        const idf = Math.log(1 + (docs.length - p.size + 0.5) / (p.size + 0.5));
        for (const [di, tf] of p) {
          scores.set(di, (scores.get(di) || 0) + w * idf * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * lens[di] / avg)));
        }
      }
    }
    const matches = (text) => {
      const out = [];
      for (const t of tokens(text)) if (qt.some((q) => stem(t.raw) === q.stem || (q.prefix && (t.raw.startsWith(q.raw) || stem(t.raw).startsWith(q.stem))))) out.push({ start: t.start, end: t.end });
      return out;
    };
    const ranked = [...scores].map(([di, s]) => [di, Math.round(s * 1e6) / 1e6])
      .sort((a, b) => b[1] - a[1] || KIND_ORDER[docs[a[0]].kind] - KIND_ORDER[docs[b[0]].kind] || (docs[a[0]].id < docs[b[0]].id ? -1 : 1));
    base.results = ranked.slice(0, Math.max(1, Math.min(limit, 50))).map(([di, score]) => {
      const d = docs[di];
      return { id: d.id, kind: d.kind, packId: d.packId, title: d.title, score, titleMatches: matches(d.title), snippet: snippet(d.text, matches(d.text)) };
    });
    return base;
  }
  return { search, size: docs.length };
}

const WINDOW = 200;
export function snippet(text, ms) {
  if (text.length <= WINDOW) return { text, matches: ms, truncatedStart: false, truncatedEnd: false };
  let from = ms.length ? Math.max(0, ms[0].start - 60) : 0;
  if (from > 0) { const sp = text.indexOf(' ', from); if (sp !== -1 && sp - from < 20) from = sp + 1; }
  const to = Math.min(text.length, from + WINDOW);
  return {
    text: text.slice(from, to),
    matches: ms.filter((m) => m.start >= from && m.end <= to).map((m) => ({ start: m.start - from, end: m.end - from })),
    truncatedStart: from > 0, truncatedEnd: to < text.length,
  };
}
