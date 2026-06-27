import { Router } from 'express'
import { issueAdminToken, verifyPin } from '../auth.js'

export const adminRouter = Router()

// POST /api/admin/login  { pin } -> { token }
adminRouter.post('/login', (req, res) => {
  const { pin } = req.body || {}
  if (!verifyPin(pin)) {
    return res.status(401).json({ error: 'Incorrect PIN' })
  }
  const token = issueAdminToken()
  res.json({ token })
})
