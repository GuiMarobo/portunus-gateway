import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleDestroy,
} from '@nestjs/common';
import { GatewayConfig } from './gateway-config';

export type ExitProcess = (code: number) => void;

export const EXIT_PROCESS = Symbol('EXIT_PROCESS');

export const exitCurrentProcess: ExitProcess = (code) => {
  process.exit(code);
};

const FORCED_SHUTDOWN_EXIT_CODE = 1;

@Injectable()
export class GracefulShutdown implements OnModuleDestroy, OnApplicationShutdown {
  private readonly logger = new Logger(GracefulShutdown.name);
  private deadline: NodeJS.Timeout | undefined;

  constructor(
    private readonly config: GatewayConfig,
    @Inject(EXIT_PROCESS) private readonly exitProcess: ExitProcess,
  ) {}

  onModuleDestroy(): void {
    this.logger.log('Graceful shutdown started');
    this.deadline = setTimeout(() => {
      this.forceExit();
    }, this.config.SHUTDOWN_TIMEOUT_MS).unref();
  }

  onApplicationShutdown(): void {
    clearTimeout(this.deadline);
    this.logger.log('Graceful shutdown completed');
  }

  private forceExit(): void {
    this.logger.warn(
      `Graceful shutdown exceeded ${String(this.config.SHUTDOWN_TIMEOUT_MS)}ms; forcing exit`,
    );
    this.exitProcess(FORCED_SHUTDOWN_EXIT_CODE);
  }
}
