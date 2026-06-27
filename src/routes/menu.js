import { Router } from 'express'
import { getStore } from '../store/index.js'

export const menuRouter = Router()

// GET /api/menu — public list of bakery items
menuRouter.get('/', async (req, res, next) => {
  try {
    const items = await getStore().listMenu()
    res.json({ items })
  } catch (err) {
    next(err)
  }
})
