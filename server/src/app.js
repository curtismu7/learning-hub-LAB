// The hub API. Read-only, no accounts, no secrets. Packs are data: every string leaves as JSON, never as HTML.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import { loadHub } from './hub.js';
import { MAX_QUERY } from './limits.js';

const LOOPBACK_HOST = /^(localhost|127(\.\d+){3}|\[::1\])$/;
export const RELOAD_LIMIT = { max: 5, windowMs: 60_000 };
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url));

export async function createApp({ mockOnly = false, registryPath, localPath, shelfPath, loopbackOnly = true, allowedHosts = [], now = Date.now, webDist = WEB_DIST } = {}) {
  const opts = { registryPath, localPath, shelfPath, mockOnly };
  let state = await loadHub(opts);
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    // DNS-rebinding guard: with HUB_ALLOWED_HOSTS only those host names are answered; otherwise, while bound to loopback, only loopback names.
    const host = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
    if (allowedHosts.length ? !allowedHosts.includes(host) : loopbackOnly && !LOOPBACK_HOST.test(host)) return res.status(403).json({ error: 'host_not_allowed' });
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'" });
    next();
  });

  // Mock-only: the one central refusal. Anything that is not a plain read of /api is refused before any route runs
  // (today that is /api/reload, which re-reads files; a future import/connect route is covered automatically).
  app.use('/api', (req, res, next) => {
    if (mockOnly && !['GET', 'HEAD'].includes(req.method)) return res.status(403).json({ error: 'mock_only', message: 'Disabled in the hosted mock.' });
    next();
  });

  app.get('/api/health', (req, res) => res.json({ ok: true, mode: mockOnly ? 'mock-only' : 'normal' }));
  app.get('/api/packs', (req, res) => res.json({ loadedAt: state.loadedAt, registryProblems: state.registryProblems, packs: mockOnly ? state.statuses.map((x) => ({ ...x, source: path.isAbsolute(x.source) ? path.relative(REPO_ROOT, x.source) : x.source })) : state.statuses }));
  app.get('/api/hub', (req, res) => res.json({ loadedAt: state.loadedAt, ...state.hub }));

  app.get('/api/search', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const limit = Number.parseInt(req.query.limit, 10);
    res.json(state.search.search(q, Number.isFinite(limit) ? limit : 20));
  });

  app.get('/api/terms/:id', (req, res) => {
    const g = state.hub.glossary.find((x) => x.definitions.some((d) => d.id === req.params.id));
    if (!g) return res.status(404).json({ error: 'not_found' });
    res.json({ ...g, cards: g.cards.map((id) => state.hub.cards.find((c) => c.id === id)) });
  });

  const hits = [];
  app.post('/api/reload', async (req, res) => {
    const origin = req.headers.origin;
    if (origin) { let ok = false; try { ok = new URL(origin).host === req.headers.host; } catch { /* bad origin */ } if (!ok) return res.status(403).json({ error: 'origin_not_allowed' }); }
    const t = now();
    while (hits.length && t - hits[0] >= RELOAD_LIMIT.windowMs) hits.shift();
    if (hits.length >= RELOAD_LIMIT.max) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((RELOAD_LIMIT.windowMs - (t - hits[0])) / 1000))));
      return res.status(429).json({ error: 'rate_limited' });
    }
    hits.push(t);
    state = await loadHub(opts);
    res.json({ loadedAt: state.loadedAt, packs: state.statuses });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found', maxQuery: MAX_QUERY }));
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('*', (req, res) => res.sendFile('index.html', { root: webDist }));
  }
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    // A malformed %-escape in the URL is the caller's mistake (400), not ours; the SPA still gets to show its own page.
    if (err.status === 400 && !req.path.startsWith('/api') && existsSync(webDist)) return res.status(400).sendFile('index.html', { root: webDist });
    res.status(err.status === 400 ? 400 : 500).json({ error: err.status === 400 ? 'bad_request' : 'internal' });
  });
  return app;
}
