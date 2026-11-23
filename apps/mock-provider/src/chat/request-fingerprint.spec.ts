import { describe, expect, it } from 'vitest';
import { canonicalJson, requestFingerprint } from './request-fingerprint';

describe('canonical JSON', () => {
  it.each([
    [{ b: 1, a: { d: 2, c: 3 } }, '{"a":{"c":3,"d":2},"b":1}'],
    [{ list: [3, { f: 1, e: 2 }, 1] }, '{"list":[3,{"e":2,"f":1},1]}'],
    [{ text: 'olá', missing: null }, '{"missing":null,"text":"olá"}'],
  ])('serializes %j with sorted keys and arrays in their order', (value, expected) => {
    expect(canonicalJson(value)).toBe(expected);
  });
});

describe('request fingerprint', () => {
  const request = { model: 'm', messages: [{ role: 'user', content: 'hi' }], limit: null };

  it('is the same when the keys come in another order', () => {
    const reordered = { limit: null, messages: [{ content: 'hi', role: 'user' }], model: 'm' };

    expect(requestFingerprint(reordered)).toEqual(requestFingerprint(request));
  });

  it('changes when a value changes', () => {
    const changed = { ...request, messages: [{ role: 'user', content: 'hi!' }] };

    expect(requestFingerprint(changed)).not.toEqual(requestFingerprint(request));
  });
});
