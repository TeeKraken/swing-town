import { describe, expect, it } from "vitest";
import { CHALLENGE_POINTS, PRESETS, TOWN, preset } from "./presets";
import { checkMap, districtResults, meetsChallenge, parseMap, pointsToLoseMajority, seatCurve, seats, townShare } from "./town";

const orangeCurve = (id: "fair" | "greedy" | "safe") => seatCurve(TOWN, preset(id).map).map((p) => p.orange);

describe("Swing Town", () => {
  it("is 36 blocks in 6 districts of 6", () => {
    expect(TOWN.orange).toHaveLength(36);
    expect(TOWN.districts).toBe(6);
  });

  it("keeps every block far enough from 0 and 100 that a 10-point swing is never clamped", () => {
    for (const v of TOWN.orange) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v - 10).toBeGreaterThanOrEqual(0);
      expect(v + 10).toBeLessThanOrEqual(100);
    }
  });

  it("gives orange a bit under half the votes", () => {
    expect(townShare(TOWN)).toBeCloseTo(46.78, 2);
  });
});

describe("the preset maps", () => {
  it("are all valid maps", () => {
    for (const p of PRESETS) expect(checkMap(TOWN, p.map), p.id).toEqual({ ok: true, problems: [] });
  });

  it("fair boxes: orange wins half the seats, and seats follow the votes", () => {
    expect(seats(TOWN, preset("fair").map)).toEqual({ orange: 3, purple: 3, tie: 0 });
    expect(orangeCurve("fair")).toEqual([2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]);
  });

  it("greedy: five seats for orange with under half the votes, every win thin", () => {
    const r = districtResults(TOWN, preset("greedy").map);
    expect(seats(TOWN, preset("greedy").map)).toEqual({ orange: 5, purple: 1, tie: 0 });
    const wins = r.filter((d) => d.winner === "orange").map((d) => d.orangeShare);
    expect(wins.filter((s) => s < 54)).toHaveLength(4);
    // the one purple district is packed: purple has over 85% there
    const lost = r.find((d) => d.winner === "purple")!;
    expect(lost.orangeShare).toBeLessThan(15);
  });

  it("greedy: a 3-point swing toward purple takes orange from five seats to one", () => {
    const m = preset("greedy").map;
    expect(seats(TOWN, m, -2).orange).toBe(4);
    expect(seats(TOWN, m, -3)).toEqual({ orange: 1, purple: 4, tie: 1 });
    expect(pointsToLoseMajority(TOWN, m)).toBe(3);
    expect(orangeCurve("greedy")).toEqual([0, 0, 1, 1, 1, 1, 1, 1, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]);
  });

  it("safe seats: three seats that hold even after a 10-point swing", () => {
    const m = preset("safe").map;
    expect(seats(TOWN, m)).toEqual({ orange: 3, purple: 3, tie: 0 });
    for (let s = -10; s <= 0; s++) expect(seats(TOWN, m, s).orange, `swing ${s}`).toBe(3);
  });

  it("none of them meets the challenge on its own", () => {
    for (const p of PRESETS) expect(meetsChallenge(TOWN, p.map, CHALLENGE_POINTS), p.id).toBe(false);
  });

  it("the challenge can be done (here is one answer)", () => {
    const answer = parseMap(["111223", "111233", "444223", "444253", "666553", "666555"]);
    expect(checkMap(TOWN, answer).ok).toBe(true);
    expect(seats(TOWN, answer, -CHALLENGE_POINTS).orange).toBe(4);
    expect(meetsChallenge(TOWN, answer, CHALLENGE_POINTS)).toBe(true);
  });
});
