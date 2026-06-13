import { describe, it, expect } from "vitest";
import { checkAccess } from "./file-access";

const HOME = "/home/u";
const PROJ = "/home/u/code/app";

describe("checkAccess (write/read allowlist)", () => {
  it("allows a tracked global file", () => {
    expect(checkAccess(HOME, null, "/home/u/.claude/CLAUDE.md")).toEqual({
      allowed: true,
      kind: "file",
    });
  });

  it("allows a tracked directory entry", () => {
    expect(checkAccess(HOME, null, "/home/u/.claude/memory")).toEqual({
      allowed: true,
      kind: "dir",
    });
  });

  it("allows a non-catalog child file inside a tracked directory", () => {
    // rules/ is a tracked dir; an arbitrary file inside it is a "child".
    const a = checkAccess(HOME, null, "/home/u/.claude/rules/my-custom-rule.md");
    expect(a.allowed).toBe(true);
    if (a.allowed) expect(a.kind).toBe("child");
  });

  it("allows a tracked project file only when a project is set", () => {
    expect(checkAccess(HOME, PROJ, "/home/u/code/app/CLAUDE.md").allowed).toBe(true);
    expect(checkAccess(HOME, null, "/home/u/code/app/CLAUDE.md").allowed).toBe(false);
  });

  it("rejects arbitrary system files", () => {
    expect(checkAccess(HOME, PROJ, "/etc/passwd").allowed).toBe(false);
    expect(checkAccess(HOME, PROJ, "/home/u/.ssh/id_rsa").allowed).toBe(false);
  });

  it("rejects path traversal escaping a tracked directory", () => {
    expect(
      checkAccess(HOME, null, "/home/u/.claude/memory/../../.ssh/id_rsa").allowed
    ).toBe(false);
    expect(
      checkAccess(HOME, null, "/home/u/.claude/rules/../../../etc/hosts").allowed
    ).toBe(false);
  });

  it("rejects empty or non-string input", () => {
    expect(checkAccess(HOME, null, "").allowed).toBe(false);
    // @ts-expect-error testing runtime guard
    expect(checkAccess(HOME, null, null).allowed).toBe(false);
  });
});
