// Store factory.
//
// Chooses the data backend:
//   - DATA_STORE=memory      -> always in-memory (tests / quick local runs)
//   - otherwise              -> PocketBase, which is the persistent source of
//                               truth for menu and order data.

import { createPocketbaseStore } from "./pocketbaseStore.js";
import { createMemoryStore } from "./memoryStore.js";

let active = null;

export function getStore() {
  if (!active)
    throw new Error("Store not initialised — call initStore() first");
  return active;
}

export async function initStore() {
  const mode = (process.env.DATA_STORE || "pocketbase").toLowerCase();

  if (mode === "memory") {
    active = createMemoryStore();
    await active.init();
    console.log("[store] using in-memory store (DATA_STORE=memory)");
    return active;
  }

  const pb = createPocketbaseStore();
  await pb.init();
  active = pb;
  console.log("[store] connected to PocketBase");
  return active;
}
