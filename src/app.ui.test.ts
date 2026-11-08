// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { IDEA_URL, JRMF_PUZZLE_URL, POST_IDEA_URL, REPO_URL } from "./links";

const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const text = (id: string) => $(id).textContent ?? "";
const cells = () => Array.from(document.querySelectorAll<HTMLElement>("#grid .cell"));
const click = (el: Element) => el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
const press = (el: Element, key: string) => el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

function pointerDown(cell: HTMLElement) {
  cell.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  cell.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
}

function setSwing(v: number) {
  const s = $<HTMLInputElement>("swing");
  s.value = String(v);
  s.dispatchEvent(new Event("input", { bubbles: true }));
}

function pickDistrict(d: number) {
  click(document.querySelectorAll("#palette .pal")[d - 1]);
}

/** Paint a whole map given as rows of digits, by tapping. */
function paintMap(rows: string[]) {
  const all = cells();
  for (let d = 1; d <= 6; d++) {
    pickDistrict(d);
    rows.join("").split("").forEach((ch, i) => {
      if (Number(ch) === d) pointerDown(all[i]);
    });
  }
}

const preset = (id: string) => document.querySelector(`[data-preset="${id}"]`)!;

beforeAll(async () => {
  const body = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>")).replace(/<script[\s\S]*?<\/script>/g, "");
  document.body.innerHTML = body;
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
  window.print = () => {};
  await import("./main");
});

describe("Swing Town page", () => {
  it("starts on step 1 with the fair map", () => {
    expect(text("step-title")).toBe("Meet Swing Town");
    expect(text("seats")).toContain("3 seats orange");
    expect(text("seats")).toContain("3 seats purple");
    expect(text("map-name")).toBe("Fair boxes · No swing");
    expect(cells()).toHaveLength(36);
    expect(cells()[0].querySelector(".num")!.textContent).toBe("62");
    expect(text("score-note")).toContain("46.8%");
  });

  it("links to the idea, the code, the puzzle and the post-an-idea page", () => {
    expect($<HTMLAnchorElement>("idea-link").href).toBe(IDEA_URL);
    expect($<HTMLAnchorElement>("repo-link").href).toBe(REPO_URL);
    expect($<HTMLAnchorElement>("wish-link").href).toBe(POST_IDEA_URL);
    expect($<HTMLAnchorElement>("jrmf-link").href).toBe(JRMF_PUZZLE_URL);
    expect(document.body.textContent).toContain("isn't made by or affiliated with JRMF");
    expect(document.body.textContent).toContain("Made entirely by an AI");
  });

  it("switches presets and re-scores live with the swing", () => {
    click(preset("greedy"));
    expect(preset("greedy").getAttribute("aria-pressed")).toBe("true");
    expect(text("seats")).toContain("5 seats orange");
    setSwing(-3);
    expect(text("map-name")).toBe("Greedy (packed and cracked) · 3 points toward purple");
    expect(text("seats")).toContain("1 seat orange");
    expect(text("seats")).toContain("1 tied");
    // each block shows its number after the swing
    expect(cells()[0].querySelector(".num")!.textContent).toBe("59");
    expect(text("district-list")).toContain("Tied");
    expect($("chart").querySelector("svg")!.getAttribute("aria-label")).toContain("orange wins 1 of 6 seats");
    expect(document.querySelectorAll("#curve-table tbody tr")).toHaveLength(21);
    click(preset("safe"));
    setSwing(-10);
    expect(text("seats")).toContain("3 seats orange");
    setSwing(0);
  });

  it("walks through the story steps", () => {
    click($("step-next"));
    expect(text("step-title")).toBe("A greedy map");
    expect(text("seats")).toContain("5 seats orange");
    click($("step-next"));
    expect(text("step-title")).toBe("A small swing");
    expect($<HTMLInputElement>("swing").value).toBe("-3");
    click($("step-next"));
    expect(text("step-title")).toBe("Safe seats");
    click($("step-actions").querySelectorAll("button")[1]);
    expect($<HTMLInputElement>("swing").value).toBe("-10");
    expect(text("seats")).toContain("3 seats orange");
    click($("step-next"));
    expect(text("step-title")).toBe("Your turn");
    expect($("step-next").hidden).toBe(true);
    expect($("challenge").hidden).toBe(false);
    expect($<HTMLInputElement>("swing").value).toBe("-5");
  });

  it("explains what's wrong with an unfinished map", () => {
    click($("step-actions").querySelector("button")!); // start from a blank map
    expect($("draw").hidden).toBe(false);
    expect($("grid").getAttribute("role")).toBe("grid");
    expect(text("seats")).toContain("Map not finished");
    expect(text("problems")).toContain("36 blocks aren't in a district yet.");
    pickDistrict(1);
    const all = cells();
    [0, 1, 2, 3, 4, 5, 6].forEach((i) => pointerDown(all[i]));
    expect(text("problems")).toContain("District 1 has 7 blocks. It needs 6, so give 1 block to another district.");
    expect(text("palette")).toContain("7/6");
    pickDistrict(7); // the eraser
    pointerDown(all[6]);
    pickDistrict(2);
    [6, 8].forEach((i) => pointerDown(all[i]));
    expect(text("problems")).toContain("District 2 is in 2 pieces.");
    expect(text("challenge-status")).toContain("finish your map first");
  });

  it("paints with the keyboard", () => {
    click($("clear-map"));
    const grid = $("grid");
    // the last block touched (row 2) keeps the focus spot; move to the top-left corner
    expect(cells()[8].tabIndex).toBe(0);
    press(grid, "ArrowUp");
    press(grid, "Home");
    const all = cells();
    expect(all[0].tabIndex).toBe(0);
    expect(document.activeElement).toBe(all[0]);
    press(grid, "3");
    press(grid, "Enter");
    expect(all[0].querySelector(".dno")!.textContent).toBe("3");
    press(grid, "ArrowRight");
    expect(cells()[1].tabIndex).toBe(0);
    expect(document.activeElement).toBe(cells()[1]);
    press(grid, " ");
    expect(cells()[1].querySelector(".dno")!.textContent).toBe("3");
    press(grid, "Delete");
    expect(cells()[1].querySelector(".dno")!.textContent).toBe("");
  });

  it("says when the challenge is met", () => {
    click($("clear-map"));
    paintMap(["123345", "123345", "123345", "122445", "112455", "666666"]); // the greedy map
    expect(text("problems")).toBe("");
    expect(text("challenge-status")).toContain("Not yet.");
    expect(text("challenge-status")).toContain("orange wins 1 of 6 seats");
    click($("clear-map"));
    paintMap(["111223", "111233", "444223", "444253", "666553", "666555"]);
    expect(text("map-name")).toBe("Your own map · 5 points toward purple");
    expect(text("challenge-status")).toContain("You did it!");
    expect($("challenge-status").classList.contains("ok")).toBe(true);
    expect(text("seats")).toContain("4 seats orange");
  });

  it("fills in the printable sheet", () => {
    const sheet = $("print-sheet");
    expect(sheet.querySelectorAll(".pcell")).toHaveLength(36);
    expect(sheet.textContent).toContain("Map: Your own map");
    expect(sheet.textContent).toContain("Seats at every swing");
    expect(sheet.querySelectorAll("table.curve")).toHaveLength(2);
    // the printed map shows the numbers before any swing
    expect(sheet.querySelector(".pcell .num")!.textContent).toBe("62");
    expect(sheet.textContent).toContain("not made by or affiliated with JRMF");
  });

  it("stops painting when drawing is done", () => {
    click($("draw-done"));
    expect($("draw").hidden).toBe(true);
    expect($("grid").getAttribute("role")).toBe("img");
    const before = cells()[0].querySelector(".dno")!.textContent;
    pointerDown(cells()[0]);
    expect(cells()[0].querySelector(".dno")!.textContent).toBe(before);
  });
});
