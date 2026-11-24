import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fx, registryFile, tmp } from './helpers.js';

const script = fileURLToPath(new URL('../../../scripts/doctor.mjs', import.meta.url));
const doctor = (registryPath, localPath) => {
  const r = spawnSync(process.execPath, [script, '--json'], { encoding: 'utf8', env: { PATH: process.env.PATH, HUB_PORT: '4687', HUB_REGISTRY: registryPath, HUB_LOCAL_REGISTRY: localPath } });
  return { code: r.status, out: JSON.parse(r.stdout) };
};

describe('doctor and machine-specific seed paths', () => {
  it('WARNs (exit 0) naming a missing seed path, and still passes the packs it can read', () => {
    const seed = registryFile(tmp(), [{ id: 'here', source: fx('valid-a') }, { id: 'gone', source: '/nonexistent/other-mac/content-pack.json' }]);
    const { code, out } = doctor(seed, '/nonexistent/local.json');
    const by = Object.fromEntries(out.checks.map((c) => [c.id, c]));
    expect(code).toBe(0);
    expect(by['pack:here'].status).toBe('pass');
    expect(by['pack:gone'].status).toBe('warn');
    expect(by['pack:gone'].message).toContain('/nonexistent/other-mac/content-pack.json');
    expect(by['pack:gone'].fix).toContain('packs.local.json');
  });

  it('still FAILs a missing path that is not a shipped seed (a typo in a local override)', () => {
    const seed = registryFile(tmp(), [{ id: 'here', source: fx('valid-a') }]);
    const local = registryFile(tmp(), [{ id: 'typo', source: '/nonexistent/typo.json' }]);
    const { code, out } = doctor(seed, local);
    expect(code).toBe(1);
    expect(out.checks.find((c) => c.id === 'pack:typo').status).toBe('fail');
  });

  it('the shipped registry reads the privilege pack from this repo by a repo-relative path', async () => {
    const { readFileSync } = await import('node:fs');
    const reg = JSON.parse(readFileSync(new URL('../../../data/packs.json', import.meta.url), 'utf8'));
    expect(reg.packs.find((p) => p.id === 'privilege').source).toBe('packs/privilege-demo.pack.json');
  });
});
