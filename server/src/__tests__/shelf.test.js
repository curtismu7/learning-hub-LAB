import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadHub } from '../hub.js';
import { applyShelf, loadShelf } from '../shelf.js';
import { fx, registryFile, tmp } from './helpers.js';

const shelfFile = (doc) => { const f = path.join(tmp(), 'demos.json'); writeFileSync(f, typeof doc === 'string' ? doc : JSON.stringify(doc)); return f; };
const packs = [{ id: 'alpha', demo: { id: 'demo-a', catalog: 'C1' } }, { id: 'beta', demo: { id: 'demo-b', catalog: 'D1', baseUrl: 'http://localhost:1' } }, { id: 'gamma', demo: { id: 'demo-c', catalog: 'X9' } }];

describe('shelf link-out', () => {
  it('maps by catalog id, then demo id; a shelf url beats the pack baseUrl; others keep theirs', () => {
    const shelf = loadShelf(shelfFile({ demos: [{ id: 'other', catalogId: 'C1', url: 'http://localhost:2' }, { id: 'demo-b', catalogId: 'Z', url: 'http://localhost:3' }] }));
    const r = applyShelf(packs, shelf);
    expect(r.packs.map((p) => p.demo.baseUrl)).toEqual(['http://localhost:2', 'http://localhost:3', undefined]);
    expect(r.urlSource).toEqual({ alpha: 'shelf', beta: 'shelf', gamma: null });
    expect(packs[1].demo.baseUrl).toBe('http://localhost:1'); // input not mutated
  });

  it('catalogId wins over id when the two keys map to different urls (precedence is catalogId first)', () => {
    const shelf = loadShelf(shelfFile({ demos: [{ id: 'demo-a', url: 'http://localhost:11' }, { id: 'zzz', catalogId: 'C1', url: 'http://localhost:22' }] }));
    expect(applyShelf([packs[0]], shelf).packs[0].demo.baseUrl).toBe('http://localhost:22');
  });

  it('reports a bad file or entry and ignores it', () => {
    expect(loadShelf('relative.json').problems[0]).toMatch(/absolute path/);
    expect(loadShelf('/nonexistent/demos.json').problems[0]).toMatch(/not found/);
    expect(loadShelf(shelfFile('{nope')).problems[0]).toMatch(/unreadable/);
    expect(loadShelf(shelfFile({ nope: 1 })).problems[0]).toMatch(/expected/);
    const s = loadShelf(shelfFile({ demos: [{ id: 'a', catalogId: 'C1', url: 'javascript:alert(1)' }, { id: 'b', url: 'http://u:p@localhost:1' }] }));
    expect(s.problems).toHaveLength(2);
    expect(s.byCatalog.size + s.byId.size).toBe(0);
  });

  it('surfaces the shelf url and its source through loadHub, and shelf problems with the registry problems', async () => {
    const registryPath = registryFile(tmp(), [{ id: 'good', source: fx('valid-a') }]);
    const s = await loadHub({ registryPath, shelfPath: shelfFile({ demos: [{ id: 'x', url: 'http://localhost:9' }] }) });
    expect(s.hub.packs[0].demo).toMatchObject({ baseUrl: 'http://localhost:4999', urlSource: 'pack' }); // the fixture's own baseUrl; no shelf match
    const t = await loadHub({ registryPath, shelfPath: '/nonexistent/demos.json' });
    expect(t.registryProblems[0]).toMatch(/shelf registry not found/);
    expect(t.statuses[0].status).toBe('ok');
  });
});
