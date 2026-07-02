// Store factory.
//
// Chooses the data backend:
//   - DATA_STORE=memory           -> always in-memory (tests / quick local runs)
//   - DATA_STORE=pocketbase-strict -> PocketBase only; hard-fail if unreachable
//                                    (use in production so a DB outage is loud)
//   - otherwise (default)          -> try PocketBase, and if it is unreachable
//                                    fall back to the in-memory store so the API
//                                    still boots for local development.

import { createPocketbaseStore } from "./pocketbaseStore.js";
import { createMemoryStore } from "./memoryStore.js";

let active = null;

export function getStore() {
  if (!active)
    throw new Error("Store not initialised — call initStore() first");
  return active;
}

async function useMemory(reason) {
  active = createMemoryStore();
  await active.init();
  if (reason) console.warn(`[store] ${reason}`);
  console.log("[store] using in-memory store (data is NOT persisted)");
  return active;
}

export async function initStore() {
  const mode = (process.env.DATA_STORE || "pocketbase").toLowerCase();

  if (mode === "memory") {
    return useMemory();
  }

  try {
    const pb = createPocketbaseStore();
    await pb.init();
    active = pb;
    console.log("[store] connected to PocketBase");
    return active;
  } catch (err) {
    const msg = err?.originalError?.cause?.code || err?.message || err;
    if (mode === "pocketbase-strict") {
      // Production mode: a DB failure must not be silently masked.
      throw new Error(`PocketBase unavailable (${msg}) and DATA_STORE=pocketbase-strict`);
    }
    // Dev convenience: keep the API alive on the in-memory store.
    return useMemory(
      `PocketBase unreachable (${msg}); falling back to in-memory store. ` +
        `Start PocketBase (npm run pb) for persistence, or set DATA_STORE=pocketbase-strict to require it.`
    );
  }
}
