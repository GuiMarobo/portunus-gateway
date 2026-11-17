import 'reflect-metadata';
import { createApp } from './app.factory';

async function bootstrap(): Promise<void> {
  const { app, config } = await createApp(process.env);
  await app.listen(config.PORT, config.HOST);
}

void bootstrap();
