import { type DynamicModule, Module } from '@nestjs/common';
import type { DestinationStream } from 'pino';
import type { GatewayConfig } from './gateway-config';
import { GatewayConfigModule } from './gateway-config.module';
import { HealthController } from './health.controller';
import { LoggingModule } from './logging.module';

@Module({
  controllers: [HealthController],
})
export class AppModule {
  static register(config: GatewayConfig, logDestination: DestinationStream): DynamicModule {
    return {
      module: AppModule,
      imports: [
        GatewayConfigModule.register(config),
        LoggingModule.register(config, logDestination),
      ],
    };
  }
}
