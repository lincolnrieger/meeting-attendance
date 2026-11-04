/**
 * Node.js entry point — local development (`npm run dev`), tests and
 * self-hosting (`npm run build && npm start`). Uses a local SQLite file.
 * Production on Cloudflare uses worker/index.mjs instead.
 */
const path = require('node:path');
const fs = require('node:fs');
const { serve } = require('@hono/node-server');
const { serveStatic } = require('@hono/node-server/serve-static');
const { createNodeDatabase } = require('./node-database');
const { createApp } = require('./app');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3001;
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'data', 'board-attendance.db');

const db = createNodeDatabase(DB_PATH);
const config = {
  adminUsername: process.env.ADMIN_USERNAME,
  adminPassword: process.env.ADMIN_PASSWORD,
  allowDefaultPassword: true, // admin / admin123 when ADMIN_PASSWORD isn't set
  seedSampleData: process.env.SEED_SAMPLE_DATA !== 'false',
  timeZone: process.env.APP_TIMEZONE,
};
const app = createApp({ getDb: () => db, getConfig: () => config });

// Serve the built frontend (after `npm run build`), with SPA fallback.
const dist = path.join(ROOT, 'client', 'dist');
if (fs.existsSync(dist)) {
  const root = path.relative(process.cwd(), dist) || '.';
  app.use('*', serveStatic({ root }));
  app.get('*', serveStatic({ root, path: 'index.html' }));
}

const server = serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Board attendance server listening on http://localhost:${PORT}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
