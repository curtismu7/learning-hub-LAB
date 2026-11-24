import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
// MOCK_ONLY=1|true|yes|on: hosted-mock mode. Packaged data only, no outbound requests, no host files, nothing writable.
const ON = ['1', 'true', 'yes', 'on'];
const OFF = ['0', 'false', 'no', 'off'];
export const isMockOnly = (env = process.env) => ON.includes(String(env.MOCK_ONLY ?? '').trim().toLowerCase());
// HUB_ALLOWED_HOSTS: comma-separated Host names (no port) a non-loopback bind will answer; anything else gets 403.
export const parseAllowedHosts = (v) => String(v ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
export function config(env = process.env) {
  const raw = String(env.MOCK_ONLY ?? '').trim().toLowerCase();
  // An unrecognised value must not silently turn the mock guarantees off.
  if (raw && !ON.includes(raw) && !OFF.includes(raw)) throw new Error(`MOCK_ONLY="${env.MOCK_ONLY}" is not recognised; use one of ${[...ON, ...OFF].join(', ')}`);
  const mockOnly = isMockOnly(env);
  const host = env.HUB_BIND || '127.0.0.1';
  const allowedHosts = parseAllowedHosts(env.HUB_ALLOWED_HOSTS);
  // A hosted mock on a non-loopback bind must name its hosts; it never falls back to answering any Host.
  if (mockOnly && !isLoopbackBind(host) && !allowedHosts.length) throw new Error('MOCK_ONLY on a non-loopback HUB_BIND requires HUB_ALLOWED_HOSTS');
  return {
    mockOnly,
    allowedHosts,
    port: Number(env.HUB_PORT) || 4600,
    host,
    registryPath: (!mockOnly && env.HUB_REGISTRY) || path.join(root, 'data/packs.json'),
    shelfPath: (!mockOnly && env.HUB_SHELF_URL) || '',
    localPath: mockOnly ? '' : env.HUB_LOCAL_REGISTRY || path.join(root, '.data/packs.local.json'),
  };
}
export const isLoopbackBind = (host) => ['127.0.0.1', 'localhost', '::1'].includes(host) || /^127\.\d+\.\d+\.\d+$/.test(host);
