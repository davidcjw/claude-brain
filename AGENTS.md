<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Claude's Brain

Local-only dashboard that visualizes which files Claude Code reads (global `~/.claude/` + a chosen project), green = present / red = missing.

UI concept: **"The Cortex"** — files fire into context in read order down a neural spine (framer-motion). Present = green pulse, missing = red dead synapse.

## Architecture
- `lib/catalog.ts` — **single source of truth**: every path Claude Code reads, tagged with `scope`, `category`, `tier`, `loadType` (`startup`/`on-demand`), `mechanism` and `importance`. `order` + `mechanism` are derived by `buildCatalog` (`mechanismFor`: on-demand→`invoke`, Config tiers→`harness`, else→`prompt`). `TIERS` defines the strata; `MECHANISMS` defines per-mechanism label/verb/accent/blurb. Add new tracked files here.
- `lib/scan.ts` — read-only filesystem inspector (`lstat`/`stat`/`readlink`); never writes.
- `app/api/scan/route.ts` — `GET /api/scan?project=<path>` (`~` expanded, validated). Node runtime.
- `app/api/projects/route.ts` — lists `~/code` subdirs for quick-pick chips.
- `app/components/cortex.tsx` — client viz. A `step` state sweeps `1..N` on a 300ms interval; each node derives `pending|firing|present|missing` from `order` vs `step`.
- `app/page.tsx` — header + **Cortex | Cache tab switcher**; renders `<Cortex>` or `<CacheLab>`. `scanKey` bump retriggers the sweep.
- `lib/cache-model.ts` — pure, faithful prompt-cache economics (`turnCost`, `CACHE` constants: 0.1× read, 1.25×/2× write, 5m/1h TTL, Opus 4.8 $5/1M). Tested in `lib/cache-model.test.ts`. Keep numbers accurate — it's a teaching tool.
- `app/components/cache-lab.tsx` — the **scenario-driven** Cache tab. `SCENARIOS` are scripted step timelines (send / wait / editSystem / changeTools / switchModel); pressing ▶ Play runs one via a `stepIdx`-driven effect (each step applies state + pushes a narrated `Ev`, then advances after its `dwell`). `simulate()` deterministically replays a scenario to build the `Timeline` (segments ∝ √duration, wait segments split green→red at the TTL boundary, an ink+amber playhead sweeps as it plays). Prefix bar, TTL clock, event log, and ledger all react live.
- `lib/file-access.ts` — **security boundary** for the file editor. `checkAccess(home, project, path)` permits a path only if it IS a tracked file or lives inside a tracked dir (resolved + traversal-checked). Tested in `lib/file-access.test.ts`. All read/write must go through this.
- `app/api/file/route.ts` — `GET ?path=&project=` reads a file (or lists a dir); `PUT {path,content,project}` writes to disk (creates if missing, `mkdir -p` parent). Both gated by `checkAccess`. 2 MB cap; binary files are read-only.
- `app/components/file-modal.tsx` — click-to-edit modal: view/edit/save, dir drill-in, create-missing nodes, **"+ New file in this folder"** (creates new files inside a tracked dir → resolves as `child` in checkAccess), symlink-write warning, ⌘S to save, Esc to close.
- `bin/claude-brain.mjs` — the global launcher (registered via the `bin` field). Builds once if `.next/BUILD_ID` is missing, starts `next start` on an auto-picked free port, opens the browser. Flags: `--rebuild`, `--no-open`, `--port <n>`. Installed with `npm link`.
- `next.config.ts` — pins `outputFileTracingRoot` to the project so the prod server (launched from any cwd) doesn't warn about unrelated lockfiles.

## Conventions
- **Writes are real but scoped.** The editor writes to disk, but ONLY through `checkAccess` — never widen that allowlist to accept arbitrary paths, and never add file *deletion*. Reads/writes outside `~/.claude` and the active project's tracked paths must stay impossible.
- This app is **not** for Vercel — it needs local filesystem access. Don't add deploy config.
- To track a new file type, add a `CatalogEntry` in `lib/catalog.ts`; scanner, cortex, and editor pick it up automatically.
- Animations must respect `prefers-reduced-motion` (cortex jumps to the final state) and never cause horizontal scroll — `<main>` uses `overflow-x-clip`; the layout grid uses `minmax(0,1fr)` tracks so long paths shrink.
