import type { z } from 'zod';
import { ConfigValidationError } from './config-validation-error';

export type RawEnvironment = Readonly<Record<string, string | undefined>>;

export function loadConfig<TSchema extends z.ZodType>(
  schema: TSchema,
  environment: RawEnvironment,
): z.output<TSchema> {
  const result = schema.safeParse(environment);
  if (!result.success) {
    throw new ConfigValidationError(result.error.issues);
  }
  return result.data;
}
