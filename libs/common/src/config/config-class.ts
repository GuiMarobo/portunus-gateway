import type { z } from 'zod';
import { loadConfig, type RawEnvironment } from './load-config';

export type ConfigClass<TSchema extends z.ZodType<object>> = new (
  environment: RawEnvironment,
) => Readonly<z.output<TSchema>>;

export function configClass<TSchema extends z.ZodType<object>>(
  schema: TSchema,
): ConfigClass<TSchema> {
  return class {
    constructor(environment: RawEnvironment) {
      Object.assign(this, loadConfig(schema, environment));
    }
  } as ConfigClass<TSchema>;
}
