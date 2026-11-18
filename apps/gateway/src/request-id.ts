import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';

const ACCEPTED_CLIENT_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

export function resolveRequestId(clientRequestId: string | string[] | undefined): string {
  if (typeof clientRequestId === 'string' && ACCEPTED_CLIENT_REQUEST_ID.test(clientRequestId)) {
    return clientRequestId;
  }
  return randomUUID();
}

export function requestIdFromHeaders(request: { headers: IncomingHttpHeaders }): string {
  return resolveRequestId(request.headers[REQUEST_ID_HEADER]);
}
