/**
 * Administrator authentication.
 *
 * Uses server-side sessions stored in the `sessions` table. The session token
 * is a random 256-bit value sent to the browser in an HttpOnly cookie.
 * Passwords are hashed with bcrypt.
 */
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const { HttpError, ValidationError } = require('./validation');

const COOKIE_NAME = 'bma_session';
const SESSION_DAYS = 14;

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Create the initial administrator account if no users exist yet. */
function ensureAdminUser(db) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return;
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  db.prepare('INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)').run(
    username,
    'Administrator',
    bcrypt.hashSync(password, 10),
  );
  console.log(`[auth] Created administrator account "${username}". Change the password from Settings after first login.`);
}

function authRouter(db) {
  const router = express.Router();

  const cookieOptions = (req) => [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    req.secure ? 'Secure' : null,
  ].filter(Boolean).join('; ');

  router.post('/login', (req, res) => {
    const { username = '', password = '' } = req.body || {};
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim());
    if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
      throw new HttpError(401, 'Incorrect username or password.');
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expires);
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; ${cookieOptions(req)}; Max-Age=${SESSION_DAYS * 86400}`);
    res.json({ user: { id: user.id, username: user.username, display_name: user.display_name } });
  });

  router.post('/logout', (req, res) => {
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; ${cookieOptions(req)}; Max-Age=0`);
    res.json({ ok: true });
  });

  // Whether the out-of-the-box credentials still work (used to show a hint on the login page).
  router.get('/setup', (req, res) => {
    const user = db.prepare('SELECT password_hash FROM users WHERE username = ?').get('admin');
    res.json({ defaultCredentials: Boolean(user && bcrypt.compareSync('admin123', user.password_hash)) });
  });

  router.get('/me', requireAuth(db), (req, res) => {
    res.json({ user: req.user });
  });

  router.post('/change-password', requireAuth(db), (req, res) => {
    const { current_password = '', new_password = '' } = req.body || {};
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const errors = {};
    if (!bcrypt.compareSync(String(current_password), user.password_hash)) errors.current_password = 'Current password is incorrect.';
    if (String(new_password).length < 8) errors.new_password = 'New password must be at least 8 characters.';
    if (Object.keys(errors).length) throw new ValidationError(errors);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(new_password), 10), user.id);
    res.json({ ok: true });
  });

  return router;
}

function requireAuth(db) {
  const lookup = db.prepare(`
    SELECT u.id, u.username, u.display_name
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?
  `);
  return (req, res, next) => {
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
    const user = token && lookup.get(token, new Date().toISOString());
    if (!user) return next(new HttpError(401, 'Please sign in to continue.'));
    req.user = user;
    next();
  };
}

module.exports = { authRouter, requireAuth, ensureAdminUser };
