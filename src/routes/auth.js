import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { OAuth2Client } from 'google-auth-library'
import { getStore } from '../store/index.js'
import { config } from '../config.js'
import {
  issueAdminToken,
  issueUserToken,
  verifyAdminCredentials,
  requireAuth
} from '../auth.js'
import { sendPasswordPin, sendVerificationCode } from '../email.js'

export const authRouter = Router()

const googleClient = config.googleClientId ? new OAuth2Client(config.googleClientId) : null
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, provider: u.provider }
}

// Generate a fresh 6-digit verification code, store it hashed on the user
// (15-min expiry), and email it. Only someone who can read the inbox can
// complete verification — which is how we ensure the address really exists.
async function issueEmailVerification(user) {
  const code = String(Math.floor(100000 + Math.random() * 900000))
  const verifyPin = await bcrypt.hash(code, 10)
  const verifyPinExpires = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  await getStore().updateUser(user.id, { verifyPin, verifyPinExpires })
  await sendVerificationCode(user.email, code)
}

function addProvider(provider, next) {
  const parts = new Set((provider || '').split(',').filter(Boolean))
  parts.add(next)
  return [...parts].join(',')
}

// POST /api/auth/register — create a normal email+password account
authRouter.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {}
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
    if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'A valid email is required' })
    if (!password || String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }
    const existing = await getStore().getUserByEmail(email)
    if (existing) {
      // A verified account is a real conflict. If it's an unverified, half-finished
      // signup, resend a code instead so it can be completed — without overwriting
      // the original password (only the inbox owner can ever verify it).
      if (existing.emailVerified) {
        return res.status(409).json({ error: 'An account with this email already exists' })
      }
      await issueEmailVerification(existing)
      return res.status(200).json({ pendingVerification: true, email: existing.email })
    }

    const passwordHash = await bcrypt.hash(String(password), 10)
    const user = await getStore().createUser({
      name: name.trim(),
      email: email.toLowerCase(),
      passwordHash,
      provider: 'password',
      emailVerified: false
    })
    // No token yet — the account is inert until the emailed code is confirmed.
    await issueEmailVerification(user)
    res.status(201).json({ pendingVerification: true, email: user.email })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/verify-email — confirm the 6-digit code and activate the account
authRouter.post('/verify-email', async (req, res, next) => {
  try {
    const { email, code } = req.body || {}
    if (!email || !code) return res.status(400).json({ error: 'Email and code are required' })

    const user = await getStore().getUserByEmail(email)
    if (!user) return res.status(400).json({ error: 'No pending verification for this email' })
    if (user.emailVerified) return res.status(400).json({ error: 'Email is already verified — please sign in' })
    if (!user.verifyPin || !user.verifyPinExpires) {
      return res.status(400).json({ error: 'No pending verification — request a new code' })
    }
    if (new Date(user.verifyPinExpires).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Code has expired — request a new one' })
    }
    const match = await bcrypt.compare(String(code), user.verifyPin)
    if (!match) return res.status(400).json({ error: 'Incorrect code' })

    const verified = await getStore().updateUser(user.id, {
      emailVerified: true,
      verifyPin: '',
      verifyPinExpires: ''
    })
    // Now they're proven owners of the email — hand back a real session token.
    res.json({ token: issueUserToken(verified), role: 'customer', user: publicUser(verified) })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/resend-verification — email a fresh code for a pending signup
authRouter.post('/resend-verification', async (req, res, next) => {
  try {
    const { email } = req.body || {}
    if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'A valid email is required' })

    const user = await getStore().getUserByEmail(email)
    // Only act for a real, still-unverified account, but always respond ok so
    // this endpoint can't be used to probe which emails are registered.
    if (user && !user.emailVerified) await issueEmailVerification(user)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/login — unified: admin (username/password) OR customer (email/password)
authRouter.post('/login', async (req, res, next) => {
  try {
    const { username, email, password } = req.body || {}
    const identifier = username ?? email

    // Admin path first (username `admin` + configured password)
    if (verifyAdminCredentials(identifier, password)) {
      return res.json({ token: issueAdminToken(), role: 'admin' })
    }

    // Customer path
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }
    const user = await getStore().getUserByEmail(identifier)
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }
    const ok = await bcrypt.compare(String(password), user.passwordHash)
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' })

    // Password is right, but the address must be proven before first sign-in.
    if (!user.emailVerified) {
      return res.status(403).json({
        error: 'Please verify your email before signing in. Check your inbox for the code.',
        needsVerification: true,
        email: user.email
      })
    }

    res.json({ token: issueUserToken(user), role: 'customer', user: publicUser(user) })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/google — verify a Google ID token (credential) and sign in
authRouter.post('/google', async (req, res, next) => {
  try {
    if (!googleClient) return res.status(500).json({ error: 'Google sign-in is not configured' })
    const { credential } = req.body || {}
    if (!credential) return res.status(400).json({ error: 'Missing Google credential' })

    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: config.googleClientId })
    const payload = ticket.getPayload()
    const email = payload?.email?.toLowerCase()
    if (!email || !payload.email_verified) {
      return res.status(401).json({ error: 'Google account email is not verified' })
    }

    let user = await getStore().getUserByEmail(email)
    if (!user) {
      user = await getStore().createUser({
        name: payload.name || email.split('@')[0],
        email,
        googleId: payload.sub,
        provider: 'google',
        emailVerified: true // Google already verified this address
      })
    } else {
      // Signing in via Google proves ownership — link the account and, if it was
      // a still-unverified password signup, mark it verified now.
      const patch = {}
      if (!user.googleId) {
        patch.googleId = payload.sub
        patch.provider = addProvider(user.provider, 'google')
      }
      if (!user.emailVerified) patch.emailVerified = true
      if (Object.keys(patch).length) user = await getStore().updateUser(user.id, patch)
    }
    res.json({ token: issueUserToken(user), role: 'customer', user: publicUser(user) })
  } catch (err) {
    next(err)
  }
})

// GET /api/auth/me — current principal
authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role === 'admin') return res.json({ user: { role: 'admin', name: 'Admin' } })
    const user = await getStore().getUserById(req.user.sub)
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({ user: publicUser(user) })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/password/request-pin — email a 6-digit PIN to the logged-in user
authRouter.post('/password/request-pin', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'customer') return res.status(403).json({ error: 'Not available for this account' })
    const user = await getStore().getUserById(req.user.sub)
    if (!user) return res.status(404).json({ error: 'User not found' })

    const pin = String(Math.floor(100000 + Math.random() * 900000))
    const pwPin = await bcrypt.hash(pin, 10)
    const pwPinExpires = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    await getStore().updateUser(user.id, { pwPin, pwPinExpires })
    await sendPasswordPin(user.email, pin)

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/password/change — verify the PIN and set a new password
authRouter.post('/password/change', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'customer') return res.status(403).json({ error: 'Not available for this account' })
    const { pin, newPassword } = req.body || {}
    if (!pin) return res.status(400).json({ error: 'PIN is required' })
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    const user = await getStore().getUserById(req.user.sub)
    if (!user || !user.pwPin || !user.pwPinExpires) {
      return res.status(400).json({ error: 'Request a PIN first' })
    }
    if (new Date(user.pwPinExpires).getTime() < Date.now()) {
      return res.status(400).json({ error: 'PIN has expired — request a new one' })
    }
    const ok = await bcrypt.compare(String(pin), user.pwPin)
    if (!ok) return res.status(400).json({ error: 'Incorrect PIN' })

    const passwordHash = await bcrypt.hash(String(newPassword), 10)
    await getStore().updateUser(user.id, {
      passwordHash,
      provider: addProvider(user.provider, 'password'),
      pwPin: '',
      pwPinExpires: ''
    })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})
