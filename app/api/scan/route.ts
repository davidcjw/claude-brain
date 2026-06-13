import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { scan } from "@/lib/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("project");
  let project: string | null = null;

  if (raw && raw.trim()) {
    project = path.resolve(expandHome(raw.trim()));
    // Validate it's a real directory so the UI can flag bad input.
    try {
      const stat = await fs.stat(project);
      if (!stat.isDirectory()) {
        return NextResponse.json(
          { error: `Not a directory: ${project}` },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: `Project path not found: ${project}` },
        { status: 400 }
      );
    }
  }

  const payload = await scan(project);
  return NextResponse.json(payload);
}
