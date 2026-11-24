import net from 'node:net';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { config, isLoopbackBind, isMockOnly } from '../config.js';
import { loadPack } from '../loader.js';
import { fx, registryFile, tmp } from './helpers.js';

const REFUSED = { error: 'mock_only', message: 'Disabled in the hosted mock.' };
const reg = (packs) => registryFile(tmp(), packs);
afterEach(() => vi.restoreAllMocks());

describe('MOCK_ONLY switch', () => {
  it('accepts 1 and true, nothing else', () => {
    expect([isMockOnly({ MOCK_ONLY: '1' }), isMockOnly({ MOCK_ONLY: 'TRUE' }), isMockOnly({ MOCK_ONLY: '0' }), isMockOnly({})]).toEqual([true, true, false, false]);
  });
  it('yes and on count as on; unrecognised values throw instead of failing open', () => {
    expect([isMockOnly({ MOCK_ONLY: 'yes' }), isMockOnly({ MOCK_ONLY: 'On' }), isMockOnly({ MOCK_ONLY: 'no' }), isMockOnly({ MOCK_ONLY: 'off' })]).toEqual([true, true, false, false]);
    expect(config({ MOCK_ONLY: 'yes' }).mockOnly).toBe(true);
    expect(config({ MOCK_ONLY: 'off' }).mockOnly).toBe(false);
    expect(config({ MOCK_ONLY: '' }).mockOnly).toBe(false);
    expect(() => config({ MOCK_ONLY: 'ture' })).toThrow(/MOCK_ONLY/);
  });
  it('config drops env-supplied registry, local overlay and shelf, and keeps the default bind', () => {
    const c = config({ MOCK_ONLY: '1', HUB_REGISTRY: '/etc/x.json', HUB_SHELF_URL: '/etc/s.json', HUB_LOCAL_REGISTRY: '/etc/l.json' });
    expect(c).toMatchObject({ mockOnly: true, localPath: '', shelfPath: '', host: '127.0.0.1' });
    expect(c.registryPath).toMatch(/data\/packs\.json$/);
  });

  it('refuses reload (and any non-GET /api request) with 403 mock_only', async () => {
    const app = await createApp({ mockOnly: true, registryPath: reg([{ id: 'a', source: fx('valid-a') }]) });
    for (const [m, p] of [['post', '/api/reload'], ['post', '/api/import'], ['put', '/api/packs'], ['delete', '/api/packs']]) {
      const r = await request(app)[m](p);
      expect(r.status, `${m} ${p}`).toBe(403);
      expect(r.body).toEqual(REFUSED);
    }
  });
  it('reload still works with the switch off', async () => {
    const app = await createApp({ registryPath: reg([{ id: 'a', source: fx('valid-a') }]) });
    await request(app).post('/api/reload').expect(200);
  });
  it('reads still work with the switch on', async () => {
    const app = await createApp({ mockOnly: true, registryPath: reg([{ id: 'a', source: fx('valid-a') }]) });
    await request(app).get('/api/hub').expect(200);
  });

  it('health reports the mode', async () => {
    const on = await createApp({ mockOnly: true, registryPath: reg([]) });
    const off = await createApp({ registryPath: reg([]) });
    expect((await request(on).get('/api/health').expect(200)).body).toEqual({ ok: true, mode: 'mock-only' });
    expect((await request(off).get('/api/health').expect(200)).body).toEqual({ ok: true, mode: 'normal' });
  });

  it('serves only packaged packs: URL and absolute-path registry entries are skipped, local overlay and shelf are ignored', async () => {
    const dir = tmp();
    const local = registryFile(dir, [{ id: 'sneaky', source: fx('valid-b') }]);
    const shelf = `${dir}/shelf.json`;
    const app = await createApp({ mockOnly: true, registryPath: reg([{ id: 'abs', source: fx('valid-a') }, { id: 'url', source: 'http://127.0.0.1:9/p.json' }, { id: 'rel', source: 'packs/privilege-demo.pack.json' }]), localPath: local, shelfPath: shelf });
    const r = await request(app).get('/api/packs').expect(200);
    expect(r.body.packs.map((p) => p.id)).toEqual(['rel']);
    expect(r.body.packs[0].source).toBe('packs/privilege-demo.pack.json'); // never the server's absolute path
    expect(r.body.registryProblems).toEqual([]); // skipped entries are not a visitor-facing error
  });
  it('the real data/packs.json shows visitors no registry error under mock-only', async () => {
    const app = await createApp({ mockOnly: true, registryPath: config({ MOCK_ONLY: '1' }).registryPath });
    const r = await request(app).get('/api/packs').expect(200);
    expect(r.body.registryProblems).toEqual([]);
  });
  it('the real registry reports every pack source relative to the repo root', async () => {
    const app = await createApp({ mockOnly: true, registryPath: config({ MOCK_ONLY: '1' }).registryPath });
    const r = await request(app).get('/api/packs').expect(200);
    expect(r.body.packs.length).toBeGreaterThan(10);
    for (const p of r.body.packs) expect(p.source, p.id).toMatch(/^packs\/[a-z0-9-]+\.pack\.json$/);
  });
  it('loadPack itself refuses URLs and un-rooted files under mock-only', async () => {
    expect((await loadPack('http://127.0.0.1:9/p.json', { mockOnly: true })).problems[0]).toMatch(/mock_only/);
    expect((await loadPack(fx('valid-a'), { mockOnly: true })).problems[0]).toMatch(/mock_only/);
  });

  it('makes zero outbound attempts while loading, reloading and serving', async () => {
    const attempts = [];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => { attempts.push(`fetch ${u}`); throw new Error('blocked'); });
    // No netguard helper exists in this repo, so spy on the socket layer: loopback (supertest's own server) passes, anything else is recorded and blocked.
    const realConnect = net.Socket.prototype.connect;
    vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(function guard(...a) {
      const o = a[0] && typeof a[0] === 'object' && !Array.isArray(a[0]) ? a[0] : { port: a[0], host: a[1] };
      if (o.path || /^(127\.|::1$|localhost$)/.test(String(o.host ?? 'localhost'))) return realConnect.apply(this, a);
      attempts.push(`connect ${o.host}:${o.port}`);
      throw new Error('blocked');
    });
    const app = await createApp({ mockOnly: true, registryPath: reg([{ id: 'url', source: 'https://example.com/p.json' }, { id: 'rel', source: 'packs/privilege-demo.pack.json' }]) });
    await request(app).post('/api/reload');
    await request(app).get('/api/hub');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(attempts).toEqual([]);
  });
});

describe('hosting the mock', () => {
  const hosted = { MOCK_ONLY: '1', HUB_BIND: '0.0.0.0', HUB_ALLOWED_HOSTS: 'Hub.Example.com, hub2.example.com' };
  const appFor = async (env) => { const c = config(env); return createApp({ mockOnly: c.mockOnly, registryPath: reg([{ id: 'rel', source: 'packs/privilege-demo.pack.json' }]), loopbackOnly: isLoopbackBind(c.host), allowedHosts: c.allowedHosts }); };

  it('serves the allowed Host (any port, any case) and rejects every other Host', async () => {
    const app = await appFor(hosted);
    await request(app).get('/api/health').set('Host', 'hub.example.com').expect(200);
    await request(app).get('/api/health').set('Host', 'HUB2.example.com:8080').expect(200);
    for (const h of ['evil.example', 'hub.example.com.evil.example', '127.0.0.1', 'localhost']) {
      const r = await request(app).get('/api/hub').set('Host', h);
      expect(r.status, h).toBe(403);
      expect(r.body).toEqual({ error: 'host_not_allowed' });
    }
  });
  it('is still mock-only when hosted: writes refused', async () => {
    const app = await appFor(hosted);
    await request(app).post('/api/reload').set('Host', 'hub.example.com').expect(403);
  });
  it('without the settings the bind stays loopback and non-loopback Hosts are refused', async () => {
    const c = config({ MOCK_ONLY: '1' });
    expect(c).toMatchObject({ host: '127.0.0.1', allowedHosts: [] });
    const app = await appFor({ MOCK_ONLY: '1' });
    await request(app).get('/api/health').set('Host', '127.0.0.1:4600').expect(200);
    await request(app).get('/api/health').set('Host', 'hub.example.com').expect(403);
  });
  it('a non-loopback bind without HUB_ALLOWED_HOSTS refuses to start under MOCK_ONLY', () => {
    expect(() => config({ MOCK_ONLY: '1', HUB_BIND: '0.0.0.0' })).toThrow(/HUB_ALLOWED_HOSTS/);
  });
});
