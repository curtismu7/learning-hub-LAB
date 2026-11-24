import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRegistry, sourceProblem } from '../registry.js';
import { fx, registryFile, tmp } from './helpers.js';

describe('sourceProblem', () => {
  it.each([
    ['/abs/ok.json', null],
    ['packs/ok.json', null],
    ['http://127.0.0.1:4999/content-pack.json', null],
    ['http://localhost/x.json', null],
    ['https://[::1]:1/x', null],
  ])('accepts %s', (s, p) => expect(sourceProblem(s)).toBe(p));
  it.each([
    ['/abs/../etc/passwd.json', /\.\./],
    ['packs/../../x.json', /\.\./],
    ['packs/x.txt', /\.json/],
    ['/abs/pack.txt', /\.json/],
    ['/abs/pack.json; rm -rf /', /shell/],
    ['/abs/$(id).json', /shell/],
    ['/abs/`id`.json', /shell/],
    ['http://example.com/x.json', /loopback/],
    ['http://user:pw@127.0.0.1/x.json', /loopback/],
    ['http://127.0.0.1.evil.com/x.json', /loopback/],
    ['file:///etc/passwd', /only absolute/],
    ['ftp://127.0.0.1/x', /only absolute/],
    ['', /non-empty/],
  ])('rejects %s', (s, re) => expect(sourceProblem(s)).toMatch(re));
});

describe('loadRegistry', () => {
  it('accepts valid entries in order and rejects duplicates and bad entries', () => {
    const dir = tmp();
    const file = registryFile(dir, [
      { id: 'one', source: fx('valid-a') },
      { id: 'two', source: fx('valid-b') },
      { id: 'one', source: fx('valid-b') },
      { id: 'Bad Id', source: fx('valid-b') },
      { id: 'esc', source: '/tmp/../etc/passwd.json' },
    ]);
    const r = loadRegistry({ registryPath: file });
    expect(r.entries.map((e) => e.id)).toEqual(['one', 'two']);
    expect(r.rejected.map((e) => e.problem).join('|')).toMatch(/duplicate registry id.*entry id must match.*"\.\."/);
  });
  it('local overrides replace by id and append new ids', () => {
    const dir = tmp();
    const file = registryFile(dir, [{ id: 'one', source: fx('valid-a') }, { id: 'two', source: fx('valid-b') }]);
    const local = path.join(dir, 'local.json');
    writeFileSync(local, JSON.stringify({ packs: [{ id: 'one', source: fx('xss') }, { id: 'three', source: fx('valid-a') }] }));
    const r = loadRegistry({ registryPath: file, localPath: local });
    expect(r.entries).toEqual([{ id: 'one', source: fx('xss') }, { id: 'two', source: fx('valid-b') }, { id: 'three', source: fx('valid-a') }]);
  });
  it('reports a missing or malformed registry without throwing', () => {
    expect(loadRegistry({ registryPath: '/nope/packs.json' }).problems[0]).toMatch(/not found/);
    const dir = tmp(); const f = path.join(dir, 'p.json'); writeFileSync(f, '{nope');
    expect(loadRegistry({ registryPath: f }).problems.length).toBe(1);
    writeFileSync(f, '{"packs": 3}');
    expect(loadRegistry({ registryPath: f }).problems[0]).toMatch(/expected/);
  });
  it('a missing local file is fine', () => {
    const dir = tmp();
    expect(loadRegistry({ registryPath: registryFile(dir, []), localPath: path.join(dir, 'none.json') }).problems).toEqual([]);
  });
});
