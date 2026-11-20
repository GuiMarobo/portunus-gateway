import { performance } from 'node:perf_hooks';
import OpenAI from 'openai';
import type { CreateEmbeddingResponse } from 'openai/resources/embeddings';
import { afterEach, describe, expect, it } from 'vitest';
import { type RunningMock, startMock } from './testing/running-mock';

const MODEL = 'text-embedding-3-small';
const DEFAULT_DIMENSIONS = 1536;

describe('POST /v1/embeddings', () => {
  let mock: RunningMock;

  afterEach(async () => {
    await mock.close();
  });

  async function clientFor(environment: Record<string, string> = {}): Promise<OpenAI> {
    mock = await startMock(environment);
    return new OpenAI({ baseURL: `${mock.baseUrl}/v1`, apiKey: 'test-key', maxRetries: 0 });
  }

  async function postEmbeddings(
    body: unknown,
    scenarioHeaders: Record<string, string> = {},
    pathPrefix = '',
  ) {
    const response = await fetch(`${mock.baseUrl}${pathPrefix}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-key',
        ...scenarioHeaders,
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  it('answers a list with one embedding per input, the model and the summed usage', async () => {
    const client = await clientFor();

    const single = await client.embeddings.create({
      model: MODEL,
      input: 'Hello there!',
      encoding_format: 'float',
    });
    const batch = await client.embeddings.create({
      model: MODEL,
      input: ['Hello there!', 'abcde'],
      encoding_format: 'float',
    });

    expect(envelopeOf(single)).toEqual({
      object: 'list',
      model: MODEL,
      data: [{ object: 'embedding', index: 0 }],
      usage: { prompt_tokens: 3, total_tokens: 3 },
    });
    expect(envelopeOf(batch)).toEqual({
      object: 'list',
      model: MODEL,
      data: [
        { object: 'embedding', index: 0 },
        { object: 'embedding', index: 1 },
      ],
      usage: { prompt_tokens: 5, total_tokens: 5 },
    });
    expect(single.data[0]?.embedding).toHaveLength(DEFAULT_DIMENSIONS);
    expect(batch.data[0]?.embedding).toEqual(single.data[0]?.embedding);
    expect(batch.data[1]?.embedding).not.toEqual(single.data[0]?.embedding);
  });

  it('answers base64 when asked, which the SDK default decodes to the same vector as float', async () => {
    const client = await clientFor();
    const request = { model: MODEL, input: 'Hello there!' };

    const raw = await postEmbeddings({ ...request, encoding_format: 'base64' });
    const decodedBySdk = await client.embeddings.create(request);
    const asFloat = await client.embeddings.create({ ...request, encoding_format: 'float' });

    expect(raw.status).toBe(200);
    expect(JSON.stringify(raw.body)).toMatch(/"embedding":"[A-Za-z0-9+/]+=*"/);
    expect(decodedBySdk.data[0]?.embedding).toEqual(asFloat.data[0]?.embedding);
  });

  it.each([
    ['MOCK_EMBEDDING_DIMENSIONS', { MOCK_EMBEDDING_DIMENSIONS: '8' }, undefined, 8],
    ['the dimensions parameter', {}, 256, 256],
    [
      'dimensions equal to MOCK_MAX_EMBEDDING_DIMENSIONS',
      { MOCK_MAX_EMBEDDING_DIMENSIONS: '1600' },
      1600,
      1600,
    ],
  ])('sizes the vector by %s', async (_case, environment, dimensions, expectedLength) => {
    const client = await clientFor(environment);

    const response = await client.embeddings.create({
      model: MODEL,
      input: 'Hello there!',
      encoding_format: 'float',
      ...(dimensions === undefined ? {} : { dimensions }),
    });

    expect(response.data[0]?.embedding).toHaveLength(expectedLength);
  });

  it('answers 400 to dimensions above MOCK_MAX_EMBEDDING_DIMENSIONS', async () => {
    mock = await startMock({ MOCK_MAX_EMBEDDING_DIMENSIONS: '1600' });

    const response = await postEmbeddings({
      model: MODEL,
      input: 'Hello there!',
      dimensions: 1601,
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: { type: 'invalid_request_error', param: 'dimensions' },
    });
  });

  it.each([
    ['missing', { model: MODEL }],
    ['an empty list', { model: MODEL, input: [] }],
  ])('answers 400 in the OpenAI format when input is %s', async (_case, body) => {
    mock = await startMock();

    const response = await postEmbeddings(body);

    expect(response).toEqual({
      status: 400,
      body: {
        error: {
          message: "Missing or invalid value for parameter 'input'.",
          type: 'invalid_request_error',
          param: 'input',
          code: null,
        },
      },
    });
  });

  describe('scenario', () => {
    const VALID_BODY = { model: MODEL, input: 'Hello there!' };

    it.each([
      ['error=429', 429],
      ['error=500', 500],
      ['error=503', 503],
      ['error=500;error-rate=0', 200],
      ['error=stream-cut', 400],
    ])('answers %s with status %i', async (scenario, status) => {
      mock = await startMock();

      const response = await postEmbeddings(VALID_BODY, { 'x-mock-scenario': scenario });

      expect(response.status).toBe(status);
    });

    it('takes the scenario from the /scenarios path too', async () => {
      mock = await startMock();

      const response = await postEmbeddings(VALID_BODY, {}, '/scenarios/error=503');

      expect(response.status).toBe(503);
    });

    it('delays the answer by the scenario latency', async () => {
      mock = await startMock();
      const startedAt = performance.now();

      const response = await postEmbeddings(VALID_BODY, { 'x-mock-scenario': 'latency=50' });

      expect(response.status).toBe(200);
      expect(performance.now() - startedAt).toBeGreaterThanOrEqual(50);
    });

    it('drops the connection without an answer on error=timeout', async () => {
      mock = await startMock({ MOCK_MAX_DELAY_MS: '50' });

      await expect(
        postEmbeddings(VALID_BODY, { 'x-mock-scenario': 'error=timeout' }),
      ).rejects.toThrow(TypeError);
    });
  });
});

function envelopeOf({ data, ...envelope }: CreateEmbeddingResponse) {
  return { ...envelope, data: data.map(({ object, index }) => ({ object, index })) };
}
