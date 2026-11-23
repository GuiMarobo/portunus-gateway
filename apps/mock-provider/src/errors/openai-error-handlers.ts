import type { FastifyError, FastifyInstance } from 'fastify';
import { MAX_REQUEST_BODY_BYTES } from '../mock-limits';
import { sendOpenAiError } from './openai-error';

const CLIENT_ERROR_MIN_STATUS = 400;
const SERVER_ERROR_MIN_STATUS = 500;
const INTERNAL_ERROR_STATUS = 500;
const NOT_FOUND_STATUS = 404;
const PAYLOAD_TOO_LARGE_STATUS = 413;
const UNSUPPORTED_MEDIA_TYPE_STATUS = 415;
const BYTES_PER_MEBIBYTE = 1024 * 1024;
const UNKNOWN_URL_MESSAGE = 'Invalid URL: this method and path are not served by the mock.';
const UNPARSABLE_JSON_MESSAGE =
  'We could not parse the JSON body of your request. Send a valid JSON object.';
const PAYLOAD_TOO_LARGE_MESSAGE = `Your request body is above the ${String(MAX_REQUEST_BODY_BYTES / BYTES_PER_MEBIBYTE)} MiB the mock accepts.`;
const UNSUPPORTED_MEDIA_TYPE_MESSAGE =
  'Unsupported content-type. Send the body as JSON with content-type application/json.';
const CLIENT_ERROR_MESSAGES: ReadonlyMap<number, string> = new Map([
  [PAYLOAD_TOO_LARGE_STATUS, PAYLOAD_TOO_LARGE_MESSAGE],
  [UNSUPPORTED_MEDIA_TYPE_STATUS, UNSUPPORTED_MEDIA_TYPE_MESSAGE],
]);
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
        message: CLIENT_ERROR_MESSAGES.get(error.statusCode) ?? UNPARSABLE_JSON_MESSAGE,
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
