import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { describe, expect, it } from 'vitest';
import { loadMockConfig } from './mock-config';
import { mockConfigSchema } from './mock-config.schema';

const ENV_EXAMPLE_FILE = resolve(__dirname, '../.env.example');

const example = parseEnv(readFileSync(ENV_EXAMPLE_FILE, 'utf8'));

describe('.env.example', () => {
  it('declares exactly the variables the mock configuration accepts', () => {
    expect(Object.keys(example).sort()).toEqual(Object.keys(mockConfigSchema.shape).sort());
  });

  it('holds values the mock configuration accepts', () => {
    expect(() => loadMockConfig(example)).not.toThrow();
  });
});
