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
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 8_000;
const MAX_SHUTDOWN_TIMEOUT_MS = 300_000;

const booleanFlag = z.enum(['true', 'false']).transform((flag) => BOOLEAN_FLAGS[flag]);

export const gatewayConfigSchema = z
  .object({
    NODE_ENV: z.enum(NODE_ENVIRONMENTS).default(DEFAULT_NODE_ENVIRONMENT),
    HOST: z.string().min(1).default(DEFAULT_HTTP_HOST),
    PORT: integerFromEnv(z.number().min(MIN_TCP_PORT).max(MAX_TCP_PORT)).default(DEFAULT_HTTP_PORT),
    LOG_LEVEL: z.enum(LOG_LEVELS).default(DEFAULT_LOG_LEVEL),
    LOG_PRETTY: booleanFlag.default(DEFAULT_LOG_PRETTY),
    SHUTDOWN_TIMEOUT_MS: integerFromEnv(z.number().positive().max(MAX_SHUTDOWN_TIMEOUT_MS)).default(
      DEFAULT_SHUTDOWN_TIMEOUT_MS,
    ),
  })
  .refine((config) => !(config.NODE_ENV === 'production' && config.LOG_PRETTY), {
    path: ['LOG_PRETTY'],
    message: 'pretty logs are not allowed in production',
  });
