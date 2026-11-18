import { type DynamicModule, Module } from '@nestjs/common';
import type { IncomingHttpHeaders, IncomingMessage, OutgoingHttpHeaders } from 'node:http';
import { LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import type { ReqId } from 'pino-http';
import type { GatewayConfig } from './gateway-config';

interface SerializedRequest {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
}

interface SerializedResponse {
  statusCode: number;
  headers: OutgoingHttpHeaders;
}

const CREDENTIAL_HEADER_PATHS = [
  'req.headers.authorization',
  'req.headers["x-api-key"]',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

const QUERY_STRING_SEPARATOR = '?';

function pathOf(url: string): string {
  const separatorIndex = url.indexOf(QUERY_STRING_SEPARATOR);
  return separatorIndex === -1 ? url : url.slice(0, separatorIndex);
}

function requestContext(request: IncomingMessage): { request_id: ReqId } {
  return { request_id: request.id };
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
              customProps: requestContext,
              redact: CREDENTIAL_HEADER_PATHS,
              serializers: {
                req: ({ method, url, headers }: SerializedRequest) => ({
                  method,
                  url: pathOf(url),
                  headers,
                }),
                res: ({ statusCode, headers }: SerializedResponse) => ({ statusCode, headers }),
              },
            },
            destination,
          ],
        }),
      ],
    };
  }
}
