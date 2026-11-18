export type LogEntry = Record<string, unknown>;

type LinePredicate = (line: string) => boolean;

interface PendingWait {
  readonly predicate: LinePredicate;
  readonly resolve: (line: string) => void;
}

export const isCompletedRequestLine: LinePredicate = (line) => line.includes('request completed');

export class MemoryLogDestination {
  private readonly writtenLines: string[] = [];
  private pendingWaits: PendingWait[] = [];

  write(chunk: string): void {
    const newLines = chunk.split('\n').filter(Boolean);
    this.writtenLines.push(...newLines);
    for (const line of newLines) {
      this.settleWaitsMatching(line);
    }
  }

  clear(): void {
    this.writtenLines.length = 0;
  }

  lines(): string[] {
    return [...this.writtenLines];
  }

  entries(): LogEntry[] {
    return this.writtenLines.map((line) => JSON.parse(line) as LogEntry);
  }

  waitForLine(predicate: LinePredicate): Promise<string> {
    const written = this.writtenLines.find(predicate);
    if (written !== undefined) {
      return Promise.resolve(written);
    }
    return new Promise((resolve) => this.pendingWaits.push({ predicate, resolve }));
  }

  private settleWaitsMatching(line: string): void {
    const matching = this.pendingWaits.filter((wait) => wait.predicate(line));
    this.pendingWaits = this.pendingWaits.filter((wait) => !wait.predicate(line));
    for (const wait of matching) {
      wait.resolve(line);
    }
  }
}
