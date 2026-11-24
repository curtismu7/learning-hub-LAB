import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validatePack } from '../validate.js';
import { loadPack } from '../loader.js';
import { fx } from './helpers.js';

const load = (n) => JSON.parse(readFileSync(fx(n), 'utf8'));
const jwt = () => ['ey' + 'J' + 'hbGciOiJSUzI1NiJ9', 'e30', 'c2ln'].join('.'); // built at runtime so no token literal is committed

describe('validatePack', () => {
  it('accepts a valid pack', () => expect(validatePack(load('valid-a')).ok).toBe(true));
  it('rejects a schema violation with the path', () => {
    const r = validatePack(load('invalid-schema'));
    expect(r.ok).toBe(false);
    expect(r.problems.join()).toMatch(/glossary/);
  });
  it('refuses an unknown schema version with a clear message', () => {
    const r = validatePack(load('wrong-version'));
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/unsupported pack schema "demo-content-pack\/2".*demo-content-pack\/1/);
  });
  it('rejects non-http(s) source links', () => {
    expect(validatePack(load('bad-link')).problems.join()).toMatch(/sources\/0\/url.*http/);
  });
  it('rejects javascript: external card links and protocol-relative routes', () => {
    const a = load('valid-a'); a.cards[0].action = { type: 'external', href: 'javascript:alert(1)' };
    expect(validatePack(a).ok).toBe(false);
    const b = load('valid-a'); b.cards[0].action.href = '//evil.example/x';
    expect(validatePack(b).ok).toBe(false);
  });
  it('rejects overlong strings, control characters and raw tokens', () => {
    const a = load('valid-a'); a.glossary[0].definition = 'x'.repeat(8001);
    expect(validatePack(a).problems.join()).toMatch(/longer than/);
    const b = load('valid-a'); b.glossary[0].definition = 'a\u0000b';
    expect(validatePack(b).problems.join()).toMatch(/control/);
    const c = load('valid-a'); c.glossary[0].definition = `bearer ${jwt()}`;
    expect(validatePack(c).problems.join()).toMatch(/raw token/);
  });
  it('rejects duplicate ids, dangling term/story refs and escaping document paths', () => {
    const a = load('valid-a'); a.glossary.push({ ...a.glossary[0] });
    expect(validatePack(a).problems.join()).toMatch(/duplicate id/);
    const b = load('valid-a'); b.cards[0].terms = ['nope']; b.cards[0].story = 'S99';
    expect(validatePack(b).problems.join()).toMatch(/unknown glossary id.*|unknown story id/s);
    const c = load('valid-a'); c.documents = [{ id: 'd', path: '../../etc/passwd', title: 't' }];
    expect(validatePack(c).problems.join()).toMatch(/documents\/0\/path/);
  });
  it('rejects an unknown glossary id on its own (the story reference is valid)', () => {
    const b = load('valid-a'); b.cards[0].terms = ['nope'];
    const r = validatePack(b);
    expect(r.ok).toBe(false);
    expect(r.problems).toEqual(['/cards/0/terms: unknown glossary id "nope"']);
  });
  it('rejects an unknown story id on its own (the term reference is valid)', () => {
    const b = load('valid-a'); b.cards[0].story = 'S99';
    expect(validatePack(b).problems).toEqual(['/cards/0/story: unknown story id "S99"']);
  });
  it('keeps XSS-looking strings as inert text, unchanged', () => {
    const r = validatePack(load('xss'));
    expect(r.ok).toBe(true);
    expect(r.pack.glossary[0].term).toBe('<img src=x onerror=alert(1)>');
  });
  it('never throws on junk', () => {
    for (const v of [null, 3, 'x', [], {}]) expect(validatePack(v).ok).toBe(false);
  });
});

describe('loadPack', () => {
  it('reports a missing file and bad JSON without throwing', async () => {
    expect((await loadPack('/nonexistent/dir/p.json')).problems[0]).toMatch(/not found/);
    expect((await loadPack(fx('valid-a').replace('valid-a.json', 'README-none.json'))).ok).toBe(false);
  });
});
