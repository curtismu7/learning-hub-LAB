import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadHub } from '../hub.js';
import { loadPack } from '../loader.js';
import { registryFile, tmp } from './helpers.js';

const priv = fileURLToPath(new URL('../../../packs/privilege-demo.pack.json', import.meta.url));
const idjag = fileURLToPath(new URL('../../../packs/id-jag.pack.json', import.meta.url));

describe('shipped Privilege pack', () => {
  it('validates against the schema', async () => {
    const r = await loadPack(priv);
    expect(r.problems ?? []).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.pack.stories.map((s) => s.id)).toEqual(['S01', 'S04', 'S05', 'S23']);
  });

  it('cites only URLs found in the privilege-demo README (when that checkout is present)', () => {
    let readme;
    try { readme = readFileSync(process.env.PRIVILEGE_DEMO_README, 'utf8'); } catch { return; }
    const pack = JSON.parse(readFileSync(priv, 'utf8'));
    for (const s of pack.sources) expect(readme).toContain(s.url);
  });

  it('is registered in data/packs.json', () => {
    const reg = JSON.parse(readFileSync(new URL('../../../data/packs.json', import.meta.url), 'utf8'));
    expect(reg.packs.map((p) => p.id)).toContain('privilege');
  });

  it('the shipped registry holds no absolute paths and the hub loads every pack', async () => {
    const reg = JSON.parse(readFileSync(new URL('../../../data/packs.json', import.meta.url), 'utf8'));
    for (const p of reg.packs) expect(p.source, p.id).toMatch(/^packs\//);
    const s = await loadHub({ registryPath: fileURLToPath(new URL('../../../data/packs.json', import.meta.url)) });
    expect(s.statuses.length).toBe(reg.packs.length);
    expect(s.statuses.filter((x) => x.status !== 'ok')).toEqual([]);
  });

  it('merges with the ID-JAG pack: a shared term keeps one definition per demo', async () => {
    const s = await loadHub({ registryPath: registryFile(tmp(), [{ id: 'id-jag', source: idjag }, { id: 'privilege', source: priv }]) });
    expect(s.statuses.map((x) => x.status)).toEqual(['ok', 'ok']);
    const g = s.hub.glossary.find((x) => x.term === 'Actor token (act)');
    expect(g.definitions.map((d) => d.packId)).toEqual(['id-jag', 'privilege']);
    expect(g.display).toBe('id-jag.actor-token');
    expect(new Set(g.definitions.map((d) => d.definition)).size).toBe(2);
    expect(s.hub.packs.map((p) => p.id)).toEqual(['id-jag', 'privilege']);
  });
});
