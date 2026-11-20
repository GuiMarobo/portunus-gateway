import type { FastifyReply } from 'fastify';
import type { z } from 'zod';

const BAD_REQUEST_STATUS = 400;
const PARAM_PATH_SEPARATOR = '.';

export interface OpenAiErrorBody {
  readonly message: string;
  readonly type: string;
  readonly param: string | null;
  readonly code: string | null;
}

export function sendOpenAiError(
  reply: FastifyReply,
  statusCode: number,
  error: OpenAiErrorBody,
): FastifyReply {
  return reply.code(statusCode).send({ error });
}

export function sendInvalidParameter(reply: FastifyReply, error: z.ZodError): FastifyReply {
  const param = error.issues[0]?.path.join(PARAM_PATH_SEPARATOR) ?? null;
  return sendOpenAiError(reply, BAD_REQUEST_STATUS, {
    message: `Missing or invalid value for parameter '${param ?? ''}'.`,
    type: 'invalid_request_error',
    param,
    code: null,
  });
}
