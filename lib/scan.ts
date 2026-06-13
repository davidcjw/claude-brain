import { promises as fs } from "fs";
import os from "os";
import { buildCatalog, type CatalogEntry } from "./catalog";

export type ScanResult = CatalogEntry & {
  exists: boolean;
  isSymlink: boolean;
  symlinkTarget: string | null;
  /** Bytes for files; null for dirs/missing. */
  size: number | null;
  /** ISO mtime, or null if missing. */
  modified: string | null;
  /** For dirs: number of content children (filtered by contentExt if set). */
  childCount: number | null;
};

async function inspect(entry: CatalogEntry): Promise<ScanResult> {
  const base: ScanResult = {
    ...entry,
    exists: false,
    isSymlink: false,
    symlinkTarget: null,
    size: null,
    modified: null,
    childCount: null,
  };

  let lstat;
  try {
    lstat = await fs.lstat(entry.path);
  } catch {
    return base; // missing
  }

  base.isSymlink = lstat.isSymbolicLink();
  if (base.isSymlink) {
    try {
      base.symlinkTarget = await fs.readlink(entry.path);
    } catch {
      base.symlinkTarget = null;
    }
  }

  // Resolve through symlinks for the real thing.
  let stat;
  try {
    stat = await fs.stat(entry.path);
  } catch {
    // Dangling symlink — exists as a link but points nowhere.
    base.exists = false;
    return base;
  }

  base.exists = true;
  base.modified = stat.mtime.toISOString();

  if (entry.type === "file" && stat.isFile()) {
    base.size = stat.size;
  } else if (entry.type === "dir" && stat.isDirectory()) {
    try {
      const children = await fs.readdir(entry.path, { withFileTypes: true });
      const filtered = children.filter((c) => {
        if (c.name.startsWith(".")) return false;
        if (entry.contentExt) return c.name.endsWith(entry.contentExt);
        return true;
      });
      base.childCount = filtered.length;
    } catch {
      base.childCount = 0;
    }
  }

  return base;
}

export type ScanPayload = {
  home: string;
  project: string | null;
  scannedAt: string;
  results: ScanResult[];
};

export async function scan(project: string | null): Promise<ScanPayload> {
  const home = os.homedir();
  const catalog = buildCatalog(home, project);
  const results = await Promise.all(catalog.map(inspect));
  return {
    home,
    project,
    scannedAt: new Date().toISOString(),
    results,
  };
}
