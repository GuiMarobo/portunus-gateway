import type { Writable } from 'node:stream';

export function waitUnlessClosed(response: Writable, delayMs: number): Promise<boolean> {
  if (response.destroyed) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const onClose = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      response.off('close', onClose);
      resolve(true);
    }, delayMs);
    response.once('close', onClose);
  });
}
