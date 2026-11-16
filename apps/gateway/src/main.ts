import 'reflect-metadata';
import { createApp } from './app.factory';
import { HTTP_HOST, HTTP_PORT } from './http-server.constants';

async function bootstrap(): Promise<void> {
  const app = await createApp();
  await app.listen(HTTP_PORT, HTTP_HOST);
}

void bootstrap();
