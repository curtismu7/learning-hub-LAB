// Merge validated packs (in registry order) into one read-only index. Ids are namespaced "<packId>.<id>".
// Per-demo glossary definitions are kept side by side; one is chosen for display (first pack, or `display` override).
const STATUS_RANK = { verified: 0, read: 1, 'search-only': 2, 'not-read': 3 }; // higher = worse

const ns = (packId, id) => `${packId}.${id}`;
export const termKey = (t) => t.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

function urlKey(u) {
  const x = new URL(u);
  x.hash = '';
  return `${x.protocol}//${x.host.toLowerCase()}${x.pathname.replace(/\/+$/, '')}${x.search}`;
}

export function mergePacks(packs, { display = {} } = {}) {
  const hub = { packs: [], glossary: [], sources: [], cards: [], diagrams: [], stories: [] };
  const groups = new Map();
  const bySource = new Map();
  const termGroup = new Map(); // namespaced term id -> group
  for (const p of packs) {
    const demo = p.demo;
    hub.packs.push({
      id: p.id, title: p.title, version: p.version, demo: { id: demo.id, name: demo.name, catalog: demo.catalog ?? null, baseUrl: demo.baseUrl ?? null, tags: demo.tags ?? [] },
      counts: { glossary: p.glossary.length, sources: p.sources.length, cards: p.cards.length, diagrams: (p.diagrams || []).length, stories: (p.stories || []).length },
    });
    for (const t of p.glossary) {
      const key = termKey(t.term);
      let g = groups.get(key);
      if (!g) { g = { id: ns(p.id, t.id), key, term: t.term, display: ns(p.id, t.id), definitions: [], cards: [] }; groups.set(key, g); }
      const def = { id: ns(p.id, t.id), packId: p.id, term: t.term, definition: t.definition, aliases: t.aliases || [] };
      g.definitions.push(def);
      termGroup.set(def.id, g);
    }
    for (const s of p.sources) {
      const k = urlKey(s.url);
      const m = bySource.get(k);
      if (!m) {
        const merged = { id: ns(p.id, s.id), packIds: [p.id], aliases: [], title: s.title, url: s.url, kind: s.kind, use: s.use, status: s.status, checked: s.checked };
        bySource.set(k, merged);
        hub.sources.push(merged);
      } else { // same link in two packs: one entry, the worst status and the oldest check win so a stale copy is never promoted
        m.aliases.push(ns(p.id, s.id));
        if (!m.packIds.includes(p.id)) m.packIds.push(p.id);
        if (STATUS_RANK[s.status] > STATUS_RANK[m.status]) m.status = s.status;
        if (s.checked < m.checked) m.checked = s.checked;
      }
    }
    for (const c of p.cards) {
      const card = {
        id: ns(p.id, c.id), packId: p.id, demoId: demo.id, catalog: demo.catalog ?? null, label: c.label, description: c.description ?? '',
        group: c.group, action: c.action, url: c.action.type === 'route' && demo.baseUrl ? demo.baseUrl.replace(/\/+$/, '') + c.action.href : c.action.type === 'external' ? c.action.href : null,
        terms: (c.terms || []).map((t) => ns(p.id, t)), story: c.story ? ns(p.id, c.story) : null,
        ...(c.wire ? { wire: c.wire } : {}), // optional "On the wire" block; absent stays absent
      };
      hub.cards.push(card);
      for (const t of card.terms) { const g = termGroup.get(t); if (g && !g.cards.includes(card.id)) g.cards.push(card.id); }
    }
    for (const d of p.diagrams || []) hub.diagrams.push({ id: ns(p.id, d.id), packId: p.id, label: d.label, href: d.href, mode: d.mode ?? null });
    for (const s of p.stories || []) hub.stories.push({ id: ns(p.id, s.id), packId: p.id, title: s.title, say: s.say ?? '', file: s.file ?? null });
  }
  for (const g of groups.values()) {
    const chosen = display[g.key] && g.definitions.find((d) => d.packId === display[g.key]);
    if (chosen) { g.display = chosen.id; g.term = chosen.term; }
    hub.glossary.push(g);
  }
  return hub;
}
