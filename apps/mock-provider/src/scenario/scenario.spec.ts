import { describe, expect, it } from 'vitest';
import { parseScenario } from './scenario';

const LIMITS = { maxDelayMs: 1000 };

describe('mock scenario parser', () => {
  it.each([
    ['an empty scenario', '', {}],
    ['a fixed latency', 'latency=50', { latency: { min: 50, max: 50 } }],
    ['a latency range', 'latency=10-20', { latency: { min: 10, max: 20 } }],
    ['a latency at the delay ceiling', 'latency=1000', { latency: { min: 1000, max: 1000 } }],
    [
      'the streaming keys',
      'ttfb=5-9;chunk-delay=3;tokens=8',
      { ttfb: { min: 5, max: 9 }, chunkDelayMs: 3, tokens: 8 },
    ],
    ['an error that always happens', 'error=500', { failure: { kind: '500', rate: 1 } }],
    [
      'an error with a rate and a seed',
      'error=503;error-rate=0.25;seed=7',
      { failure: { kind: '503', rate: 0.25 }, seed: 7 },
    ],
    [
      'a rate limit with its retry-after',
      'error=429;retry-after=3',
      { failure: { kind: '429', rate: 1, retryAfterSeconds: 3 } },
    ],
    [
      'a stream cut with its chunk count',
      'error=stream-cut;cut-after=2',
      { failure: { kind: 'stream-cut', rate: 1, cutAfterChunks: 2 } },
    ],
    ['a timeout', 'error=timeout', { failure: { kind: 'timeout', rate: 1 } }],
    ['spaces and a trailing separator', ' latency = 5 ; ', { latency: { min: 5, max: 5 } }],
  ])('reads %s', (_case, raw, scenario) => {
    expect(parseScenario(raw, LIMITS)).toEqual({ ok: true, scenario });
  });

  it.each([
    [
      'an unknown key',
      'banana=1',
      [
        'unknown key; allowed keys are latency, ttfb, chunk-delay, tokens, error, error-rate, retry-after, cut-after, seed',
      ],
    ],
    ['an entry without a value', 'latency', ['entry 1 is not in key=value form']],
    ['a repeated key', 'latency=1;latency=2', ['latency: appears more than once']],
    ['an invalid number', 'latency=abc', ['latency: must be N or MIN-MAX milliseconds']],
    ['an inverted range', 'ttfb=20-10', ['ttfb: range is inverted (MIN above MAX)']],
    [
      'a latency above the delay ceiling',
      'latency=0-1001',
      ['latency: above the 1000 ms ceiling (MOCK_MAX_DELAY_MS)'],
    ],
    [
      'a chunk delay above the delay ceiling',
      'chunk-delay=1001',
      ['chunk-delay: above the 1000 ms ceiling (MOCK_MAX_DELAY_MS)'],
    ],
    ['zero tokens', 'tokens=0', ['tokens: must be an integer from 1 to 4096']],
    ['an unknown error', 'error=418', ['error: must be one of 429, 500, 503, timeout, stream-cut']],
    [
      'an error rate above 1',
      'error=503;error-rate=1.5',
      ['error-rate: must be a number from 0 to 1'],
    ],
    [
      'a retry-after above its ceiling',
      'error=429;retry-after=3601',
      ['retry-after: must be an integer from 0 to 3600'],
    ],
    [
      'a seed that is not an integer',
      'seed=abc',
      ['seed: must be an integer from 0 to 4294967295'],
    ],
    ['an error rate without an error', 'error-rate=0.5', ['error-rate: requires error']],
    [
      'a retry-after without a rate limit',
      'error=500;retry-after=3',
      ['retry-after: requires error=429'],
    ],
    [
      'a cut-after without a stream cut',
      'error=429;cut-after=2',
      ['cut-after: requires error=stream-cut'],
    ],
    [
      'several problems at once',
      'latency=abc;seed=abc',
      [
        'latency: must be N or MIN-MAX milliseconds',
        'seed: must be an integer from 0 to 4294967295',
      ],
    ],
  ])('rejects %s, naming the key and never the value', (_case, raw, problems) => {
    expect(parseScenario(raw, LIMITS)).toEqual({ ok: false, problems });
  });
});
