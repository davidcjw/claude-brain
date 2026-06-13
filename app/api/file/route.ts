import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { checkAccess } from "@/lib/file-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB editor cap

function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveProject(raw: string | null): string | null {
  if (!raw || !raw.trim()) return null;
  return path.resolve(expandHome(raw.trim()));
}

// ── Read a file (or list a directory) ──
export async function GET(req: NextRequest) {
  const home = os.homedir();
  const rawPath = req.nextUrl.searchParams.get("path");
  const project = resolveProject(req.nextUrl.searchParams.get("project"));
  if (!rawPath) return NextResponse.json({ error: "Missing path" }, { status: 400 });

  const target = path.resolve(expandHome(rawPath));
  const access = checkAccess(home, project, target);
  if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: 403 });

  let lstat;
  try {
    lstat = await fs.lstat(target);
  } catch {
    // Doesn't exist yet — allow creating it through the editor.
    return NextResponse.json({
      path: target,
      type: "file",
      exists: false,
      content: "",
      isSymlink: false,
      symlinkTarget: null,
    });
  }

  const isSymlink = lstat.isSymbolicLink();
  const symlinkTarget = isSymlink ? await fs.readlink(target).catch(() => null) : null;

  let stat;
  try {
    stat = await fs.stat(target);
  } catch {
    return NextResponse.json({ path: target, type: "file", exists: false, content: "", isSymlink, symlinkTarget });
  }

  if (stat.isDirectory()) {
    const dirents = await fs.readdir(target, { withFileTypes: true });
    const entries = await Promise.all(
      dirents
        .filter((d) => !d.name.startsWith("."))
        .map(async (d) => {
          const child = path.join(target, d.name);
          let size: number | null = null;
          try {
            const s = await fs.stat(child);
            size = s.isFile() ? s.size : null;
          } catch {}
          return { name: d.name, path: child, isDir: d.isDirectory(), size };
        })
    );
    entries.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
    return NextResponse.json({ path: target, type: "dir", exists: true, entries });
  }

  if (stat.size > MAX_BYTES) {
    return NextResponse.json({ path: target, type: "file", exists: true, tooLarge: true, size: stat.size, isSymlink, symlinkTarget });
  }

  const buf = await fs.readFile(target);
  const binary = buf.includes(0);
  return NextResponse.json({
    path: target,
    type: "file",
    exists: true,
    binary,
    content: binary ? "" : buf.toString("utf8"),
    size: stat.size,
    isSymlink,
    symlinkTarget,
  });
}

// ── Write a file (real disk write; creates if missing) ──
export async function PUT(req: NextRequest) {
  const home = os.homedir();
  let body: { path?: string; content?: string; project?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.path !== "string" || typeof body.content !== "string") {
    return NextResponse.json({ error: "path and content are required" }, { status: 400 });
  }

  const project = resolveProject(body.project ?? null);
  const target = path.resolve(expandHome(body.path));
  const access = checkAccess(home, project, target);
  if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: 403 });
  if (access.kind === "dir") {
    return NextResponse.json({ error: "Cannot write to a directory" }, { status: 400 });
  }
  if (Buffer.byteLength(body.content, "utf8") > MAX_BYTES) {
    return NextResponse.json({ error: "Content exceeds 2 MB limit" }, { status: 413 });
  }

  // Don't clobber a directory or follow into one.
  try {
    const st = await fs.lstat(target);
    if (st.isDirectory()) {
      return NextResponse.json({ error: "Target is a directory" }, { status: 400 });
    }
  } catch {
    // missing — we'll create it
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, body.content, "utf8");
  const stat = await fs.stat(target);
  return NextResponse.json({ ok: true, path: target, size: stat.size });
}
