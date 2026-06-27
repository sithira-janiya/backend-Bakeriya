import { Router } from 'express'
import { getStore } from '../store/index.js'
import { requireAdmin } from '../auth.js'

export const menuRouter = Router()

// ---- helpers ----
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

// Menu name/description are bilingual { en, si }. Accept a string or object and
// normalise to that shape (falling back si -> en so nothing renders blank).
function toBilingual(v) {
  if (v && typeof v === 'object') return { en: v.en || '', si: v.si || v.en || '' }
  const s = String(v || '')
  return { en: s, si: s }
}

function normalizeItem(body = {}) {
  const name = toBilingual(body.name)
  if (!name.en) return null
  const id =
    body.id && String(body.id).trim()
      ? slugify(body.id)
      : `${slugify(name.en) || 'item'}-${Math.random().toString(36).slice(2, 6)}`
  return {
    id,
    name,
    category: String(body.category || 'Other'),
    price: Number(body.price) || 0,
    tags: Array.isArray(body.tags) ? body.tags : [],
    description: toBilingual(body.description),
    emoji: String(body.emoji || '🍞'),
    available: body.available !== false
  }
}

function pickPatch(body = {}) {
  const patch = {}
  if (body.name !== undefined) patch.name = toBilingual(body.name)
  if (body.category !== undefined) patch.category = String(body.category)
  if (body.price !== undefined) patch.price = Number(body.price) || 0
  if (body.tags !== undefined) patch.tags = Array.isArray(body.tags) ? body.tags : []
  if (body.description !== undefined) patch.description = toBilingual(body.description)
  if (body.emoji !== undefined) patch.emoji = String(body.emoji)
  if (body.available !== undefined) patch.available = !!body.available
  return patch
}

// GET /api/menu — public list of AVAILABLE bakery items
menuRouter.get('/', async (req, res, next) => {
  try {
    const items = await getStore().listMenu()
    res.json({ items: items.filter((i) => i.available !== false) })
  } catch (err) {
    next(err)
  }
})

// GET /api/menu/admin — full list incl. hidden items (admin only)
menuRouter.get('/admin', requireAdmin, async (req, res, next) => {
  try {
    const items = await getStore().listMenu()
    res.json({ items })
  } catch (err) {
    next(err)
  }
})

// POST /api/menu — create an item (admin only)
menuRouter.post('/', requireAdmin, async (req, res, next) => {
  try {
    const item = normalizeItem(req.body)
    if (!item) return res.status(400).json({ error: 'Item name is required' })
    const created = await getStore().createMenuItem(item)
    res.status(201).json({ item: created })
  } catch (err) {
    next(err)
  }
})

// PATCH /api/menu/:id — update an item, incl. availability (admin only)
menuRouter.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const updated = await getStore().updateMenuItem(req.params.id, pickPatch(req.body))
    if (!updated) return res.status(404).json({ error: 'Item not found' })
    res.json({ item: updated })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/menu/:id — remove an item (admin only)
menuRouter.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const ok = await getStore().deleteMenuItem(req.params.id)
    if (!ok) return res.status(404).json({ error: 'Item not found' })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})
