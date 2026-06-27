// WebSocket broadcast hub for live order updates.
//
// The frontend opens a WebSocket to /ws. Whenever an order is created or its
// status changes, the API calls broadcast(...) and connected clients receive
// the event — giving the Chef Panel and customer Track pages a live feed.
//
// Privacy: order payloads contain customer PII. Only authenticated admin
// sockets receive the full order. Anonymous clients (customer Track page)
// receive a lightweight { code, status } event with no personal data.
//
// A client authenticates by sending { type: 'auth', token } after connecting.

import { WebSocketServer } from 'ws'
import { verifyToken } from './auth.js'

let wss = null

export function attachWebSocket(httpServer) {
  wss = new WebSocketServer({ server: httpServer, path: '/ws' })

  wss.on('connection', (socket) => {
    socket.isAlive = true
    socket.isAdmin = false

    socket.on('pong', () => { socket.isAlive = true })

    socket.on('message', (raw) => {
      let msg
      try { msg = JSON.parse(raw.toString()) } catch { return }
      if (msg?.type === 'auth' && typeof msg.token === 'string') {
        socket.isAdmin = !!verifyToken(msg.token)
        socket.send(JSON.stringify({ type: 'auth:result', ok: socket.isAdmin }))
      }
    })

    socket.send(JSON.stringify({ type: 'connected', at: new Date().toISOString() }))
  })

  const interval = setInterval(() => {
    if (!wss) return
    for (const socket of wss.clients) {
      if (socket.isAlive === false) { socket.terminate(); continue }
      socket.isAlive = false
      try { socket.ping() } catch {}
    }
  }, 30000)

  wss.on('close', () => clearInterval(interval))
  return wss
}

// type is 'order:created' | 'order:updated'; payload.order is the full order.
export function broadcast(type, payload) {
  if (!wss) return
  const order = payload.order || {}
  const fullMessage = JSON.stringify({ type, order })
  const liteMessage = JSON.stringify({ type, code: order.id, status: order.status })
  for (const socket of wss.clients) {
    if (socket.readyState !== socket.OPEN) continue
    socket.send(socket.isAdmin ? fullMessage : liteMessage)
  }
}

export function clientCount() {
  return wss ? wss.clients.size : 0
}
