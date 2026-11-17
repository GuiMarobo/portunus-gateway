import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { loadConfig } from './load-config';

const portSchema = z.object({ PORT: z.coerce.number().int() });

describe('loadConfig', () => {
  it('returns the configuration parsed by the schema, not the raw environment', () => {
    const config = loadConfig(portSchema, { PORT: '8080', UNRELATED: 'ignored' });

    expect(config).toEqual({ PORT: 8080 });
  });

  it('throws a validation error when the environment does not satisfy the schema', () => {
    expect(() => loadConfig(portSchema, { PORT: 'not-a-number' })).toThrow(z.ZodError);
  });
});
