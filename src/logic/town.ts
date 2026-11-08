/**
 * The math behind Swing Town.
 *
 * The town is a grid of blocks. Every block has exactly 100 voters, and each
 * block is described by one whole number: how many of its 100 voters vote
 * orange (the rest vote purple). Every district is made of the same number of
 * blocks, so every district has the same number of voters.
 *
 * Uniform swing. A swing of `s` points (a whole number; positive means toward
 * orange, negative means toward purple) moves `s` voters out of every 100 in
 * every block from purple to orange (or the other way when `s` is negative).
 * So a block's orange count becomes `orange + s`, clamped to 0..100 because a
 * block can't have fewer than 0 or more than 100 orange voters.
 *
 * When no block hits the clamp, every district's orange share moves by exactly
 * `s` percentage points too, because a district is just its blocks added up.
 *
 * Who wins a district: the color with more votes. Exactly half and half is a
 * tie, and a tied district counts for neither color. All counting is done in
 * whole voters, so a tie is detected exactly (no rounding).
 */

export type Color = "orange" | "purple";
export type Winner = Color | "tie";

export interface Town {
  rows: number;
  cols: number;
  /** Orange voters (0..100) in each block, row by row. */
  orange: readonly number[];
  /** How many districts a map must have. */
  districts: number;
}

/** District number (0-based) for each block, row by row; null = not drawn yet. */
export type DistrictMap = readonly (number | null)[];

export const VOTERS_PER_BLOCK = 100;
export const MAX_SWING = 10;

export function blockCount(town: Town): number {
  return town.rows * town.cols;
}

/** Blocks in each district: the town split into equal parts. */
export function districtSize(town: Town): number {
  return blockCount(town) / town.districts;
}

export function seatsForMajority(town: Town): number {
  return Math.floor(town.districts / 2) + 1;
}

/** Orange voters in one block after a uniform swing of `swing` points toward orange. */
export function swingBlock(orange: number, swing: number): number {
  return Math.min(VOTERS_PER_BLOCK, Math.max(0, orange + swing));
}

export function winnerOf(orangeVotes: number, totalVotes: number): Winner {
  const purpleVotes = totalVotes - orangeVotes;
  if (orangeVotes > purpleVotes) return "orange";
  if (purpleVotes > orangeVotes) return "purple";
  return "tie";
}

export interface DistrictResult {
  district: number;
  blocks: number;
  orangeVotes: number;
  totalVotes: number;
  /** Orange share as a percentage, 0..100. */
  orangeShare: number;
  winner: Winner;
}

/**
 * Votes and winner for each district (0..districts-1) under `swing`.
 * Blocks not in a district are ignored; an empty district has no winner (tie).
 */
export function districtResults(town: Town, map: DistrictMap, swing = 0): DistrictResult[] {
  const results: DistrictResult[] = [];
  for (let d = 0; d < town.districts; d++) {
    results.push({ district: d, blocks: 0, orangeVotes: 0, totalVotes: 0, orangeShare: 0, winner: "tie" });
  }
  map.forEach((d, i) => {
    if (d === null || d < 0 || d >= town.districts) return;
    const r = results[d];
    r.blocks += 1;
    r.orangeVotes += swingBlock(town.orange[i], swing);
    r.totalVotes += VOTERS_PER_BLOCK;
  });
  for (const r of results) {
    r.orangeShare = r.totalVotes ? (100 * r.orangeVotes) / r.totalVotes : 0;
    r.winner = r.totalVotes ? winnerOf(r.orangeVotes, r.totalVotes) : "tie";
  }
  return results;
}

export interface Seats {
  orange: number;
  purple: number;
  tie: number;
}

export function seats(town: Town, map: DistrictMap, swing = 0): Seats {
  const s: Seats = { orange: 0, purple: 0, tie: 0 };
  for (const r of districtResults(town, map, swing)) s[r.winner] += 1;
  return s;
}

export interface CurvePoint extends Seats {
  swing: number;
}

/** Seats at every whole-number swing from -max to +max. */
export function seatCurve(town: Town, map: DistrictMap, max = MAX_SWING): CurvePoint[] {
  const out: CurvePoint[] = [];
  for (let s = -max; s <= max; s++) out.push({ swing: s, ...seats(town, map, s) });
  return out;
}

/** Orange share of the whole town after a swing, as a percentage. */
export function townShare(town: Town, swing = 0): number {
  const total = town.orange.reduce((sum, v) => sum + swingBlock(v, swing), 0);
  return (100 * total) / (blockCount(town) * VOTERS_PER_BLOCK);
}

/**
 * The smallest swing toward purple (a positive number of points, up to `max`)
 * at which orange no longer holds a majority of seats. Returns 0 if orange has
 * no majority to begin with, and null if orange keeps it through `max` points.
 */
export function pointsToLoseMajority(town: Town, map: DistrictMap, color: Color = "orange", max = MAX_SWING): number | null {
  const need = seatsForMajority(town);
  for (let p = 0; p <= max; p++) {
    const swing = color === "orange" ? -p : p;
    if (seats(town, map, swing)[color] < need) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Checking a map: every block drawn, equal sizes, each district in one piece.

export type Problem =
  | { kind: "undrawn"; count: number }
  | { kind: "size"; district: number; blocks: number; need: number }
  | { kind: "split"; district: number; pieces: number };

export interface MapCheck {
  ok: boolean;
  problems: Problem[];
}

/** Neighbours that share a side (corners don't count). */
export function neighbours(town: Town, i: number): number[] {
  const r = Math.floor(i / town.cols);
  const c = i % town.cols;
  const out: number[] = [];
  if (r > 0) out.push(i - town.cols);
  if (r < town.rows - 1) out.push(i + town.cols);
  if (c > 0) out.push(i - 1);
  if (c < town.cols - 1) out.push(i + 1);
  return out;
}

/** How many separate pieces district `d` is in (0 if it has no blocks). */
export function pieces(town: Town, map: DistrictMap, d: number): number {
  const seen = new Set<number>();
  let count = 0;
  map.forEach((di, start) => {
    if (di !== d || seen.has(start)) return;
    count += 1;
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const i = stack.pop()!;
      for (const n of neighbours(town, i)) {
        if (map[n] === d && !seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
  });
  return count;
}

export function checkMap(town: Town, map: DistrictMap): MapCheck {
  const problems: Problem[] = [];
  const need = districtSize(town);
  const undrawn = map.filter((d) => d === null).length;
  if (undrawn > 0) problems.push({ kind: "undrawn", count: undrawn });
  for (let d = 0; d < town.districts; d++) {
    const blocks = map.filter((x) => x === d).length;
    if (blocks !== need) problems.push({ kind: "size", district: d, blocks, need });
    const p = pieces(town, map, d);
    if (p > 1) problems.push({ kind: "split", district: d, pieces: p });
  }
  return { ok: problems.length === 0, problems };
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** A plain sentence for each problem, saying what's wrong and how to fix it. */
export function describeProblem(p: Problem): string {
  switch (p.kind) {
    case "undrawn":
      return `${plural(p.count, "block isn't", "blocks aren't")} in a district yet. Paint every block.`;
    case "size":
      if (p.blocks === 0) return `District ${p.district + 1} has no blocks yet. It needs ${p.need}.`;
      return p.blocks > p.need
        ? `District ${p.district + 1} has ${p.blocks} blocks. It needs ${p.need}, so give ${plural(p.blocks - p.need, "block", "blocks")} to another district.`
        : `District ${p.district + 1} has ${plural(p.blocks, "block", "blocks")}. It needs ${p.need}, so add ${plural(p.need - p.blocks, "more block", "more blocks")}.`;
    case "split":
      return `District ${p.district + 1} is in ${p.pieces} pieces. Its blocks must join up side to side (corners don't count).`;
  }
}

/** Does this map meet the challenge: valid, and a majority for orange after a `points` swing toward purple? */
export function meetsChallenge(town: Town, map: DistrictMap, points = 5): boolean {
  if (!checkMap(town, map).ok) return false;
  return seats(town, map, -points).orange >= seatsForMajority(town);
}

/** Read a map from rows of digits ("112233"), 1-based district numbers, "." for undrawn. */
export function parseMap(rows: readonly string[]): (number | null)[] {
  const out: (number | null)[] = [];
  for (const row of rows) {
    for (const ch of row) out.push(ch === "." ? null : Number(ch) - 1);
  }
  return out;
}
