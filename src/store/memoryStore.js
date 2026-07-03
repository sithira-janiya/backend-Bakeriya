// In-memory implementation of the data store.
//
// Used automatically as a fallback when Pocketbase is unreachable, and for
// local testing / CI. Data lives only for the lifetime of the process.
// The public methods match pocketbaseStore.js exactly so the rest of the app
// is agnostic to which backend is active.

import { menuItems as seedItems } from '../menuData.js'

export function createMemoryStore() {
  /** @type {Map<string, any>} keyed by item.id */
  const items = new Map()
  /** @type {Map<string, any>} keyed by order code */
  const orders = new Map()
  /** @type {Map<string, any>} keyed by user id */
  const users = new Map()
  let userSeq = 0

  return {
    name: 'memory',

    async init() {
      // nothing to connect to
    },

    async seedMenu(list = seedItems) {
      for (const it of list) {
        items.set(it.id, { ...it })
      }
      return items.size
    },

    async listMenu() {
      return [...items.values()].sort((a, b) => a.id.localeCompare(b.id))
    },

    async createOrder(order) {
      orders.set(order.id, { ...order })
      return { ...order }
    },

    async getOrderByCode(code) {
      const o = orders.get(code)
      return o ? { ...o } : null
    },

    async listOrdersByEmail(email) {
      const e = String(email).toLowerCase()
      return [...orders.values()]
        .filter((o) => o.customer?.email?.toLowerCase() === e)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    },

    async listOrders() {
      return [...orders.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    },

    async updateOrderStatus(code, status) {
      const o = orders.get(code)
      if (!o) return null
      o.status = status
      o.statusHistory = [...(o.statusHistory || []), { status, at: new Date().toISOString() }]
      orders.set(code, o)
      return { ...o }
    },

    async deleteOrder(code) {
      return orders.delete(code)
    },

    // ---- Menu admin (add / update / remove single items) ----
    async createMenuItem(item) {
      const rec = { ...item, tags: item.tags || [], available: item.available !== false }
      items.set(rec.id, rec)
      return { ...rec }
    },

    async updateMenuItem(id, patch) {
      const rec = items.get(id)
      if (!rec) return null
      const updated = { ...rec, ...patch }
      items.set(id, updated)
      return { ...updated }
    },

    async deleteMenuItem(id) {
      return items.delete(id)
    },

    // ---- Customers (auth) ----
    async createUser(user) {
      const id = `usr_${++userSeq}`
      const rec = {
        id,
        name: user.name || '',
        email: String(user.email).toLowerCase(),
        passwordHash: user.passwordHash || '',
        provider: user.provider || 'password',
        googleId: user.googleId || '',
        emailVerified: user.emailVerified || false,
        verifyPin: '',
        verifyPinExpires: '',
        pwPin: '',
        pwPinExpires: '',
        createdAt: new Date().toISOString()
      }
      users.set(id, rec)
      return { ...rec }
    },

    async getUserByEmail(email) {
      const e = String(email).toLowerCase()
      const found = [...users.values()].find((u) => u.email === e)
      return found ? { ...found } : null
    },

    async getUserById(id) {
      const u = users.get(id)
      return u ? { ...u } : null
    },

    async updateUser(id, patch) {
      const u = users.get(id)
      if (!u) return null
      const updated = { ...u, ...patch }
      users.set(id, updated)
      return { ...updated }
    }
  }
}
