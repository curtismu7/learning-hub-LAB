import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const fx = (name) => fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url));
export const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'hub-test-'));
export function registryFile(dir, packs, extra = {}) {
  const file = path.join(dir, 'packs.json');
  writeFileSync(file, JSON.stringify({ packs, ...extra }));
  return file;
}
