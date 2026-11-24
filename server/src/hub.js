// Load every registered pack, apply the pack-id collision rule, merge. One bad pack is reported and excluded;
// it never stops the others and never throws.
import { loadPack } from './loader.js';
import { mergePacks } from './merge.js';
import { loadRegistry } from './registry.js';
import { createSearch } from './search.js';
import { applyShelf, loadShelf } from './shelf.js';

export async function loadHub(raw) {
  // Mock-only: only packaged packs; no local registry overlay, no shelf file.
  const opts = raw.mockOnly ? { ...raw, localPath: '', shelfPath: '' } : raw;
  const reg = loadRegistry(opts);
  const statuses = reg.rejected.map((r) => ({ id: r.id, source: r.source, status: 'invalid', problems: [r.problem] }));
  const accepted = [];
  const owner = new Map(); // pack id -> registry id that provided it
  const results = await Promise.all(reg.entries.map((e) => loadPack(e.source, { within: e.within, mockOnly: opts.mockOnly })));
  reg.entries.forEach((e, i) => {
    const r = results[i];
    if (!r.ok) { statuses.push({ id: e.id, source: e.source, status: 'invalid', problems: r.problems }); return; }
    if (owner.has(r.pack.id)) {
      statuses.push({ id: e.id, source: e.source, status: 'invalid', problems: [`pack id "${r.pack.id}" is already provided by registry entry "${owner.get(r.pack.id)}"; second pack refused`] });
      return;
    }
    owner.set(r.pack.id, e.id);
    accepted.push(r.pack);
    statuses.push({ id: e.id, source: e.source, status: 'ok', problems: [], packId: r.pack.id, version: r.pack.version, counts: undefined });
  });
  const order = new Map(reg.entries.map((e, i) => [e.id, i]));
  statuses.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9) || a.id.localeCompare(b.id));
  const shelf = loadShelf(opts.shelfPath);
  const applied = applyShelf(accepted, shelf);
  const hub = mergePacks(applied.packs, { display: reg.display });
  for (const p of hub.packs) p.demo.urlSource = applied.urlSource[p.id];
  const counts = new Map(hub.packs.map((p) => [p.id, p.counts]));
  for (const s of statuses) if (s.status === 'ok') s.counts = counts.get(s.packId);
  return { hub, statuses, registryProblems: [...reg.problems, ...shelf.problems], search: createSearch(hub), loadedAt: new Date().toISOString() };
}
