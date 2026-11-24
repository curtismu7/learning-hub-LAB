// Pack validation: JSON Schema (a copy of the kit's docs/content-pack.schema.json), then the checks a schema
// cannot express: caps, http(s)-only links, inert text, unique ids, cross-references. Never throws on bad input.
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { MAX_ITEMS, MAX_STRING } from './limits.js';

const schema = JSON.parse(readFileSync(new URL('../schema/content-pack.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const check = ajv.compile(schema);

export const SUPPORTED_SCHEMA = 'demo-content-pack/1';
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/; // no "." (it is the namespace separator)
const CONTROL = /[\0-\x08\x0b\x0c\x0e-\x1f\x7f]/;
const JWT_SHAPE = /eyJ[A-Za-z0-9_-]{10,}\./;
const MAX_PROBLEMS = 20;

function walk(v, at, problems) {
  if (typeof v === 'string') {
    if (v.length > MAX_STRING) problems.push(`${at}: string longer than ${MAX_STRING} characters`);
    else if (CONTROL.test(v)) problems.push(`${at}: contains control characters`);
    else if (JWT_SHAPE.test(v)) problems.push(`${at}: looks like a raw token; packs must not carry tokens`);
  } else if (Array.isArray(v)) {
    if (v.length > MAX_ITEMS) problems.push(`${at}: more than ${MAX_ITEMS} items`);
    else v.forEach((x, i) => walk(x, `${at}/${i}`, problems));
  } else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) walk(x, `${at}/${k}`, problems);
  }
}

function httpUrl(s) {
  try { const u = new URL(s); return (u.protocol === 'http:' || u.protocol === 'https:') && !u.username && !u.password; } catch { return false; }
}
const routePath = (s) => typeof s === 'string' && s.startsWith('/') && !s.startsWith('//') && !/[\\\0-\x1f]/.test(s);
const relPath = (s) => typeof s === 'string' && s && !s.startsWith('/') && !/[\\\0-\x1f]/.test(s) && !s.split('/').includes('..');

// "On the wire" examples must be obviously fake: every URL host is an example/test host, and a quiet step says so.
const FAKE_HOST = /(^|\.)(example\.(com|org|net)|example|invalid|test)$/;
const URL_IN_TEXT = /https?:\/\/([^\s/"'?#:&,;)\]\\]+)/g;
function checkWire(w, at, problems) {
  const hosts = (text) => { for (const m of String(text).matchAll(URL_IN_TEXT)) if (!FAKE_HOST.test(m[1].toLowerCase())) problems.push(`${at}: "${m[1]}" is not an example host (use example.com style hosts)`); };
  const msg = (m) => m && hosts([m.line, ...(m.headers || []), m.body || ''].join('\n'));
  w.steps.forEach((s, i) => {
    const here = `${at}/steps/${i}`;
    if (!s.request && !s.response && !s.quiet) problems.push(`${here}: a step with no request or response needs a "quiet" note saying no traffic happens`);
    msg(s.request); msg(s.response);
    for (const c of [...(s.token?.header || []), ...(s.token?.claims || [])]) hosts(JSON.stringify(c.value));
  });
  (w.links || []).forEach((l, i) => { if (!httpUrl(l.url)) problems.push(`${at}/links/${i}/url: must be an http(s) URL`); });
}

function uniqueIds(list, label, problems) {
  const seen = new Set();
  list.forEach((x, i) => {
    if (!ID_RE.test(x.id)) problems.push(`/${label}/${i}/id: must match ${ID_RE}`);
    else if (seen.has(x.id)) problems.push(`/${label}/${i}/id: duplicate id "${x.id}"`);
    seen.add(x.id);
  });
  return seen;
}

// -> { ok: true, pack } | { ok: false, problems: string[] }
export function validatePack(pack) {
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) return { ok: false, problems: ['pack must be a JSON object'] };
  if (typeof pack.schema === 'string' && pack.schema !== SUPPORTED_SCHEMA) {
    return { ok: false, problems: [`unsupported pack schema "${pack.schema.slice(0, 60)}"; this hub reads ${SUPPORTED_SCHEMA} only`] };
  }
  const problems = [];
  walk(pack, '', problems);
  if (problems.length) return { ok: false, problems: problems.slice(0, MAX_PROBLEMS) };
  if (!check(pack)) {
    return { ok: false, problems: check.errors.slice(0, MAX_PROBLEMS).map((e) => `${e.instancePath || '/'} ${e.message}`) };
  }
  const terms = uniqueIds(pack.glossary, 'glossary', problems);
  const sources = uniqueIds(pack.sources, 'sources', problems);
  uniqueIds(pack.cards, 'cards', problems);
  if (pack.diagrams) uniqueIds(pack.diagrams, 'diagrams', problems);
  const stories = pack.stories ? uniqueIds(pack.stories, 'stories', problems) : new Set();
  if (pack.documents) uniqueIds(pack.documents, 'documents', problems);
  pack.sources.forEach((s, i) => { if (!httpUrl(s.url)) problems.push(`/sources/${i}/url: must be an http(s) URL`); });
  pack.cards.forEach((c, i) => {
    const h = c.action.href;
    if (c.action.type === 'external' ? !httpUrl(h) : !routePath(h)) problems.push(`/cards/${i}/action/href: ${c.action.type === 'external' ? 'must be an http(s) URL' : 'must be a path starting with a single "/"'}`);
    for (const t of c.terms || []) if (!terms.has(t)) problems.push(`/cards/${i}/terms: unknown glossary id "${t}"`);
    if (c.wire) checkWire(c.wire, `/cards/${i}/wire`, problems);
    if (c.story && !stories.has(c.story)) problems.push(`/cards/${i}/story: unknown story id "${c.story}"`);
  });
  (pack.diagrams || []).forEach((d, i) => { if (!routePath(d.href)) problems.push(`/diagrams/${i}/href: must be a path starting with a single "/"`); });
  (pack.documents || []).forEach((d, i) => {
    if (!relPath(d.path)) problems.push(`/documents/${i}/path: must be a relative path without ".."`);
    if (d.sourceId && !sources.has(d.sourceId)) problems.push(`/documents/${i}/sourceId: unknown source id "${d.sourceId}"`);
  });
  if (pack.demo.baseUrl && !httpUrl(pack.demo.baseUrl)) problems.push('/demo/baseUrl: must be an http(s) URL');
  if (pack.demo.doctor && !routePath(pack.demo.doctor)) problems.push('/demo/doctor: must be a path starting with a single "/"');
  return problems.length ? { ok: false, problems: problems.slice(0, MAX_PROBLEMS) } : { ok: true, pack };
}
