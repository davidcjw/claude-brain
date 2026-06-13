import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lists immediate subdirectories of ~/code to populate the project picker.
export async function GET() {
  const codeDir = path.join(os.homedir(), "code");
  try {
    const entries = await fs.readdir(codeDir, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => ({ name: e.name, path: path.join(codeDir, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ root: codeDir, projects: dirs });
  } catch {
    return NextResponse.json({ root: codeDir, projects: [] });
  }
}
