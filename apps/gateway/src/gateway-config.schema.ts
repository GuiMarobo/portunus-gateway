import { z } from 'zod';
import { DEFAULT_HTTP_HOST, DEFAULT_HTTP_PORT } from './http-server.constants';

export const gatewayConfigSchema = z.object({
  HOST: z.string().default(DEFAULT_HTTP_HOST),
  PORT: z.coerce.number().int().default(DEFAULT_HTTP_PORT),
});

export type GatewayConfig = z.output<typeof gatewayConfigSchema>;
