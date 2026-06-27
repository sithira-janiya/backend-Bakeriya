import { Router } from 'express'
import { getStore } from '../store/index.js'
import { requireAdmin } from '../auth.js'
import { broadcast } from '../realtime.js'
import { buildOrder, isValidStatus } from '../util.js'

export const ordersRouter = Router()

// GET /api/orders?email=...   (admin lists all; email lookup is public)
ordersRouter.get('/', async (req, res, next) => {
  try {
    const { email } = req.query
    if (email) {
      const orders = await getStore().listOrdersByEmail(String(email))
      return res.json({ orders })
    }
    // No email -> full list, admin only
    return requireAdmin(req, res, async () => {
      const orders = await getStore().listOrders()
      res.json({ orders })
    })
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

// GET /api/orders/:code — fetch a single order (public, by its ORD code)
ordersRouter.get('/:code', async (req, res, next) => {
  try {
    const order = await getStore().getOrderByCode(req.params.code)
    if (!order) return res.status(404).json({ error: 'Order not found' })
    res.json({ order })
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
