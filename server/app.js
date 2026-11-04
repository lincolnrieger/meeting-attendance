/**
 * HTTP API (Hono). The same app runs on Cloudflare Workers (worker/index.mjs)
 * and on Node.js (server/index.js); each entry point supplies the database.
 *
 *   createApp({
 *     getDb:     (c) => database adapter for this request (see database.js),
 *     getConfig: (c) => ({ adminUsername, adminPassword, allowDefaultPassword, seedSampleData, timeZone }),
 *   })
 */
const { Hono } = require('hono');
const { bodyLimit } = require('hono/body-limit');
const { authRoutes, requireAuth, ensureAdminUser } = require('./auth');
const { migrate } = require('./database');
const { seedIfEmpty } = require('./seed');
const { setTimeZone } = require('./validation');

/** One-time setup per database (schema, admin account, sample data), memoised. */
const ready = new WeakMap();
function ensureReady(db, config) {
  if (!ready.has(db)) {
    const p = (async () => {
      await migrate(db);
      await ensureAdminUser(db, config);
      if (config.seedSampleData !== false) await seedIfEmpty(db);
    })();
    p.catch(() => ready.delete(db)); // retry on the next request if setup failed
    ready.set(db, p);
  }
  return ready.get(db);
}

function createApp({ getDb, getConfig }) {
  const app = new Hono();

  app.get('/api/health', (c) => c.json({ ok: true }));

  app.use('/api/*', bodyLimit({ maxSize: 5 * 1024 * 1024, onError: (c) => c.json({ error: 'Request is too large.' }, 413) }));
  app.use('/api/*', async (c, next) => {
    const config = getConfig(c);
    setTimeZone(config.timeZone);
    const db = getDb(c);
    await ensureReady(db, config);
    c.set('db', db);
    c.set('config', config);
    await next();
  });

  app.route('/api/auth', authRoutes());

  // Everything else under /api requires a signed-in administrator.
  const api = new Hono();
  api.use('*', requireAuth);
  api.route('/participants', require('./routes/participants')());
  api.route('/meetings', require('./routes/meetings')());
  api.route('/dashboard', require('./routes/dashboard')());
  api.route('/reports', require('./routes/reports')());
  api.route('/settings', require('./routes/settings')());
  api.route('/custom-fields', require('./routes/custom-fields')());
  app.route('/api', api);

  app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404));

  // Central error handler: validation errors → 422 with per-field messages.
  app.onError((err, c) => {
    // Errors we raise deliberately carry a status; anything else is unexpected.
    const expected = Number.isInteger(err.status);
    if (!expected) console.error(err);
    return c.json(
      { error: expected ? err.message : 'Something went wrong on the server.', ...(err.errors ? { errors: err.errors } : {}) },
      expected ? err.status : 500,
    );
  });

  return app;
}

module.exports = { createApp };
