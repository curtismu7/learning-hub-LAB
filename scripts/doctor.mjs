#!/usr/bin/env node
// npm run doctor -- [--json]   Checks Node, the port, the registry and every registered pack. Exit 1 on any failure. Prints no secrets.
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { config } from '../server/src/config.js';
import { loadHub } from '../server/src/hub.js';
import { loadRegistry } from '../server/src/registry.js';

try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); } catch { /* no .env */ }
const cfg = config();
const checks = [];
const add = (id, ok, message, fix, level = 'fail') => checks.push({ id, status: ok ? 'pass' : level, message, ...(ok ? {} : { fix }) });

const major = Number(process.versions.node.split('.')[0]);
add('node', major >= 20, `Node ${process.versions.node}`, 'install Node 20 or newer');

const free = await new Promise((resolve) => {
  const s = net.createServer();
  s.once('error', () => resolve(false));
  s.listen(cfg.port, cfg.host, () => s.close(() => resolve(true)));
});
add('port', free, free ? `${cfg.host}:${cfg.port} is free` : `${cfg.host}:${cfg.port} is in use (the hub may already be running)`, 'stop whatever uses the port or set HUB_PORT');

const state = await loadHub({ registryPath: cfg.registryPath, localPath: cfg.localPath, shelfPath: cfg.shelfPath });
add('registry', state.registryProblems.length === 0, state.registryProblems.join('; ') || `${state.statuses.length} registry entries`, 'fix data/packs.json (an array under "packs") or HUB_SHELF_URL (absolute path to the shelf registry)');
// A shipped seed path (data/packs.json) is a path on the author's machine; on a clean clone it may not exist. That is a WARN, not a FAIL.
const seedSources = new Set(loadRegistry({ registryPath: cfg.registryPath }).entries.map((e) => e.source));
for (const s of state.statuses) {
  const missingSeed = s.status !== 'ok' && s.problems[0] === 'file not found' && seedSources.has(s.source);
  if (missingSeed) add(`pack:${s.id}`, false, `seed path does not exist on this machine: ${s.source} (pack excluded)`, 'point this id at your own checkout in .data/packs.local.json (see README, "Packs")', 'warn');
  else add(`pack:${s.id}`, s.status === 'ok', s.status === 'ok' ? `ok, v${s.version}` : s.problems.slice(0, 3).join('; '), 'fix the pack or remove its registry entry; the hub excludes it until then');
}

const ok = checks.every((c) => c.status !== 'fail');
if (process.argv.includes('--json')) console.log(JSON.stringify({ schema: 'demo-doctor/1', demo: 'learning-hub', ok, checks }, null, 2));
else for (const c of checks) console.log(`${c.status === 'pass' ? 'PASS' : c.status === 'warn' ? 'WARN' : 'FAIL'}  ${c.id}: ${c.message}${c.fix ? `\n      fix: ${c.fix}` : ''}`);
process.exit(ok ? 0 : 1);
