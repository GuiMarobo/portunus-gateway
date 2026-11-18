import { z } from 'zod';

const DECIMAL_INTEGER = /^-?\d+$/;

export function integerFromEnv<TNumberSchema extends z.ZodType<number, number>>(
  numberSchema: TNumberSchema,
) {
  return z
    .string()
    .regex(DECIMAL_INTEGER, 'must be a decimal integer')
    .transform(Number)
    .pipe(numberSchema);
}
