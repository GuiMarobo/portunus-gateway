import { integerFromEnv } from '@portunus/common';
import { z } from 'zod';
import {
  DEFAULT_HTTP_HOST,
  DEFAULT_HTTP_PORT,
  MAX_TCP_PORT,
  MIN_TCP_PORT,
} from './http-server.constants';

const NODE_ENVIRONMENTS = ['development', 'test', 'production'] as const;
const DEFAULT_NODE_ENVIRONMENT = 'development';
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
const DEFAULT_LOG_LEVEL = 'info';
const BOOLEAN_FLAGS = { true: true, false: false } as const;
const DEFAULT_LOG_PRETTY = false;
const DEFAULT_COMPLETION_TOKENS = 16;
const MIN_COMPLETION_TOKENS = 1;
export const MAX_COMPLETION_TOKENS = 4096;
const DEFAULT_MAX_DELAY_MS = 30_000;
const MIN_MAX_DELAY_MS = 1;
const MAX_MAX_DELAY_MS = 600_000;
const DEFAULT_RETRY_AFTER_SECONDS = 1;
const MIN_RETRY_AFTER_SECONDS = 0;
export const MAX_RETRY_AFTER_SECONDS = 3600;

const booleanFlag = z.enum(['true', 'false']).transform((flag) => BOOLEAN_FLAGS[flag]);

export const mockConfigSchema = z
  .object({
    NODE_ENV: z.enum(NODE_ENVIRONMENTS).default(DEFAULT_NODE_ENVIRONMENT),
    HOST: z.string().min(1).default(DEFAULT_HTTP_HOST),
    PORT: integerFromEnv(z.number().min(MIN_TCP_PORT).max(MAX_TCP_PORT)).default(DEFAULT_HTTP_PORT),
    LOG_LEVEL: z.enum(LOG_LEVELS).default(DEFAULT_LOG_LEVEL),
    LOG_PRETTY: booleanFlag.default(DEFAULT_LOG_PRETTY),
    MOCK_DEFAULT_COMPLETION_TOKENS: integerFromEnv(
      z.number().min(MIN_COMPLETION_TOKENS).max(MAX_COMPLETION_TOKENS),
    ).default(DEFAULT_COMPLETION_TOKENS),
    MOCK_MAX_DELAY_MS: integerFromEnv(
      z.number().min(MIN_MAX_DELAY_MS).max(MAX_MAX_DELAY_MS),
    ).default(DEFAULT_MAX_DELAY_MS),
    MOCK_DEFAULT_RETRY_AFTER_SECONDS: integerFromEnv(
      z.number().min(MIN_RETRY_AFTER_SECONDS).max(MAX_RETRY_AFTER_SECONDS),
    ).default(DEFAULT_RETRY_AFTER_SECONDS),
  })
  .refine((config) => !(config.NODE_ENV === 'production' && config.LOG_PRETTY), {
    path: ['LOG_PRETTY'],
    message: 'pretty logs are not allowed in production',
  });
