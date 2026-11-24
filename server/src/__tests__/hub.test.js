import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadHub } from '../hub.js';
import { fx, registryFile, tmp } from './helpers.js';

const entries = (...names) => names.map((n) => ({ id: n.replace(/[^a-z]/g, '') || 'x', source: fx(n) }));
const load = (packs, extra) => loadHub({ registryPath: registryFile(tmp(), packs, extra) });

describe('loadHub', () => {
  it('excludes every kind of bad pack, keeps the good one, and never throws', async () => {
    const dir = tmp();
    const big = path.join(dir, 'big.json');
    writeFileSync(big, JSON.stringify({ pad: 'x'.repeat(5 * 1024 * 1024 + 10) }));
    const s = await load([
      { id: 'good', source: fx('valid-a') },
      { id: 'badschema', source: fx('invalid-schema') },
      { id: 'badver', source: fx('wrong-version') },
      { id: 'collide', source: fx('colliding-id') },
      { id: 'oversized', source: big },
      { id: 'escape', source: '/tmp/x/../../etc/passwd.json' },
      { id: 'missing', source: '/nonexistent/pack.json' },
    ]);
    const by = Object.fromEntries(s.statuses.map((x) => [x.id, x]));
    expect(by.good.status).toBe('ok');
    for (const id of ['badschema', 'badver', 'collide', 'oversized', 'escape', 'missing']) expect(by[id].status).toBe('invalid');
    expect(by.collide.problems[0]).toMatch(/already provided by registry entry "good"/);
    expect(by.oversized.problems[0]).toMatch(/larger than/);
    expect(by.badver.problems[0]).toMatch(/unsupported pack schema/);
    expect(s.hub.packs.map((p) => p.id)).toEqual(['alpha']);
    expect(s.hub.glossary.length).toBe(2);
  });

  it('does not follow a symlink to a non-.json target', async () => {
    const dir = tmp(); const link = path.join(dir, 'l.json');
    symlinkSync('/etc/hosts', link);
    const s = await load([{ id: 'sym', source: link }]);
    expect(s.statuses[0].status).toBe('invalid');
  });

  it('refuses a symlink to a VALID pack whose real path is not .json (only the real-path check stops it)', async () => {
    const dir = tmp(); const real = path.join(dir, 'pack.dat'); const link = path.join(dir, 'l.json');
    copyFileSync(fx('valid-a'), real);
    symlinkSync(real, link);
    const s = await load([{ id: 'sym', source: link }]);
    expect(s.statuses[0]).toMatchObject({ status: 'invalid' });
    expect(s.statuses[0].problems[0]).toMatch(/non-\.json target/);
  });

  it('refuses a repo-relative source whose symlink leaves the repo, even to a valid .json pack', async () => {
    const root = tmp(); const outside = tmp();
    copyFileSync(fx('valid-a'), path.join(outside, 'real.json'));
    symlinkSync(path.join(outside, 'real.json'), path.join(root, 'link.json'));
    copyFileSync(fx('valid-b'), path.join(root, 'inside.json'));
    const s = await loadHub({ registryPath: registryFile(tmp(), [{ id: 'esc', source: 'link.json' }, { id: 'in', source: 'inside.json' }]), root });
    const by = Object.fromEntries(s.statuses.map((x) => [x.id, x]));
    expect(by.esc.status).toBe('invalid');
    expect(by.esc.problems[0]).toMatch(/outside the repo/);
    expect(by.in.status).toBe('ok');
  });

  it('reads a repo-relative source from the given root and rejects ".." escapes', async () => {
    const root = tmp(); mkdirSync(path.join(root, 'packs'));
    copyFileSync(fx('valid-a'), path.join(root, 'packs', 'a.json'));
    const s = await loadHub({ registryPath: registryFile(tmp(), [{ id: 'rel', source: 'packs/a.json' }, { id: 'up', source: '../a.json' }]), root });
    const by = Object.fromEntries(s.statuses.map((x) => [x.id, x]));
    expect(by.rel).toMatchObject({ status: 'ok', source: path.join(root, 'packs', 'a.json') });
    expect(by.up.status).toBe('invalid');
    expect(by.up.problems[0]).toMatch(/\.\./);
  });

  it('a FIFO named *.json is reported invalid within a second; other packs load; reload still completes', async () => {
    const dir = tmp(); const fifo = path.join(dir, 'pipe.json');
    execFileSync('mkfifo', [fifo]);
    const t0 = Date.now();
    const s = await load([{ id: 'good', source: fx('valid-a') }, { id: 'pipe', source: fifo }]);
    const again = await load([{ id: 'good', source: fx('valid-a') }, { id: 'pipe', source: fifo }]); // what POST /api/reload does
    expect(Date.now() - t0).toBeLessThan(1000);
    const by = Object.fromEntries(s.statuses.map((x) => [x.id, x]));
    expect(by.good.status).toBe('ok');
    expect(by.pipe.status).toBe('invalid');
    expect(by.pipe.problems[0]).toMatch(/not a regular file/);
    expect(again.hub.packs.map((p) => p.id)).toEqual(['alpha']);
  });

  it('a directory named *.json is refused as not a regular file', async () => {
    const d = path.join(tmp(), 'dir.json'); mkdirSync(d);
    expect((await load([{ id: 'd', source: d }])).statuses[0].problems[0]).toMatch(/not a regular file/);
  });

  it('merges per-demo definitions, namespaces ids, resolves cross-links', async () => {
    const s = await load([{ id: 'a', source: fx('valid-a') }, { id: 'b', source: fx('valid-b') }]);
    const dpop = s.hub.glossary.find((g) => g.key === 'dpop');
    expect(dpop.definitions.map((d) => d.id)).toEqual(['alpha.dpop', 'beta.dpop']);
    expect(dpop.display).toBe('alpha.dpop');
    expect(dpop.definitions[1].definition).toMatch(/Sender-constrained/);
    expect(dpop.cards).toEqual(['alpha.try', 'beta.try']);
    const card = s.hub.cards.find((c) => c.id === 'beta.try');
    expect(card.terms).toEqual(['beta.dpop']);
    expect(card.story).toBe('beta.S01');
    expect(card.url).toBe('http://localhost:4999/dpop');
    expect(s.hub.stories.map((x) => x.id)).toEqual(['alpha.S01', 'beta.S01']);
  });

  it('display definition is overridable', async () => {
    const s = await load([{ id: 'a', source: fx('valid-a') }, { id: 'b', source: fx('valid-b') }], { displayDefinitions: { dpop: 'beta' } });
    expect(s.hub.glossary.find((g) => g.key === 'dpop').display).toBe('beta.dpop');
  });

  it('dedupes a shared source keeping the worst status and oldest check', async () => {
    const s = await load([{ id: 'a', source: fx('valid-a') }, { id: 'b', source: fx('valid-b') }]);
    expect(s.hub.sources).toHaveLength(1);
    expect(s.hub.sources[0]).toMatchObject({ id: 'alpha.rfc9449', aliases: ['beta.rfc9449'], status: 'search-only', checked: '2026-09-01', packIds: ['alpha', 'beta'] });
  });

  it('keeps XSS-looking strings as inert text', async () => {
    const s = await load([{ id: 'x', source: fx('xss') }]);
    expect(s.hub.packs[0].title).toBe('<script>alert(1)</script>');
    expect(s.hub.glossary[0].term).toBe('<img src=x onerror=alert(1)>');
  });

  it('survives an unreadable registry', async () => {
    const s = await loadHub({ registryPath: '/nope/packs.json' });
    expect(s.registryProblems.length).toBe(1);
    expect(s.hub.packs).toEqual([]);
  });

  describe('loopback URL packs', () => {
    const body = readFileSync(fx('valid-a'));
    const server = createServer((req, res) => {
      if (req.url === '/ok') { res.setHeader('content-type', 'application/json'); return res.end(body); }
      // the target is a VALID pack with a different id than 'ok', so only redirect:'error' stops it being accepted
      if (req.url === '/other') { res.setHeader('content-type', 'application/json'); return res.end(readFileSync(fx('valid-b'))); }
      if (req.url === '/redirect') { res.statusCode = 302; res.setHeader('location', '/other'); return res.end(); }
      if (req.url === '/huge') { res.write('{"a":"'); const chunk = 'x'.repeat(1 << 20); let n = 0; const t = setInterval(() => { if (n++ > 6 || res.destroyed) { clearInterval(t); res.end('"}'); } else res.write(chunk); }, 1); return; }
      res.statusCode = 404; res.end();
    });
    const up = new Promise((r) => server.listen(0, '127.0.0.1', r));
    afterAll(() => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }));
    it('loads, and refuses redirects, 404s and oversized bodies', async () => {
      await up;
      const base = `http://127.0.0.1:${server.address().port}`;
      const s = await load([{ id: 'ok', source: `${base}/ok` }, { id: 'redir', source: `${base}/redirect` }, { id: 'nf', source: `${base}/nope` }, { id: 'huge', source: `${base}/huge` }]);
      const by = Object.fromEntries(s.statuses.map((x) => [x.id, x]));
      expect(by.ok.status).toBe('ok');
      expect(by.redir.status).toBe('invalid');
      expect(by.redir.problems[0]).toMatch(/cannot read/);
      expect(s.hub.packs.map((p) => p.id)).toEqual(['alpha']); // beta was not pulled in via the redirect
      expect(by.nf.problems[0]).toMatch(/404/);
      expect(by.huge.problems[0]).toMatch(/larger than/);
    });
  });
});
