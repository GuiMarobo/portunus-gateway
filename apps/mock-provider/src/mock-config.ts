import { loadConfig, type RawEnvironment } from '@portunus/common';
import type { z } from 'zod';
import { mockConfigSchema } from './mock-config.schema';

export type MockConfig = Readonly<z.output<typeof mockConfigSchema>>;

export function loadMockConfig(environment: RawEnvironment): MockConfig {
  return loadConfig(mockConfigSchema, environment);
}
