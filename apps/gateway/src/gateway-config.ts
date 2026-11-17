import { configClass } from '@portunus/common';
import { gatewayConfigSchema } from './gateway-config.schema';

export class GatewayConfig extends configClass(gatewayConfigSchema) {}
