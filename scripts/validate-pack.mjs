#!/usr/bin/env node
// npm run validate-pack -- <pack.json> [...]   Validates packs exactly as the hub does. Exit 1 if any is invalid.
import { loadPack } from '../server/src/loader.js';
import path from 'node:path';

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: npm run validate-pack -- <pack.json> [...]'); process.exit(2); }
let bad = 0;
for (const f of files) {
  const r = await loadPack(path.resolve(f));
  if (r.ok) console.log(`PASS  ${f}  (${r.pack.id} v${r.pack.version}: ${r.pack.glossary.length} terms, ${r.pack.sources.length} sources, ${r.pack.cards.length} cards)`);
  else { bad++; console.log(`FAIL  ${f}`); r.problems.forEach((p) => console.log(`      ${p}`)); }
}
process.exit(bad ? 1 : 0);
