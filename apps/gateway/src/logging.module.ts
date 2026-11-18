import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import type { GatewayConfig } from './gateway-config';

interface SerializedRequest {
  method: string;
  url: string;
}

interface SerializedResponse {
  statusCode: number;
}

@Module({})
export class LoggingModule {
  static register(config: GatewayConfig, destination: DestinationStream): DynamicModule {
    return {
      module: LoggingModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: [
            {
              level: config.LOG_LEVEL,
              serializers: {
                req: ({ method, url }: SerializedRequest) => ({ method, url }),
                res: ({ statusCode }: SerializedResponse) => ({ statusCode }),
              },
            },
            destination,
          ],
        }),
      ],
    };
  }
}
