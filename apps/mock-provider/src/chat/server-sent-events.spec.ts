import { Writable } from 'node:stream';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { sendServerSentEvents } from './server-sent-events';

const IMMEDIATE = { ttfbMs: 0, chunkDelayMs: 0 };
const ONE_BYTE_BUFFER = 1;
const STILL_SENDING = 'still sending';

class SlowSocket extends Writable {
  readonly received: string[] = [];
  private held: (() => void) | undefined;
  private holding = true;

  constructor() {
    super({ highWaterMark: ONE_BYTE_BUFFER });
  }

  writeHead(): this {
    return this;
  }

  flushHeaders(): void {
    return undefined;
  }

  override _write(chunk: Buffer, _encoding: BufferEncoding, done: () => void): void {
    this.received.push(chunk.toString());
    if (this.holding) {
      this.held = done;
      return;
    }
    done();
  }

  release(): void {
    this.holding = false;
    this.held?.();
  }
}

describe('sendServerSentEvents', () => {
  it('waits for drain before writing the next event when the socket buffer is full', async () => {
    const socket = new SlowSocket();

    const sending = sendServerSentEvents(
      socket,
      [{ n: 1 }, { n: 2 }],
      IMMEDIATE,
      new AbortController().signal,
    );
    await nextTurn();

    expect(socket.writableLength).toBe('data: {"n":1}\n\n'.length);

    socket.release();
    await sending;

    expect(socket.received.join('')).toBe('data: {"n":1}\n\ndata: {"n":2}\n\ndata: [DONE]\n\n');
  });

  it('drops the connection when shutdown starts while it waits for drain', async () => {
    const socket = new SlowSocket();
    const shutdown = new AbortController();
    const sending = sendServerSentEvents(socket, [{ n: 1 }, { n: 2 }], IMMEDIATE, shutdown.signal);
    await nextTurn();

    shutdown.abort();
    await nextTurn();

    expect(await Promise.race([sending, Promise.resolve(STILL_SENDING)])).not.toBe(STILL_SENDING);
    expect(socket.destroyed).toBe(true);
  });
});
