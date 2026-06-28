// Step 2 — production launcher: boot PocketBase + the Node API together.
//
// Order of operations:
//   1. Fail-fast secret validation (abort if any secret is missing, default, or weak).
//   2. Ensure the verified Linux PocketBase binary exists (delegates to Step 1).
//   3. Upsert the PocketBase superuser from env (idempotent, runs every boot).
//   4. Start PocketBase on 127.0.0.1:8090 — INTERNAL ONLY, never exposed publicly.
//   5. Wait for PocketBase health, then start the Node API on Render's $PORT.
//
// Process model: this script is PID 1 for the service. If either child dies the
// other is killed and we exit with its code so Render restarts the instance.
// SIGTERM/SIGINT are forwarded for graceful shutdown.
//
// Usage:  node scripts/start-render.mjs

import path from "path";
import { spawn, execFileSync } from "child_process";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const binaryPath = path.join(repoRoot, "pocketbase");
const ensureScript = path.join(repoRoot, "scripts", "ensure-pocketbase.mjs");

const PB_PORT = process.env.PB_PORT || "8090";
const PB_URL = `http://127.0.0.1:${PB_PORT}`;
const PB_DATA_DIR = process.env.PB_DATA_DIR || path.join(repoRoot, "pb_data");

// --- 1. Fail-fast secret validation ----------------------------------------
// These defaults mirror src/config.js and must NEVER reach production.
const INSECURE_DEFAULTS = {
  JWT_SECRET: "dev-insecure-secret-change-me",
  ADMIN_PASSWORD: "SamanthiM@075",
  POCKETBASE_ADMIN_EMAIL: "admin@bakerya.local",
  POCKETBASE_ADMIN_PASSWORD: "changeme-strong-password",
};

function validateSecrets() {
  const e = process.env;
  const errors = [];

  if (!e.JWT_SECRET) errors.push("JWT_SECRET is not set");
  else if (e.JWT_SECRET === INSECURE_DEFAULTS.JWT_SECRET)
    errors.push("JWT_SECRET is still the insecure dev default");
  else if (e.JWT_SECRET.length < 32)
    errors.push("JWT_SECRET must be at least 32 characters");

  // Admin signs in with ADMIN_USERNAME + ADMIN_PASSWORD (PIN auth was removed).
  // The username isn't a secret (defaults to 'admin'); the password is.
  if (!e.ADMIN_PASSWORD) errors.push("ADMIN_PASSWORD is not set");
  else if (e.ADMIN_PASSWORD === INSECURE_DEFAULTS.ADMIN_PASSWORD)
    errors.push("ADMIN_PASSWORD is still the insecure default baked into config.js");
  else if (e.ADMIN_PASSWORD.length < 10)
    errors.push("ADMIN_PASSWORD must be at least 10 characters");

  if (!e.POCKETBASE_ADMIN_EMAIL) errors.push("POCKETBASE_ADMIN_EMAIL is not set");
  else if (e.POCKETBASE_ADMIN_EMAIL === INSECURE_DEFAULTS.POCKETBASE_ADMIN_EMAIL)
    errors.push("POCKETBASE_ADMIN_EMAIL is still the default placeholder");
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.POCKETBASE_ADMIN_EMAIL))
    errors.push("POCKETBASE_ADMIN_EMAIL is not a valid email address");

  if (!e.POCKETBASE_ADMIN_PASSWORD)
    errors.push("POCKETBASE_ADMIN_PASSWORD is not set");
  else if (e.POCKETBASE_ADMIN_PASSWORD === INSECURE_DEFAULTS.POCKETBASE_ADMIN_PASSWORD)
    errors.push("POCKETBASE_ADMIN_PASSWORD is still the insecure dev default");
  else if (e.POCKETBASE_ADMIN_PASSWORD.length < 10)
    errors.push("POCKETBASE_ADMIN_PASSWORD must be at least 10 characters");

  if (errors.length) {
    console.error(
      "[boot] FATAL — refusing to start with insecure configuration:",
    );
    for (const msg of errors) console.error(`  - ${msg}`);
    console.error(
      "[boot] Set these as environment variables in the Render dashboard and redeploy.",
    );
    process.exit(1);
  }
  console.log("[boot] secret validation passed");
}

// --- 4/5. Process orchestration ---------------------------------------------
let pb = null;
let api = null;
let shuttingDown = false;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of [pb, api]) {
    if (child && !child.killed) {
      try {
        child.kill("SIGTERM");
      } catch {}
    }
  }
  process.exit(code);
}

async function waitForPocketBase(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${PB_URL}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("PocketBase did not become healthy in time");
}

async function main() {
  validateSecrets();

  // 2. Ensure the verified binary exists (Step 1). Throws on failure.
  console.log("[boot] ensuring PocketBase binary…");
  execFileSync("node", [ensureScript], { stdio: "inherit" });

  // 3. Upsert the superuser (idempotent) before serving.
  console.log("[boot] upserting PocketBase superuser…");
  execFileSync(
    binaryPath,
    [
      "superuser",
      "upsert",
      process.env.POCKETBASE_ADMIN_EMAIL,
      process.env.POCKETBASE_ADMIN_PASSWORD,
      "--dir",
      PB_DATA_DIR,
    ],
    { stdio: "inherit" },
  );

  // 4. Start PocketBase — bound to loopback only, not publicly reachable.
  console.log(`[boot] starting PocketBase on ${PB_URL} (internal only)…`);
  pb = spawn(
    binaryPath,
    ["serve", `--http=127.0.0.1:${PB_PORT}`, "--dir", PB_DATA_DIR],
    { stdio: "inherit" },
  );
  pb.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`[boot] PocketBase exited (${code}) — shutting down`);
      shutdown(code ?? 1);
    }
  });

  await waitForPocketBase();
  console.log("[boot] PocketBase healthy");

  // 5. Start the Node API on Render's $PORT, pointed at the internal PocketBase.
  console.log("[boot] starting Node API…");
  api = spawn("node", ["src/server.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DATA_STORE: "pocketbase",
      POCKETBASE_URL: PB_URL,
    },
    stdio: "inherit",
  });
  api.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`[boot] Node API exited (${code}) — shutting down`);
      shutdown(code ?? 1);
    }
  });
}

process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));

main().catch((err) => {
  console.error(`[boot] FATAL: ${err.message}`);
  shutdown(1);
});
