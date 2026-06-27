// Pocketbase-backed implementation of the data store.
//
// Talks to a running Pocketbase instance using the official JS SDK. On init it
// authenticates as the configured admin/superuser, then ensures the `items`
// and `orders` collections exist (creating them if missing). All order/menu
// reads & writes go through Pocketbase, which is the source of truth.
//
// Collections
//   items   -> bakery menu (mirrors frontend menu shape)
//   orders  -> customer orders + status history
//
// Note: the `code` field on orders stores the human ORD-XXXX id the customer
// sees; Pocketbase's own `id` is internal.

import PocketBase from 'pocketbase'
import { config } from '../config.js'
import { menuItems as seedItems } from '../menuData.js'

const ITEMS = 'items'
const ORDERS = 'orders'

function toMenuItem(rec) {
  return {
    id: rec.extId,
    name: rec.name,
    category: rec.category,
    price: rec.price,
    tags: rec.tags || [],
    description: rec.description,
    emoji: rec.emoji,
    available: rec.available
  }
}

function toOrder(rec) {
  return {
    id: rec.code,
    customer: rec.customer,
    items: rec.items,
    total: rec.total,
    status: rec.status,
    createdAt: rec.placedAt || rec.created,
    statusHistory: rec.statusHistory || []
  }
}

export function createPocketbaseStore() {
  const pb = new PocketBase(config.pocketbaseUrl)
  pb.autoCancellation(false)

  async function authenticateAdmin() {
    // SDK >=0.23 exposes superusers via a normal auth collection; older
    // versions use pb.admins. Try both so the backend works across versions.
    try {
      if (pb.admins?.authWithPassword) {
        await pb.admins.authWithPassword(config.pbAdminEmail, config.pbAdminPassword)
        return
      }
    } catch (err) {
      // fall through to superusers collection
    }
    await pb.collection('_superusers').authWithPassword(config.pbAdminEmail, config.pbAdminPassword)
  }

  async function collectionExists(name) {
    try {
      await pb.collections.getOne(name)
      return true
    } catch {
      return false
    }
  }

  async function ensureSchema() {
    if (!(await collectionExists(ITEMS))) {
      await pb.collections.create({
        name: ITEMS,
        type: 'base',
        schema: [
          { name: 'extId', type: 'text', required: true, options: {} },
          { name: 'name', type: 'json', required: true, options: {} },
          { name: 'category', type: 'text', required: true, options: {} },
          { name: 'price', type: 'number', required: true, options: { min: 0 } },
          { name: 'tags', type: 'json', required: false, options: {} },
          { name: 'description', type: 'json', required: false, options: {} },
          { name: 'emoji', type: 'text', required: false, options: {} },
          { name: 'available', type: 'bool', required: false, options: {} }
        ],
        indexes: [`CREATE UNIQUE INDEX idx_items_extId ON ${ITEMS} (extId)`],
        // public read so the menu can be fetched; writes restricted to admin
        listRule: '',
        viewRule: '',
        createRule: null,
        updateRule: null,
        deleteRule: null
      })
    }

    if (!(await collectionExists(ORDERS))) {
      await pb.collections.create({
        name: ORDERS,
        type: 'base',
        schema: [
          { name: 'code', type: 'text', required: true, options: {} },
          { name: 'customer', type: 'json', required: true, options: {} },
          { name: 'items', type: 'json', required: true, options: {} },
          { name: 'total', type: 'number', required: true, options: { min: 0 } },
          {
            name: 'status',
            type: 'select',
            required: true,
            options: { maxSelect: 1, values: ['pending', 'cooking', 'ready', 'completed'] }
          },
          { name: 'statusHistory', type: 'json', required: false, options: {} },
          { name: 'placedAt', type: 'text', required: false, options: {} }
        ],
        indexes: [`CREATE UNIQUE INDEX idx_orders_code ON ${ORDERS} (code)`],
        // orders are written/read through the Node API (admin auth), not directly
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null
      })
    }
  }

  async function findOrderRecord(code) {
    try {
      return await pb.collection(ORDERS).getFirstListItem(`code="${code}"`)
    } catch {
      return null
    }
  }

  return {
    name: 'pocketbase',

    async init() {
      await authenticateAdmin()
      await ensureSchema()
    },

    async seedMenu(list = seedItems) {
      let count = 0
      for (const it of list) {
        const data = {
          extId: it.id,
          name: it.name,
          category: it.category,
          price: it.price,
          tags: it.tags || [],
          description: it.description,
          emoji: it.emoji,
          available: it.available
        }
        let existing = null
        try {
          existing = await pb.collection(ITEMS).getFirstListItem(`extId="${it.id}"`)
        } catch {
          existing = null
        }
        if (existing) {
          await pb.collection(ITEMS).update(existing.id, data)
        } else {
          await pb.collection(ITEMS).create(data)
        }
        count++
      }
      return count
    },

    async listMenu() {
      const records = await pb.collection(ITEMS).getFullList({ sort: 'extId' })
      return records.map(toMenuItem)
    },

    async createOrder(order) {
      const rec = await pb.collection(ORDERS).create({
        code: order.id,
        customer: order.customer,
        items: order.items,
        total: order.total,
        status: order.status,
        statusHistory: order.statusHistory,
        placedAt: order.createdAt
      })
      return toOrder(rec)
    },

    async getOrderByCode(code) {
      const rec = await findOrderRecord(code)
      return rec ? toOrder(rec) : null
    },

    async listOrdersByEmail(email) {
      const records = await pb.collection(ORDERS).getFullList({
        filter: `customer.email = "${String(email).replace(/"/g, '')}"`,
        sort: '-placedAt'
      })
      return records.map(toOrder)
    },

    async listOrders() {
      const records = await pb.collection(ORDERS).getFullList({ sort: '-placedAt' })
      return records.map(toOrder)
    },

    async updateOrderStatus(code, status) {
      const rec = await findOrderRecord(code)
      if (!rec) return null
      const statusHistory = [...(rec.statusHistory || []), { status, at: new Date().toISOString() }]
      const updated = await pb.collection(ORDERS).update(rec.id, { status, statusHistory })
      return toOrder(updated)
    }
  }
}
