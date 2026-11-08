import { describe, expect, it } from "vitest";
import {
  checkMap,
  describeProblem,
  districtResults,
  districtSize,
  meetsChallenge,
  neighbours,
  parseMap,
  pieces,
  pointsToLoseMajority,
  seatCurve,
  seats,
  seatsForMajority,
  swingBlock,
  townShare,
  winnerOf,
  type Town,
} from "./town";

// A tiny 2 x 4 town split into 2 districts of 4 blocks.
const tiny: Town = { rows: 2, cols: 4, districts: 2, orange: [60, 60, 40, 40, 56, 56, 30, 30] };
const halves = parseMap(["1122", "1122"]);

describe("uniform swing on a block", () => {
  it("moves the orange count by the swing", () => {
    expect(swingBlock(40, 3)).toBe(43);
    expect(swingBlock(40, -3)).toBe(37);
    expect(swingBlock(40, 0)).toBe(40);
  });
  it("can't go below 0 or above 100 voters", () => {
    expect(swingBlock(4, -10)).toBe(0);
    expect(swingBlock(95, 10)).toBe(100);
    expect(swingBlock(0, -1)).toBe(0);
    expect(swingBlock(100, 1)).toBe(100);
  });
});

describe("who wins", () => {
  it("is whoever has more votes, and exactly half is a tie", () => {
    expect(winnerOf(301, 600)).toBe("orange");
    expect(winnerOf(299, 600)).toBe("purple");
    expect(winnerOf(300, 600)).toBe("tie");
  });
});

describe("district results", () => {
  it("adds up blocks and works out each share", () => {
    const [a, b] = districtResults(tiny, halves);
    expect(a).toMatchObject({ blocks: 4, orangeVotes: 232, totalVotes: 400, orangeShare: 58, winner: "orange" });
    expect(b).toMatchObject({ blocks: 4, orangeVotes: 140, totalVotes: 400, orangeShare: 35, winner: "purple" });
  });

  it("moves every district's share by exactly the swing when no block hits 0 or 100", () => {
    for (const s of [-10, -3, 0, 4, 10]) {
      const r = districtResults(tiny, halves, s);
      expect(r[0].orangeShare).toBeCloseTo(58 + s, 10);
      expect(r[1].orangeShare).toBeCloseTo(35 + s, 10);
    }
  });

  it("finds an exact tie with whole-voter counting", () => {
    // district 1 is 58%: an 8-point swing toward purple makes it exactly 50%
    const r = districtResults(tiny, halves, -8);
    expect(r[0].orangeVotes).toBe(200);
    expect(r[0].winner).toBe("tie");
    expect(seats(tiny, halves, -8)).toEqual({ orange: 0, purple: 1, tie: 1 });
  });

  it("ignores undrawn blocks, and an empty district wins for nobody", () => {
    const partial = parseMap(["11..", "11.."]);
    const r = districtResults(tiny, partial);
    expect(r[0].blocks).toBe(4);
    expect(r[1]).toMatchObject({ blocks: 0, totalVotes: 0, winner: "tie" });
  });

  it("clamps at the block, not the district", () => {
    const edge: Town = { rows: 1, cols: 2, districts: 1, orange: [5, 60] };
    const r = districtResults(edge, [0, 0], -10);
    // 5 -> 0 (not -5), 60 -> 50
    expect(r[0].orangeVotes).toBe(50);
  });
});

describe("seats and the seats-vs-swing curve", () => {
  it("counts seats by winner", () => {
    expect(seats(tiny, halves)).toEqual({ orange: 1, purple: 1, tie: 0 });
    expect(seats(tiny, halves, 10)).toEqual({ orange: 1, purple: 1, tie: 0 });
  });

  it("has one point for every whole swing from -max to +max", () => {
    const curve = seatCurve(tiny, halves, 10);
    expect(curve).toHaveLength(21);
    expect(curve[0].swing).toBe(-10);
    expect(curve[20].swing).toBe(10);
    for (const p of curve) expect(p.orange + p.purple + p.tie).toBe(2);
  });

  it("never gives orange fewer seats as the swing moves toward orange", () => {
    const curve = seatCurve(tiny, halves, 30);
    for (let i = 1; i < curve.length; i++) expect(curve[i].orange).toBeGreaterThanOrEqual(curve[i - 1].orange);
  });

  it("works out the whole town's share", () => {
    expect(townShare(tiny)).toBeCloseTo(46.5, 10);
    expect(townShare(tiny, -2)).toBeCloseTo(44.5, 10);
  });

  it("finds the swing that costs orange its majority", () => {
    const three: Town = { rows: 1, cols: 3, districts: 3, orange: [52, 55, 30] };
    const map = [0, 1, 2];
    expect(seatsForMajority(three)).toBe(2);
    expect(pointsToLoseMajority(three, map)).toBe(2); // at 2 points, 52 -> 50 is a tie
    expect(pointsToLoseMajority(three, map, "purple")).toBe(0);
    const safe: Town = { rows: 1, cols: 3, districts: 3, orange: [70, 75, 30] };
    expect(pointsToLoseMajority(safe, map)).toBeNull();
  });

  it("needs more than half the seats for a majority", () => {
    expect(seatsForMajority({ ...tiny, districts: 6 })).toBe(4);
    expect(seatsForMajority({ ...tiny, districts: 5 })).toBe(3);
  });
});

describe("checking a map", () => {
  it("accepts equal, joined-up districts", () => {
    expect(districtSize(tiny)).toBe(4);
    expect(checkMap(tiny, halves)).toEqual({ ok: true, problems: [] });
    expect(checkMap(tiny, parseMap(["1111", "2222"])).ok).toBe(true);
  });

  it("only counts neighbours that share a side", () => {
    expect(neighbours(tiny, 0).sort()).toEqual([1, 4]);
    expect(neighbours(tiny, 5).sort((a, b) => a - b)).toEqual([1, 4, 6]);
  });

  it("reports undrawn blocks", () => {
    const check = checkMap(tiny, parseMap(["11.2", "1122"]));
    expect(check.ok).toBe(false);
    expect(check.problems).toContainEqual({ kind: "undrawn", count: 1 });
  });

  it("reports districts of the wrong size", () => {
    const check = checkMap(tiny, parseMap(["1112", "1122"]));
    expect(check.problems).toEqual([
      { kind: "size", district: 0, blocks: 5, need: 4 },
      { kind: "size", district: 1, blocks: 3, need: 4 },
    ]);
  });

  it("reports a district in pieces, and corners don't join", () => {
    const diagonal = parseMap(["1212", "2121"]);
    expect(pieces(tiny, diagonal, 0)).toBe(4);
    const check = checkMap(tiny, diagonal);
    expect(check.problems).toContainEqual({ kind: "split", district: 0, pieces: 4 });
    expect(check.problems).toContainEqual({ kind: "split", district: 1, pieces: 4 });
    expect(pieces(tiny, parseMap(["1122", "1122"]), 0)).toBe(1);
    expect(pieces(tiny, parseMap(["....", "...."]), 0)).toBe(0);
  });

  it("says what's wrong in plain words", () => {
    expect(describeProblem({ kind: "undrawn", count: 1 })).toBe("1 block isn't in a district yet. Paint every block.");
    expect(describeProblem({ kind: "undrawn", count: 3 })).toBe("3 blocks aren't in a district yet. Paint every block.");
    expect(describeProblem({ kind: "size", district: 0, blocks: 7, need: 6 })).toBe(
      "District 1 has 7 blocks. It needs 6, so give 1 block to another district.",
    );
    expect(describeProblem({ kind: "size", district: 2, blocks: 4, need: 6 })).toBe(
      "District 3 has 4 blocks. It needs 6, so add 2 more blocks.",
    );
    expect(describeProblem({ kind: "size", district: 3, blocks: 0, need: 6 })).toBe("District 4 has no blocks yet. It needs 6.");
    expect(describeProblem({ kind: "split", district: 1, pieces: 2 })).toBe(
      "District 2 is in 2 pieces. Its blocks must join up side to side (corners don't count).",
    );
  });

  it("reads maps written as rows of digits", () => {
    expect(parseMap(["12", ".2"])).toEqual([0, 1, null, 1]);
  });
});

describe("the challenge check", () => {
  it("needs a valid map and a majority after the swing", () => {
    const three: Town = { rows: 1, cols: 3, districts: 3, orange: [56, 57, 10] };
    expect(meetsChallenge(three, [0, 1, 2], 5)).toBe(true);
    expect(meetsChallenge(three, [0, 1, 2], 6)).toBe(false); // 56 - 6 = 50: tied, not a win
    expect(meetsChallenge(three, [0, 1, null], 5)).toBe(false);
  });

  it("doesn't count a tie as a win", () => {
    const three: Town = { rows: 1, cols: 3, districts: 3, orange: [55, 60, 10] };
    expect(meetsChallenge(three, [0, 1, 2], 5)).toBe(false); // 55 - 5 = 50: tied
  });
});
