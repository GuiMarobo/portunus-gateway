import { afterEach, describe, expect, it } from 'vitest';
import { type RunningMock, startMock } from './testing/running-mock';

const CHAT_COMPLETIONS_PATH = '/v1/chat/completions';
const OPENAI_REQUEST_ID = /^req_[0-9a-f]{32}$/;

describe('x-request-id response header', () => {
  let mock: RunningMock;

  afterEach(async () => {
    await mock.close();
  });

  async function requestIdOf(body: object, headers: Record<string, string>) {
    const response = await fetch(`${mock.baseUrl}${CHAT_COMPLETIONS_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({
        model: 'any-model-name',
        messages: [{ role: 'user', content: 'Hello there!' }],
        ...body,
      }),
    });
    await response.text();
    return response.headers.get('x-request-id');
  }

  it.each<[string, object, Record<string, string>]>([
    ['a JSON completion', {}, { authorization: 'Bearer test-key' }],
    ['a streamed completion', { stream: true }, { authorization: 'Bearer test-key' }],
    ['an error', {}, {}],
  ])('answers %s with a unique request id in the OpenAI format', async (_case, body, headers) => {
    mock = await startMock();

    const first = await requestIdOf(body, headers);
    const second = await requestIdOf(body, headers);

    expect(first).toMatch(OPENAI_REQUEST_ID);
    expect(second).toMatch(OPENAI_REQUEST_ID);
    expect(second).not.toBe(first);
  });
});
