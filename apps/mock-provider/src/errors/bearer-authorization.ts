import type { FastifyInstance } from 'fastify';
import { sendOpenAiError } from './openai-error';

const BEARER_WITH_TOKEN = /^bearer\s+\S/i;
const UNAUTHORIZED_STATUS = 401;
const MISSING_API_KEY_ERROR = {
  message: 'You did not provide an API key. Send it in the Authorization header as Bearer <key>.',
  type: 'invalid_request_error',
  param: null,
  code: 'invalid_api_key',
} as const;

export function requireBearerAuthorization(
  server: FastifyInstance,
  publicPaths: readonly string[],
): void {
  server.addHook('onRequest', async (request, reply) => {
    if (request.routeOptions.url !== undefined && publicPaths.includes(request.routeOptions.url)) {
      return;
    }
    if (!hasBearerToken(request.headers.authorization)) {
      await sendOpenAiError(reply, UNAUTHORIZED_STATUS, MISSING_API_KEY_ERROR);
    }
  });
}

function hasBearerToken(authorization: string | undefined): boolean {
  return authorization !== undefined && BEARER_WITH_TOKEN.test(authorization);
}
