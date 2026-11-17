import { z } from 'zod';
import {
  DEFAULT_HTTP_HOST,
  DEFAULT_HTTP_PORT,
  MAX_TCP_PORT,
  MIN_TCP_PORT,
} from './http-server.constants';

const NODE_ENVIRONMENTS = ['development', 'test', 'production'] as const;
const DEFAULT_NODE_ENVIRONMENT = 'development';

export const gatewayConfigSchema = z.object({
  NODE_ENV: z.enum(NODE_ENVIRONMENTS).default(DEFAULT_NODE_ENVIRONMENT),
  HOST: z.string().min(1).default(DEFAULT_HTTP_HOST),
  PORT: z.coerce.number().int().min(MIN_TCP_PORT).max(MAX_TCP_PORT).default(DEFAULT_HTTP_PORT),
});
