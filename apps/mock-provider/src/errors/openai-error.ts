import type { FastifyReply } from 'fastify';

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
