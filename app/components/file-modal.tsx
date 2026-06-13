"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";

export type FileTarget = {
  path: string;
  label: string;
  type: "file" | "dir";
  isSymlink?: boolean;
  symlinkTarget?: string | null;
};

type FileData = {
  path: string;
  type: "file" | "dir";
  exists: boolean;
  content?: string;
  binary?: boolean;
  tooLarge?: boolean;
  size?: number;
  isSymlink?: boolean;
  symlinkTarget?: string | null;
  entries?: { name: string; path: string; isDir: boolean; size: number | null }[];
};

function fmtBytes(n?: number | null): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function FileModal({
  target,
  project,
  onClose,
  onSaved,
}: {
  target: FileTarget;
  project: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Allow drilling from a directory into its children within the same modal.
  const [viewPath, setViewPath] = useState(target.path);
  const [rootPath] = useState(target.path);
  const [data, setData] = useState<FileData | null>(null);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const startNewFile = useCallback(
    (dirPath: string) => {
      const name = newName.trim();
      if (!name || name.includes("/") || name.includes("..")) {
        setStatus({ kind: "err", msg: "Enter a simple filename (no slashes)." });
        return;
      }
      setCreating(false);
      setNewName("");
      setStatus(null);
      setViewPath(`${dirPath.replace(/\/$/, "")}/${name}`);
    },
    [newName]
  );

  const fetchFile = useCallback(
    async (p: string) => {
      setLoading(true);
      setStatus(null);
      try {
        const url = `/api/file?path=${encodeURIComponent(p)}${project ? `&project=${encodeURIComponent(project)}` : ""}`;
        const res = await fetch(url);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to read");
        setData(json);
        if (json.type === "file") {
          setContent(json.content ?? "");
          setDirty(false);
        }
      } catch (e) {
        setStatus({ kind: "err", msg: e instanceof Error ? e.message : "Failed to read" });
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [project]
  );

  useEffect(() => {
    fetchFile(viewPath);
  }, [viewPath, fetchFile]);

  const save = useCallback(async () => {
    if (!data || data.type !== "file" || saving) return;
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/file", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: viewPath, content, project }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setDirty(false);
      setStatus({ kind: "ok", msg: `Saved · ${fmtBytes(json.size)}` });
      onSaved();
    } catch (e) {
      setStatus({ kind: "err", msg: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }, [data, saving, viewPath, content, project, onSaved]);

  const requestClose = useCallback(() => {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    onClose();
  }, [dirty, onClose]);

  // Keyboard: Esc closes, Cmd/Ctrl+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose, save]);

  const isChild = viewPath !== rootPath;
  const fileName = viewPath.split("/").filter(Boolean).pop() ?? viewPath;
  const editable = data?.type === "file" && !data.binary && !data.tooLarge;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* scrim */}
      <motion.div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={requestClose}
      />
      <motion.div
        className="relative flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950 shadow-2xl"
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
      >
        {/* header */}
        <header className="flex items-start justify-between gap-3 border-b border-slate-800 px-5 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {isChild && (
                <button
                  onClick={() => setViewPath(rootPath)}
                  className="rounded text-slate-500 hover:text-slate-200"
                  title="Back to directory"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                </button>
              )}
              <h2 className="truncate font-display text-base font-bold text-slate-50">{fileName}</h2>
              {data?.exists === false && (
                <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-300">new</span>
              )}
              {data?.type === "dir" && (
                <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-300">dir</span>
              )}
            </div>
            <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">{viewPath}</p>
            {target.isSymlink && target.symlinkTarget && !isChild && (
              <p className="mt-1 truncate font-mono text-[11px] text-amber-400/90">
                ↳ symlink — writes through to {target.symlinkTarget}
              </p>
            )}
          </div>
          <button
            onClick={requestClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </header>

        {/* body */}
        <div className="min-h-0 flex-1 overflow-auto">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-500">Reading…</div>
          ) : !data ? (
            <div className="flex h-40 items-center justify-center text-sm text-rose-300">{status?.msg ?? "Could not read file."}</div>
          ) : data.type === "dir" ? (
            <div>
              {/* New file affordance */}
              <div className="border-b border-slate-800/70 px-5 py-2.5">
                {creating ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") startNewFile(data.path);
                        if (e.key === "Escape") {
                          e.stopPropagation();
                          setCreating(false);
                          setNewName("");
                        }
                      }}
                      placeholder="new-file.md"
                      className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-[13px] text-slate-100 outline-none focus:border-violet-500/60"
                    />
                    <button
                      onClick={() => startNewFile(data.path)}
                      className="rounded-md bg-gradient-to-br from-violet-500 to-emerald-500 px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
                    >
                      Create
                    </button>
                    <button
                      onClick={() => {
                        setCreating(false);
                        setNewName("");
                      }}
                      className="rounded-md px-2 py-1.5 text-[12px] text-slate-400 hover:text-slate-200"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setCreating(true)}
                    className="flex items-center gap-2 text-[13px] font-medium text-violet-300 transition-colors hover:text-violet-200"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                    New file in this folder
                  </button>
                )}
              </div>
            <ul className="divide-y divide-slate-800/70">
              {data.entries && data.entries.length > 0 ? (
                data.entries.map((e) => (
                  <li key={e.path}>
                    <button
                      onClick={() => !e.isDir && setViewPath(e.path)}
                      disabled={e.isDir}
                      className="flex w-full items-center justify-between px-5 py-2.5 text-left transition-colors enabled:hover:bg-slate-900 disabled:opacity-50"
                    >
                      <span className="flex items-center gap-2 font-mono text-[13px] text-slate-200">
                        <span className="text-slate-600">{e.isDir ? "▸" : "·"}</span>
                        {e.name}
                      </span>
                      <span className="font-mono text-[11px] text-slate-600">{e.isDir ? "dir" : fmtBytes(e.size)}</span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="px-5 py-10 text-center text-sm text-slate-600">Empty directory.</li>
              )}
            </ul>
            </div>
          ) : data.tooLarge ? (
            <div className="flex h-40 items-center justify-center px-6 text-center text-sm text-slate-500">
              File is {fmtBytes(data.size)} — too large to edit here (2 MB cap).
            </div>
          ) : data.binary ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-500">Binary file — not editable.</div>
          ) : (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setDirty(true);
                setStatus(null);
              }}
              spellCheck={false}
              className="block h-[52vh] w-full resize-none bg-transparent px-5 py-4 font-mono text-[13px] leading-relaxed text-slate-100 outline-none"
              placeholder={data.exists === false ? "Empty — type here and Save to create this file…" : ""}
            />
          )}
        </div>

        {/* footer */}
        {editable && (
          <footer className="flex items-center justify-between gap-3 border-t border-slate-800 px-5 py-3">
            <div className="flex items-center gap-3 text-[11px]">
              <span className="font-mono text-slate-600">{fmtBytes(new Blob([content]).size)}</span>
              {dirty && <span className="text-amber-400">● unsaved</span>}
              {status && (
                <span className={status.kind === "ok" ? "text-emerald-400" : "text-rose-400"}>{status.msg}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <kbd className="hidden rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 sm:inline">⌘S</kbd>
              <button
                onClick={requestClose}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-[13px] text-slate-300 transition-colors hover:bg-slate-800"
              >
                Close
              </button>
              <button
                onClick={save}
                disabled={!dirty || saving}
                className="rounded-lg bg-gradient-to-br from-violet-500 to-emerald-500 px-4 py-1.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? "Saving…" : data?.exists === false ? "Create file" : "Save to disk"}
              </button>
            </div>
          </footer>
        )}
      </motion.div>
    </div>
  );
}
