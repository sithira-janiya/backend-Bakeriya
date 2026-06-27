// Step 1 — ensure a verified Linux PocketBase binary exists.
//
// Downloads a PINNED PocketBase release from the official GitHub releases over
// HTTPS, verifies its SHA256 against the value published in that release's
// checksums.txt, and extracts the `pocketbase` binary to the repo root.
//
// Security properties:
//   - Version is pinned (reproducible, auditable) — bump PB_VERSION + PB_SHA256
//     together when upgrading.
//   - The download is rejected unless its SHA256 matches PB_SHA256 exactly, so a
//     tampered or corrupted file never gets executed.
//
// Usage:  node scripts/ensure-pocketbase.mjs
// Exits 0 if the binary is present & verified, non-zero otherwise.

import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

// --- Pinned release (verified against official checksums.txt) ---------------
const PB_VERSION = "0.39.4";
const PB_SHA256 =
  "06a3ec70205b3eaf8343e226ab74c132013f7b1e9102e898dbca034bdd622d62";
const PB_ASSET = `pocketbase_${PB_VERSION}_linux_amd64.zip`;
const PB_URL = `https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/${PB_ASSET}`;

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const binaryPath = path.join(repoRoot, "pocketbase");

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function downloadVerified() {
  console.log(`[pb] downloading ${PB_ASSET} from official releases…`);
  const res = await fetch(PB_URL, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`download failed: HTTP ${res.status} for ${PB_URL}`);
  }
  const zipBuf = Buffer.from(await res.arrayBuffer());

  const actual = sha256(zipBuf);
  if (actual !== PB_SHA256) {
    throw new Error(
      `SHA256 mismatch — refusing to use binary.\n` +
        `  expected ${PB_SHA256}\n  actual   ${actual}`,
    );
  }
  console.log(`[pb] checksum OK (${actual})`);

  // Write zip to a temp file, then extract only the `pocketbase` entry.
  const tmpZip = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "pb-")),
    PB_ASSET,
  );
  fs.writeFileSync(tmpZip, zipBuf);

  try {
    // -o overwrite, -j junk paths, extract just the binary into repoRoot.
    execFileSync("unzip", ["-o", "-j", tmpZip, "pocketbase", "-d", repoRoot], {
      stdio: "inherit",
    });
  } catch (err) {
    throw new Error(
      `could not unzip PocketBase — is 'unzip' installed on the host? (${err.message})`,
    );
  } finally {
    fs.rmSync(path.dirname(tmpZip), { recursive: true, force: true });
  }

  fs.chmodSync(binaryPath, 0o755);
  console.log(`[pb] ready at ${binaryPath}`);
}

async function main() {
  if (fs.existsSync(binaryPath) && fs.statSync(binaryPath).size > 0) {
    console.log(`[pb] binary already present at ${binaryPath} — skipping`);
    return;
  }
  await downloadVerified();
}

main().catch((err) => {
  console.error(`[pb] FATAL: ${err.message}`);
  process.exit(1);
});
