"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CACHE, turnCost, type Tier, type Warm, type Sizes, type TurnKind } from "@/lib/cache-model";

const TOOLS = 3000;
const SYSTEM = 12000;
const TURN = 4500;
const START_HISTORY = 25000;

type CacheState = {
  writtenAt: number;
  ttl: number;
  tiers: Record<Tier, boolean>;
} | null;

type Row = {
  n: number;
  kind: TurnKind;
  readTok: number;
  coldTok: number;
  newTok: number;
  dollars: number;
  noCacheDollars: number;
};

type EvTone = "hit" | "miss" | "partial" | "info" | "warn";
type Ev = {
  id: number;
  head: string;
  note: string;
  metric: string;
  tone: EvTone;
};

// ── Scenarios: scripted timelines the user just presses play on ──
type Step =
  | { t: "send"; note: string }
  | { t: "wait"; sec: number; note: string }
  | { t: "editSystem"; note: string }
  | { t: "changeTools"; note: string }
  | { t: "switchModel"; note: string };

type Scenario = { id: string; title: string; blurb: string; icon: string; steps: Step[] };

const SCENARIOS: Scenario[] = [
  {
    id: "rapid",
    title: "Rapid back-and-forth",
    icon: "⚡",
    blurb: "Reply fast — every turn after the first rides the warm cache.",
    steps: [
      { t: "send", note: "Your first message. Nothing is cached yet, so the whole prefix is written from scratch." },
      { t: "wait", sec: 12, note: "You read the reply and type back within seconds." },
      { t: "send", note: "The prefix is still warm — this turn just re-reads it at one-tenth the price." },
      { t: "wait", sec: 10, note: "Another quick reply." },
      { t: "send", note: "Still warm. This is the sweet spot: cheap, fast turns." },
    ],
  },
  {
    id: "coffee",
    title: "Coffee break",
    icon: "☕",
    blurb: "Step away past the 5-minute TTL and the cache goes cold.",
    steps: [
      { t: "send", note: "Cold start — the prefix gets written." },
      { t: "wait", sec: 12, note: "You reply quickly." },
      { t: "send", note: "Warm hit — cheap." },
      { t: "wait", sec: 360, note: "You wander off for a coffee. Six minutes pass — past the 5-minute TTL." },
      { t: "send", note: "The cache expired while you were away, so you pay full price to rewarm it." },
    ],
  },
  {
    id: "edit",
    title: "Edit your system prompt",
    icon: "✎",
    blurb: "Changing mid-prefix invalidates everything after it — tools survive.",
    steps: [
      { t: "send", note: "Cold start." },
      { t: "wait", sec: 12, note: "Quick reply." },
      { t: "send", note: "Warm hit." },
      { t: "editSystem", note: "You tweak your system prompt mid-conversation." },
      { t: "send", note: "System and messages must be reprocessed — but tools at the very front survive. A partial hit." },
    ],
  },
  {
    id: "model",
    title: "Switch models mid-chat",
    icon: "🔄",
    blurb: "Each model keeps its own cache — switching starts you cold.",
    steps: [
      { t: "send", note: "Cold start on Opus." },
      { t: "wait", sec: 12, note: "Quick reply." },
      { t: "send", note: "Warm hit." },
      { t: "switchModel", note: "You switch to a different model." },
      { t: "send", note: "The new model has its own cache — so the entire prefix is cold again." },
    ],
  },
];

const TIER_META: { key: Tier; label: string }[] = [
  { key: "tools", label: "tools" },
  { key: "system", label: "system" },
  { key: "messages", label: "messages" },
];

const GREEN = "#4d7c0f"; // sage — warm / hit
const RED = "#c0392b"; // terracotta — cold / miss
const AMBER = "#b45309"; // burnt amber — partial
const SLATE = "#a8a29e"; // warm stone — neutral/info
const INK = "var(--foreground)";
const LINE = "var(--line)";

function fmtTok(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `${n}`;
}
function fmtMoney(n: number): string {
  return n < 0.01 && n > 0 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`;
}
function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function humanWait(sec: number): string {
  if (sec >= 60) {
    const m = Math.round(sec / 60);
    return `${m} minute${m === 1 ? "" : "s"} pass`;
  }
  return `${sec} seconds pass`;
}
function humanWaitShort(sec: number): string {
  return sec >= 60 ? `+${Math.round(sec / 60)}m` : `+${sec}s`;
}
function toneColor(t: EvTone): string {
  return t === "hit" ? GREEN : t === "miss" ? RED : t === "partial" ? AMBER : t === "warn" ? RED : SLATE;
}

// How long each step lingers so the user can read its event.
function dwell(step: Step): number {
  if (step.t === "wait") return 2100;
  if (step.t === "send") return 1600;
  return 1800;
}

// ── Timeline: deterministically replay a scenario to build a time-axis ──
type Seg = {
  i: number;
  kind: "send" | "wait" | "inv";
  label: string;
  weight: number; // visual width (∝ √duration, so a 6-min wait reads "much longer" without dwarfing 12s)
  warmFrac: number; // wait segments: fraction of the span still warm before the TTL expires
  tone: EvTone;
};

function simulate(scn: Scenario): { segs: Seg[]; totalSec: number } {
  let clock = 0;
  let history = START_HISTORY;
  let cache: CacheState = null;
  let model = "claude-opus-4-8";
  let turnNo = 0;
  const segs: Seg[] = [];

  scn.steps.forEach((step, i) => {
    if (step.t === "send") {
      const expired = cache ? clock > cache.writtenAt + cache.ttl : true;
      const warm: Warm = {
        tools: !!cache && cache.tiers.tools && !expired,
        system: !!cache && cache.tiers.system && !expired,
        messages: !!cache && cache.tiers.messages && !expired,
      };
      const base = model === "claude-opus-4-8" ? 5 : 3;
      const r = turnCost({ warm, sizes: { tools: TOOLS, system: SYSTEM, messages: history, turn: TURN }, writeMult: CACHE.WRITE_5M, base });
      turnNo += 1;
      segs.push({ i, kind: "send", label: `Turn ${turnNo}`, weight: Math.sqrt(5), warmFrac: 1, tone: r.kind });
      cache = { writtenAt: clock, ttl: CACHE.TTL_5M, tiers: { tools: true, system: true, messages: true } };
      history += TURN;
      clock += 5;
    } else if (step.t === "wait") {
      const start = clock;
      const end = clock + step.sec;
      let warmFrac = 0;
      let crossed = false;
      if (cache) {
        const expAt = cache.writtenAt + cache.ttl;
        if (start <= expAt) {
          const warmUntil = Math.min(end, expAt);
          warmFrac = (warmUntil - start) / (end - start);
          crossed = end > expAt;
        }
      }
      segs.push({ i, kind: "wait", label: humanWaitShort(step.sec), weight: Math.sqrt(step.sec), warmFrac, tone: crossed ? "warn" : "info" });
      clock = end;
    } else {
      if (step.t === "editSystem") {
        if (cache) cache = { ...cache, tiers: { ...cache.tiers, system: false, messages: false } };
      } else if (step.t === "changeTools") {
        cache = null;
      } else if (step.t === "switchModel") {
        model = model === "claude-opus-4-8" ? "claude-sonnet-4-6" : "claude-opus-4-8";
        cache = null;
      }
      const label = step.t === "editSystem" ? "edit" : step.t === "changeTools" ? "tools" : "model";
      segs.push({ i, kind: "inv", label, weight: 0.7, warmFrac: 0, tone: "warn" });
    }
  });

  return { segs, totalSec: clock };
}

export default function CacheLab() {
  const [history, setHistory] = useState(START_HISTORY);
  const [clock, setClock] = useState(0);
  const [model, setModel] = useState("claude-opus-4-8");
  const [toolsRev, setToolsRev] = useState(1);
  const [cache, setCache] = useState<CacheState>(null);
  const [ledger, setLedger] = useState<Row[]>([]);
  const [turnNo, setTurnNo] = useState(0);
  const [flash, setFlash] = useState<{ tiers: Tier[]; id: number } | null>(null);
  const [showHelp, setShowHelp] = useState(true);

  // Scenario player
  const [scenarioId, setScenarioId] = useState<string>(SCENARIOS[0].id);
  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [events, setEvents] = useState<Ev[]>([]);
  const evId = useRef(0);
  const processed = useRef(-1);

  const scenario = SCENARIOS.find((s) => s.id === scenarioId)!;
  const { segs, totalSec } = useMemo(() => simulate(scenario), [scenario]);
  const ttl = CACHE.TTL_5M; // scenarios use the default 5-min TTL
  const writeMult = CACHE.WRITE_5M;
  const base = model === "claude-opus-4-8" ? 5 : 3; // Opus 4.8 vs Sonnet 4.6 input $/1M
  const prefix = TOOLS + SYSTEM + history;
  const sizes: Sizes = { tools: TOOLS, system: SYSTEM, messages: history, turn: TURN };

  const expired = cache ? clock > cache.writtenAt + cache.ttl : true;
  const remaining = cache ? Math.max(0, cache.writtenAt + cache.ttl - clock) : 0;
  const warm: Warm = {
    tools: !!cache && cache.tiers.tools && !expired,
    system: !!cache && cache.tiers.system && !expired,
    messages: !!cache && cache.tiers.messages && !expired,
  };
  const anyWarm = warm.tools || warm.system || warm.messages;

  const triggerFlash = (tiers: Tier[]) => setFlash({ tiers, id: evId.current });
  const pushEv = (e: Omit<Ev, "id">) => setEvents((l) => [...l, { ...e, id: ++evId.current }]);

  // Reset all sim state to the start of a scenario.
  const prime = (id: string) => {
    setPlaying(false);
    processed.current = -1;
    setScenarioId(id);
    setStepIdx(0);
    setHistory(START_HISTORY);
    setClock(0);
    setModel("claude-opus-4-8");
    setToolsRev(1);
    setCache(null);
    setLedger([]);
    setEvents([]);
    setTurnNo(0);
    setFlash(null);
  };

  const play = () => {
    prime(scenarioId);
    setPlaying(true);
  };

  const finished = stepIdx >= scenario.steps.length;

  // Player loop: process one step, then advance after its dwell.
  useEffect(() => {
    if (!playing) return;
    if (stepIdx >= scenario.steps.length) {
      setPlaying(false);
      return;
    }
    if (processed.current === stepIdx) return;
    processed.current = stepIdx;

    const step = scenario.steps[stepIdx];

    if (step.t === "send") {
      const r = turnCost({ warm, sizes, writeMult, base });
      const n = turnNo + 1;
      setLedger((l) => [
        { n, kind: r.kind, readTok: r.readTok, coldTok: r.coldTok, newTok: r.newTok, dollars: r.dollars, noCacheDollars: r.noCacheDollars },
        ...l,
      ].slice(0, 8));
      setTurnNo(n);
      setHistory((h) => h + TURN);
      setCache({ writtenAt: clock, ttl, tiers: { tools: true, system: true, messages: true } });
      setClock((c) => c + 5);
      const label = r.kind === "hit" ? "cache HIT" : r.kind === "miss" ? "cache MISS" : "partial hit";
      pushEv({
        head: `Turn ${n} → ${label}`,
        note: step.note,
        metric:
          `${fmtMoney(r.dollars)} — read ${fmtTok(r.readTok)} @0.1×` +
          (r.coldTok ? ` · reprocess ${fmtTok(r.coldTok)} @${writeMult}×` : "") +
          ` · write ${fmtTok(r.newTok)} new`,
        tone: r.kind,
      });
    } else if (step.t === "wait") {
      const newClock = clock + step.sec;
      const nowExpired = cache ? newClock > cache.writtenAt + cache.ttl : true;
      const left = cache ? Math.max(0, cache.writtenAt + cache.ttl - newClock) : 0;
      setClock(newClock);
      pushEv({
        head: `${humanWait(step.sec)}${nowExpired && anyWarm ? " — cache expired" : ""}`,
        note: step.note,
        metric: !cache
          ? "no warm cache"
          : nowExpired
            ? "the prefix is now cold"
            : `${mmss(left)} left before it expires`,
        tone: nowExpired && anyWarm ? "warn" : "info",
      });
    } else if (step.t === "editSystem") {
      if (cache) setCache({ ...cache, tiers: { ...cache.tiers, system: false, messages: false } });
      triggerFlash(["system", "messages"]);
      pushEv({
        head: "System prompt edited",
        note: step.note,
        metric: "system + messages go cold · tools stay warm",
        tone: "warn",
      });
    } else if (step.t === "changeTools") {
      setToolsRev((v) => v + 1);
      setCache(null);
      triggerFlash(["tools", "system", "messages"]);
      pushEv({ head: "Tools changed", note: step.note, metric: "the entire prefix goes cold", tone: "warn" });
    } else if (step.t === "switchModel") {
      const next = model === "claude-opus-4-8" ? "claude-sonnet-4-6" : "claude-opus-4-8";
      setModel(next);
      setCache(null);
      triggerFlash(["tools", "system", "messages"]);
      pushEv({
        head: `Switched to ${next === "claude-opus-4-8" ? "Opus 4.8" : "Sonnet 4.6"}`,
        note: step.note,
        metric: "a fresh cache — the entire prefix is cold",
        tone: "warn",
      });
    }

    const timer = setTimeout(() => setStepIdx((i) => i + 1), dwell(step));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, stepIdx, scenarioId]);

  const spent = ledger.reduce((s, r) => s + r.dollars, 0);
  const noCache = ledger.reduce((s, r) => s + r.noCacheDollars, 0);
  const saved = noCache - spent;
  const ttlColor = remaining > ttl * 0.5 ? GREEN : remaining > 0 ? AMBER : RED;

  return (
    <div className="space-y-5">
      {/* ── How this works ── */}
      <section className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-5">
        <button onClick={() => setShowHelp((s) => !s)} className="flex w-full cursor-pointer items-center justify-between text-left">
          <h3 className="font-display text-sm font-bold text-foreground">
            What is this? <span className="text-amber-700">Prompt caching in 20 seconds</span>
          </h3>
          <span className="font-mono text-[11px] text-stone-400">{showHelp ? "hide ▴" : "show ▾"}</span>
        </button>
        <AnimatePresence initial={false}>
          {showHelp && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <p className="mt-3 text-[13px] leading-relaxed text-stone-600">
                Every turn re-sends the <span className="font-semibold text-foreground">whole conversation</span>{" "}
                (tools → system → messages) before your new message. Caching stores that unchanged{" "}
                <span className="font-semibold text-foreground">prefix</span> and reads it back at{" "}
                <span className="font-semibold text-[#3f6212]">~1/10th the price</span> — but it{" "}
                <span className="font-semibold text-amber-700">expires</span> (5 min) and{" "}
                <span className="font-semibold text-[#c0392b]">breaks</span> if the prefix changes. Pick a scenario and press{" "}
                <span className="font-semibold text-amber-800">▶ Play</span> — watch the bar, the TTL clock, and the event log react live.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* ── Scenario picker + transport ── */}
      <section className="rounded-2xl border border-line bg-paper p-5 shadow-paper">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-foreground">Pick a scenario</h3>
          <span className="font-mono text-[11px] text-stone-400">
            {playing ? `playing · step ${Math.min(stepIdx + 1, scenario.steps.length)}/${scenario.steps.length}` : finished && events.length ? "done" : "ready"}
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {SCENARIOS.map((s) => {
            const active = s.id === scenarioId;
            return (
              <button
                key={s.id}
                disabled={playing}
                onClick={() => prime(s.id)}
                className={`cursor-pointer rounded-xl border p-3 text-left transition-colors disabled:cursor-default disabled:opacity-50 ${
                  active ? "border-amber-500/60 bg-amber-500/10" : "border-line bg-paper-sunk hover:border-line-strong"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{s.icon}</span>
                  <span className={`font-display text-[13px] font-bold ${active ? "text-amber-800" : "text-stone-800"}`}>{s.title}</span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-stone-500">{s.blurb}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={play}
            disabled={playing}
            className="flex cursor-pointer items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-60"
          >
            {playing ? (
              <>
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-white" />
                Playing…
              </>
            ) : finished && events.length ? (
              <>↺ Replay</>
            ) : (
              <>▶ Play</>
            )}
          </button>
          <button
            onClick={() => prime(scenarioId)}
            disabled={playing}
            className="cursor-pointer rounded-lg border border-line px-3 py-2 text-[13px] font-medium text-stone-700 transition-colors hover:bg-paper-sunk disabled:opacity-50"
          >
            ↺ Reset
          </button>
        </div>
      </section>

      {/* ── The prefix ── */}
      <section className="rounded-2xl border border-line bg-paper p-5 shadow-paper">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-foreground">The cached prefix</h3>
          <span className="font-mono text-[11px] text-stone-400">render order: tools → system → messages</span>
        </div>

        <div className="relative flex h-16 w-full overflow-hidden rounded-xl border border-line">
          {TIER_META.map(({ key, label }) => {
            const w = warm[key];
            return (
              <div
                key={key + toolsRev}
                className="relative flex flex-col items-center justify-center border-r border-line last:border-r-0"
                style={{
                  flexGrow: sizes[key],
                  flexBasis: 0,
                  background: w ? `linear-gradient(180deg, ${GREEN}26, ${GREEN}10)` : "rgba(192,57,43,0.07)",
                }}
                title={`${label}: ${fmtTok(sizes[key])} tokens — ${w ? "warm (cache read 0.1×)" : "cold (reprocess + write)"}`}
              >
                {w && (
                  <motion.span
                    className="pointer-events-none absolute inset-0"
                    animate={{ opacity: [0.2, 0.45, 0.2] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                    style={{ background: `linear-gradient(180deg, ${GREEN}1c, transparent)` }}
                  />
                )}
                <span className="relative z-10 font-mono text-[12px] font-semibold" style={{ color: w ? "#3f6212" : "#a13a2c" }}>
                  {label}
                </span>
                <span className="relative z-10 font-mono text-[10px] text-stone-400">{fmtTok(sizes[key])}</span>
                <AnimatePresence>
                  {flash && flash.tiers.includes(key) && (
                    <motion.span
                      key={flash.id}
                      className="pointer-events-none absolute inset-0"
                      initial={{ opacity: 0.6 }}
                      animate={{ opacity: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.7, ease: "easeOut" }}
                      onAnimationComplete={() => setFlash(null)}
                      style={{ background: RED }}
                    />
                  )}
                </AnimatePresence>
              </div>
            );
          })}
          <div className="absolute right-0 top-0 flex h-full items-center">
            <div className="h-full w-[3px]" style={{ background: anyWarm ? GREEN : "#d6cfc2" }} />
          </div>
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[10px] text-stone-400">
          <span>position 0</span>
          <span>{fmtTok(prefix)} tokens · cache_control breakpoint ▸</span>
        </div>

        <div className="mt-3 flex items-center gap-2 text-[11px]">
          <span className={`rounded px-2 py-0.5 font-bold uppercase tracking-wider ${anyWarm && !expired ? "bg-[#eaf3da] text-[#3f6212]" : "bg-[#fbe3da] text-[#9a3412]"}`}>
            {anyWarm && !expired ? "warm" : "cold"}
          </span>
          <span className="font-mono text-stone-500">model {model}</span>
          <span className="font-mono text-stone-400">· tools rev {toolsRev}</span>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        {/* ── Event log (the star) ── */}
        <section className="rounded-2xl border border-line bg-paper p-5 shadow-paper">
          <h3 className="mb-3 font-display text-sm font-bold text-foreground">What&apos;s happening</h3>
          <Timeline segs={segs} stepIdx={stepIdx} playing={playing} started={events.length > 0 || playing} totalSec={totalSec} />
          {events.length === 0 ? (
            <div className="flex h-44 flex-col items-center justify-center gap-1 text-center">
              <span className="text-2xl opacity-70">{scenario.icon}</span>
              <p className="text-[13px] text-stone-500">{scenario.title}</p>
              <p className="max-w-xs text-[11px] text-stone-400">Press ▶ Play and the steps will narrate here as they happen.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {events.map((e, i) => {
                  const isLast = i === events.length - 1;
                  const c = toneColor(e.tone);
                  return (
                    <motion.div
                      key={e.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: isLast ? 1 : 0.7, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="flex gap-3 rounded-xl border bg-paper-sunk px-3.5 py-2.5"
                      style={{ borderColor: isLast ? `${c}66` : LINE }}
                    >
                      <span className="mt-0.5 inline-block h-2 w-2 flex-shrink-0 rounded-full" style={{ background: c, boxShadow: isLast ? `0 0 7px ${c}99` : "none" }} />
                      <div className="min-w-0">
                        <p className="font-display text-[13px] font-bold" style={{ color: c }}>
                          {e.head}
                        </p>
                        <p className="mt-0.5 text-[12px] leading-snug text-stone-600">{e.note}</p>
                        <p className="mt-1 font-mono text-[11px] text-stone-500">{e.metric}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </section>

        {/* ── TTL + totals ── */}
        <section className="flex flex-col gap-4">
          <div className="rounded-2xl border border-line bg-paper p-5 shadow-paper">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
                TTL clock
                {playing && (
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-[#3f6212]">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: GREEN }} />
                    live
                  </span>
                )}
              </h3>
              <span className="font-mono text-[11px] text-stone-400">5m TTL</span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-display text-3xl font-bold tabular-nums" style={{ color: ttlColor }}>
                {cache && !expired ? mmss(remaining) : "—"}
              </span>
              <span className="text-[11px] text-stone-400">{cache && !expired ? "until cold" : "no warm cache"}</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
              <motion.div
                className="h-full rounded-full"
                animate={{ width: `${cache && !expired ? (remaining / cache.ttl) * 100 : 0}%` }}
                transition={{ ease: "linear", duration: 0.4 }}
                style={{ background: ttlColor }}
              />
            </div>
            <p className="mt-2 font-mono text-[10px] text-stone-400">session clock +{mmss(clock)} · write {writeMult}×</p>
          </div>

          <div className="rounded-2xl border border-line bg-paper p-5 shadow-paper">
            <h3 className="mb-2 font-display text-sm font-bold text-foreground">Ledger</h3>
            <div className="flex justify-between font-mono text-[12px]">
              <span className="text-stone-500">spent</span>
              <span className="text-stone-800">{fmtMoney(spent)}</span>
            </div>
            <div className="flex justify-between font-mono text-[12px]">
              <span className="text-stone-500">saved vs no-cache</span>
              <span style={{ color: saved >= 0 ? GREEN : RED }}>{fmtMoney(saved)}</span>
            </div>
            <div className="flex justify-between font-mono text-[12px]">
              <span className="text-stone-500">turns</span>
              <span className="text-stone-600">{turnNo}</span>
            </div>
          </div>
        </section>
      </div>

      <p className="text-center font-mono text-[10px] leading-relaxed text-stone-400">
        faithful model · {model === "claude-opus-4-8" ? "Opus 4.8 $5/1M input" : "Sonnet 4.6 $3/1M input"} · read 0.1× · write 1.25× (5m TTL) ·
        editing system keeps tools warm; changing tools or model goes fully cold
      </p>
    </div>
  );
}

function Timeline({
  segs,
  stepIdx,
  playing,
  started,
  totalSec,
}: {
  segs: Seg[];
  stepIdx: number;
  playing: boolean;
  started: boolean;
  totalSec: number;
}) {
  const total = segs.reduce((s, x) => s + x.weight, 0) || 1;
  let cum = 0;
  const cums = segs.map((s) => {
    cum += s.weight;
    return cum;
  });
  // Where the playhead should be: the trailing edge of the step currently playing.
  const playPct = !started ? 0 : !playing ? 100 : ((cums[Math.min(stepIdx, segs.length - 1)] ?? total) / total) * 100;
  // Match the sweep duration to the current step's dwell so it glides across that segment.
  const curKind = playing ? segs[Math.min(stepIdx, segs.length - 1)]?.kind : null;
  const sweepDur = curKind === "wait" ? 2.1 : curKind === "send" ? 1.6 : curKind === "inv" ? 1.8 : 0.5;

  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] text-stone-400">
        <span>timeline — time flows left → right</span>
        <span>{mmss(totalSec)} of conversation</span>
      </div>
      <div className="relative flex h-12 gap-1">
        {playing && (
          <motion.div
            className="pointer-events-none absolute -top-1 bottom-2 z-20 w-[2px]"
            style={{ background: INK, boxShadow: "0 0 8px 1px rgba(217,119,6,0.5)" }}
            animate={{ left: `${playPct}%` }}
            transition={{ ease: "linear", duration: sweepDur }}
          >
            <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full" style={{ background: "#d97706", boxShadow: "0 0 7px 2px rgba(217,119,6,0.6)" }} />
          </motion.div>
        )}
        {segs.map((seg) => {
          const done = started && seg.i < stepIdx;
          const current = playing && seg.i === stepIdx;
          const op = current ? 1 : done ? 0.95 : started ? 0.45 : 0.65;
          const c = toneColor(seg.tone);
          return (
            <div key={seg.i} className="relative flex min-w-0 flex-col transition-opacity" style={{ flexGrow: seg.weight, flexBasis: 0, opacity: op }}>
              <span className="truncate px-0.5 font-mono text-[9px]" style={{ color: seg.kind === "send" ? c : "#a8a29e" }}>
                {seg.label}
              </span>
              <div
                className="relative mt-0.5 flex-1 overflow-hidden rounded border"
                style={{ borderColor: current ? `${c}aa` : LINE, boxShadow: current ? `0 0 9px ${c}55` : "none" }}
              >
                {seg.kind === "wait" ? (
                  <div className="flex h-full w-full">
                    <div style={{ flexGrow: Math.max(seg.warmFrac, 0.001), background: `${GREEN}59` }} />
                    <div style={{ flexGrow: Math.max(1 - seg.warmFrac, 0.001), background: seg.warmFrac > 0 ? `${RED}59` : "rgba(168,162,158,0.3)" }} />
                  </div>
                ) : seg.kind === "send" ? (
                  <div className="h-full w-full" style={{ background: `${c}3d` }} />
                ) : (
                  <div className="flex h-full w-full items-center justify-center" style={{ background: `${RED}40`, color: "#9a3412" }}>
                    <span className="text-[10px]">✕</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-lime-600"
          animate={{ width: `${playPct}%` }}
          transition={{ ease: "linear", duration: playing ? sweepDur : 0.4 }}
        />
      </div>
    </div>
  );
}
