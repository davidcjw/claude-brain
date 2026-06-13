"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import type { ScanResult } from "@/lib/scan";
import { TIERS, MECHANISMS } from "@/lib/catalog";
import FileModal, { type FileTarget } from "./file-modal";

type NodeState = "pending" | "firing" | "present" | "missing";

function fmtBytes(n: number | null): string | null {
  if (n == null) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function nodeState(r: ScanResult, step: number): NodeState {
  if (r.order > step) return "pending";
  if (r.order === step) return "firing";
  return r.exists ? "present" : "missing";
}

const GREEN = "#4d7c0f"; // sage — present / warm
const RED = "#c0392b"; // terracotta — missing / cold

function Synapse({
  r,
  state,
  accent,
  onOpen,
}: {
  r: ScanResult;
  state: NodeState;
  accent: string;
  onOpen: (t: FileTarget) => void;
}) {
  const present = r.exists;
  const dotColor = present ? GREEN : RED;
  const meta: string[] = [];
  if (r.type === "dir" && r.childCount != null)
    meta.push(`${r.childCount} item${r.childCount === 1 ? "" : "s"}`);
  const size = fmtBytes(r.size);
  if (size) meta.push(size);

  const lit = state === "present" || state === "firing";
  const ring = present ? "rgba(77,124,15," : "rgba(192,57,43,";

  const open = () =>
    onOpen({
      path: r.path,
      label: r.label,
      type: r.type,
      isSymlink: r.isSymlink,
      symlinkTarget: r.symlinkTarget,
    });

  return (
    <motion.div
      layout
      initial={false}
      animate={{
        opacity: state === "pending" ? 0.5 : 1,
        scale: state === "firing" ? 1.035 : 1,
        x: 0,
      }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      className="group relative flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-2.5 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-amber-500/60"
      style={{
        borderColor: lit
          ? `${ring}0.45)`
          : state === "missing"
            ? "rgba(192,57,43,0.32)"
            : "var(--line)",
        background: lit
          ? `linear-gradient(100deg, ${ring}0.07), #ffffff)`
          : "#ffffff",
        boxShadow:
          state === "firing"
            ? `0 0 0 1px ${ring}0.4), 0 8px 26px -10px ${ring}0.45)`
            : state === "present"
              ? `0 8px 24px -16px ${ring}0.55)`
              : "0 1px 2px rgba(28,25,23,0.04)",
      }}
      title={`${r.description}\n${r.path}`}
    >
      {/* firing burst */}
      <AnimatePresence>
        {state === "firing" && (
          <motion.span
            className="pointer-events-none absolute inset-0 rounded-xl"
            initial={{ opacity: 0.6, scale: 0.85 }}
            animate={{ opacity: 0, scale: 1.4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            style={{ boxShadow: `0 0 26px 3px ${ring}0.5)`, border: `1px solid ${ring}0.6)` }}
          />
        )}
      </AnimatePresence>

      {/* status orb */}
      <span className="relative mt-1 flex h-3 w-3 shrink-0 items-center justify-center">
        {state !== "pending" && present && (
          <motion.span
            className="absolute inset-0 rounded-full"
            animate={{ scale: [1, 1.9, 1], opacity: [0.45, 0, 0.45] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            style={{ background: GREEN }}
          />
        )}
        <span
          className="relative h-2.5 w-2.5 rounded-full"
          style={{
            background: state === "pending" ? "#d6cfc2" : dotColor,
            boxShadow: state === "pending" ? "none" : `0 0 8px ${dotColor}55`,
          }}
        />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="truncate font-mono text-[13px] font-medium"
            style={{ color: state === "pending" ? "#a8a29e" : present ? "#1c1917" : "#a13a2c" }}
          >
            {r.label}
          </span>
          {r.importance === "core" && (
            <span className="rounded bg-stone-200 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-stone-600">
              core
            </span>
          )}
          {r.isSymlink && (
            <span className="rounded bg-amber-500/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-amber-700">
              symlink
            </span>
          )}
          {state === "missing" && (
            <span className="rounded bg-[#fbe3da] px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-[#9a3412]">
              missing
            </span>
          )}
          <span
            className="rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-wider"
            style={{
              color: MECHANISMS[r.mechanism].accent,
              background: `${MECHANISMS[r.mechanism].accent}1a`,
            }}
            title={MECHANISMS[r.mechanism].blurb}
          >
            {MECHANISMS[r.mechanism].label}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] leading-snug text-stone-500">
          {r.isSymlink && r.symlinkTarget ? `→ ${r.symlinkTarget}` : r.description}
        </p>
        {meta.length > 0 && lit && (
          <p className="mt-1 font-mono text-[10px] text-stone-400">{meta.join(" · ")}</p>
        )}
      </div>

      {/* open affordance + sequence index */}
      <span className="ml-1 mt-0.5 flex shrink-0 items-center gap-1.5">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-stone-400 opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        >
          {r.type === "dir" ? (
            <path d="M9 18l6-6-6-6" />
          ) : (
            <>
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" />
            </>
          )}
        </svg>
        <span
          className="font-mono text-[10px] tabular-nums"
          style={{ color: state === "pending" ? "#c4b8a3" : accent }}
        >
          {String(r.order).padStart(2, "0")}
        </span>
      </span>
    </motion.div>
  );
}

export default function Cortex({
  results,
  projectActive,
  scanKey,
  project,
  onSaved,
}: {
  results: ScanResult[];
  projectActive: boolean;
  scanKey: string;
  project: string | null;
  onSaved: () => void;
}) {
  const reduce = useReducedMotion();
  const [openTarget, setOpenTarget] = useState<FileTarget | null>(null);
  const ordered = useMemo(() => [...results].sort((a, b) => a.order - b.order), [results]);
  const total = ordered.length;
  const lastStartup = useMemo(() => {
    const s = ordered.filter((r) => r.loadType === "startup");
    return s.length ? s[s.length - 1].order : 0;
  }, [ordered]);

  const [step, setStep] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const play = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    if (reduce || total === 0) {
      setStep(total);
      return;
    }
    setStep(0);
    timer.current = setInterval(() => {
      setStep((s) => {
        const next = s + 1;
        if (next >= total) {
          if (timer.current) clearInterval(timer.current);
        }
        return next;
      });
    }, 300);
  }, [reduce, total]);

  // (Re)play whenever a new scan arrives.
  useEffect(() => {
    play();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [scanKey, play]);

  const firing = ordered.find((r) => r.order === step) ?? null;
  const startupDone = step >= lastStartup;
  const sweepFrac = total > 0 ? Math.min(step, lastStartup) / Math.max(lastStartup, 1) : 0;

  const presentCount = ordered.filter((r) => r.exists).length;

  const startupTiers = TIERS.filter((t) => t.loadType === "startup");
  const onDemand = ordered.filter((r) => r.loadType === "on-demand");

  return (
    <div className="relative">
      <div className="synapse-grid pointer-events-none absolute inset-0 -z-10" />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[230px_minmax(0,1fr)]">
        {/* ── Readout rail ── */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-line bg-paper p-5 shadow-paper">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">
              {firing ? MECHANISMS[firing.mechanism].verb : startupDone ? "Context loaded" : "Reading into context"}
            </p>
            <div className="mt-2 flex items-baseline gap-2 font-display">
              <span
                className="text-5xl font-bold tabular-nums"
                style={{ color: firing ? MECHANISMS[firing.mechanism].accent : GREEN }}
              >
                {String(Math.min(step, total)).padStart(2, "0")}
              </span>
              <span className="text-lg font-semibold text-stone-400">/ {String(total).padStart(2, "0")}</span>
            </div>

            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
              <motion.div
                className="h-full rounded-full"
                animate={{ width: `${(Math.min(step, total) / Math.max(total, 1)) * 100}%` }}
                transition={{ ease: "easeOut", duration: 0.3 }}
                style={{ background: "linear-gradient(90deg,#d97706,#b45309,#4d7c0f)" }}
              />
            </div>

            <div className="mt-4 min-h-[42px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={firing ? firing.id : startupDone ? "done" : "idle"}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                >
                  {firing ? (
                    <>
                      <p className="truncate font-mono text-[13px] text-foreground">{firing.label}</p>
                      <p className="truncate text-[11px] text-stone-500">{firing.tier}</p>
                    </>
                  ) : (
                    <p className="text-[13px] text-stone-500">
                      {presentCount} present · {total - presentCount} missing
                    </p>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            <button
              onClick={play}
              className="group mt-5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-line bg-paper-sunk px-3 py-2 text-[13px] font-semibold text-stone-700 transition-colors hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-800"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="transition-transform group-hover:scale-110">
                <path d="M8 5v14l11-7z" />
              </svg>
              Replay sequence
            </button>

            <div className="mt-5 space-y-1.5 border-t border-line pt-4 text-[11px]">
              <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">Status</p>
              <Legend color={GREEN} label="Present — fires green" />
              <Legend color={RED} label="Missing — dead synapse" />
              <Legend color="#c4b8a3" label="Not yet read" />
            </div>
            <div className="mt-4 space-y-1.5 border-t border-line pt-4 text-[11px]">
              <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">How it&apos;s used</p>
              <Legend color={MECHANISMS.prompt.accent} label="In context — injected as prompt text" />
              <Legend color={MECHANISMS.harness.accent} label="Harness — configures the session" />
              <Legend color={MECHANISMS.invoke.accent} label="On invoke — loads only when used" />
            </div>
            <p className="mt-4 text-[10px] leading-relaxed text-stone-400">
              Read order is approximate — it reflects Claude Code&apos;s load hierarchy, not byte-exact timing.
            </p>
          </div>
        </aside>

        {/* ── Cortex spine ── */}
        <div className="relative pl-10 sm:pl-14">
          {/* spine */}
          <div
            className="absolute bottom-2 left-4 top-2 w-[2px] rounded-full sm:left-6"
            style={{
              background:
                "linear-gradient(180deg,#b45309 0%,#c2410c 22%,#92400e 40%,#4d7c0f 70%,#3f6212 85%,#d6ccb8 100%)",
              opacity: 0.7,
            }}
          />
          {/* traveling pulse */}
          {!reduce && step > 0 && step <= lastStartup && (
            <motion.div
              className="absolute left-4 z-10 h-3 w-3 -translate-x-[5px] rounded-full sm:left-6"
              animate={{ top: `${sweepFrac * 100}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 18 }}
              style={{ background: "#fff", boxShadow: "0 0 14px 4px rgba(217,119,6,0.6)" }}
            />
          )}

          <div className="space-y-7">
            {startupTiers.map((tier) => {
              const items = ordered.filter((r) => r.tier === tier.name);
              if (!items.length) return null;
              const tierReached = items.some((r) => r.order <= step);
              return (
                <section key={tier.name} className="relative">
                  {/* tier node on the spine */}
                  <span
                    className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full sm:-left-[34px]"
                    style={{
                      background: tierReached ? tier.accent : "#ddd3c0",
                      boxShadow: tierReached ? `0 0 10px ${tier.accent}80` : "none",
                      transition: "all .3s",
                    }}
                  />
                  <header className="mb-2.5">
                    <h3
                      className="font-display text-sm font-bold tracking-tight"
                      style={{ color: tierReached ? tier.accent : "#a8a29e" }}
                    >
                      {tier.name}
                    </h3>
                    <p className="text-[11px] text-stone-400">{tier.blurb}</p>
                  </header>
                  <div className="space-y-2">
                    {items.map((r) => (
                      <NodeWithConnector key={r.id} r={r} step={step} accent={tier.accent} onOpen={setOpenTarget} />
                    ))}
                  </div>
                </section>
              );
            })}

            {/* ── On-demand pool ── */}
            {projectActive || onDemand.length > 0 ? (
              <section className="relative">
                <span
                  className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full border border-line-strong sm:-left-[34px]"
                  style={{ background: startupDone ? "#b3a892" : "#e7dfcf" }}
                />
                <header className="mb-2.5">
                  <h3 className="font-display text-sm font-bold tracking-tight text-stone-500">
                    On-Demand Extensions
                  </h3>
                  <p className="text-[11px] text-stone-400">
                    Not in the boot sequence — pulled in only when a command, agent, skill or hook fires.
                  </p>
                </header>
                <motion.div
                  className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                  initial={false}
                  animate={{ opacity: startupDone ? 1 : 0.45 }}
                  transition={{ duration: 0.4 }}
                >
                  {onDemand.map((r) => (
                    <Synapse key={r.id} r={r} state={nodeState(r, startupDone ? total : 0)} accent="#a8a29e" onOpen={setOpenTarget} />
                  ))}
                </motion.div>
              </section>
            ) : null}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {openTarget && (
          <FileModal
            target={openTarget}
            project={project}
            onClose={() => setOpenTarget(null)}
            onSaved={onSaved}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function NodeWithConnector({
  r,
  step,
  accent,
  onOpen,
}: {
  r: ScanResult;
  step: number;
  accent: string;
  onOpen: (t: FileTarget) => void;
}) {
  const state = nodeState(r, step);
  const fired = r.order <= step;
  return (
    <div className="relative">
      {/* connector beam from spine to card */}
      <div className="absolute -left-[26px] top-1/2 h-[2px] w-[26px] -translate-y-1/2 sm:-left-[34px] sm:w-[34px]">
        <div className="h-full w-full rounded-full bg-stone-200" />
        <motion.div
          className="absolute inset-0 h-full rounded-full"
          initial={false}
          animate={{ opacity: fired ? 1 : 0, scaleX: fired ? 1 : 0.2 }}
          transition={{ duration: 0.35 }}
          style={{
            transformOrigin: "left",
            background: `linear-gradient(90deg, ${accent}, ${r.exists ? GREEN : RED})`,
            boxShadow: state === "firing" ? `0 0 8px ${accent}` : "none",
          }}
        />
      </div>
      <Synapse r={r} state={state} accent={accent} onOpen={onOpen} />
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-stone-600">
      <span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 5px ${color}66` }} />
      {label}
    </div>
  );
}
