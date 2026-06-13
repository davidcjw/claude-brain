import path from "path";
import { buildCatalog } from "./catalog";

// Security boundary for the read/write file API. A requested path is only
// permitted if it IS a tracked config file, or lives somewhere inside a
// tracked config directory. Everything is resolved and traversal-checked so a
// crafted `../../etc/passwd` can never escape the allowlist.

export type AccessKind = "file" | "dir" | "child";
export type Access =
  | { allowed: true; kind: AccessKind }
  | { allowed: false; reason: string };

function isInside(dir: string, target: string): boolean {
  const rel = path.relative(dir, target);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

export function checkAccess(
  home: string,
  project: string | null,
  requested: string
): Access {
  if (!requested || typeof requested !== "string") {
    return { allowed: false, reason: "No path provided." };
  }
  const target = path.resolve(requested);
  const catalog = buildCatalog(home, project);

  // Exact match against a tracked file path.
  for (const e of catalog) {
    if (e.type === "file" && path.resolve(e.path) === target) {
      return { allowed: true, kind: "file" };
    }
  }
  // The directory entry itself.
  for (const e of catalog) {
    if (e.type === "dir" && path.resolve(e.path) === target) {
      return { allowed: true, kind: "dir" };
    }
  }
  // A file living inside a tracked directory.
  for (const e of catalog) {
    if (e.type === "dir" && isInside(path.resolve(e.path), target)) {
      return { allowed: true, kind: "child" };
    }
  }
  return {
    allowed: false,
    reason: "Path is outside Claude's tracked config files.",
  };
}
