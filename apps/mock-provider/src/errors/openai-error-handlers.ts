import type { FastifyError, FastifyInstance } from 'fastify';
import { sendOpenAiError } from './openai-error';

const CLIENT_ERROR_MIN_STATUS = 400;
const SERVER_ERROR_MIN_STATUS = 500;
const INTERNAL_ERROR_STATUS = 500;
const NOT_FOUND_STATUS = 404;
const UNKNOWN_URL_MESSAGE = 'Invalid URL: this method and path are not served by the mock.';
const UNREADABLE_REQUEST_MESSAGE =
  'We could not read the body of your request. Send valid JSON with content-type application/json.';
const INTERNAL_ERROR_MESSAGE = 'The mock failed to process your request.';

export function answerErrorsInOpenAiFormat(server: FastifyInstance): void {
  server.setNotFoundHandler((_request, reply) =>
    sendOpenAiError(reply, NOT_FOUND_STATUS, {
      message: UNKNOWN_URL_MESSAGE,
      type: 'invalid_request_error',
      param: null,
      code: 'unknown_url',
    }),
  );
  server.setErrorHandler((error: FastifyError, request, reply) => {
    if (isClientError(error.statusCode)) {
      return sendOpenAiError(reply, error.statusCode, {
        message: UNREADABLE_REQUEST_MESSAGE,
        type: 'invalid_request_error',
        param: null,
        code: null,
      });
    }
    request.log.error({ err: error }, INTERNAL_ERROR_MESSAGE);
    return sendOpenAiError(reply, INTERNAL_ERROR_STATUS, {
      message: INTERNAL_ERROR_MESSAGE,
      type: 'server_error',
      param: null,
      code: null,
    });
  });
}

function isClientError(statusCode: number | undefined): statusCode is number {
  return (
    statusCode !== undefined &&
    statusCode >= CLIENT_ERROR_MIN_STATUS &&
    statusCode < SERVER_ERROR_MIN_STATUS
  );
}
