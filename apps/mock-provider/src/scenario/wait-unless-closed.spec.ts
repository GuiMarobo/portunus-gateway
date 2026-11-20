import { once } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitUnlessClosed } from './wait-unless-closed';

const DELAY_MS = 1000;
const STILL_WAITING = 'still waiting';
const NO_SHUTDOWN = new AbortController().signal;

describe('wait unless the response is closed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function settledBeforeTheDelay(wait: Promise<boolean>) {
    return Promise.race([wait, Promise.resolve(STILL_WAITING)]);
  }

  it('completes the wait when the response stays open', async () => {
    const wait = waitUnlessClosed(new PassThrough(), DELAY_MS, NO_SHUTDOWN);

    await vi.advanceTimersByTimeAsync(DELAY_MS);

    expect(await settledBeforeTheDelay(wait)).toBe(true);
  });

  it('gives up when the response closes during the wait', async () => {
    const response = new PassThrough();
    const wait = waitUnlessClosed(response, DELAY_MS, NO_SHUTDOWN);

    response.destroy();
    await vi.advanceTimersByTimeAsync(0);

    expect(await settledBeforeTheDelay(wait)).toBe(false);
  });

  it('gives up at once when the response closed before the wait started', async () => {
    const response = new PassThrough();
    response.destroy();
    await once(response, 'close');

    const wait = waitUnlessClosed(response, DELAY_MS, NO_SHUTDOWN);
    await vi.advanceTimersByTimeAsync(0);

    expect(await settledBeforeTheDelay(wait)).toBe(false);
  });
});
