import { integerFromEnv } from '@portunus/common';
import { z } from 'zod';
import {
  DEFAULT_HTTP_HOST,
  DEFAULT_HTTP_PORT,
  MAX_TCP_PORT,
  MIN_TCP_PORT,
} from './http-server.constants';
import {
  MAX_COMPLETION_TOKENS,
  MAX_EMBEDDING_DIMENSIONS,
  MAX_RETRY_AFTER_SECONDS,
} from './mock-limits';
import { parseScenario } from './scenario/scenario';

const NODE_ENVIRONMENTS = ['development', 'test', 'production'] as const;
const DEFAULT_NODE_ENVIRONMENT = 'development';
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
const DEFAULT_LOG_LEVEL = 'info';
const BOOLEAN_FLAGS = { true: true, false: false } as const;
const DEFAULT_LOG_PRETTY = false;
const DEFAULT_COMPLETION_TOKENS = 16;
const MIN_COMPLETION_TOKENS = 1;
const DEFAULT_MAX_DELAY_MS = 30_000;
const MIN_MAX_DELAY_MS = 1;
const MAX_MAX_DELAY_MS = 600_000;
const DEFAULT_RETRY_AFTER_SECONDS = 1;
const MIN_RETRY_AFTER_SECONDS = 0;
const NO_DEFAULT_SCENARIO = '';
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_MAX_EMBEDDING_DIMENSIONS = 3072;
const MIN_EMBEDDING_DIMENSIONS = 1;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 8_000;
const MIN_SHUTDOWN_TIMEOUT_MS = 1;
const MAX_SHUTDOWN_TIMEOUT_MS = 300_000;
const PROBLEM_SEPARATOR = '; ';
const STREAM_CUT_AS_DEFAULT_PROBLEM =
  'error=stream-cut only applies per request (x-mock-scenario header or /scenarios path), since it would fail every non-streaming call';

const embeddingDimensions = integerFromEnv(
  z.number().min(MIN_EMBEDDING_DIMENSIONS).max(MAX_EMBEDDING_DIMENSIONS),
);

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
    MOCK_DEFAULT_SCENARIO: z.string().default(NO_DEFAULT_SCENARIO),
    MOCK_EMBEDDING_DIMENSIONS: embeddingDimensions.default(DEFAULT_EMBEDDING_DIMENSIONS),
    MOCK_MAX_EMBEDDING_DIMENSIONS: embeddingDimensions.default(DEFAULT_MAX_EMBEDDING_DIMENSIONS),
    SHUTDOWN_TIMEOUT_MS: integerFromEnv(
      z.number().min(MIN_SHUTDOWN_TIMEOUT_MS).max(MAX_SHUTDOWN_TIMEOUT_MS),
    ).default(DEFAULT_SHUTDOWN_TIMEOUT_MS),
  })
  .refine((config) => !(config.NODE_ENV === 'production' && config.LOG_PRETTY), {
    path: ['LOG_PRETTY'],
    message: 'pretty logs are not allowed in production',
  })
  .refine((config) => config.MOCK_EMBEDDING_DIMENSIONS <= config.MOCK_MAX_EMBEDDING_DIMENSIONS, {
    path: ['MOCK_EMBEDDING_DIMENSIONS'],
    message: 'must not exceed MOCK_MAX_EMBEDDING_DIMENSIONS',
  })
  .transform((config, context) => {
    const defaultScenario = parseScenario(config.MOCK_DEFAULT_SCENARIO, {
      maxDelayMs: config.MOCK_MAX_DELAY_MS,
    });
    if (!defaultScenario.ok) {
      context.addIssue({
        code: 'custom',
        path: ['MOCK_DEFAULT_SCENARIO'],
        message: defaultScenario.problems.join(PROBLEM_SEPARATOR),
      });
      return z.NEVER;
    }
    if (defaultScenario.scenario.failure?.kind === 'stream-cut') {
      context.addIssue({
        code: 'custom',
        path: ['MOCK_DEFAULT_SCENARIO'],
        message: STREAM_CUT_AS_DEFAULT_PROBLEM,
      });
      return z.NEVER;
    }
    return { ...config, MOCK_DEFAULT_SCENARIO: defaultScenario.scenario };
  });
