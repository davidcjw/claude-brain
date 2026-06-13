// The canonical map of files & directories Claude Code looks for, ordered by
// the sequence they are read into context. Each entry is resolved against
// either the home dir (global scope) or a project dir (project scope).
// This is the single source of truth the scanner walks and the UI renders.

export type Scope = "global" | "project";
export type EntryType = "file" | "dir";
export type Importance = "core" | "optional";
export type LoadType = "startup" | "on-demand";
// How a file is actually used — the honest axis, orthogonal to scope/location:
//   prompt  — injected into the context as text (you "read" it)
//   harness — read by the harness to configure the session, not prompt text
//   invoke  — discovered now, but content only loads when the thing is used
export type Mechanism = "prompt" | "harness" | "invoke";

export type CatalogEntry = {
  id: string;
  label: string;
  scope: Scope;
  category: string;
  /** Stratum this node belongs to (see TIERS). */
  tier: string;
  /** Read sequence — assigned by buildCatalog after scope filtering. */
  order: number;
  /** Loaded at session start, or pulled in only when invoked. */
  loadType: LoadType;
  /** How the file is consumed (see Mechanism / MECHANISMS). */
  mechanism: Mechanism;
  /** Absolute path on disk. */
  path: string;
  type: EntryType;
  importance: Importance;
  description: string;
  /** For dirs: only children matching this extension count as "content". */
  contentExt?: string;
};

// Display metadata for each mechanism: the verb shown while it "fires", the
// short pill label on each node, an accent, and a one-line explanation.
export const MECHANISMS: Record<
  Mechanism,
  { label: string; verb: string; accent: string; blurb: string }
> = {
  prompt: {
    label: "in context",
    verb: "Reading into context",
    accent: "#38bdf8",
    blurb: "Injected into the prompt as text",
  },
  harness: {
    label: "harness",
    verb: "Configuring harness",
    accent: "#fbbf24",
    blurb: "Configures the harness — permissions, hooks, env, MCP (not prompt text)",
  },
  invoke: {
    label: "on invoke",
    verb: "Registering",
    accent: "#94a3b8",
    blurb: "Discovered now; content loads only when used",
  },
};

// Config tiers configure the harness rather than entering the prompt.
const HARNESS_TIERS = new Set(["Global Config", "Project Config"]);

function mechanismFor(e: { tier: string; loadType: LoadType }): Mechanism {
  if (e.loadType === "on-demand") return "invoke";
  return HARNESS_TIERS.has(e.tier) ? "harness" : "prompt";
}

// Strata in load order, top → bottom. Accents flow violet → teal → slate,
// tracing global → project → on-demand as context streams in.
export const TIERS: {
  name: string;
  scope: Scope | "mixed";
  loadType: LoadType;
  accent: string;
  blurb: string;
}[] = [
  { name: "Global Instructions", scope: "global", loadType: "startup", accent: "#a78bfa", blurb: "Your standing orders, every session" },
  { name: "Global Memory", scope: "global", loadType: "startup", accent: "#818cf8", blurb: "Persisted facts recalled into context" },
  { name: "Global Config", scope: "global", loadType: "startup", accent: "#60a5fa", blurb: "Harness behaviour & MCP registry" },
  { name: "Project Instructions", scope: "project", loadType: "startup", accent: "#22d3ee", blurb: "This repo's rules & guidance" },
  { name: "Project Config", scope: "project", loadType: "startup", accent: "#2dd4bf", blurb: "Repo-scoped settings & MCP" },
  { name: "On-Demand", scope: "mixed", loadType: "on-demand", accent: "#64748b", blurb: "Loaded only when invoked" },
];

function join(...parts: string[]): string {
  return parts.join("/").replace(/\/+/g, "/");
}

type RawEntry = Omit<CatalogEntry, "order" | "mechanism">;

/**
 * Build the full catalog for a given home dir and (optional) project dir,
 * assigning a contiguous read `order` across whatever scopes are present.
 */
export function buildCatalog(home: string, project: string | null): CatalogEntry[] {
  const dotClaude = join(home, ".claude");
  const raw: RawEntry[] = [
    // ── Global Instructions ──
    {
      id: "g-claude-md",
      label: "CLAUDE.md",
      scope: "global",
      category: "Instructions",
      tier: "Global Instructions",
      loadType: "startup",
      path: join(dotClaude, "CLAUDE.md"),
      type: "file",
      importance: "core",
      description: "Global instructions injected into every session, across all projects.",
    },
    {
      id: "g-rules",
      label: "rules/",
      scope: "global",
      category: "Rules",
      tier: "Global Instructions",
      loadType: "startup",
      path: join(dotClaude, "rules"),
      type: "dir",
      importance: "optional",
      contentExt: ".md",
      description: "Reusable rule files applied to all projects.",
    },

    // ── Global Memory ──
    {
      id: "g-memory-index",
      label: "memory/MEMORY.md",
      scope: "global",
      category: "Memory",
      tier: "Global Memory",
      loadType: "startup",
      path: join(dotClaude, "memory", "MEMORY.md"),
      type: "file",
      importance: "core",
      description: "Auto-memory index loaded into context each session.",
    },
    {
      id: "g-memory-dir",
      label: "memory/",
      scope: "global",
      category: "Memory",
      tier: "Global Memory",
      loadType: "startup",
      path: join(dotClaude, "memory"),
      type: "dir",
      importance: "optional",
      contentExt: ".md",
      description: "Individual persisted memory facts (one per file).",
    },

    // ── Global Config ──
    {
      id: "g-settings",
      label: "settings.json",
      scope: "global",
      category: "Settings",
      tier: "Global Config",
      loadType: "startup",
      path: join(dotClaude, "settings.json"),
      type: "file",
      importance: "core",
      description: "Global harness config: permissions, env, hooks, model.",
    },
    {
      id: "g-settings-local",
      label: "settings.local.json",
      scope: "global",
      category: "Settings",
      tier: "Global Config",
      loadType: "startup",
      path: join(dotClaude, "settings.local.json"),
      type: "file",
      importance: "optional",
      description: "Local-only global overrides (not committed).",
    },
    {
      id: "g-keybindings",
      label: "keybindings.json",
      scope: "global",
      category: "Settings",
      tier: "Global Config",
      loadType: "startup",
      path: join(dotClaude, "keybindings.json"),
      type: "file",
      importance: "optional",
      description: "Custom keyboard shortcut overrides.",
    },
    {
      id: "g-dotclaude-json",
      label: "~/.claude.json",
      scope: "global",
      category: "MCP",
      tier: "Global Config",
      loadType: "startup",
      path: join(home, ".claude.json"),
      type: "file",
      importance: "core",
      description: "Home-level config store: globally registered MCP servers & auth.",
    },
  ];

  if (project) {
    const projClaude = join(project, ".claude");
    raw.push(
      // ── Project Instructions ──
      {
        id: "p-claude-md",
        label: "CLAUDE.md",
        scope: "project",
        category: "Instructions",
        tier: "Project Instructions",
        loadType: "startup",
        path: join(project, "CLAUDE.md"),
        type: "file",
        importance: "core",
        description: "Project instructions for this repo (may @import AGENTS.md).",
      },
      {
        id: "p-agents-md",
        label: "AGENTS.md",
        scope: "project",
        category: "Instructions",
        tier: "Project Instructions",
        loadType: "startup",
        path: join(project, "AGENTS.md"),
        type: "file",
        importance: "optional",
        description: "Cross-tool agent instructions (open AGENTS.md standard).",
      },
      {
        id: "p-claude-local",
        label: "CLAUDE.local.md",
        scope: "project",
        category: "Instructions",
        tier: "Project Instructions",
        loadType: "startup",
        path: join(project, "CLAUDE.local.md"),
        type: "file",
        importance: "optional",
        description: "Local-only project instructions (not committed).",
      },
      {
        id: "p-rules",
        label: ".claude/rules/",
        scope: "project",
        category: "Rules",
        tier: "Project Instructions",
        loadType: "startup",
        path: join(projClaude, "rules"),
        type: "dir",
        importance: "optional",
        contentExt: ".md",
        description: "Project-specific rule files.",
      },
      // ── Project Config ──
      {
        id: "p-settings",
        label: ".claude/settings.json",
        scope: "project",
        category: "Settings",
        tier: "Project Config",
        loadType: "startup",
        path: join(projClaude, "settings.json"),
        type: "file",
        importance: "core",
        description: "Project harness config (shared, committed).",
      },
      {
        id: "p-settings-local",
        label: ".claude/settings.local.json",
        scope: "project",
        category: "Settings",
        tier: "Project Config",
        loadType: "startup",
        path: join(projClaude, "settings.local.json"),
        type: "file",
        importance: "optional",
        description: "Local-only project overrides (gitignored).",
      },
      {
        id: "p-mcp",
        label: ".mcp.json",
        scope: "project",
        category: "MCP",
        tier: "Project Config",
        loadType: "startup",
        path: join(project, ".mcp.json"),
        type: "file",
        importance: "optional",
        description: "Project-scoped MCP server definitions.",
      },
    );
  }

  // ── On-Demand (always last; loaded only when invoked) ──
  raw.push(
    {
      id: "g-commands",
      label: "commands/",
      scope: "global",
      category: "Commands",
      tier: "On-Demand",
      loadType: "on-demand",
      path: join(dotClaude, "commands"),
      type: "dir",
      importance: "optional",
      contentExt: ".md",
      description: "Global slash commands.",
    },
    {
      id: "g-agents",
      label: "agents/",
      scope: "global",
      category: "Subagents",
      tier: "On-Demand",
      loadType: "on-demand",
      path: join(dotClaude, "agents"),
      type: "dir",
      importance: "optional",
      contentExt: ".md",
      description: "Global custom subagent definitions.",
    },
    {
      id: "g-skills",
      label: "skills/",
      scope: "global",
      category: "Skills",
      tier: "On-Demand",
      loadType: "on-demand",
      path: join(dotClaude, "skills"),
      type: "dir",
      importance: "optional",
      description: "Global agent skills.",
    },
    {
      id: "g-hooks",
      label: "hooks/",
      scope: "global",
      category: "Hooks",
      tier: "On-Demand",
      loadType: "on-demand",
      path: join(dotClaude, "hooks"),
      type: "dir",
      importance: "optional",
      description: "Global hook scripts referenced by settings.json.",
    },
  );

  if (project) {
    const projClaude = join(project, ".claude");
    raw.push(
      {
        id: "p-commands",
        label: ".claude/commands/",
        scope: "project",
        category: "Commands",
        tier: "On-Demand",
        loadType: "on-demand",
        path: join(projClaude, "commands"),
        type: "dir",
        importance: "optional",
        contentExt: ".md",
        description: "Project slash commands.",
      },
      {
        id: "p-agents",
        label: ".claude/agents/",
        scope: "project",
        category: "Subagents",
        tier: "On-Demand",
        loadType: "on-demand",
        path: join(projClaude, "agents"),
        type: "dir",
        importance: "optional",
        contentExt: ".md",
        description: "Project subagent definitions.",
      },
      {
        id: "p-skills",
        label: ".claude/skills/",
        scope: "project",
        category: "Skills",
        tier: "On-Demand",
        loadType: "on-demand",
        path: join(projClaude, "skills"),
        type: "dir",
        importance: "optional",
        description: "Project agent skills.",
      },
      {
        id: "p-hooks",
        label: ".claude/hooks/",
        scope: "project",
        category: "Hooks",
        tier: "On-Demand",
        loadType: "on-demand",
        path: join(projClaude, "hooks"),
        type: "dir",
        importance: "optional",
        description: "Project hook scripts.",
      },
    );
  }

  return raw.map((e, i) => ({ ...e, order: i + 1, mechanism: mechanismFor(e) }));
}
