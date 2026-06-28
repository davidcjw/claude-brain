import { describe, it, expect } from "vitest";
import { buildCatalog, projectSlug, TIERS } from "./catalog";

const HOME = "/home/u";
const PROJ = "/home/u/code/app";

describe("buildCatalog", () => {
  it("assigns a contiguous read order starting at 1", () => {
    const entries = buildCatalog(HOME, PROJ);
    const orders = entries.map((e) => e.order);
    expect(orders).toEqual(entries.map((_, i) => i + 1));
  });

  it("reads every startup file before any on-demand file", () => {
    const entries = buildCatalog(HOME, PROJ);
    const lastStartup = Math.max(
      ...entries.filter((e) => e.loadType === "startup").map((e) => e.order)
    );
    const firstOnDemand = Math.min(
      ...entries.filter((e) => e.loadType === "on-demand").map((e) => e.order)
    );
    expect(lastStartup).toBeLessThan(firstOnDemand);
  });

  it("omits project-scoped entries when no project is given", () => {
    const entries = buildCatalog(HOME, null);
    expect(entries.every((e) => e.scope === "global")).toBe(true);
    // order stays contiguous even with fewer entries
    expect(entries.map((e) => e.order)).toEqual(entries.map((_, i) => i + 1));
  });

  it("reads global instructions first (CLAUDE.md at order 1)", () => {
    const entries = buildCatalog(HOME, PROJ);
    expect(entries[0].id).toBe("g-claude-md");
    expect(entries[0].order).toBe(1);
  });

  it("resolves the global CLAUDE.md under ~/.claude", () => {
    const entries = buildCatalog(HOME, null);
    const g = entries.find((e) => e.id === "g-claude-md")!;
    expect(g.path).toBe("/home/u/.claude/CLAUDE.md");
  });

  it("places the home-level MCP store at ~/.claude.json (not inside .claude/)", () => {
    const entries = buildCatalog(HOME, null);
    const mcp = entries.find((e) => e.id === "g-dotclaude-json")!;
    expect(mcp.path).toBe("/home/u/.claude.json");
  });

  it("classifies mechanism: instructions/memory/rules = prompt", () => {
    const e = buildCatalog(HOME, PROJ);
    const byId = (id: string) => e.find((x) => x.id === id)!;
    expect(byId("g-claude-md").mechanism).toBe("prompt");
    expect(byId("g-memory-index").mechanism).toBe("prompt");
    expect(byId("g-rules").mechanism).toBe("prompt");
    expect(byId("p-agents-md").mechanism).toBe("prompt");
    expect(byId("p-memory-index").mechanism).toBe("prompt");
    expect(byId("p-memory-dir").mechanism).toBe("prompt");
  });

  it("derives the project slug by replacing every non-alphanumeric char with a dash", () => {
    expect(projectSlug("/home/u/code/app")).toBe("-home-u-code-app");
    // the "." is also replaced, and dashes are not collapsed
    expect(projectSlug("/Users/x/.claude")).toBe("-Users-x--claude");
  });

  it("resolves per-project memory under ~/.claude/projects/<slug>/memory", () => {
    const e = buildCatalog(HOME, PROJ);
    const idx = e.find((x) => x.id === "p-memory-index")!;
    expect(idx.path).toBe("/home/u/.claude/projects/-home-u-code-app/memory/MEMORY.md");
    const dir = e.find((x) => x.id === "p-memory-dir")!;
    expect(dir.path).toBe("/home/u/.claude/projects/-home-u-code-app/memory");
  });

  it("omits per-project memory when no project is given", () => {
    const e = buildCatalog(HOME, null);
    expect(e.find((x) => x.id === "p-memory-index")).toBeUndefined();
    expect(e.find((x) => x.id === "p-memory-dir")).toBeUndefined();
  });

  it("classifies mechanism: settings/keybindings/MCP = harness", () => {
    const e = buildCatalog(HOME, PROJ);
    const byId = (id: string) => e.find((x) => x.id === id)!;
    expect(byId("g-settings").mechanism).toBe("harness");
    expect(byId("g-keybindings").mechanism).toBe("harness");
    expect(byId("g-dotclaude-json").mechanism).toBe("harness");
    expect(byId("p-mcp").mechanism).toBe("harness");
  });

  it("classifies mechanism: commands/agents/skills/hooks = invoke", () => {
    const e = buildCatalog(HOME, PROJ);
    const onDemand = e.filter((x) => x.loadType === "on-demand");
    expect(onDemand.length).toBeGreaterThan(0);
    expect(onDemand.every((x) => x.mechanism === "invoke")).toBe(true);
  });

  it("only references tiers that exist in the TIERS registry", () => {
    const names = new Set(TIERS.map((t) => t.name));
    for (const e of buildCatalog(HOME, PROJ)) {
      expect(names.has(e.tier)).toBe(true);
    }
  });
});
