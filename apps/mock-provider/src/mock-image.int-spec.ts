import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import OpenAI from 'openai';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REPOSITORY_ROOT = resolve(__dirname, '../../..');
const COMPOSE_ENV_FILE = resolve(REPOSITORY_ROOT, 'infra/.env');
const MOCK_DOCKERFILE = 'apps/mock-provider/Dockerfile';
const MOCK_CONTAINER_PORT = 3001;
const DEFAULT_COMPLETION_TOKENS = 16;
const IMAGE_BUILD_TIMEOUT_MS = 300_000;

function composeImage(variable: string): string {
  const image = parseEnv(readFileSync(COMPOSE_ENV_FILE, 'utf8'))[variable];
  if (!image) {
    throw new Error(`${variable} is not set in ${COMPOSE_ENV_FILE}`);
  }
  return image;
}

describe('mock-provider image built from the Dockerfile', () => {
  let mock: StartedTestContainer | undefined;

  beforeAll(async () => {
    const image = await GenericContainer.fromDockerfile(REPOSITORY_ROOT, MOCK_DOCKERFILE)
      .withBuildArgs({ NODE_IMAGE: composeImage('NODE_IMAGE') })
      .build();
    mock = await image
      .withExposedPorts(MOCK_CONTAINER_PORT)
      .withWaitStrategy(Wait.forHealthCheck())
      .start();
  }, IMAGE_BUILD_TIMEOUT_MS);

  afterAll(async () => {
    await mock?.stop();
  });

  it('becomes healthy and answers a chat completion through the OpenAI SDK', async () => {
    if (!mock) {
      throw new Error('mock-provider container did not start');
    }
    const client = new OpenAI({
      baseURL: `http://${mock.getHost()}:${String(mock.getMappedPort(MOCK_CONTAINER_PORT))}/v1`,
      apiKey: 'integration-test-key',
      maxRetries: 0,
    });

    const completion = await client.chat.completions.create({
      model: 'any-model-name',
      messages: [{ role: 'user', content: 'Hello from the container!' }],
    });

    expect({
      object: completion.object,
      model: completion.model,
      completionTokens: completion.usage?.completion_tokens,
      finishReason: completion.choices[0]?.finish_reason,
    }).toEqual({
      object: 'chat.completion',
      model: 'any-model-name',
      completionTokens: DEFAULT_COMPLETION_TOKENS,
      finishReason: 'stop',
    });
  });
});
