import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { startAdminAutoSync } from './adminScanWorker.ts';

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: createApp().fetch, port }, (info) => {
  console.log(`TapeArena API 已启动：http://localhost:${info.port}`);
  startAdminAutoSync();
});
