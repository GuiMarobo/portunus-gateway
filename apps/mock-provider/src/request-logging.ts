import {
  type FastifyReply,
  type FastifyRequest,
  type FastifyServerOptions,
  LogController,
} from 'fastify';
import type { LogDestination } from './mock-app.factory';
import type { MockConfig } from './mock-config';

const CREDENTIAL_HEADER_PATHS = [
  'req.headers.authorization',
  'req.headers["x-api-key"]',
  'req.headers.cookie',
];
const QUERY_STRING_SEPARATOR = '?';
const COMPLETED_REQUEST_MESSAGE = 'request completed';
const ERRORED_REQUEST_MESSAGE = 'request errored';

export class SingleLineRequestLogController extends LogController {
  override incomingRequest(): void {
    return;
  }

  override requestCompleted(
    error: Error | null | undefined,
    request: FastifyRequest,
    reply: FastifyReply,
  ): void {
    const entry = { req: request, res: reply, responseTime: reply.elapsedTime };
    if (error) {
      reply.log.error({ ...entry, err: error }, ERRORED_REQUEST_MESSAGE);
      return;
    }
    reply.log.info(entry, COMPLETED_REQUEST_MESSAGE);
  }
}

export function loggerOptions(
  config: MockConfig,
  destination: LogDestination,
): NonNullable<FastifyServerOptions['logger']> {
  return {
    level: config.LOG_LEVEL,
    stream: destination,
    redact: CREDENTIAL_HEADER_PATHS,
    serializers: {
      req: (request) => ({
        method: request.method,
        url: pathOf(request.url),
        headers: request.headers,
      }),
      res: (reply) => ({ statusCode: reply.statusCode }),
    },
  };
}

function pathOf(url: string): string {
  const separatorIndex = url.indexOf(QUERY_STRING_SEPARATOR);
  return separatorIndex === -1 ? url : url.slice(0, separatorIndex);
}
