import { describe, it, expect } from "vitest";
import { turnCost, CACHE } from "./cache-model";

const sizes = { tools: 3000, system: 12000, messages: 185000, turn: 4500 };
const W5 = CACHE.WRITE_5M;

describe("turnCost", () => {
  it("a full cache miss reprocesses the whole prefix at the write rate (~$1.25 on 200k)", () => {
    const r = turnCost({
      warm: { tools: false, system: false, messages: false },
      sizes,
      writeMult: W5,
    });
    expect(r.kind).toBe("miss");
    expect(r.readTok).toBe(0);
    expect(r.coldTok).toBe(200000);
    // (200000 + 4500) * 1.25 * 5 / 1e6 ≈ 1.278
    expect(r.dollars).toBeCloseTo(1.278, 2);
  });

  it("a full warm hit reads the prefix at 0.1× (~$0.10 + a small write for the new turn)", () => {
    const r = turnCost({
      warm: { tools: true, system: true, messages: true },
      sizes,
      writeMult: W5,
    });
    expect(r.kind).toBe("hit");
    expect(r.coldTok).toBe(0);
    expect(r.readTok).toBe(200000);
    // 200000*0.1*5/1e6 = 0.10 read; + 4500*1.25*5/1e6 ≈ 0.028 write
    expect(r.dollars).toBeCloseTo(0.128, 2);
  });

  it("warming reads are ~10× cheaper than a cold miss for the same prefix", () => {
    const hit = turnCost({ warm: { tools: true, system: true, messages: true }, sizes, writeMult: W5 });
    const miss = turnCost({ warm: { tools: false, system: false, messages: false }, sizes, writeMult: W5 });
    expect(miss.dollars / hit.dollars).toBeGreaterThan(8);
  });

  it("editing the system prompt leaves tools warm but reprocesses system+messages (partial)", () => {
    const r = turnCost({
      warm: { tools: true, system: false, messages: false },
      sizes,
      writeMult: W5,
    });
    expect(r.kind).toBe("partial");
    expect(r.readTok).toBe(3000); // tools survived
    expect(r.coldTok).toBe(197000); // system + messages reprocessed
  });

  it("the 1-hour TTL costs more to write than the 5-minute TTL", () => {
    const warm = { tools: false, system: false, messages: false };
    const cheap = turnCost({ warm, sizes, writeMult: CACHE.WRITE_5M });
    const pricey = turnCost({ warm, sizes, writeMult: CACHE.WRITE_1H });
    expect(pricey.dollars).toBeGreaterThan(cheap.dollars);
  });

  it("caching beats no-cache once the prefix is warm", () => {
    const hit = turnCost({ warm: { tools: true, system: true, messages: true }, sizes, writeMult: W5 });
    expect(hit.dollars).toBeLessThan(hit.noCacheDollars);
  });
});
