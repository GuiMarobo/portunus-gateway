import type { LogDestination } from './mock-app.factory';
import type { MockConfig } from './mock-config';

export async function resolveLogDestination(
  config: MockConfig,
  destination: LogDestination,
): Promise<LogDestination> {
  if (!config.LOG_PRETTY) {
    return destination;
  }
  return prettyDestination(destination);
}

async function prettyDestination(destination: LogDestination): Promise<LogDestination> {
  const { prettyFactory } = await import('pino-pretty');
  const prettify = prettyFactory({});
  return {
    write: (line: string) => {
      destination.write(prettify(line));
    },
  };
}
