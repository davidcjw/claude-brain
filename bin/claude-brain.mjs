#!/usr/bin/env node
// Zero-fuss launcher for Claude's Brain.
// Builds the app once (if needed), starts the production server on a free
// port, and opens it in your browser. Re-run any time — subsequent launches
// skip the build and start instantly.
//
// Flags / env:
//   --rebuild            force a fresh production build
//   --no-open            don't auto-open the browser (just print the URL)
//   --port <n>           use a specific port instead of an auto-picked one
//   CLAUDE_BRAIN_NO_OPEN=1   same as --no-open

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { platform } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const flagVal = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};

const noOpen = has("--no-open") || process.env.CLAUDE_BRAIN_NO_OPEN === "1";
const forceRebuild = has("--rebuild");

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  violet: (s) => `\x1b[35m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: "inherit", ...opts });
    p.on("error", reject);
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))
    );
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function openBrowser(url) {
  const cmd =
    platform() === "darwin" ? "open" : platform() === "win32" ? "cmd" : "xdg-open";
  const args = platform() === "win32" ? ["/c", "start", "", url] : [url];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
}

async function main() {
  console.log("\n" + c.violet(c.bold("🧠 Claude's Brain")));

  const built = existsSync(join(ROOT, ".next", "BUILD_ID"));
  if (!built || forceRebuild) {
    console.log(c.dim(forceRebuild ? "  Rebuilding…" : "  First run — building (one-time)…\n"));
    await run("npx", ["next", "build"]);
  }

  const port = Number(flagVal("--port")) || (await freePort());
  const url = `http://localhost:${port}`;

  const server = spawn("npx", ["next", "start", "-p", String(port)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "inherit"],
  });

  let opened = false;
  server.stdout.on("data", (buf) => {
    const line = buf.toString();
    if (!opened && /Ready|started server|Local:/i.test(line)) {
      opened = true;
      console.log("\n  " + c.green("●") + "  " + c.bold(url));
      console.log(c.dim("     scans & edits your local ~/.claude + project config"));
      console.log(c.dim("     Ctrl-C to stop\n"));
      if (!noOpen) openBrowser(url);
    }
  });

  const shutdown = () => {
    server.kill("SIGTERM");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  server.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error("\n  Failed to launch:", err.message, "\n");
  process.exit(1);
});
