// Full-stack end-to-end test (run from the backend root: `npm run e2e`).
//
// Boots the server with the in-memory store and simulates the frontend's exact
// API + WebSocket usage end to end:
//   customer loads menu -> places order -> tracks it
//   chef logs in (PIN->JWT) -> authenticates WS -> sees queue -> advances status
//   customer's WS receives live status updates with NO personal data
//   chef's WS receives the full order (with PII)
import { spawn } from 'child_process'
import { WebSocket } from 'ws'

const PORT = 4777
const BASE = `http://127.0.0.1:${PORT}`
let pass = 0
let fail = 0
const ok = (n, c) => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  XX  ' + n)) }

const child = spawn('node', ['src/server.js'], {
  env: { ...process.env, DATA_STORE: 'memory', PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe']
})
child.stderr.on('data', (d) => process.stderr.write('[be] ' + d))

async function up() {
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) return } catch {}
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error('server did not start')
}

async function main() {
  await up()

  // Customer (anonymous WS)
  const custEvents = []
  const custWs = new WebSocket(`ws://127.0.0.1:${PORT}/ws`)
  await new Promise((r) => custWs.on('open', r))
  custWs.on('message', (m) => custEvents.push(JSON.parse(m.toString())))

  const menu = (await (await fetch(`${BASE}/api/menu`)).json()).items
  ok('customer loads menu', menu.length === 14)

  const cart = [{ id: menu[0].id, name: menu[0].name, price: menu[0].price, qty: 3 }]
  const placeRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer: { name: 'Sam', address: '9 Oak', email: 'sam@x.com', phone: '+1999888777' }, items: cart })
  })
  const { order } = await placeRes.json()
  ok('customer places order (201)', placeRes.status === 201)
  ok('server computed total', order.total === menu[0].price * 3)

  const tracked = (await (await fetch(`${BASE}/api/orders/${order.id}`)).json()).order
  ok('customer tracks order by code', tracked.id === order.id && tracked.status === 'pending')

  // Chef
  const { token } = await (await fetch(`${BASE}/api/admin/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '1234' })
  })).json()
  ok('chef logs in', !!token)

  const chefEvents = []
  const chefWs = new WebSocket(`ws://127.0.0.1:${PORT}/ws`)
  await new Promise((r) => chefWs.on('open', r))
  chefWs.on('message', (m) => chefEvents.push(JSON.parse(m.toString())))
  chefWs.send(JSON.stringify({ type: 'auth', token }))
  await new Promise((r) => setTimeout(r, 150))

  const list = (await (await fetch(`${BASE}/api/orders`, { headers: { Authorization: `Bearer ${token}` } })).json()).orders
  ok('chef sees order in queue', list.some((o) => o.id === order.id))

  for (const status of ['cooking', 'ready']) {
    await fetch(`${BASE}/api/orders/${order.id}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status })
    })
  }
  await new Promise((r) => setTimeout(r, 300))

  ok('chef WS received full order w/ customer PII',
    chefEvents.some((e) => e.type === 'order:updated' && e.order?.customer?.email === 'sam@x.com'))
  const custLive = custEvents.filter((e) => e.type === 'order:updated' && e.code === order.id)
  ok('customer WS received live status updates',
    custLive.some((e) => e.status === 'cooking') && custLive.some((e) => e.status === 'ready'))
  ok('customer WS got NO PII over the wire', custEvents.every((e) => !e.order && !e.customer))
  ok('customer sees final status = ready (live, no refetch)', custLive[custLive.length - 1]?.status === 'ready')

  custWs.close()
  chefWs.close()
  console.log(`\n${pass} passed, ${fail} failed`)
}

main().then(() => { child.kill(); process.exit(fail === 0 ? 0 : 1) }).catch((e) => { console.error('E2E ERROR', e); child.kill(); process.exit(1) })
