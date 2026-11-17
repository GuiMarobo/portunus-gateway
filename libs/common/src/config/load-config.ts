import type { z } from 'zod';

export type RawEnvironment = Readonly<Record<string, string | undefined>>;

export function loadConfig<TSchema extends z.ZodType>(
  schema: TSchema,
  environment: RawEnvironment,
): z.output<TSchema> {
  return schema.parse(environment);
}
