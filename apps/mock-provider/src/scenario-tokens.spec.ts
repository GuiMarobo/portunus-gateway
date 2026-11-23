import OpenAI from 'openai';
import { afterEach, describe, expect, it } from 'vitest';
import { type RunningMock, startMock } from './testing/running-mock';

const BASE_REQUEST = {
  model: 'any-model-name',
  messages: [{ role: 'user' as const, content: 'Hello there!' }],
};

describe('tokens key of the scenario', () => {
  let mock: RunningMock;

  afterEach(async () => {
    await mock.close();
  });

  function clientForMock(): OpenAI {
    return new OpenAI({ baseURL: `${mock.baseUrl}/v1`, apiKey: 'test-key', maxRetries: 0 });
  }

  function withScenario(scenario: string) {
    return { headers: { 'x-mock-scenario': scenario } };
  }

  it('sets the length of a non-streaming answer instead of MOCK_DEFAULT_COMPLETION_TOKENS', async () => {
    mock = await startMock({ MOCK_DEFAULT_COMPLETION_TOKENS: '16' });

    const completion = await clientForMock().chat.completions.create(
      BASE_REQUEST,
      withScenario('tokens=5'),
    );

    expect({
      completionTokens: completion.usage?.completion_tokens,
      words: completion.choices[0]?.message.content?.split(' ').length,
      finishReason: completion.choices[0]?.finish_reason,
    }).toEqual({ completionTokens: 5, words: 5, finishReason: 'stop' });
  });

  it.each([
    [
      'below tokens cuts the answer',
      'tokens=10',
      3,
      { completionTokens: 3, finishReason: 'length' },
    ],
    [
      'equal to tokens keeps it whole',
      'tokens=5',
      5,
      { completionTokens: 5, finishReason: 'stop' },
    ],
  ])('max_completion_tokens %s', async (_case, scenario, maxTokens, expected) => {
    mock = await startMock({ MOCK_DEFAULT_COMPLETION_TOKENS: '16' });

    const completion = await clientForMock().chat.completions.create(
      { ...BASE_REQUEST, max_completion_tokens: maxTokens },
      withScenario(scenario),
    );

    expect({
      completionTokens: completion.usage?.completion_tokens,
      finishReason: completion.choices[0]?.finish_reason,
    }).toEqual(expected);
  });

  it('sets the number of content chunks of a streaming answer', async () => {
    mock = await startMock({ MOCK_DEFAULT_COMPLETION_TOKENS: '16' });

    const stream = await clientForMock().chat.completions.create(
      { ...BASE_REQUEST, stream: true, stream_options: { include_usage: true } },
      withScenario('tokens=5'),
    );
    const contentChunks: string[] = [];
    let completionTokens: number | undefined;
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta.content;
      if (content) {
        contentChunks.push(content);
      }
      completionTokens = chunk.usage?.completion_tokens ?? completionTokens;
    }

    expect({ contentChunks: contentChunks.length, completionTokens }).toEqual({
      contentChunks: 5,
      completionTokens: 5,
    });
  });
});
