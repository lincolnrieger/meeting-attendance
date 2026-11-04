/**
 * Cloudflare Workers entry point.
 *
 * Static files (the built React app in client/dist) are served by Workers
 * Static Assets; requests to /api/* run this Worker, which uses the D1
 * database bound as `DB` (see wrangler.toml).
 */
import serverApp from '../server/app.js';
import database from '../server/database.js';

const { createApp } = serverApp;
const { createD1Database } = database;

const adapters = new WeakMap();
function getDb(c) {
  if (!c.env.DB) throw new Error('No D1 database is bound as "DB". Check the d1_databases section of wrangler.toml.');
  if (!adapters.has(c.env.DB)) adapters.set(c.env.DB, createD1Database(c.env.DB));
  return adapters.get(c.env.DB);
}

const app = createApp({
  getDb,
  getConfig: (c) => ({
    adminUsername: c.env.ADMIN_USERNAME,
    adminPassword: c.env.ADMIN_PASSWORD, // set as a secret; there is no default password on Cloudflare
    allowDefaultPassword: false,
    seedSampleData: c.env.SEED_SAMPLE_DATA !== 'false',
    timeZone: c.env.APP_TIMEZONE,
  }),
});

// Anything that isn't /api is a frontend route: serve the single-page app.
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
