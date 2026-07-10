const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');

const pool = require('./db');
const { logger, logEvent } = require('./logger');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TOKEN_TTL_MS = Number(process.env.TOKEN_TTL_MS || 24 * 60 * 60 * 1000);

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return (forwarded && forwarded.split(',')[0].trim()) || req.socket.remoteAddress;
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Login endpoint that accepts username or email and password, and returns a token if successful. 
// the token is stored in the database with an expiration time.
app.post('/login', async (req, res) => {
  const { usernameOrEmail, password } = req.body || {};
  const ip = clientIp(req);

  if (!usernameOrEmail || !password) {
    logEvent({ userId: null, action: 'login_failed', reason: 'missing_credentials', ip });
    return res.status(400).json({ error: 'usernameOrEmail and password are required' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, username, password_hash FROM users WHERE username = ? OR email = ? LIMIT 1',
      [usernameOrEmail, usernameOrEmail]
    );
    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      logEvent({ userId: user ? user.id : null, action: 'login_failed', reason: 'invalid_credentials', ip });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await pool.query(
      'INSERT INTO user_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, token, expiresAt]
    );

    logEvent({ userId: user.id, action: 'login_success', ip });
    return res.json({ token, expiresAt });
  } catch (err) {
    logger.error(`Login error: ${err.message}`);
    logEvent({ userId: null, action: 'login_error', reason: err.message, ip });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

async function requireAuth(req, res, next) {
  const token = req.header('x-auth-token');
  const ip = clientIp(req);

  if (!token) {
    return res.status(401).json({ error: 'Missing x-auth-token header' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT ut.user_id, u.username FROM user_tokens ut
       JOIN users u ON u.id = ut.user_id
       WHERE ut.token = ? AND ut.revoked = 0 AND ut.expires_at > NOW()
       LIMIT 1`,
      [token]
    );
    const record = rows[0];

    if (!record) {
      logEvent({ userId: null, action: 'auth_failed', reason: 'invalid_or_expired_token', ip });
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = { id: record.user_id, username: record.username };
    return next();
  } catch (err) {
    logger.error(`Auth middleware error: ${err.message}`);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Example protected route demonstrating token-as-header usage , depending on the time of the assignment, 
// I will check the path in the frontend.
app.get('/me', requireAuth, (req, res) => {
  logEvent({ userId: req.user.id, action: 'me_lookup', ip: clientIp(req) });
  res.json({ user: req.user });
});

app.post('/logout', requireAuth, async (req, res) => {
  const token = req.header('x-auth-token');
  await pool.query('UPDATE user_tokens SET revoked = 1 WHERE token = ?', [token]);
  logEvent({ userId: req.user.id, action: 'logout', ip: clientIp(req) });
  res.json({ status: 'logged_out' });
});

app.listen(PORT, () => {
  logger.info(`Backend listening on port ${PORT}`);
});