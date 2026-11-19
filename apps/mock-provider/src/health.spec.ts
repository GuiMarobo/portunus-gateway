import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type RunningMock, startMock } from './testing/running-mock';

describe('GET /health', () => {
  let mock: RunningMock;

  beforeEach(async () => {
    mock = await startMock();
  });

  afterEach(async () => {
    await mock.close();
  });

  it('responds 200 with status ok', async () => {
    const response = await fetch(`${mock.baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
