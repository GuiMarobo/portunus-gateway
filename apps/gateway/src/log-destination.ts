import type { DestinationStream } from 'pino';
import type { GatewayConfig } from './gateway-config';

export async function resolveLogDestination(
  config: GatewayConfig,
  destination: DestinationStream,
): Promise<DestinationStream> {
  if (!config.LOG_PRETTY) {
    return destination;
  }
  return prettyDestination(destination);
}

async function prettyDestination(destination: DestinationStream): Promise<DestinationStream> {
  const { prettyFactory } = await import('pino-pretty');
  const prettify = prettyFactory({});
  return {
    write: (line: string) => {
      destination.write(prettify(line));
    },
  };
}
