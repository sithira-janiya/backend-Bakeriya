import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const isWindows = process.platform === "win32";
const candidates = isWindows
  ? ["pocketbase.exe", "pocketbase"]
  : ["pocketbase", "pocketbase.exe"];

function findPocketBaseBinary() {
  for (const candidate of candidates) {
    const absolute = path.join(repoRoot, candidate);
    if (fs.existsSync(absolute)) return absolute;
  }
  return candidates[0];
}

const binary = findPocketBaseBinary();
const args = process.argv.slice(2);
if (args.length === 0) {
  args.push("serve", "--http=127.0.0.1:8090");
}

const child = spawn(binary, args, {
  cwd: repoRoot,
  stdio: "inherit",
  shell: isWindows && !binary.endsWith(".exe"),
});

child.on("error", (err) => {
  console.error(`Failed to start PocketBase from ${binary}:`, err.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
