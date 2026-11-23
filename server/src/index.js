import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { buildApp } from './app.js';
import { seedIfEmpty } from './seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const bool = (v) => /^(1|true|yes|on)$/i.test(v || '');

const dataDir = path.resolve(env.DATA_DIR || path.join(here, '..', '..', 'data'));
const db = openDb(path.join(dataDir, 'catalog.db'));

const app = buildApp({
  db,
  dataDir,
  requireAuth: bool(env.REQUIRE_AUTH),
  authBasic: bool(env.AUTH_BASIC),
  devUser: env.DEV_USER || null,
  allowPrivateFetch: bool(env.IMG_FETCH_ALLOW_PRIVATE),
  webDir: path.resolve(env.WEB_DIR || path.join(here, '..', '..', 'web', 'dist')),
  logger: { level: env.LOG_LEVEL || 'info' },
});

seedIfEmpty(app.svc, { demo: bool(env.SEED_DEMO) });

const port = Number(env.PORT || 3000);
await app.listen({ port, host: env.HOST || '0.0.0.0' });

const stop = async () => {
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
