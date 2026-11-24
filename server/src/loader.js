// Reads one registered pack (file or loopback URL) with a byte cap, then validates it. Never throws.
import { constants } from 'node:fs';
import { open, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { MAX_FETCH_MS, MAX_PACK_BYTES } from './limits.js';
import { validatePack } from './validate.js';

const tooBig = () => ({ ok: false, problems: [`pack is larger than ${MAX_PACK_BYTES} bytes`] });

const withTimeout = (promise, ms, what) => {
  let t;
  const timer = new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error(what), { code: 'ETIMEDOUT' })), ms); });
  return Promise.race([promise, timer]).finally(() => clearTimeout(t));
};

// `within` (optional): the real path must sit inside this directory (used for repo-relative registry sources).
async function readFileCapped(file, within) {
  const real = await realpath(file); // resolves symlinks, so every check below applies to the real target
  if (!real.endsWith('.json')) return { ok: false, problems: ['file resolves to a non-.json target'] };
  if (within) {
    const root = await realpath(within);
    if (!real.startsWith(root + path.sep)) return { ok: false, problems: ['repo-relative source resolves outside the repo'] };
  }
  // Refuse FIFOs, sockets, devices and directories BEFORE open(): opening a FIFO blocks forever.
  if (!(await stat(real)).isFile()) return { ok: false, problems: ['not a regular file (FIFO, socket, device or directory)'] };
  // O_NONBLOCK keeps open() from blocking if the file is swapped for a FIFO after the stat; fstat re-checks the opened handle.
  const fh = await open(real, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const st = await fh.stat();
    if (!st.isFile()) return { ok: false, problems: ['not a regular file (FIFO, socket, device or directory)'] };
    if (st.size > MAX_PACK_BYTES) return tooBig();
    return { ok: true, text: await withTimeout(fh.readFile('utf8'), MAX_FETCH_MS, 'read timed out') };
  } finally { await fh.close(); }
}

async function readUrlCapped(url) {
  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(MAX_FETCH_MS) });
  if (!res.ok) return { ok: false, problems: [`HTTP ${res.status}`] };
  const len = Number(res.headers.get('content-length'));
  if (len > MAX_PACK_BYTES) return tooBig();
  const chunks = [];
  let total = 0;
  for await (const chunk of res.body) {
    total += chunk.length;
    if (total > MAX_PACK_BYTES) return tooBig();
    chunks.push(chunk);
  }
  return { ok: true, text: Buffer.concat(chunks).toString('utf8') };
}

export async function loadPack(source, { within, mockOnly = false } = {}) {
  try {
    // Mock-only: no network and no file outside the packaged tree, whatever the caller passed.
    if (mockOnly && (/^https?:/i.test(source) || !within)) return { ok: false, problems: ['mock_only: only packaged packs can be read'] };
    const raw = /^https?:/i.test(source) ? await readUrlCapped(source) : await readFileCapped(source, within);
    if (!raw.ok) return raw;
    let json;
    try { json = JSON.parse(raw.text); } catch (e) { return { ok: false, problems: [`not valid JSON: ${e.message.slice(0, 120)}`] }; }
    return validatePack(json);
  } catch (e) {
    return { ok: false, problems: [e.code === 'ENOENT' ? 'file not found' : e.code === 'ETIMEDOUT' ? 'timed out reading the file' : `cannot read: ${String(e.code || e.name || 'error')}`] };
  }
}
