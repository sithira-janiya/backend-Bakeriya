import http from 'http'
import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import { initStore, getStore } from './store/index.js'
import { attachWebSocket, clientCount } from './realtime.js'
import { menuRouter } from './routes/menu.js'
import { ordersRouter } from './routes/orders.js'
import { authRouter } from './routes/auth.js'

async function main() {
  const store = await initStore()

  // Seed the menu on boot (idempotent upsert).
  if (config.seedOnBoot) {
    try {
      const n = await store.seedMenu()
      console.log(`[seed] menu ready (${n} items)`)
    } catch (err) {
      console.warn('[seed] could not seed menu:', err?.message || err)
    }
  }

  const app = express()
  app.use(
    cors({
      origin(origin, cb) {
        // allow non-browser tools (no origin), any configured origin, and any
        // localhost/127.0.0.1 port (dev: Vite may pick 5173, 5174, …)
        const isLocalhost = origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
        if (!origin || isLocalhost || config.corsOrigins.includes(origin)) return cb(null, true)
        return cb(new Error(`Origin ${origin} not allowed by CORS`))
      }
    })
  )
  app.use(express.json())

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, store: getStore().name, wsClients: clientCount() })
  })

  app.use('/api/menu', menuRouter)
  app.use('/api/orders', ordersRouter)
  app.use('/api/auth', authRouter)

  // 404 for unknown API routes
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }))

  // Central error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[error]', err?.message || err)
    res.status(err.status || 500).json({ error: err?.message || 'Internal server error' })
  })

  const server = http.createServer(app)
  attachWebSocket(server)

  server.listen(config.port, () => {
    console.log(`[server] Bakerya backend on http://localhost:${config.port}`)
    console.log(`[server] WebSocket on ws://localhost:${config.port}/ws`)
  })
}

main().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
