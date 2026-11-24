import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp, RELOAD_LIMIT } from '../app.js';
import { fx, registryFile, tmp } from './helpers.js';

const make = (packs, extra = {}) => createApp({ registryPath: registryFile(tmp(), packs), ...extra });
const good = [{ id: 'a', source: fx('valid-a') }, { id: 'bad', source: fx('invalid-schema') }, { id: 'x', source: fx('xss') }];

describe('API', () => {
  it('a malformed %-escape is a 400 JSON, never a 500', async () => {
    const app = await make(good);
    const r = await request(app).get('/api/terms/%E0%A4%A').expect(400);
    expect(r.body).toEqual({ error: 'bad_request' });
  });
  it('a malformed %-escape on a page path is a 400 serving the SPA page (temp dist, build-independent)', async () => {
    const webDist = path.join(tmp(), 'dist');
    mkdirSync(webDist);
    writeFileSync(path.join(webDist, 'index.html'), '<!doctype html><title>spa</title>');
    const r = await request(await make(good, { webDist })).get('/glossary/%E0%A4%A');
    expect(r.status).toBe(400);
    expect(r.text).toContain('<title>spa</title>');
  });
  it('a malformed %-escape on a page path is never the internal-error JSON when there is no dist', async () => {
    const r = await request(await make(good, { webDist: path.join(tmp(), 'missing') })).get('/glossary/%E0%A4%A');
    expect(r.status).toBe(404);
    expect(r.body.error).not.toBe('internal');
  });
  it('GET /api/packs reports ok and invalid with the problem', async () => {
    const r = await request(await make(good)).get('/api/packs').expect(200);
    const by = Object.fromEntries(r.body.packs.map((p) => [p.id, p]));
    expect(by.a).toMatchObject({ status: 'ok', version: '1.0.0', counts: { glossary: 2, cards: 1 } });
    expect(by.bad.status).toBe('invalid');
    expect(by.bad.problems.length).toBeGreaterThan(0);
  });
  it('GET /api/hub returns the merged index and stays JSON for XSS strings', async () => {
    const r = await request(await make(good)).get('/api/hub').expect(200);
    expect(r.headers['content-type']).toMatch(/application\/json/);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.body.glossary.map((g) => g.id)).toContain('alpha.dpop');
    expect(r.body.packs.find((p) => p.id === 'xss').title).toBe('<script>alert(1)</script>');
  });
  it('GET /api/search', async () => {
    const app = await make(good);
    const r = await request(app).get('/api/search').query({ q: 'proof possession' }).expect(200);
    expect(r.body.results[0].id).toMatch(/dpop/);
    expect((await request(app).get('/api/search')).body.results).toEqual([]);
    expect((await request(app).get('/api/search').query({ q: 'x'.repeat(100000).slice(0, 7000) })).status).toBe(200);
    expect((await request(app).get('/api/search?q=a&q=b')).status).toBe(200);
  });
  it('GET /api/terms/:id returns all per-demo definitions and linked cards; 404 otherwise', async () => {
    const app = await make([{ id: 'a', source: fx('valid-a') }, { id: 'b', source: fx('valid-b') }]);
    const r = await request(app).get('/api/terms/beta.dpop').expect(200);
    expect(r.body.definitions).toHaveLength(2);
    expect(r.body.cards.map((c) => c.id)).toEqual(['alpha.try', 'beta.try']);
    await request(app).get('/api/terms/nope.nope').expect(404);
    await request(app).get('/api/terms/..%2f..%2fetc').expect(404);
    await request(app).get('/api/unknown').expect(404);
  });
  it('POST /api/reload re-reads packs and is rate limited', async () => {
    let t = 1_000_000;
    const dir = tmp();
    const file = registryFile(dir, [{ id: 'a', source: fx('valid-a') }]);
    const app = await createApp({ registryPath: file, now: () => t });
    expect((await request(app).get('/api/packs')).body.packs).toHaveLength(1);
    registryFile(dir, [{ id: 'a', source: fx('valid-a') }, { id: 'b', source: fx('valid-b') }]);
    const r = await request(app).post('/api/reload').expect(200);
    expect(r.body.packs).toHaveLength(2);
    expect((await request(app).get('/api/packs')).body.packs).toHaveLength(2);
    for (let i = 1; i < RELOAD_LIMIT.max; i++) await request(app).post('/api/reload').expect(200);
    const limited = await request(app).post('/api/reload').expect(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    t += RELOAD_LIMIT.windowMs;
    await request(app).post('/api/reload').expect(200);
  });
  it('reload refuses a cross-origin browser request', async () => {
    const app = await make(good);
    await request(app).post('/api/reload').set('Origin', 'https://evil.example').expect(403);
  });
  it('rejects non-loopback Host headers when bound to loopback (DNS rebinding)', async () => {
    const app = await make(good);
    await request(app).get('/api/packs').set('Host', 'evil.example').expect(403);
    const open = await make(good, { loopbackOnly: false });
    await request(open).get('/api/packs').set('Host', 'hub.example').expect(200);
  });
  it('is read-only: no write verbs other than reload', async () => {
    const app = await make(good);
    await request(app).put('/api/hub').expect(404);
    await request(app).delete('/api/packs').expect(404);
    await request(app).post('/api/packs').expect(404);
  });
  it('survives a registry that does not exist', async () => {
    const r = await request(await createApp({ registryPath: '/nope/packs.json' })).get('/api/packs').expect(200);
    expect(r.body.registryProblems).toHaveLength(1);
  });
});
