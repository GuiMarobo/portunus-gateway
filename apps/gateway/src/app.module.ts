import { type DynamicModule, Module, type Type } from '@nestjs/common';
import type { DestinationStream } from 'pino';
import type { GatewayConfig } from './gateway-config';
import { GatewayConfigModule } from './gateway-config.module';
import {
  EXIT_PROCESS,
  exitCurrentProcess,
  type ExitProcess,
  GracefulShutdown,
} from './graceful-shutdown';
import { HealthController } from './health.controller';
import { LoggingModule } from './logging.module';

@Module({
  controllers: [HealthController],
})
export class AppModule {
  static register(
    config: GatewayConfig,
    logDestination: DestinationStream,
    additionalModules: Type[] = [],
    exitProcess: ExitProcess = exitCurrentProcess,
  ): DynamicModule {
    return {
      module: AppModule,
      imports: [
        GatewayConfigModule.register(config),
        LoggingModule.register(config, logDestination),
        ...additionalModules,
      ],
      providers: [GracefulShutdown, { provide: EXIT_PROCESS, useValue: exitProcess }],
    };
  }
}
