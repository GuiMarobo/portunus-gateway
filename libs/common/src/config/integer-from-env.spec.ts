import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { integerFromEnv } from './integer-from-env';

const integer = integerFromEnv(z.number().int());

describe('integerFromEnv', () => {
  it.each([
    ['8080', 8080],
    ['-1', -1],
  ])('reads the decimal integer %j as %d', (raw, expected) => {
    expect(integer.parse(raw)).toBe(expected);
  });

  it.each(['0x50', '1e3', ' 80 ', '8080.5', 'abc', ''])(
    'rejects %j because it is not written as a decimal integer',
    (raw) => {
      expect(integer.safeParse(raw).success).toBe(false);
    },
  );
});
