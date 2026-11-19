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

export async function sendServerSentEvents(
  response: EventStreamResponse,
  chunks: readonly object[],
  { ttfbMs, chunkDelayMs }: StreamPacing,
): Promise<void> {
  response.writeHead(OK_STATUS, SSE_HEADERS);
  response.flushHeaders();
  const events = [...chunks.map((chunk) => JSON.stringify(chunk)), DONE_DATA];
  for (const [position, data] of events.entries()) {
    const delayMs = position === 0 ? ttfbMs : chunkDelayMs;
    if (delayMs > NO_DELAY_MS && !(await waitUnlessClosed(response, delayMs))) {
      return;
    }
    if (!response.write(sseEvent(data)) && !(await drainUnlessClosed(response))) {
      return;
    }
  }
  response.end();
}

function sseEvent(data: string): string {
  return `data: ${data}\n\n`;
}

function drainUnlessClosed(response: Writable): Promise<boolean> {
  if (response.destroyed) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const onDrain = () => {
      response.off('close', onClose);
      resolve(true);
    };
    const onClose = () => {
      response.off('drain', onDrain);
      resolve(false);
    };
    response.once('drain', onDrain);
    response.once('close', onClose);
  });
}
