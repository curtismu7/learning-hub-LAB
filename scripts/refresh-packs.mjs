#!/usr/bin/env node
// npm run refresh-packs [-- --no-fetch] [--only=<id>] [--dry-run]
// Snapshots each demo's published content pack into packs/<id>.pack.json and registers it in data/packs.json (relative paths,
// so a clean clone reads its own copy). Source of truth is data/pack-sources.json: { id, repo, path? } per demo. The pack is
// read from `origin/main` of the sibling checkout <repo> (default: next to this repo, or DEMO_REPOS_DIR), never from the working
// tree, so an unmerged branch cannot leak in. Every pack is validated exactly as the hub does before anything is written;
// an invalid pack is reported and skipped (the previous snapshot stays).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPack } from '../server/src/loader.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7);
const reposDir = process.env.DEMO_REPOS_DIR || path.resolve(root, '..');
const git = (repo, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });

const sources = JSON.parse(fs.readFileSync(path.join(root, 'data', 'pack-sources.json'), 'utf8')).sources;
const regPath = path.join(root, 'data', 'packs.json');
const registry = JSON.parse(fs.readFileSync(regPath, 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-packs-'));
let bad = 0;
const rows = [];

for (const s of sources) {
  if (only && s.id !== only) continue;
  const repo = path.join(reposDir, s.repo);
  try {
    if (!fs.existsSync(path.join(repo, '.git'))) throw new Error(`no checkout at ${repo}`);
    if (!flag('--no-fetch')) { try { git(repo, 'fetch', '--quiet', 'origin'); } catch { /* offline: use what is there */ } }
    const text = git(repo, 'show', `origin/main:${s.path || 'content-pack.json'}`);
    const probe = path.join(tmp, `${s.id}.json`);
    fs.writeFileSync(probe, text);
    const r = await loadPack(probe);
    if (!r.ok) throw new Error(`invalid: ${(r.problems || []).slice(0, 3).join('; ')}`);
    const commit = git(repo, 'rev-parse', '--short', 'origin/main').trim();
    const rel = `packs/${s.id}.pack.json`;
    if (!flag('--dry-run')) {
      fs.writeFileSync(path.join(root, rel), JSON.stringify(JSON.parse(text), null, 2) + '\n');
      const at = registry.packs.findIndex((p) => p.id === (s.registryId || s.id));
      const entry = { id: s.registryId || s.id, source: rel };
      if (at >= 0) registry.packs[at] = entry; else registry.packs.push(entry);
    }
    rows.push(`ok   ${s.id.padEnd(24)} ${r.pack.version.padEnd(7)} ${String(r.pack.glossary.length).padStart(3)} terms ${String(r.pack.cards.length).padStart(3)} cards ${String((r.pack.stories || []).length).padStart(2)} stories  @${commit}`);
  } catch (e) {
    bad++;
    rows.push(`FAIL ${s.id.padEnd(24)} ${String(e.message).split('\n')[0].slice(0, 160)}`);
  }
}
if (!flag('--dry-run')) fs.writeFileSync(regPath, JSON.stringify(registry, null, 2) + '\n');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(rows.join('\n'));
console.log(bad ? `${bad} pack(s) skipped` : 'all packs refreshed');
process.exit(bad ? 1 : 0);
