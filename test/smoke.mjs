// Self-contained end-to-end smoke test for the Bakerya backend.
import { spawn } from 'child_process'
import { WebSocket } from 'ws'

const PORT = 4555
const BASE = `http://127.0.0.1:${PORT}`
let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok  ${name}`) }
  else { fail++; console.log(`  XX  ${name} ${extra}`) }
}

const child = spawn('node', ['src/server.js'], {
  env: { ...process.env, DATA_STORE: 'memory', PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe']
})
child.stdout.on('data', () => {})
child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`))

async function waitForHealth(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return r.json() } catch {}
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error('server did not become healthy')
}

async function main() {
  const health = await waitForHealth()
  check('health ok + memory store', health.ok && health.store === 'memory')

  const menu = await (await fetch(`${BASE}/api/menu`)).json()
  check('menu returns 14 items', menu.items?.length === 14)
  check('menu item shape', menu.items?.[0]?.name?.en && typeof menu.items[0].price === 'number')

  const bad = await fetch(`${BASE}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '0000' }) })
  check('wrong PIN -> 401', bad.status === 401)
  const good = await fetch(`${BASE}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '1234' }) })
  const { token } = await good.json()
  check('correct PIN -> token', typeof token === 'string' && token.length > 20)

  const adminEvents = [], anonEvents = []
  const wsAdmin = new WebSocket(`ws://127.0.0.1:${PORT}/ws`)
  const wsAnon = new WebSocket(`ws://127.0.0.1:${PORT}/ws`)
  await Promise.all([
    new Promise((res, rej) => { wsAdmin.on('open', res); wsAdmin.on('error', rej) }),
    new Promise((res, rej) => { wsAnon.on('open', res); wsAnon.on('error', rej) })
  ])
  wsAdmin.on('message', (m) => adminEvents.push(JSON.parse(m.toString())))
  wsAnon.on('message', (m) => anonEvents.push(JSON.parse(m.toString())))
  wsAdmin.send(JSON.stringify({ type: 'auth', token }))
  await new Promise((r) => setTimeout(r, 200))
  check('admin WS auth acknowledged', adminEvents.some((e) => e.type === 'auth:result' && e.ok))

  const placed = await fetch(`${BASE}/api/orders`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer: { name: 'Jane', address: '1 Baker St', email: 'jane@example.com', phone: '+15551234567' }, items: [{ id: 'brd-1', name: { en: 'Sourdough Loaf' }, price: 6.5, qty: 2 }] })
  })
  const { order } = await placed.json()
  check('place order -> 201', placed.status === 201)
  check('order total computed (13.0)', order.total === 13)
  check('order has ORD code + pending', /^ORD-/.test(order.id) && order.status === 'pending')

  const invalid = await fetch(`${BASE}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer: { name: '', address: '', email: 'bad', phone: '' }, items: [] }) })
  check('invalid order -> 400', invalid.status === 400)

  const fetched = await (await fetch(`${BASE}/api/orders/${order.id}`)).json()
  check('get order by code', fetched.order?.id === order.id)
  const missing = await fetch(`${BASE}/api/orders/ORD-NOPE`)
  check('unknown code -> 404', missing.status === 404)

  const byEmail = await (await fetch(`${BASE}/api/orders?email=jane@example.com`)).json()
  check('lookup by email finds order', byEmail.orders?.length === 1)

  const noTok = await fetch(`${BASE}/api/orders/${order.id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cooking' }) })
  check('status change without token -> 401', noTok.status === 401)

  const badStatus = await fetch(`${BASE}/api/orders/${order.id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status: 'exploded' }) })
  check('invalid status -> 400', badStatus.status === 400)

  const patched = await fetch(`${BASE}/api/orders/${order.id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status: 'cooking' }) })
  const patchedBody = await patched.json()
  check('status -> cooking', patchedBody.order?.status === 'cooking')
  check('status history grew to 2', patchedBody.order?.statusHistory?.length === 2)

  const all = await (await fetch(`${BASE}/api/orders`, { headers: { Authorization: `Bearer ${token}` } })).json()
  check('admin list returns orders', all.orders?.length === 1)
  const allNoTok = await fetch(`${BASE}/api/orders`)
  check('admin list without token -> 401', allNoTok.status === 401)

  await new Promise((r) => setTimeout(r, 300))
  check('admin WS got full order:created (with PII)', adminEvents.some((e) => e.type === 'order:created' && e.order?.customer?.email === 'jane@example.com'))
  check('admin WS got full order:updated -> cooking', adminEvents.some((e) => e.type === 'order:updated' && e.order?.status === 'cooking'))
  check('anon WS got lite order:updated (code+status, no PII)', anonEvents.some((e) => e.type === 'order:updated' && e.code === order.id && e.status === 'cooking' && !e.order))
  check('anon WS leaks NO customer data', anonEvents.every((e) => !e.order && !e.customer))
  wsAdmin.close(); wsAnon.close()
  console.log(`\n${pass} passed, ${fail} failed`)
}

main().then(() => { child.kill(); process.exit(fail === 0 ? 0 : 1) }).catch((err) => { console.error('SMOKE ERROR:', err); child.kill(); process.exit(1) })
