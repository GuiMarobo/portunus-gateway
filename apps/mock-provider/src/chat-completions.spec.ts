import OpenAI from 'openai';
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
import { afterEach, describe, expect, it } from 'vitest';
import { type RunningMock, startMock } from './testing/running-mock';

const FIXED_CREATED_SECONDS = 1767225600;
const BASE_REQUEST: ChatCompletionCreateParamsNonStreaming = {
  model: 'any-model-name',
  messages: [
    { role: 'system', content: 'You are terse.' },
    { role: 'user', content: 'Hello there!' },
  ],
};
const BASE_PROMPT_TOKENS = 13;
const LEGACY_IGNORED_FIELDS = { user: 'someone' };

describe('POST /v1/chat/completions', () => {
  let mock: RunningMock;

  afterEach(async () => {
    await mock.close();
  });

  async function clientFor(environment: Record<string, string> = {}): Promise<OpenAI> {
    mock = await startMock(environment);
    return new OpenAI({ baseURL: `${mock.baseUrl}/v1`, apiKey: 'test-key', maxRetries: 0 });
  }

  it('answers a chat.completion for any model, ignoring the fields it does not use', async () => {
    const client = await clientFor();

    const completion = await client.chat.completions.create({
      ...BASE_REQUEST,
      ...LEGACY_IGNORED_FIELDS,
      temperature: 0.2,
      top_p: 0.9,
      metadata: { team: 'portunus' },
      response_format: { type: 'text' },
    });

    const { id, choices, ...envelope } = completion;
    expect(id).toMatch(/^chatcmpl-\w+$/);
    expect(envelope).toEqual({
      object: 'chat.completion',
      created: FIXED_CREATED_SECONDS,
      model: 'any-model-name',
      usage: { prompt_tokens: BASE_PROMPT_TOKENS, completion_tokens: 16, total_tokens: 29 },
    });
    expect(
      choices.map(({ index, message, finish_reason }) => ({
        index,
        role: message.role,
        finish_reason,
      })),
    ).toEqual([{ index: 0, role: 'assistant', finish_reason: 'stop' }]);
    expect(choices[0]?.message.content?.split(' ')).toHaveLength(16);
  });

  it('sizes the answer by MOCK_DEFAULT_COMPLETION_TOKENS', async () => {
    const client = await clientFor({ MOCK_DEFAULT_COMPLETION_TOKENS: '5' });

    const completion = await client.chat.completions.create(BASE_REQUEST);

    expect(completion.choices[0]?.message.content?.split(' ')).toHaveLength(5);
    expect(completion.usage).toEqual({
      prompt_tokens: BASE_PROMPT_TOKENS,
      completion_tokens: 5,
      total_tokens: 18,
    });
  });

  it('answers the same content and usage to the same request, whatever the key order', async () => {
    const client = await clientFor();
    const first = await client.chat.completions.create(BASE_REQUEST);
    const repeated = await client.chat.completions.create(BASE_REQUEST);
    const reordered = await postRawJson(
      '{"messages":[{"content":"You are terse.","role":"system"},{"content":"Hello there!","role":"user"}],"model":"any-model-name"}',
    );

    for (const answer of [repeated, reordered]) {
      expect(answer.choices[0]?.message.content).toBe(first.choices[0]?.message.content);
      expect(answer.usage).toEqual(first.usage);
    }
  });

  it.each<[string, Partial<ChatCompletionCreateParamsNonStreaming>, boolean]>([
    ['a message', { messages: [{ role: 'user', content: 'Hello there?' }] }, true],
    ['the model', { model: 'another-model' }, true],
    ['the token limit', { max_completion_tokens: 100 }, true],
    ['the temperature', { temperature: 1.5 }, false],
  ])('changing %s (%j) changes the content: %s', async (_field, change, changesContent) => {
    const client = await clientFor();
    const original = await client.chat.completions.create(BASE_REQUEST);

    const changed = await client.chat.completions.create({ ...BASE_REQUEST, ...change });

    expect(changed.choices[0]?.message.content === original.choices[0]?.message.content).toBe(
      !changesContent,
    );
  });

  it.each([
    [{ max_tokens: 3 }, 3, 'length'],
    [{ max_completion_tokens: 3 }, 3, 'length'],
    [{ max_tokens: 16 }, 16, 'stop'],
    [{ max_tokens: 2, max_completion_tokens: 4 }, 4, 'length'],
  ] as const)('with %j answers %i tokens ending by %s', async (limit, tokens, finishReason) => {
    const client = await clientFor();

    const completion = await client.chat.completions.create({ ...BASE_REQUEST, ...limit });

    expect(completion.choices[0]?.message.content?.split(' ')).toHaveLength(tokens);
    expect(completion.choices[0]?.finish_reason).toBe(finishReason);
    expect(completion.usage?.completion_tokens).toBe(tokens);
  });

  async function postRawJson(body: string): Promise<OpenAI.ChatCompletion> {
    const response = await fetch(`${mock.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-key' },
      body,
    });
    return (await response.json()) as OpenAI.ChatCompletion;
  }
});
