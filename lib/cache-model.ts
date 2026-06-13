// Faithful (teaching-scale) model of Anthropic prompt-cache economics.
// Numbers reflect the real API: Opus 4.8 input pricing, cache read/write
// multipliers, and the prefix-tier invalidation hierarchy.

export const CACHE = {
  /** Opus 4.8 input price, $ per million tokens. */
  BASE_PER_MTOK: 5,
  /** Cache read ≈ 0.1× base. */
  READ_MULT: 0.1,
  /** Cache write premium: 1.25× for the 5-min TTL, 2× for the 1-hour TTL. */
  WRITE_5M: 1.25,
  WRITE_1H: 2.0,
  /** TTLs in seconds: 5-min default, 1-hour max. */
  TTL_5M: 300,
  TTL_1H: 3600,
} as const;

export type Tier = "tools" | "system" | "messages";

export type Warm = Record<Tier, boolean>;
export type Sizes = { tools: number; system: number; messages: number; turn: number };

export type TurnKind = "hit" | "partial" | "miss";

export type TurnCost = {
  /** Tokens served warm from cache (billed at READ_MULT). */
  readTok: number;
  /** Tokens reprocessed cold this turn (billed at writeMult). */
  coldTok: number;
  /** New tokens appended + written this turn (billed at writeMult). */
  newTok: number;
  /** Actual dollar cost of this turn with caching. */
  dollars: number;
  /** Counterfactual: the same prefix at full price every turn, no caching. */
  noCacheDollars: number;
  kind: TurnKind;
};

/**
 * Cost of one turn given which prefix tiers are currently warm.
 * - warm tiers are read at READ_MULT
 * - cold tiers are reprocessed + rewritten at writeMult
 * - the new turn content is written at writeMult
 */
export function turnCost(opts: {
  warm: Warm;
  sizes: Sizes;
  writeMult: number;
  base?: number;
}): TurnCost {
  const { warm, sizes, writeMult } = opts;
  const base = opts.base ?? CACHE.BASE_PER_MTOK;

  const tierTokens: Record<Tier, number> = {
    tools: sizes.tools,
    system: sizes.system,
    messages: sizes.messages,
  };

  let readTok = 0;
  let coldTok = 0;
  (Object.keys(tierTokens) as Tier[]).forEach((t) => {
    if (warm[t]) readTok += tierTokens[t];
    else coldTok += tierTokens[t];
  });
  const newTok = sizes.turn;

  const units = readTok * CACHE.READ_MULT + coldTok * writeMult + newTok * writeMult;
  const dollars = (units * base) / 1_000_000;

  // No caching at all: full base price on the whole prefix + new content, every turn.
  const prefix = sizes.tools + sizes.system + sizes.messages;
  const noCacheDollars = ((prefix + newTok) * 1.0 * base) / 1_000_000;

  const kind: TurnKind = readTok === 0 ? "miss" : coldTok === 0 ? "hit" : "partial";

  return { readTok, coldTok, newTok, dollars, noCacheDollars, kind };
}
