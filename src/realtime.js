// WebSocket broadcast hub for live order updates.
//
// The frontend opens a WebSocket to /ws. Whenever an order is created or its
// status changes, the API calls broadcast(...) and connected clients receive
// the event — giving the Chef Panel and customer Track pages a live feed.
//
// Privacy: order payloads contain customer PII. Only authenticated admin
// sockets receive the full order. A non-admin client receives a lightweight
// { code, status } event — and ONLY for order codes it has explicitly
// subscribed to. Codes are unguessable secrets, so a client only learns about
// orders it already holds; it never sees other customers' codes or statuses.
//
// A client authenticates by sending { type: 'auth', token } after connecting,
// and subscribes to its own orders with { type: 'track', codes: [...] }.

import { WebSocketServer } from 'ws'
import { verifyToken } from './auth.js'

let wss = null

export function attachWebSocket(httpServer) {
  wss = new WebSocketServer({ server: httpServer, path: '/ws' })

  wss.on('connection', (socket) => {
    socket.isAlive = true
    socket.isAdmin = false
    // Order codes this (non-admin) client has asked to follow.
    socket.trackedCodes = new Set()

    socket.on('pong', () => { socket.isAlive = true })

    socket.on('message', (raw) => {
      let msg
      try { msg = JSON.parse(raw.toString()) } catch { return }
      if (msg?.type === 'auth' && typeof msg.token === 'string') {
        socket.isAdmin = !!verifyToken(msg.token)
        socket.send(JSON.stringify({ type: 'auth:result', ok: socket.isAdmin }))
      } else if (msg?.type === 'track' && Array.isArray(msg.codes)) {
        // Subscribe to status updates for codes the client already holds. We
        // never volunteer codes, so this can't reveal another customer's order.
        for (const code of msg.codes) {
          if (typeof code === 'string' && code) socket.trackedCodes.add(code)
        }
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
    if (socket.isAdmin) {
      socket.send(fullMessage) // chef panel: full order incl. PII
    } else if (socket.trackedCodes?.has(order.id)) {
      socket.send(liteMessage) // customer following this specific order
    }
    // otherwise: send nothing — non-admins don't hear about orders they don't hold
  }
}

export function clientCount() {
  return wss ? wss.clients.size : 0
}
