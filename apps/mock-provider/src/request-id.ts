import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

const REQUEST_ID_HEADER = 'x-request-id';
const REQUEST_ID_PREFIX = 'req_';
const UUID_SEPARATORS = /-/g;

export function openAiRequestId(): string {
  return `${REQUEST_ID_PREFIX}${randomUUID().replace(UUID_SEPARATORS, '')}`;
}

export function exposeRequestId(server: FastifyInstance): void {
  server.addHook('onRequest', async (request, reply) => {
    reply.raw.setHeader(REQUEST_ID_HEADER, request.id);
  });
}
