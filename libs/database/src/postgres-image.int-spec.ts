import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const COMPOSE_ENV_FILE = resolve(__dirname, '../../../infra/.env');
const DATABASE_USER = 'portunus';
const DATABASE_NAME = 'portunus_test';
const HEALTHCHECK_INTERVAL_MS = 1_000;
const HEALTHCHECK_RETRIES = 30;

function composeImage(variable: string): string {
  const image = parseEnv(readFileSync(COMPOSE_ENV_FILE, 'utf8'))[variable];
  if (!image) {
    throw new Error(`${variable} is not set in ${COMPOSE_ENV_FILE}`);
  }
  return image;
}

function psql(container: StartedTestContainer, ...commands: string[]) {
  const commandArgs = commands.flatMap((command) => ['-c', command]);
  return container.exec([
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-qtA',
    '-U',
    DATABASE_USER,
    '-d',
    DATABASE_NAME,
    ...commandArgs,
  ]);
}

describe('postgres image from compose', () => {
  let postgres: StartedTestContainer | undefined;

  beforeAll(async () => {
    postgres = await new GenericContainer(composeImage('POSTGRES_IMAGE'))
      .withEnvironment({
        POSTGRES_USER: DATABASE_USER,
        POSTGRES_PASSWORD: 'integration_test_only',
        POSTGRES_DB: DATABASE_NAME,
      })
      .withHealthCheck({
        test: ['CMD-SHELL', `pg_isready -h 127.0.0.1 -U ${DATABASE_USER} -d ${DATABASE_NAME}`],
        interval: HEALTHCHECK_INTERVAL_MS,
        retries: HEALTHCHECK_RETRIES,
      })
      .withWaitStrategy(Wait.forHealthCheck())
      .start();
  });

  afterAll(async () => {
    await postgres?.stop();
  });

  it('enables pgvector and computes vector distances', async () => {
    if (!postgres) {
      throw new Error('postgres container did not start');
    }
    const result = await psql(
      postgres,
      'CREATE EXTENSION vector',
      "SELECT '[1,2,3]'::vector <-> '[1,2,4]'::vector",
    );

    expect({ exitCode: result.exitCode, stdout: result.stdout.trim() }).toEqual({
      exitCode: 0,
      stdout: '1',
    });
  });
});
