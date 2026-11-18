import { type DynamicModule, Module } from '@nestjs/common';
import { GatewayConfig } from './gateway-config';

@Module({})
export class GatewayConfigModule {
  static register(config: GatewayConfig): DynamicModule {
    return {
      module: GatewayConfigModule,
      global: true,
      providers: [{ provide: GatewayConfig, useValue: config }],
      exports: [GatewayConfig],
    };
  }
}
