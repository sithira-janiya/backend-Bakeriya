// Admin authentication: PIN -> JWT.
import jwt from 'jsonwebtoken'
import { config } from './config.js'

export function issueAdminToken() {
  return jwt.sign({ role: 'admin' }, config.jwtSecret, { expiresIn: config.jwtExpiresIn })
}

export function verifyPin(pin) {
  return String(pin) === config.adminPin
}

// Returns the decoded payload if the token is a valid admin token, else null.
export function verifyToken(token) {
  try {
    const payload = jwt.verify(token, config.jwtSecret)
    return payload.role === 'admin' ? payload : null
  } catch {
    return null
  }
}

export function requireAdmin(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
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
