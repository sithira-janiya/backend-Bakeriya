import { randomBytes } from 'crypto'
import { ORDER_STATUSES } from './config.js'

export function makeOrderCode() {
  const ts = Date.now().toString(36).toUpperCase()
  // 8 hex chars from a CSPRNG (~4 billion values) so codes can't be guessed
  // or enumerated — the code doubles as the tracking secret for guests.
  const rand = randomBytes(4).toString('hex').toUpperCase()
  return `ORD-${ts}-${rand}`
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Validate + normalise an incoming order payload from the frontend.
// Returns { order } on success or { error } describing the first problem.
export function buildOrder(body) {
  const customer = body?.customer || {}
  const items = Array.isArray(body?.items) ? body.items : []

  if (!customer.name?.trim()) return { error: 'Customer name is required' }
  if (!customer.email?.trim() || !EMAIL_RE.test(customer.email)) {
    return { error: 'A valid customer email is required' }
  }
  if (!customer.phone?.trim()) return { error: 'Customer phone is required' }
  if (items.length === 0) return { error: 'Order must contain at least one item' }

  const normItems = []
  for (const it of items) {
    const qty = Number(it.qty)
    const price = Number(it.price)
    if (!it.id || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) {
      return { error: 'Each item needs a valid id, qty (>0) and price' }
    }
    normItems.push({ id: it.id, name: it.name, price, qty })
  }

  const total = normItems.reduce((sum, c) => sum + c.qty * c.price, 0)
  const now = new Date().toISOString()

  return {
    order: {
      id: makeOrderCode(),
      customer: {
        name: customer.name.trim(),
        email: customer.email.trim().toLowerCase(),
        phone: customer.phone.trim()
      },
      items: normItems,
      total: Math.round(total * 100) / 100,
      status: 'pending',
      createdAt: now,
      statusHistory: [{ status: 'pending', at: now }]
    }
  }
}

export function isValidStatus(status) {
  return ORDER_STATUSES.includes(status)
}
