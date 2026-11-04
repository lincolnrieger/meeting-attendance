/**
 * Express application factory. Kept separate from index.js so tests can create
 * an app against a temporary database.
 */
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const { authRouter, requireAuth, ensureAdminUser } = require('./auth');
const { seedIfEmpty } = require('./seed');

function createApp(db) {
  ensureAdminUser(db);
  seedIfEmpty(db);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter(db));

  const api = express.Router();
  api.use(requireAuth(db));
  api.use('/participants', require('./routes/participants')(db));
  api.use('/meetings', require('./routes/meetings')(db));
  api.use('/dashboard', require('./routes/dashboard')(db));
  api.use('/reports', require('./routes/reports')(db));
  api.use('/settings', require('./routes/settings')(db));
  app.use('/api', api);

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // Serve the built frontend in production (after `npm run build`).
  const dist = path.join(__dirname, '..', 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // Central error handler: validation errors → 422 with field messages.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({
      error: status >= 500 ? 'Something went wrong on the server.' : err.message,
      ...(err.errors ? { errors: err.errors } : {}),
    });
  });

  return app;
}

module.exports = { createApp };
