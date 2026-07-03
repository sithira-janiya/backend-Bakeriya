// Authentication: admin (username/password) + customers (email/password or
// Google), both carried as JWTs signed with config.jwtSecret.
//   - admin token:    { role: 'admin' }
//   - customer token: { role: 'customer', sub, email, name }
import jwt from 'jsonwebtoken'
import { config } from './config.js'

export function issueAdminToken() {
  return jwt.sign({ role: 'admin' }, config.jwtSecret, { expiresIn: config.jwtExpiresIn })
}

export function issueUserToken(user) {
  return jwt.sign(
    { role: 'customer', sub: user.id, email: user.email, name: user.name },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  )
}

// Replaces the old PIN check: admin signs in with a username + password.
export function verifyAdminCredentials(username, password) {
  return String(username) === config.adminUsername && String(password) === config.adminPassword
}

// Returns the decoded payload if the token is a valid ADMIN token, else null.
// Used by the WebSocket hub to gate full (PII-bearing) order broadcasts.
export function verifyToken(token) {
  try {
    const payload = jwt.verify(token, config.jwtSecret)
    return payload.role === 'admin' ? payload : null
  } catch {
    return null
  }
}

function bearerToken(req) {
  const header = req.headers.authorization || ''
  return header.startsWith('Bearer ') ? header.slice(7) : null
}

export function requireAdmin(req, res, next) {
  const token = bearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing admin token' })
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret)
    if (payload.role !== 'admin') throw new Error('not admin')
    req.admin = payload
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// Any authenticated principal (customer or admin). Sets req.user to the payload.
export function requireAuth(req, res, next) {
  const token = bearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  try {
    req.user = jwt.verify(token, config.jwtSecret)
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// Attaches req.user when a valid token is present, but never rejects the
// request. Used where anonymous access is allowed but authenticated callers
// get more (e.g. full PII on their own order vs a redacted public view).
// An invalid/expired token is treated as anonymous rather than an error.
export function optionalAuth(req, res, next) {
  const token = bearerToken(req)
  if (token) {
    try {
      req.user = jwt.verify(token, config.jwtSecret)
    } catch {
      req.user = null
    }
  }
  next()
}
