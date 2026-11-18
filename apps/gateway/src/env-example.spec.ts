import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { describe, expect, it } from 'vitest';
import { GatewayConfig } from './gateway-config';
import { gatewayConfigSchema } from './gateway-config.schema';

const ENV_EXAMPLE_FILE = resolve(__dirname, '../.env.example');

const example = parseEnv(readFileSync(ENV_EXAMPLE_FILE, 'utf8'));

describe('.env.example', () => {
  it('declares exactly the variables the gateway configuration accepts', () => {
    expect(Object.keys(example).sort()).toEqual(Object.keys(gatewayConfigSchema.shape).sort());
  });

  it('holds values the gateway configuration accepts', () => {
    expect(() => new GatewayConfig(example)).not.toThrow();
  });
});
