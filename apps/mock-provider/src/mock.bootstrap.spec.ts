import { describe, expect, it } from 'vitest';
import { bootstrapMock, type StartupProcess } from './mock.bootstrap';

describe('mock bootstrap', () => {
  it('exits with code 1 and reports each invalid variable without its value', async () => {
    const startup = fakeStartupProcess();

    await bootstrapMock({ PORT: 'secret-port', LOG_LEVEL: 'secret-level' }, startup);

    expect(startup.exitCode).toBe(1);
    expect(startup.stderr.text()).toMatch(/^ {2}PORT → \S/m);
    expect(startup.stderr.text()).toMatch(/^ {2}LOG_LEVEL → \S/m);
    expect(startup.stderr.text()).not.toContain('secret');
  });
});

function fakeStartupProcess(): StartupProcess & { stderr: { text(): string } } {
  const written: string[] = [];
  return {
    exitCode: undefined,
    stdout: { write: () => undefined },
    once: () => undefined,
    exit: () => undefined,
    stderr: {
      write: (chunk: string) => written.push(chunk) > 0,
      text: () => written.join(''),
    },
  };
}
