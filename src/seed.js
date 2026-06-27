// Standalone seeding script: `npm run seed`.
// Connects to the configured store and upserts the menu items, then exits.

import { initStore } from './store/index.js'

async function run() {
  const store = await initStore()
  const n = await store.seedMenu()
  console.log(`Seeded ${n} menu items into the "${store.name}" store.`)
  process.exit(0)
}

run().catch((err) => {
  console.error('Seeding failed:', err)
  process.exit(1)
})
