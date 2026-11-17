import { type DynamicModule, Module } from '@nestjs/common';
import type { GatewayConfig } from './gateway-config';
import { GatewayConfigModule } from './gateway-config.module';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
})
export class AppModule {
  static register(config: GatewayConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [GatewayConfigModule.register(config)],
    };
  }
}
