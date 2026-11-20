import type { FastifyInstance } from 'fastify';

export type ExitProcess = (code: number) => void;

export interface GracefulShutdownOptions {
  readonly timeoutMs: number;
  readonly exitProcess: ExitProcess;
}

const FORCED_SHUTDOWN_EXIT_CODE = 1;

export function enableGracefulShutdown(
  server: FastifyInstance,
  { timeoutMs, exitProcess }: GracefulShutdownOptions,
): AbortSignal {
  const shutdown = new AbortController();
  let deadline: NodeJS.Timeout | undefined;
  server.addHook('preClose', (done) => {
    deadline = setTimeout(() => {
      server.log.warn(`Graceful shutdown exceeded ${String(timeoutMs)}ms; forcing exit`);
      exitProcess(FORCED_SHUTDOWN_EXIT_CODE);
    }, timeoutMs).unref();
    shutdown.abort();
    done();
  });
  server.addHook('onClose', (_instance, done) => {
    clearTimeout(deadline);
    done();
  });
  server.addHook('onSend', async (_request, reply, payload) => {
    if (shutdown.signal.aborted) {
      reply.header('connection', 'close');
    }
    return payload;
  });
  return shutdown.signal;
}
