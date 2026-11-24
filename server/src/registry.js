// The pack registry: which packs the hub loads. data/packs.json plus optional local overrides
// (.data/packs.local.json: an entry with the same id replaces the shipped one, new ids are appended).
// An entry is { id, source } where source is an absolute .json file path, a .json path relative to the repo root
// (resolved at load time, must stay inside the repo), or a loopback http(s) URL.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');

const ID_RE = /^[a-z][a-z0-9-]{0,40}$/;
const BAD_CHARS = /[\0-\x1f\x7f;|&$`<>(){}*?!\\"'~]/; // control chars and shell metacharacters (a path is data, never a command)

export function isLoopbackUrl(s) {
  let u;
  try { u = new URL(s); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || /^127\.\d+\.\d+\.\d+$/.test(u.hostname);
}

// Returns the problem text for a bad source, or null.
export function sourceProblem(source) {
  if (typeof source !== 'string' || !source) return 'source must be a non-empty string';
  if (/^https?:\/\//i.test(source)) {
    return isLoopbackUrl(source) ? null : 'URL sources must be http(s) on loopback (localhost, 127.x, [::1]) with no credentials';
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(source)) return 'only absolute file paths and loopback http(s) URLs are allowed';
  if (BAD_CHARS.test(source)) return 'source contains control or shell characters';
  if (source.split('/').includes('..')) return 'file source must not contain ".." segments';
  if (path.extname(source) !== '.json') return 'file source must end in .json';
  return null;
}

function readJson(file) {
  try { return { value: JSON.parse(readFileSync(file, 'utf8')) }; }
  catch (e) { return e.code === 'ENOENT' ? { missing: true } : { problem: `${file}: ${e.message}` }; }
}

// -> { entries: [{id, source}], rejected: [{id, source, problem}], display: {termKey: packId}, problems: [] }
export function loadRegistry({ registryPath, localPath, root = REPO_ROOT, mockOnly = false }) {
  const out = { entries: [], rejected: [], display: {}, problems: [] };
  const merged = new Map(); // id -> raw entry, registry order kept
  for (const [file, required] of [[registryPath, true], [localPath, false]]) {
    if (!file) continue;
    const r = readJson(file);
    if (r.missing) { if (required) out.problems.push(`registry not found: ${file}`); continue; }
    if (r.problem) { out.problems.push(r.problem); continue; }
    const doc = r.value;
    if (!doc || typeof doc !== 'object' || !Array.isArray(doc.packs)) { out.problems.push(`${file}: expected { "packs": [...] }`); continue; }
    if (doc.displayDefinitions && typeof doc.displayDefinitions === 'object') Object.assign(out.display, doc.displayDefinitions);
    const seen = new Set();
    for (const e of doc.packs) {
      const id = e && typeof e.id === 'string' ? e.id : '';
      if (!ID_RE.test(id)) { out.rejected.push({ id: id || '(missing)', source: String(e?.source ?? ''), problem: 'entry id must match ^[a-z][a-z0-9-]{0,40}$' }); continue; }
      if (seen.has(id)) { out.rejected.push({ id, source: String(e.source ?? ''), problem: `duplicate registry id "${id}" in ${path.basename(file)}` }); continue; }
      seen.add(id);
      merged.set(id, e); // a local entry replaces the shipped one in place
    }
  }
  for (const [id, e] of merged) {
    const problem = sourceProblem(e.source);
    if (problem) out.rejected.push({ id, source: String(e.source ?? ''), problem });
    else if (mockOnly && (/^https?:/i.test(e.source) || path.isAbsolute(e.source))) { /* not packaged: skipped quietly under mock-only, never shown to visitors as a registry error */ }
    else if (/^https?:/i.test(e.source) || path.isAbsolute(e.source)) out.entries.push({ id, source: e.source });
    else {
      const resolved = path.resolve(root, e.source);
      if (!resolved.startsWith(path.resolve(root) + path.sep)) out.rejected.push({ id, source: e.source, problem: 'repo-relative source must stay inside the repo' });
      else out.entries.push({ id, source: resolved, within: root });
    }
  }
  return out;
}
