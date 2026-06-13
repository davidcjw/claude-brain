"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import type { ScanResult } from "@/lib/scan";
import Cortex from "./components/cortex";
import CacheLab from "./components/cache-lab";

type Tab = "cortex" | "cache";

type ScanPayload = {
  home: string;
  project: string | null;
  scannedAt: string;
  results: ScanResult[];
};

type ProjectItem = { name: string; path: string };

export default function Home() {
  const [projectInput, setProjectInput] = useState("");
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [data, setData] = useState<ScanPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanKey, setScanKey] = useState(0);
  const [tab, setTab] = useState<Tab>("cortex");

  const load = useCallback(async (project: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const url = project
        ? `/api/scan?project=${encodeURIComponent(project)}`
        : "/api/scan";
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Scan failed");
      setData(json);
      setActiveProject(project);
      setScanKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(null);
    fetch("/api/projects")
      .then((r) => r.json())
      .then((j) => setProjects(j.projects ?? []))
      .catch(() => {});
  }, [load]);

  const present = (data?.results ?? []).filter((r) => r.exists).length;
  const total = data?.results.length ?? 0;
  const missingCore = (data?.results ?? []).filter(
    (r) => !r.exists && r.importance === "core"
  );

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 overflow-x-clip px-5 py-8 sm:px-8 sm:py-12">
      {/* Header */}
      <header className="mb-8">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-3"
        >
          <BrainMark />
          <div>
            <h1 className="font-display text-[28px] font-extrabold leading-none tracking-tight text-slate-50">
              Claude&apos;s Brain
            </h1>
            <p className="mt-1.5 text-[13px] text-slate-500">
              {tab === "cortex"
                ? "Watch every config file fire into context — in the order it's read."
                : "How that context is reused, decays, and goes cold — prompt caching, made tangible."}
            </p>
          </div>
        </motion.div>
      </header>

      {/* Tabs */}
      <div className="mb-6 inline-flex rounded-xl border border-slate-800 bg-slate-950/50 p-1">
        {([
          { key: "cortex", label: "Cortex", sub: "what loads" },
          { key: "cache", label: "Cache", sub: "what stays warm" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors ${
              tab === t.key ? "text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {tab === t.key && (
              <motion.span
                layoutId="tab-pill"
                className="absolute inset-0 rounded-lg bg-gradient-to-br from-violet-500/30 to-emerald-500/20 ring-1 ring-violet-400/40"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative">{t.label}</span>
            <span className="relative ml-1.5 text-[10px] text-slate-500">{t.sub}</span>
          </button>
        ))}
      </div>

      {tab === "cache" ? (
        <CacheLab />
      ) : (
      <>
      {/* Controls */}
      <div className="mb-7 rounded-2xl border border-slate-800/70 bg-slate-950/40 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Project directory
            </label>
            <div className="flex gap-2">
              <input
                value={projectInput}
                onChange={(e) => setProjectInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") load(projectInput.trim() || null);
                }}
                placeholder="~/code/my-app  ·  blank = global only"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 font-mono text-[13px] text-slate-100 outline-none transition-colors focus:border-violet-500/60"
              />
              <button
                onClick={() => load(projectInput.trim() || null)}
                disabled={loading}
                className="rounded-lg bg-gradient-to-br from-violet-500 to-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "Scanning…" : "Scan"}
              </button>
            </div>
          </div>
          <StatPill label="Present" value={present} total={total} color="#22c55e" />
          <StatPill label="Missing" value={total - present} total={total} color="#f43f5e" />
        </div>

        {projects.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {projects.slice(0, 28).map((p) => (
              <button
                key={p.path}
                onClick={() => {
                  setProjectInput(p.path);
                  load(p.path);
                }}
                className={`rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors ${
                  activeProject === p.path
                    ? "border-violet-500/60 bg-violet-500/15 text-violet-200"
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {missingCore.length > 0 && (
        <div className="mb-6 rounded-xl border border-rose-500/25 bg-rose-500/5 px-4 py-3 text-[13px] text-rose-200">
          <span className="font-semibold">
            {missingCore.length} core file{missingCore.length === 1 ? "" : "s"} missing:
          </span>{" "}
          {missingCore.map((r) => r.label).join(", ")}
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {/* The Cortex */}
      {data && (
        <Cortex
          results={data.results}
          projectActive={!!activeProject}
          scanKey={`${scanKey}`}
          project={activeProject}
          onSaved={() => load(activeProject)}
        />
      )}
      </>
      )}

      <footer className="mt-12 text-center font-mono text-[11px] text-slate-700">
        {tab === "cortex"
          ? `scanned ${data ? new Date(data.scannedAt).toLocaleTimeString() : "—"} · click any file to view & edit · localhost`
          : "interactive model · no API calls · all numbers reflect real cache pricing"}
      </footer>
    </main>
  );
}

function StatPill({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-slate-800/70 bg-slate-900/40 px-3.5 py-1.5">
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="font-display text-xl font-bold tabular-nums" style={{ color }}>
        {value}
        <span className="ml-1 text-[11px] font-normal text-slate-600">/ {total}</span>
      </p>
    </div>
  );
}

function BrainMark() {
  return (
    <motion.div
      className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-violet-500/30"
      style={{ background: "radial-gradient(circle at 50% 30%, rgba(167,139,250,0.25), rgba(8,11,18,0.8))" }}
      animate={{ boxShadow: ["0 0 0px rgba(167,139,250,0.0)", "0 0 22px rgba(167,139,250,0.45)", "0 0 0px rgba(167,139,250,0.0)"] }}
      transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5a3 3 0 0 0-3 3 2.5 2.5 0 0 0-2 4 2.5 2.5 0 0 0 1 4.5A2.5 2.5 0 0 0 12 19V5Z" />
        <path d="M12 5a3 3 0 0 1 3 3 2.5 2.5 0 0 1 2 4 2.5 2.5 0 0 1-1 4.5A2.5 2.5 0 0 1 12 19" />
        <path d="M9 9.5h1M14 9.5h1M9.5 13h1M13.5 13h1" />
      </svg>
    </motion.div>
  );
}
