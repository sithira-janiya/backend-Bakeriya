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
// Our own customer table. Named `customers` (not `users`) to avoid clashing
// with PocketBase's built-in default auth collection — we manage auth ourselves
// (bcrypt + our JWTs), so this is a plain base collection.
const CUSTOMERS = 'customers'

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

function toUser(rec) {
  return {
    id: rec.id,
    name: rec.name,
    email: rec.email,
    passwordHash: rec.passwordHash || '',
    provider: rec.provider || 'password',
    googleId: rec.googleId || '',
    pwPin: rec.pwPin || '',
    pwPinExpires: rec.pwPinExpires || '',
    createdAt: rec.created
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
    // PocketBase v0.23+ replaced the old `schema: [{ ..., options }]` shape with
    // a flat `fields: [...]` array. JSON fields require an explicit `maxSize`.
    if (!(await collectionExists(ITEMS))) {
      await pb.collections.create({
        name: ITEMS,
        type: 'base',
        fields: [
          { name: 'extId', type: 'text', required: true },
          { name: 'name', type: 'json', required: true, maxSize: 2000000 },
          { name: 'category', type: 'text', required: true },
          { name: 'price', type: 'number', required: true, min: 0 },
          { name: 'tags', type: 'json', required: false, maxSize: 2000000 },
          { name: 'description', type: 'json', required: false, maxSize: 2000000 },
          { name: 'emoji', type: 'text', required: false },
          { name: 'available', type: 'bool', required: false }
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
        fields: [
          { name: 'code', type: 'text', required: true },
          { name: 'customer', type: 'json', required: true, maxSize: 2000000 },
          { name: 'items', type: 'json', required: true, maxSize: 2000000 },
          { name: 'total', type: 'number', required: true, min: 0 },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['pending', 'cooking', 'ready', 'completed']
          },
          { name: 'statusHistory', type: 'json', required: false, maxSize: 2000000 },
          { name: 'placedAt', type: 'text', required: false }
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

    if (!(await collectionExists(CUSTOMERS))) {
      await pb.collections.create({
        name: CUSTOMERS,
        type: 'base',
        fields: [
          { name: 'name', type: 'text', required: false },
          { name: 'email', type: 'text', required: true },
          { name: 'passwordHash', type: 'text', required: false },
          { name: 'provider', type: 'text', required: false },
          { name: 'googleId', type: 'text', required: false },
          { name: 'pwPin', type: 'text', required: false },
          { name: 'pwPinExpires', type: 'text', required: false }
        ],
        indexes: [`CREATE UNIQUE INDEX idx_customers_email ON ${CUSTOMERS} (email)`],
        // customer auth goes through the Node API only, never direct PB access
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
    },

    // ---- Menu admin (add / update / remove single items) ----
    async createMenuItem(item) {
      const rec = await pb.collection(ITEMS).create({
        extId: item.id,
        name: item.name,
        category: item.category,
        price: item.price,
        tags: item.tags || [],
        description: item.description,
        emoji: item.emoji,
        available: item.available !== false
      })
      return toMenuItem(rec)
    },

    async updateMenuItem(id, patch) {
      let rec = null
      try {
        rec = await pb.collection(ITEMS).getFirstListItem(`extId="${id}"`)
      } catch {
        return null
      }
      const data = {}
      for (const k of ['name', 'category', 'price', 'tags', 'description', 'emoji', 'available']) {
        if (patch[k] !== undefined) data[k] = patch[k]
      }
      const updated = await pb.collection(ITEMS).update(rec.id, data)
      return toMenuItem(updated)
    },

    async deleteMenuItem(id) {
      let rec = null
      try {
        rec = await pb.collection(ITEMS).getFirstListItem(`extId="${id}"`)
      } catch {
        return false
      }
      await pb.collection(ITEMS).delete(rec.id)
      return true
    },

    // ---- Customers (auth) ----
    async createUser(user) {
      const rec = await pb.collection(CUSTOMERS).create({
        name: user.name || '',
        email: String(user.email).toLowerCase(),
        passwordHash: user.passwordHash || '',
        provider: user.provider || 'password',
        googleId: user.googleId || '',
        pwPin: '',
        pwPinExpires: ''
      })
      return toUser(rec)
    },

    async getUserByEmail(email) {
      try {
        const rec = await pb
          .collection(CUSTOMERS)
          .getFirstListItem(`email="${String(email).toLowerCase().replace(/"/g, '')}"`)
        return toUser(rec)
      } catch {
        return null
      }
    },

    async getUserById(id) {
      try {
        const rec = await pb.collection(CUSTOMERS).getOne(id)
        return toUser(rec)
      } catch {
        return null
      }
    },

    async updateUser(id, patch) {
      const data = {}
      for (const k of ['name', 'email', 'passwordHash', 'provider', 'googleId', 'pwPin', 'pwPinExpires']) {
        if (patch[k] !== undefined) data[k] = patch[k]
      }
      const updated = await pb.collection(CUSTOMERS).update(id, data)
      return toUser(updated)
    }
  }
}
