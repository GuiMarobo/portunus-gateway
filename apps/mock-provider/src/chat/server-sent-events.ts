import type { OutgoingHttpHeaders } from 'node:http';
import type { Writable } from 'node:stream';
import type { StreamPacing } from '../scenario/scenario-pre-handler';
import { waitUnlessClosed } from '../scenario/wait-unless-closed';

const OK_STATUS = 200;
const DONE_DATA = '[DONE]';
const NO_DELAY_MS = 0;
const SSE_HEADERS = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache',
  connection: 'keep-alive',
};

export interface EventStreamResponse extends Writable {
  writeHead(statusCode: number, headers: OutgoingHttpHeaders): unknown;
  flushHeaders(): void;
}

export type StreamEnding = 'done' | 'cut';

export async function sendServerSentEvents(
  response: EventStreamResponse,
  chunks: readonly object[],
  { ttfbMs, chunkDelayMs }: StreamPacing,
  shutdown: AbortSignal,
  ending: StreamEnding = 'done',
): Promise<void> {
  response.writeHead(OK_STATUS, SSE_HEADERS);
  response.flushHeaders();
  const chunkData = chunks.map((chunk) => JSON.stringify(chunk));
  const events = ending === 'done' ? [...chunkData, DONE_DATA] : chunkData;
  for (const [position, data] of events.entries()) {
    const delayMs = position === 0 ? ttfbMs : chunkDelayMs;
    if (delayMs > NO_DELAY_MS && !(await waitUnlessClosed(response, delayMs, shutdown))) {
      return;
    }
    const isLast = position === events.length - 1;
    const written =
      ending === 'cut' && isLast
        ? await writeFlushedUnlessClosed(response, sseEvent(data))
        : response.write(sseEvent(data)) || (await drainUnlessClosed(response, shutdown));
    if (!written) {
      return;
    }
  }
  if (ending === 'cut') {
    response.destroy();
    return;
  }
  response.end();
}

function writeFlushedUnlessClosed(response: Writable, data: string): Promise<boolean> {
  return new Promise((resolve) => {
    const onClose = () => {
      resolve(false);
    };
    response.once('close', onClose);
    response.write(data, () => {
      response.off('close', onClose);
      resolve(!response.destroyed);
    });
  });
}

function sseEvent(data: string): string {
  return `data: ${data}\n\n`;
}

function drainUnlessClosed(response: Writable, shutdown: AbortSignal): Promise<boolean> {
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
    const onDrain = () => {
      response.off('close', onClose);
      shutdown.removeEventListener('abort', dropConnection);
      resolve(true);
    };
    const onClose = () => {
      response.off('drain', onDrain);
      shutdown.removeEventListener('abort', dropConnection);
      resolve(false);
    };
    response.once('drain', onDrain);
    response.once('close', onClose);
    shutdown.addEventListener('abort', dropConnection, { once: true });
  });
}
