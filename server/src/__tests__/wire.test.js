import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadHub } from '../hub.js';
import { mergePacks } from '../merge.js';
import { validatePack } from '../validate.js';
import { fx } from './helpers.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const load = (n) => JSON.parse(readFileSync(fx(n), 'utf8'));
const claim = (name, value, note = 'n') => ({ name, value, note });
const step = () => ({
  title: 'Swap', notice: 'Why it matters.',
  request: { line: 'POST https://auth.example.com/token HTTP/1.1', headers: ['Host: auth.example.com'], body: 'a=b' },
  response: { line: 'HTTP/1.1 200 OK' },
  token: { label: 't', header: [claim('alg', 'RS256')], claims: [claim('aud', 'https://billing.example.com'), claim('act', { sub: 'agent' })], signature: 'sig-not-real' },
});
const withWire = (w) => { const p = load('valid-a'); p.cards[0].wire = w; return p; };
const wire = (s = step()) => ({ intro: 'Example data.', steps: [s], links: [{ label: 'RFC', url: 'https://www.rfc-editor.org/rfc/rfc8693' }] });
const problems = (p) => validatePack(p).problems?.join('\n') ?? '';

describe('card wire block (On the wire)', () => {
  it('a pack without it validates and its cards merge with no wire key', () => {
    const p = load('valid-a');
    expect(validatePack(p).ok).toBe(true);
    for (const c of mergePacks([p]).cards) expect('wire' in c).toBe(false);
  });
  it('a valid block passes and is carried through the merge unchanged', () => {
    const p = withWire(wire());
    expect(validatePack(p).ok).toBe(true);
    expect(mergePacks([p]).cards[0].wire).toEqual(p.cards[0].wire);
  });
  it('refuses unknown fields and a signature that is not the placeholder', () => {
    const a = wire(); a.extra = 1;
    expect(problems(withWire(a))).toMatch(/wire/);
    const s = step(); s.token.signature = 'c2lnbmF0dXJl';
    expect(problems(withWire(wire(s)))).toMatch(/signature/);
  });
  it('refuses a URL that is not an example host, in a request, a header, a body or a claim', () => {
    const a = step(); a.request.line = 'GET https://api.pingone.com/x HTTP/1.1';
    expect(problems(withWire(wire(a)))).toMatch(/"api\.pingone\.com" is not an example host/);
    const b = step(); b.response.headers = ['Location: https://real.corp.net/cb'];
    expect(problems(withWire(wire(b)))).toMatch(/real\.corp\.net/);
    const c = step(); c.token.claims = [claim('iss', 'https://login.realcompany.com')];
    expect(problems(withWire(wire(c)))).toMatch(/realcompany/);
    const d = step(); d.request.body = 'redirect_uri=https://evil.example.com.attacker.io/cb';
    expect(problems(withWire(wire(d)))).toMatch(/attacker\.io/);
  });
  it('accepts example.com, .example, .invalid and .test hosts', () => {
    const s = step(); s.request.body = 'a=https://x.example&b=https://y.invalid/p&c=http://z.test:8080/q&d=https://a.b.example.org';
    expect(problems(withWire(wire(s)))).toBe('');
  });
  it('a step with no request or response must say so with "quiet"', () => {
    expect(problems(withWire(wire({ title: 'Sign in', notice: 'n' })))).toMatch(/needs a "quiet" note/);
    expect(validatePack(withWire(wire({ title: 'Sign in', notice: 'n', quiet: 'No traffic.' }))).ok).toBe(true);
  });
  it('refuses a non-http(s) link and a token-shaped string', () => {
    const a = wire(); a.links = [{ label: 'x', url: 'javascript:alert(1)' }];
    expect(problems(withWire(a))).toMatch(/links\/0\/url/);
    const s = step(); s.request.body = ['ey' + 'J' + 'hbGciOiJSUzI1NiJ9', 'e30', 'c2ln'].join('.');
    expect(problems(withWire(wire(s)))).toMatch(/raw token/);
  });
});

describe('shipped packs with wire data', () => {
  const dir = `${root}packs/`;
  const packs = readdirSync(dir).filter((f) => f.endsWith('.pack.json')).map((f) => JSON.parse(readFileSync(dir + f, 'utf8')));
  const wired = packs.flatMap((p) => p.cards.filter((c) => c.wire).map((c) => `${p.id}.${c.id}`));

  it('seven lessons carry a block and every pack still validates', () => {
    expect(wired.sort()).toEqual(['agent-registry-demo.try-workload', 'attack-gallery.story-token-elsewhere', 'id-jag.playground', 'intent-par-inspector.concept-par', 'mcp-tools.connect', 'token-workbench.decode', 'token-workbench.tester']);
    for (const p of packs) expect(validatePack(p).problems ?? [], p.id).toEqual([]);
  });
  it('the MCP lesson links to the 2026-07-28 authorization spec', () => {
    const c = packs.find((p) => p.id === 'mcp-tools').cards.find((x) => x.id === 'connect');
    expect(c.wire.links.map((l) => l.url)).toContain('https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization');
  });
  it('every token claim has a plain-language note and the pack text is labelled as example data', () => {
    for (const p of packs) for (const c of p.cards.filter((x) => x.wire)) {
      expect(c.wire.intro, c.id).toMatch(/^Example data/);
      for (const s of c.wire.steps) for (const r of [...(s.token?.header || []), ...(s.token?.claims || [])]) expect(r.note.length, `${c.id} ${r.name}`).toBeGreaterThan(10);
    }
  });
  it('the real packs load into the hub with every status ok', async () => {
    const s = await loadHub({ registryPath: `${root}data/packs.json` });
    expect(s.statuses.filter((x) => x.status !== 'ok')).toEqual([]);
    expect(s.hub.cards.filter((c) => c.wire).length).toBe(7);
  });
});

describe('server startup with the real packs and schema', () => {
  it('node boots in MOCK_ONLY mode, serves cards with wire data, and exits cleanly when stopped', async () => {
    const port = 46000 + Math.floor(Math.random() * 1000);
    const child = spawn(process.execPath, ['server/src/index.js'], { cwd: root, env: { ...process.env, MOCK_ONLY: '1', HUB_PORT: String(port), HUB_BIND: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    try {
      const deadline = Date.now() + 15000;
      while (!/listening/.test(out) && child.exitCode === null && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
      expect(out, 'startup output').toMatch(/listening.*MOCK_ONLY/);
      const hub = await (await fetch(`http://127.0.0.1:${port}/api/hub`)).json();
      expect(hub.cards.filter((c) => c.wire).length).toBe(7);
      const packs = await (await fetch(`http://127.0.0.1:${port}/api/packs`)).json();
      expect(packs.packs.every((p) => p.status === 'ok')).toBe(true);
    } finally { child.kill(); }
  }, 30000);
});
