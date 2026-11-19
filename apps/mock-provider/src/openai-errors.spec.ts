import OpenAI from 'openai';
import { afterEach, describe, expect, it } from 'vitest';
import { isCompletedRequestLine, MemoryLogDestination } from './testing/memory-log-destination';
import { type RunningMock, startMock } from './testing/running-mock';

const CHAT_COMPLETIONS_PATH = '/v1/chat/completions';
const VALID_BODY = JSON.stringify({
  model: 'any-model-name',
  messages: [{ role: 'user', content: 'Hello there!' }],
});

describe('errors in the OpenAI format', () => {
  let mock: RunningMock;

  afterEach(async () => {
    await mock.close();
  });

  async function post(path: string, headers: Record<string, string>, body: string) {
    const response = await fetch(`${mock.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
    });
    return { status: response.status, body: await response.json() };
  }

  describe('authorization', () => {
    it.each<[string, Record<string, string>]>([
      ['no Authorization header', {}],
      ['an empty bearer token', { authorization: 'Bearer ' }],
      ['a non-bearer scheme', { authorization: 'Basic dXNlcjpwYXNz' }],
    ])('answers 401 invalid_api_key to %s', async (_case, headers) => {
      mock = await startMock();

      const response = await post(CHAT_COMPLETIONS_PATH, headers, VALID_BODY);

      expect(response).toEqual({
        status: 401,
        body: {
          error: {
            message: expect.any(String) as unknown,
            type: 'invalid_request_error',
            param: null,
            code: 'invalid_api_key',
          },
        },
      });
    });

    it('makes the SDK throw AuthenticationError', async () => {
      mock = await startMock();
      const client = new OpenAI({
        baseURL: `${mock.baseUrl}/v1`,
        apiKey: 'unused',
        defaultHeaders: { authorization: null },
        maxRetries: 0,
      });

      const attempt = client.chat.completions.create({
        model: 'any-model-name',
        messages: [{ role: 'user', content: 'Hello there!' }],
      });

      await expect(attempt).rejects.toBeInstanceOf(OpenAI.AuthenticationError);
    });
  });

  describe('request body validation', () => {
    const validRequest = {
      model: 'any-model-name',
      messages: [{ role: 'user', content: 'Hello there!' }],
    };

    it.each<[string, string, Record<string, unknown>]>([
      ['without model', 'model', { messages: validRequest.messages }],
      ['without messages', 'messages', { model: validRequest.model }],
      ['with empty messages', 'messages', { ...validRequest, messages: [] }],
      ['with n above 1', 'n', { ...validRequest, n: 2 }],
    ])('makes the SDK throw BadRequestError %s, pointing at %s', async (_case, param, body) => {
      mock = await startMock();
      const client = new OpenAI({
        baseURL: `${mock.baseUrl}/v1`,
        apiKey: 'test-key',
        maxRetries: 0,
      });

      const attempt = client.post('/chat/completions', { body });

      await expect(attempt).rejects.toBeInstanceOf(OpenAI.BadRequestError);
      await expect(attempt).rejects.toMatchObject({
        status: 400,
        type: 'invalid_request_error',
        param,
      });
    });

    it('accepts n equal to 1', async () => {
      mock = await startMock();

      const response = await post(
        CHAT_COMPLETIONS_PATH,
        { authorization: 'Bearer test-key' },
        JSON.stringify({ ...validRequest, n: 1 }),
      );

      expect(response.status).toBe(200);
    });

    it('answers 400 in the OpenAI format to a body that is not valid JSON', async () => {
      mock = await startMock();

      const response = await post(
        CHAT_COMPLETIONS_PATH,
        { authorization: 'Bearer test-key' },
        '{"model": ',
      );

      expect(response).toEqual({
        status: 400,
        body: {
          error: {
            message: expect.any(String) as unknown,
            type: 'invalid_request_error',
            param: null,
            code: null,
          },
        },
      });
    });
  });

  describe('unknown routes', () => {
    it('makes the SDK throw NotFoundError in the OpenAI format', async () => {
      mock = await startMock();
      const client = new OpenAI({
        baseURL: `${mock.baseUrl}/v1`,
        apiKey: 'test-key',
        maxRetries: 0,
      });

      const attempt = client.models.list();

      await expect(attempt).rejects.toBeInstanceOf(OpenAI.NotFoundError);
      await expect(attempt).rejects.toMatchObject({
        status: 404,
        type: 'invalid_request_error',
        param: null,
        code: 'unknown_url',
      });
    });
  });

  describe('client values are never echoed', () => {
    const MARKER = 'client-echo-marker';

    it.each<[string, string]>([
      ['a body that is not valid JSON', `{"model": ${MARKER}`],
      ['invalid parameter values', JSON.stringify({ model: MARKER, messages: MARKER, n: MARKER })],
    ])('leaves %s out of the error and of the logs', async (_case, body) => {
      const logs = new MemoryLogDestination();
      mock = await startMock({}, logs);

      const response = await post(
        CHAT_COMPLETIONS_PATH,
        { authorization: 'Bearer test-key' },
        body,
      );
      await logs.waitForLine(isCompletedRequestLine);

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).not.toContain(MARKER);
      expect(logs.lines().filter((line) => line.includes(MARKER))).toEqual([]);
    });

    it('leaves the requested path out of the not-found error', async () => {
      mock = await startMock();

      const response = await post(
        `/v1/${MARKER}`,
        { authorization: 'Bearer test-key' },
        VALID_BODY,
      );

      expect(response.status).toBe(404);
      expect(JSON.stringify(response.body)).not.toContain(MARKER);
    });
  });
});
