import { describe, expect, it } from 'vitest';
import { loadHub } from '../hub.js';
import { snippet, stem } from '../search.js';
import { fx, registryFile, tmp } from './helpers.js';

const hub = await loadHub({ registryPath: registryFile(tmp(), [{ id: 'a', source: fx('valid-a') }, { id: 'b', source: fx('valid-b') }, { id: 'x', source: fx('xss') }]) });
const s = (q, n) => hub.search.search(q, n);

const tieHub = await loadHub({ registryPath: registryFile(tmp(), [{ id: 'tie', source: fx('tie') }]) });

describe('search', () => {
  it('breaks equal scores by kind (term before card) then id', () => {
    const r = tieHub.search.search('zebra').results;
    expect(new Set(r.map((x) => x.score)).size).toBe(1); // identical score, so only the tiebreak orders them
    expect(r.map((x) => `${x.kind}:${x.id}`)).toEqual(['term:tie.yyy', 'term:tie.zzz', 'card:tie.aaa', 'card:tie.bbb']);
  });
  it('truncates the query to 200 characters before tokenising', () => {
    const r = s(`${'x'.repeat(200)} dpop`);
    expect(r.truncated).toBe(true);
    expect(r.results).toEqual([]); // "dpop" sits past the cut, so it is never searched
    expect(s(`${'x'.repeat(190)} dpop`).results.length).toBeGreaterThan(0); // inside the cut it is
  });
  it('finds a term case-insensitively and ranks title hits first', () => {
    const r = s('DPOP').results;
    expect(r[0].title).toMatch(/dpop/i);
    expect(r.some((x) => x.kind === 'term')).toBe(true);
    expect(s('dpop').results.map((x) => x.id)).toEqual(r.map((x) => x.id));
  });
  it('supports prefix and stemming', () => {
    expect(s('replays').results[0].id).toBe('alpha.jti');
    expect(s('possess').results.length).toBeGreaterThan(0);
    expect(s('tokens').results.some((x) => x.id === 'alpha.dpop')).toBe(true);
    expect(stem('exchanging')).toBe(stem('exchange'));
  });
  it('returns matched spans as offsets into plain text, never HTML', () => {
    const r = s('proof').results.find((x) => x.id === 'alpha.dpop');
    expect(r.snippet.matches.length).toBeGreaterThan(0);
    for (const m of r.snippet.matches) expect(r.snippet.text.slice(m.start, m.end).toLowerCase()).toMatch(/^proof/);
    expect(JSON.stringify(r)).not.toMatch(/<mark|<b>/);
  });
  it('title offsets index the title', () => {
    const r = s('try').results.find((x) => x.kind === 'card');
    expect(r.titleMatches.map((m) => r.title.slice(m.start, m.end))).toContain('Try');
  });
  it('ranking is stable', () => {
    const a = JSON.stringify(s('dpop token proof'));
    for (let i = 0; i < 5; i++) expect(JSON.stringify(s('dpop token proof'))).toBe(a);
  });
  it('handles empty, whitespace, punctuation and unknown queries', () => {
    for (const q of ['', '   ', '!!!', 'zzzzqqq', undefined, null]) expect(s(q).results).toEqual([]);
  });
  it('truncates a huge query and bounds the work', () => {
    const q = 'dpop '.repeat(100000);
    const t0 = Date.now();
    const r = s(q);
    expect(r.truncated).toBe(true);
    expect(r.query.length).toBeLessThanOrEqual(200);
    expect(Date.now() - t0).toBeLessThan(500);
    expect(r.results.length).toBeGreaterThan(0);
  });
  it('XSS-looking text comes back as plain text', () => {
    const r = s('alert').results[0];
    expect(r.snippet.text).toMatch(/<script>/);
  });
  it('limit is clamped', () => {
    expect(s('dpop', 1).results).toHaveLength(1);
    expect(s('dpop', 9999).results.length).toBeLessThanOrEqual(50);
  });
});

describe('snippet', () => {
  it('windows long text and shifts offsets', () => {
    const text = 'lorem '.repeat(100) + 'needle ' + 'tail '.repeat(100);
    const i = text.indexOf('needle');
    const sn = snippet(text, [{ start: i, end: i + 6 }]);
    expect(sn.text.length).toBeLessThanOrEqual(200);
    expect(sn.text.slice(sn.matches[0].start, sn.matches[0].end)).toBe('needle');
    expect(sn.truncatedStart && sn.truncatedEnd).toBe(true);
  });
});
