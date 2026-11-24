// Browser run of the hub against both real packs plus fixtures. Run by hand (not CI):
//   npm install && npm run build && npx playwright install chromium   (or have Google Chrome installed)
//   npm run e2e
// Starts its own hub on a free port with a throwaway registry and shelf file, drives it with Playwright, saves screenshots to
// e2e-output/ (git-ignored) and exits 1 on the first broken expectation. Needs the ID-JAG kit checkout named in data/packs.json.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'e2e-output');
if (!fs.existsSync(path.join(root, 'web/dist/index.html'))) { console.error('web/dist is missing. Fix: npm run build'); process.exit(1); }
let chromium;
try { ({ chromium } = await import('playwright')); } catch { console.error('playwright is not installed. Fix: npm install'); process.exit(1); }

const shipped = JSON.parse(fs.readFileSync(path.join(root, 'data/packs.json'), 'utf8')).packs; // id-jag (the kit's real pack)
const privPath = path.join(root, 'packs/privilege-demo.pack.json');
const fixture = (n) => path.join(root, 'server/src/__tests__/fixtures', `${n}.json`);
const sources = { 'id-jag': shipped.find((p) => p.id === 'id-jag')?.source, privilege: privPath };
for (const [id, f] of Object.entries(sources)) if (!f || !fs.existsSync(f)) { console.error(`pack source for ${id} not found: ${f}`); process.exit(1); }
const counts = (f) => { const p = JSON.parse(fs.readFileSync(f, 'utf8')); return { terms: p.glossary.length, sources: p.sources.length, cards: p.cards.length, title: p.title }; };

const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const port = await freePort();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-e2e-'));
const registry = path.join(dir, 'packs.json');
fs.writeFileSync(registry, JSON.stringify({ packs: [
  { id: 'id-jag', source: sources['id-jag'] },
  { id: 'privilege', source: privPath },
  { id: 'fixture-alpha', source: fixture('valid-a') },
  { id: 'fixture-bad', source: fixture('invalid-schema') },
] }));
const shelf = path.join(dir, 'demos.json'); // the shelf overrides the privilege pack's own baseUrl
const SHELF_URL = 'http://localhost:4510';
fs.writeFileSync(shelf, JSON.stringify({ demos: [{ id: 'privilege-demo', catalogId: 'D1', url: SHELF_URL }] }));
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const env = { PATH: process.env.PATH, HOME: process.env.HOME, HUB_PORT: String(port), HUB_BIND: '127.0.0.1', HUB_REGISTRY: registry, HUB_LOCAL_REGISTRY: path.join(dir, 'none.json'), HUB_SHELF_URL: shelf };
const server = spawn(process.execPath, ['server/src/index.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stdout.on('data', (d) => { log += d; });
server.stderr.on('data', (d) => { log += d; });
const BASE = `http://127.0.0.1:${port}`;
for (let i = 0; ; i++) {
  if (await fetch(`${BASE}/api/packs`).then((r) => r.ok, () => false)) break;
  if (i > 60 || server.exitCode !== null) { console.error(`hub did not start:\n${log}`); server.kill(); process.exit(1); }
  await new Promise((r) => setTimeout(r, 250));
}

let browser;
const results = [];
const step = async (name, fn) => {
  try { await fn(); results.push([true, name]); console.log(`PASS  ${name}`); } catch (e) { results.push([false, name]); console.log(`FAIL  ${name}\n      ${String(e.message).split('\n')[0]}`); throw e; }
};
const eq = (got, want, what) => { if (got !== want) throw new Error(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); };
const has = (text, part, what) => { if (!text.includes(part)) throw new Error(`${what}: expected to contain ${JSON.stringify(part)}, got ${JSON.stringify(text.slice(0, 200))}`); };

try {
  for (const opts of [{}, { channel: 'chromium' }, { channel: 'chrome' }]) {
    try { browser = await chromium.launch(opts); break; } catch { /* try the next */ }
  }
  if (!browser) throw new Error('no browser found. Fix: npx playwright install chromium (or install Google Chrome)');
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  const idj = counts(sources['id-jag']);
  const priv = counts(privPath);

  await step('home lists both real packs with their real counts, and the bad fixture as invalid', async () => {
    await page.goto(`${BASE}/`);
    await page.getByRole('heading', { name: 'Loaded packs' }).waitFor();
    const cardFor = (title) => page.locator('li.card', { has: page.getByRole('heading', { name: title, exact: true }) });
    eq((await cardFor(idj.title).locator('dd').allInnerTexts()).slice(0, 3).join(','), [idj.terms, idj.sources, idj.cards].join(','), 'ID-JAG counts');
    eq((await cardFor(priv.title).locator('dd').allInnerTexts()).slice(0, 3).join(','), [priv.terms, priv.sources, priv.cards].join(','), 'Privilege counts');
    eq(await page.locator('li.card[data-status="invalid"]').count(), 1, 'invalid pack cards');
    eq(await page.locator('li.card[data-status="ok"]').count(), 3, 'ok pack cards');
    await shot('01-home');
  });

  await step('invalid pack banner names the bad pack and links to the Packs page', async () => {
    const banner = page.getByRole('alert').first();
    has(await banner.innerText(), '1 pack failed validation', 'banner');
    has(await banner.innerText(), 'fixture-bad', 'banner');
    await banner.getByRole('link', { name: 'See the Packs page' }).click();
    await page.getByRole('heading', { name: 'Packs' }).waitFor();
    has(await page.locator('tr[data-status="invalid"]').innerText(), 'fixture-bad', 'packs table');
    await shot('02-packs');
  });

  await step('search finds a term both demos define, and the term page shows both definitions side by side', async () => {
    await page.goto(`${BASE}/search?q=${encodeURIComponent('actor token')}`);
    const hit = page.locator('ol.results a', { hasText: 'Actor token (act)' }).first();
    await hit.waitFor();
    await shot('03-search');
    await hit.click();
    await page.getByRole('heading', { name: 'Definitions' }).waitFor();
    const defs = page.locator('ul.side > li');
    eq(await defs.count(), 2, 'definitions on the term page');
    const text = await defs.allInnerTexts();
    has(text.join('\n'), idj.title, 'ID-JAG heading');
    has(text.join('\n'), 'Privilege policy demo', 'Privilege heading');
    has(text.join('\n'), 'mcp:InvokeUnattended', 'Privilege definition');
    has(text.join('\n'), 'Delegation: the agent presents its own token as the actor', 'ID-JAG definition');
    eq(await page.locator('ul.side > li[data-chosen]').count(), 1, 'one shown-by-default definition');
    await shot('04-term-side-by-side');
  });

  await step('deep link #term-<id> lands on the term, marked and focused', async () => {
    await page.goto(`${BASE}/glossary#term-id-jag.actor-token`);
    const el = page.locator('[id="term-id-jag.actor-token"]');
    await el.waitFor();
    await page.waitForFunction(() => document.activeElement?.id === 'term-id-jag.actor-token');
    eq(await el.getAttribute('data-hl'), '1', 'highlight mark');
    has(await el.innerText(), '2 demos', 'term shows the demo count');
    await shot('05-deep-link');
  });

  await step('a term only the Privilege pack defines is searchable, and its card opens the demo address from the shelf', async () => {
    await page.goto(`${BASE}/search?q=default-deny`);
    await page.locator('ol.results a', { hasText: 'Default deny' }).first().waitFor();
    await page.goto(`${BASE}/cards`);
    const section = page.locator('section', { has: page.getByRole('heading', { name: priv.title, exact: true }) });
    eq(await section.getByRole('link', { name: 'Open the demo' }).getAttribute('href'), SHELF_URL, 'demo link');
    has(await section.innerText(), 'address from the demo shelf', 'url source note');
    eq(await section.getByRole('link', { name: 'Open in the demo' }).first().getAttribute('href'), `${SHELF_URL}/approvals`, 'card link');
    await shot('06-cards-shelf-link');
  });

  await step('presenter mode hides the admin clutter and the banner, and p leaves it', async () => {
    await page.goto(`${BASE}/`);
    await page.getByRole('heading', { name: 'Loaded packs' }).waitFor();
    await page.keyboard.press('p');
    await page.waitForFunction(() => document.documentElement.dataset.present === '1');
    eq(await page.getByRole('alert').count(), 0, 'alerts in presenter mode');
    eq(await page.getByRole('link', { name: 'Packs', exact: true }).count(), 0, 'Packs nav link');
    await shot('07-presenter');
    await page.keyboard.press('p');
    await page.waitForFunction(() => !document.documentElement.dataset.present);
  });

  await step('no uncaught page errors', async () => { eq(errors.length, 0, `page errors: ${errors.join('; ')}`); });
} catch (e) {
  console.error(`\n${e.message}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
const failed = results.filter(([ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} steps passed. Screenshots: ${OUT}`);
if (failed) process.exitCode = 1;
