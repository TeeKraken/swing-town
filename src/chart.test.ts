import { describe, expect, it } from "vitest";
import { chartSvg, curveTableHtml } from "./chart";
import { pct, seatsSentence, swingLabel, swingShort, winnerLabel } from "./logic/format";
import { TOWN, preset } from "./logic/presets";
import { seatCurve } from "./logic/town";

const curve = seatCurve(TOWN, preset("greedy").map);

describe("seats chart", () => {
  it("draws a bar segment per seat group and marks the current swing", () => {
    const svg = chartSvg(curve, -3, 6, 4);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.match(/class="now"/g)).toHaveLength(1);
    expect(svg).toContain("orange wins 1 of 6 seats");
    // greedy at -10 has 0 orange seats, so fewer orange bars than swings
    expect(svg.match(/class="bar-o"/g)!.length).toBe(19);
    expect(svg).toContain(">10 to purple<");
    expect(svg).toContain(">10 to orange<");
    expect(svg).toContain("majority");
  });

  it("marks nothing when the swing is off the chart", () => {
    expect(chartSvg(curve, 99, 6, 4)).not.toContain('class="now"');
  });

  it("lists every swing in the table, highlighting the current one", () => {
    const t = curveTableHtml(curve, 0);
    expect(t.match(/<tr/g)).toHaveLength(22);
    expect(t).toContain('<tr class="is-now"><th scope="row">0</th><td>5</td><td>1</td><td>0</td></tr>');
    expect(t).toContain('<th scope="row">3 to purple</th><td>1</td><td>4</td><td>1</td>');
    expect(curveTableHtml(curve, null)).not.toContain("is-now");
  });
});

describe("wording", () => {
  it("describes swings in plain words", () => {
    expect(swingLabel(0)).toBe("No swing");
    expect(swingLabel(-1)).toBe("1 point toward purple");
    expect(swingLabel(-3)).toBe("3 points toward purple");
    expect(swingLabel(4)).toBe("4 points toward orange");
    expect(swingShort(0)).toBe("0");
    expect(swingShort(-5)).toBe("5 to purple");
    expect(swingShort(2)).toBe("2 to orange");
  });

  it("shows shares to one decimal place, so a win never reads as 50.0%", () => {
    expect(pct(301 / 6)).toBe("50.2%");
    expect(pct(299 / 6)).toBe("49.8%");
    expect(pct(50)).toBe("50.0%");
  });

  it("names winners and seat counts", () => {
    expect(winnerLabel("orange")).toBe("Orange wins");
    expect(winnerLabel("purple")).toBe("Purple wins");
    expect(winnerLabel("tie")).toBe("Tied");
    expect(seatsSentence({ orange: 5, purple: 1, tie: 0 })).toBe("Orange 5 · Purple 1");
    expect(seatsSentence({ orange: 1, purple: 4, tie: 1 })).toBe("Orange 1 · Purple 4 · Tied 1");
  });
});
