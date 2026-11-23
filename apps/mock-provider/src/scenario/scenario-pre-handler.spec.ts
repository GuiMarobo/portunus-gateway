import Fastify from 'fastify';
import { assert, describe, expect, it } from 'vitest';
import { parseScenario } from './scenario';
import { scenarioHandling } from './scenario-pre-handler';

const NO_SCENARIO = parseScenario('', { maxDelayMs: 1_000 });

describe('scenario handling', () => {
  it('fails loudly when a route reads the scenario plan without the scenario pre-handler', async () => {
    assert(NO_SCENARIO.ok);
    const scenario = scenarioHandling({
      maxDelayMs: 1_000,
      defaultRetryAfterSeconds: 1,
      defaultScenario: NO_SCENARIO.scenario,
      random: () => 0.5,
      shutdown: new AbortController().signal,
    });
    const server = Fastify();
    server.get('/route-without-scenario', (request) => scenario.planOf(request));

    const response = await server.inject({ method: 'GET', url: '/route-without-scenario' });

    expect(response.statusCode).toBe(500);
    expect(response.json<unknown>()).toMatchObject({
      message: expect.stringContaining('pre-handler') as unknown,
    });
  });
});
