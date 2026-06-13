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
        className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={requestClose}
      />
      <motion.div
        className="shadow-paper-lg relative flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line bg-paper"
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
      >
        {/* header */}
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {isChild && (
                <button
                  onClick={() => setViewPath(rootPath)}
                  className="cursor-pointer rounded text-stone-400 hover:text-stone-700"
                  title="Back to directory"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                </button>
              )}
              <h2 className="truncate font-display text-base font-bold text-foreground">{fileName}</h2>
              {data?.exists === false && (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-800">new</span>
              )}
              {data?.type === "dir" && (
                <span className="rounded bg-stone-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-stone-600">dir</span>
              )}
            </div>
            <p className="mt-0.5 truncate font-mono text-[11px] text-stone-500">{viewPath}</p>
            {target.isSymlink && target.symlinkTarget && !isChild && (
              <p className="mt-1 truncate font-mono text-[11px] text-amber-700">
                ↳ symlink — writes through to {target.symlinkTarget}
              </p>
            )}
          </div>
          <button
            onClick={requestClose}
            className="shrink-0 cursor-pointer rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </header>

        {/* body */}
        <div className="min-h-0 flex-1 overflow-auto">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-stone-500">Reading…</div>
          ) : !data ? (
            <div className="flex h-40 items-center justify-center text-sm text-[#9a3412]">{status?.msg ?? "Could not read file."}</div>
          ) : data.type === "dir" ? (
            <div>
              {/* New file affordance */}
              <div className="border-b border-line px-5 py-2.5">
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
                      className="flex-1 rounded-md border border-line bg-paper-sunk px-2.5 py-1.5 font-mono text-[13px] text-foreground outline-none focus:border-amber-500/70"
                    />
                    <button
                      onClick={() => startNewFile(data.path)}
                      className="cursor-pointer rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-amber-700"
                    >
                      Create
                    </button>
                    <button
                      onClick={() => {
                        setCreating(false);
                        setNewName("");
                      }}
                      className="cursor-pointer rounded-md px-2 py-1.5 text-[12px] text-stone-500 hover:text-stone-800"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setCreating(true)}
                    className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-amber-700 transition-colors hover:text-amber-800"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                    New file in this folder
                  </button>
                )}
              </div>
            <ul className="divide-y divide-line">
              {data.entries && data.entries.length > 0 ? (
                data.entries.map((e) => (
                  <li key={e.path}>
                    <button
                      onClick={() => !e.isDir && setViewPath(e.path)}
                      disabled={e.isDir}
                      className="flex w-full cursor-pointer items-center justify-between px-5 py-2.5 text-left transition-colors enabled:hover:bg-paper-sunk disabled:cursor-default disabled:opacity-50"
                    >
                      <span className="flex items-center gap-2 font-mono text-[13px] text-stone-700">
                        <span className="text-stone-400">{e.isDir ? "▸" : "·"}</span>
                        {e.name}
                      </span>
                      <span className="font-mono text-[11px] text-stone-400">{e.isDir ? "dir" : fmtBytes(e.size)}</span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="px-5 py-10 text-center text-sm text-stone-400">Empty directory.</li>
              )}
            </ul>
            </div>
          ) : data.tooLarge ? (
            <div className="flex h-40 items-center justify-center px-6 text-center text-sm text-stone-500">
              File is {fmtBytes(data.size)} — too large to edit here (2 MB cap).
            </div>
          ) : data.binary ? (
            <div className="flex h-40 items-center justify-center text-sm text-stone-500">Binary file — not editable.</div>
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
              className="block h-[52vh] w-full resize-none bg-paper-sunk px-5 py-4 font-mono text-[13px] leading-relaxed text-foreground outline-none"
              placeholder={data.exists === false ? "Empty — type here and Save to create this file…" : ""}
            />
          )}
        </div>

        {/* footer */}
        {editable && (
          <footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
            <div className="flex items-center gap-3 text-[11px]">
              <span className="font-mono text-stone-400">{fmtBytes(new Blob([content]).size)}</span>
              {dirty && <span className="text-amber-600">● unsaved</span>}
              {status && (
                <span style={{ color: status.kind === "ok" ? "#4d7c0f" : "#c0392b" }}>{status.msg}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <kbd className="hidden rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-stone-400 sm:inline">⌘S</kbd>
              <button
                onClick={requestClose}
                className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-[13px] text-stone-700 transition-colors hover:bg-paper-sunk"
              >
                Close
              </button>
              <button
                onClick={save}
                disabled={!dirty || saving}
                className="cursor-pointer rounded-lg bg-accent px-4 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
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
