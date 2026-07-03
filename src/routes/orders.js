import { Router } from 'express'
import { randomUUID } from 'crypto'
import { getStore } from '../store/index.js'
import { requireAdmin, requireAuth, optionalAuth, issueGuestToken } from '../auth.js'
import { broadcast } from '../realtime.js'
import { buildOrder, isValidStatus } from '../util.js'

export const ordersRouter = Router()

const isAdmin = (req) => req.user?.role === 'admin'

// A caller "owns" an order when either:
//   - they're the signed-in customer whose email is on the order, OR
//   - they're a guest whose token gid matches the gid stamped on the order.
// Only owners (and admins) get full PII; everyone else gets publicOrderView.
const ownsOrder = (req, order) => {
  if (req.user?.role === 'customer' && req.user.email && order?.customer?.email) {
    return String(order.customer.email).toLowerCase() === String(req.user.email).toLowerCase()
  }
  if (req.user?.role === 'guest' && req.user.gid && order?.customer?.guestId) {
    return req.user.gid === order.customer.guestId
  }
  return false
}

// The guestId is an internal ownership handle — never echo it back in a
// response body (the owner already carries it inside their guest token).
function withoutGuestId(order) {
  if (!order?.customer?.guestId) return order
  const { guestId, ...customer } = order.customer
  return { ...order, customer }
}

// Strip customer PII for callers who are neither the owner nor an admin. Keeps
// the fields a public "track by code" page needs (status, items, total, time).
function publicOrderView(order) {
  return {
    id: order.id,
    items: order.items,
    total: order.total,
    status: order.status,
    createdAt: order.createdAt,
    statusHistory: order.statusHistory,
    customer: {}
  }
}

// GET /api/orders?email=...  — auth required.
//   customer: may only look up their OWN email.
//   admin:    email lookup for anyone, or full list when no email is given.
ordersRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const { email } = req.query
    if (email) {
      if (!isAdmin(req) && String(email).toLowerCase() !== String(req.user.email || '').toLowerCase()) {
        return res.status(403).json({ error: 'You can only view your own orders' })
      }
      const orders = await getStore().listOrdersByEmail(String(email).toLowerCase())
      return res.json({ orders: orders.map(withoutGuestId) })
    }
    // No email -> full list, admin only
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' })
    const orders = await getStore().listOrders()
    res.json({ orders: orders.map(withoutGuestId) })
  } catch (err) {
    next(err)
  }
})

// POST /api/orders — place a new order.
// Public, but we identify the placer so THEY (and only they) can reopen it:
//   - signed-in customer: owned via their email, no guest token needed.
//   - guest: stamp a gid on the order and hand back a guestToken. A returning
//     guest reuses the gid from their existing token so all their orders share
//     one identity. Identity is per-browser (the token), never per-IP.
ordersRouter.post('/', optionalAuth, async (req, res, next) => {
  try {
    const { order, error } = buildOrder(req.body)
    if (error) return res.status(400).json({ error })

    let guestToken
    if (req.user?.role !== 'customer') {
      const gid = req.user?.role === 'guest' && req.user.gid ? req.user.gid : randomUUID()
      order.customer.guestId = gid
      guestToken = issueGuestToken(gid)
    }

    const saved = await getStore().createOrder(order)
    broadcast('order:created', { order: saved })
    res.status(201).json({ order: withoutGuestId(saved), guestToken })
  } catch (err) {
    next(err)
  }
})

// GET /api/orders/:code — fetch a single order by its ORD code.
// Public (anyone with the code sees status/items), but customer PII is only
// returned to the owning customer or an admin.
ordersRouter.get('/:code', optionalAuth, async (req, res, next) => {
  try {
    const order = await getStore().getOrderByCode(req.params.code)
    if (!order) return res.status(404).json({ error: 'Order not found' })
    const full = isAdmin(req) || ownsOrder(req, order)
    res.json({ order: full ? withoutGuestId(order) : publicOrderView(order) })
  } catch (err) {
    next(err)
  }
})

// PATCH /api/orders/:code/status — chef advances an order (admin only)
ordersRouter.patch('/:code/status', requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.body || {}
    if (!isValidStatus(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }
    const updated = await getStore().updateOrderStatus(req.params.code, status)
    if (!updated) return res.status(404).json({ error: 'Order not found' })

    broadcast('order:updated', { order: updated })
    res.json({ order: updated })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/orders/:code — permanently remove a COLLECTED order (admin only).
// End-of-day cleanup: frees the record in the store. Guarded to completed
// orders so an active/in-progress order can never be wiped by mistake.
ordersRouter.delete('/:code', requireAdmin, async (req, res, next) => {
  try {
    const order = await getStore().getOrderByCode(req.params.code)
    if (!order) return res.status(404).json({ error: 'Order not found' })
    if (order.status !== 'completed') {
      return res.status(409).json({ error: 'Only collected (completed) orders can be removed' })
    }

    await getStore().deleteOrder(req.params.code)
    broadcast('order:deleted', { order: { id: req.params.code } })
    res.json({ ok: true, id: req.params.code })
  } catch (err) {
    next(err)
  }
})
