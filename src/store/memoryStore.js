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
    }
  }
}
