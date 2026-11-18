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

const QUERY_STRING_SEPARATOR = '?';

function pathOf(url: string): string {
  const separatorIndex = url.indexOf(QUERY_STRING_SEPARATOR);
  return separatorIndex === -1 ? url : url.slice(0, separatorIndex);
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
                req: ({ method, url }: SerializedRequest) => ({ method, url: pathOf(url) }),
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
