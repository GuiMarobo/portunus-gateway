import { describe, expect, it } from 'vitest';
import { bootstrapGateway, type StartupProcess } from './gateway.bootstrap';

describe('gateway bootstrap', () => {
  it('exits with code 1 and reports the invalid variable without its value', async () => {
    const startup = fakeStartupProcess();

    await bootstrapGateway({ PORT: 'secret-port' }, startup);

    expect(startup.exitCode).toBe(1);
    expect(startup.stderr.text()).toMatch(/^ {2}PORT → \S/m);
    expect(startup.stderr.text()).not.toContain('secret');
  });
});

function fakeStartupProcess(): StartupProcess & { stderr: { text(): string } } {
  const written: string[] = [];
  return {
    exitCode: undefined,
    stderr: {
      write: (chunk: string) => written.push(chunk) > 0,
      text: () => written.join(''),
    },
  };
}
