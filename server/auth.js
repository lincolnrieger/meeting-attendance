/**
 * Administrator authentication.
 *
 * Server-side sessions are stored in the `sessions` table; the browser holds a
 * random 256-bit token in an HttpOnly cookie. Passwords are hashed with
 * PBKDF2-SHA256 using the Web Crypto API, which works both in Node.js and on
 * Cloudflare Workers.
 */
const { Hono } = require('hono');
const { HttpError, ValidationError } = require('./validation');

const COOKIE_NAME = 'bma_session';
const SESSION_DAYS = 14;
// Kept within the Workers free plan's 10 ms CPU limit per request. The count is
// stored with each hash, so it can be raised later (Workers allow up to 100,000).
const PBKDF2_ITERATIONS = Number(globalThis.process?.env?.PBKDF2_ITERATIONS) || 50000;

const subtle = () => globalThis.crypto.subtle;
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));

async function pbkdf2(password, salt, iterations) {
  const key = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return toHex(await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

/** Returns "pbkdf2$<iterations>$<salt hex>$<hash hex>". */
async function hashPassword(password) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${await pbkdf2(password, salt, PBKDF2_ITERATIONS)}`;
}

async function verifyPassword(password, stored) {
  // Databases created by the first (Express) version used bcrypt.
  if (String(stored).startsWith('$2')) return require('bcryptjs').compareSync(password, stored);
  const [scheme, iter, salt, expected] = String(stored).split('$');
  if (scheme !== 'pbkdf2' || !expected) return false;
  const actual = await pbkdf2(password, fromHex(salt), Number(iter));
  // constant-time comparison
  let diff = actual.length ^ expected.length;
  for (let i = 0; i < Math.min(actual.length, expected.length); i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function randomToken() {
  return toHex(globalThis.crypto.getRandomValues(new Uint8Array(32)));
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = 'admin123';

/**
 * Create the administrator account if no users exist yet.
 * `password` comes from ADMIN_PASSWORD; when it is not set, the well-known
 * default is only used if `allowDefaultPassword` is true (local development).
 */
async function ensureAdminUser(db, { adminUsername: username, adminPassword: password, allowDefaultPassword }) {
  if ((await db.value('SELECT COUNT(*) FROM users')) > 0) return;
  const pw = password || (allowDefaultPassword ? DEFAULT_PASSWORD : null);
  if (!pw) return; // login will explain that ADMIN_PASSWORD must be set
  const user = username || DEFAULT_USERNAME;
  await db.run('INSERT OR IGNORE INTO users (username, display_name, password_hash) VALUES (?, ?, ?)', [user, 'Administrator', await hashPassword(pw)]);
  console.log(`[auth] Created administrator account "${user}".`);
}

function isHttps(c) {
  return new URL(c.req.url).protocol === 'https:' || c.req.header('x-forwarded-proto') === 'https';
}

function cookie(c, value, maxAge) {
  return [`${COOKIE_NAME}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', isHttps(c) ? 'Secure' : null, `Max-Age=${maxAge}`]
    .filter(Boolean)
    .join('; ');
}

async function readJson(c) {
  try {
    return (await c.req.json()) || {};
  } catch {
    throw new HttpError(400, 'Invalid JSON body.');
  }
}

/** Middleware: requires a valid session; sets c.var.user. */
async function requireAuth(c, next) {
  const token = parseCookies(c.req.header('cookie'))[COOKIE_NAME];
  const user = token && (await c.var.db.first(
    `SELECT u.id, u.username, u.display_name FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`,
    [token, new Date().toISOString()],
  ));
  if (!user) throw new HttpError(401, 'Please sign in to continue.');
  c.set('user', user);
  await next();
}

function authRoutes() {
  const app = new Hono();

  app.post('/login', async (c) => {
    const db = c.var.db;
    if ((await db.value('SELECT COUNT(*) FROM users')) === 0) {
      throw new HttpError(503, 'No administrator account exists yet. Set the ADMIN_PASSWORD secret for this deployment, then try again.');
    }
    const { username = '', password = '' } = await readJson(c);
    const user = await db.first('SELECT * FROM users WHERE username = ?', [String(username).trim()]);
    if (!user || !(await verifyPassword(String(password), user.password_hash))) {
      throw new HttpError(401, 'Incorrect username or password.');
    }
    const token = randomToken();
    const now = new Date();
    await db.batch([
      ['DELETE FROM sessions WHERE expires_at < ?', [now.toISOString()]],
      ['INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', [token, user.id, new Date(now.getTime() + SESSION_DAYS * 86400_000).toISOString()]],
    ]);
    c.header('Set-Cookie', cookie(c, token, SESSION_DAYS * 86400));
    return c.json({ user: { id: user.id, username: user.username, display_name: user.display_name } });
  });

  app.post('/logout', async (c) => {
    const token = parseCookies(c.req.header('cookie'))[COOKIE_NAME];
    if (token) await c.var.db.run('DELETE FROM sessions WHERE token = ?', [token]);
    c.header('Set-Cookie', cookie(c, '', 0));
    return c.json({ ok: true });
  });

  // Whether the out-of-the-box credentials still work (shows a hint on the login page).
  app.get('/setup', async (c) => {
    if (!c.var.config.allowDefaultPassword) return c.json({ defaultCredentials: false });
    const user = await c.var.db.first('SELECT password_hash FROM users WHERE username = ?', [DEFAULT_USERNAME]);
    return c.json({ defaultCredentials: Boolean(user && (await verifyPassword(DEFAULT_PASSWORD, user.password_hash))) });
  });

  app.get('/me', requireAuth, (c) => c.json({ user: c.var.user }));

  app.post('/change-password', requireAuth, async (c) => {
    const { current_password = '', new_password = '' } = await readJson(c);
    const user = await c.var.db.first('SELECT * FROM users WHERE id = ?', [c.var.user.id]);
    const errors = {};
    if (!(await verifyPassword(String(current_password), user.password_hash))) errors.current_password = 'Current password is incorrect.';
    if (String(new_password).length < 8) errors.new_password = 'New password must be at least 8 characters.';
    if (Object.keys(errors).length) throw new ValidationError(errors);
    await c.var.db.run('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(String(new_password)), user.id]);
    return c.json({ ok: true });
  });

  return app;
}

module.exports = { authRoutes, requireAuth, ensureAdminUser, readJson, hashPassword, verifyPassword };
