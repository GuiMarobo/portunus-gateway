import type { FastifyInstance } from 'fastify';
import { type ClientRequest, type IncomingMessage, request } from 'node:http';

const CHAT_COMPLETIONS_PATH = '/v1/chat/completions';

export interface PartialUpload {
  readonly request: ClientRequest;
  readonly response: Promise<IncomingMessage>;
  finish(): void;
}

export async function startUploadingSlowly(
  server: FastifyInstance,
  baseUrl: string,
  body: object,
): Promise<PartialUpload> {
  const payload = JSON.stringify(body);
  const splitAt = Math.floor(payload.length / 2);
  const upload = request(`${baseUrl}${CHAT_COMPLETIONS_PATH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(payload)),
      authorization: 'Bearer test-key',
    },
  });
  const response = new Promise<IncomingMessage>((resolve, reject) => {
    upload.once('response', resolve);
    upload.once('error', reject);
  });
  const received = new Promise((resolve) => server.server.once('request', resolve));
  upload.write(payload.slice(0, splitAt));
  await received;
  return { request: upload, response, finish: () => upload.end(payload.slice(splitAt)) };
}
