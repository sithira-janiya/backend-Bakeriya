import { Router } from 'express'
import { getStore } from '../store/index.js'
import { requireAdmin, requireAuth, optionalAuth } from '../auth.js'
import { broadcast } from '../realtime.js'
import { buildOrder, isValidStatus } from '../util.js'

export const ordersRouter = Router()

const isAdmin = (req) => req.user?.role === 'admin'
const ownsOrder = (req, order) =>
  req.user?.role === 'customer' &&
  req.user.email &&
  order?.customer?.email &&
  String(order.customer.email).toLowerCase() === String(req.user.email).toLowerCase()

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
      return res.json({ orders })
    }
    // No email -> full list, admin only
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' })
    const orders = await getStore().listOrders()
    res.json({ orders })
  } catch (err) {
    next(err)
  }
})

// POST /api/orders — place a new order (public)
ordersRouter.post('/', async (req, res, next) => {
  try {
    const { order, error } = buildOrder(req.body)
    if (error) return res.status(400).json({ error })

    const saved = await getStore().createOrder(order)
    broadcast('order:created', { order: saved })
    res.status(201).json({ order: saved })
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
    res.json({ order: full ? order : publicOrderView(order) })
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
