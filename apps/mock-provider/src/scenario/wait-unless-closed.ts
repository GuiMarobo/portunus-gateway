import type { Writable } from 'node:stream';

export function waitUnlessClosed(
  response: Writable,
  delayMs: number,
  shutdown: AbortSignal,
): Promise<boolean> {
  if (shutdown.aborted) {
    response.destroy();
  }
  if (response.destroyed) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const dropConnection = () => {
      response.destroy();
    };
    const onClose = () => {
      clearTimeout(timer);
      shutdown.removeEventListener('abort', dropConnection);
      resolve(false);
    };
    const timer = setTimeout(() => {
      response.off('close', onClose);
      shutdown.removeEventListener('abort', dropConnection);
      resolve(true);
    }, delayMs);
    response.once('close', onClose);
    shutdown.addEventListener('abort', dropConnection, { once: true });
  });
}
