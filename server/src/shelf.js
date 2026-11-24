// Optional link-out from the SE demo shelf. HUB_SHELF_URL is the absolute path of the shelf's registry file
// (demo-shelf data/demos.json: { demos: [{ id, catalogId, url }] }). A shelf url overrides a pack's demo.baseUrl,
// matched by catalog id first, then by demo id. A bad file or entry is reported and ignored; it never stops the hub.
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const MAX_BYTES = 1024 * 1024;
const httpUrl = (s) => { try { const u = new URL(s); return (u.protocol === 'http:' || u.protocol === 'https:') && !u.username && !u.password; } catch { return false; } };

// -> { byCatalog: Map, byId: Map, problems: string[] }
export function loadShelf(file) {
  const out = { byCatalog: new Map(), byId: new Map(), problems: [] };
  if (!file) return out;
  if (!path.isAbsolute(file) || path.extname(file) !== '.json') { out.problems.push('HUB_SHELF_URL must be an absolute path to a .json file'); return out; }
  let doc;
  try {
    if (statSync(file).size > MAX_BYTES) { out.problems.push(`shelf registry is larger than ${MAX_BYTES} bytes`); return out; }
    doc = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) { out.problems.push(e.code === 'ENOENT' ? `shelf registry not found: ${file}` : `shelf registry unreadable: ${String(e.code || e.name)}`); return out; }
  if (!doc || !Array.isArray(doc.demos)) { out.problems.push('shelf registry: expected { "demos": [...] }'); return out; }
  for (const d of doc.demos) {
    if (!d || typeof d.url !== 'string') continue;
    if (!httpUrl(d.url)) { out.problems.push(`shelf entry "${String(d.id).slice(0, 40)}": url must be http(s) without credentials`); continue; }
    if (typeof d.catalogId === 'string') out.byCatalog.set(d.catalogId, d.url);
    if (typeof d.id === 'string') out.byId.set(d.id, d.url);
  }
  return out;
}

// Returns shallow copies of the packs with demo.baseUrl replaced where the shelf knows the demo, plus where each url came from.
export function applyShelf(packs, shelf) {
  const urlSource = {};
  const out = packs.map((p) => {
    const url = shelf.byCatalog.get(p.demo.catalog) ?? shelf.byId.get(p.demo.id);
    if (url) { urlSource[p.id] = 'shelf'; return { ...p, demo: { ...p.demo, baseUrl: url } }; }
    urlSource[p.id] = p.demo.baseUrl ? 'pack' : null;
    return p;
  });
  return { packs: out, urlSource };
}
