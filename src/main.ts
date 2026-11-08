import "./style.css";
import { chartSvg, curveTableHtml } from "./chart";
import { IDEA_URL, JRMF_PUZZLE_URL, POST_IDEA_URL, REPO_URL } from "./links";
import { pct, swingLabel, winnerLabel } from "./logic/format";
import { CHALLENGE_POINTS, PRESETS, TOWN, preset, type PresetId } from "./logic/presets";
import {
  MAX_SWING,
  checkMap,
  describeProblem,
  districtResults,
  districtSize,
  meetsChallenge,
  pointsToLoseMajority,
  seatCurve,
  seats,
  seatsForMajority,
  swingBlock,
  townShare,
  type DistrictMap,
} from "./logic/town";

// ---------------------------------------------------------------------------
// State

interface State {
  map: (number | null)[];
  source: PresetId | "custom";
  swing: number;
  drawing: boolean;
  /** District being painted; null = eraser. */
  paint: number | null;
  step: number;
  focusCell: number;
}

const state: State = {
  map: [...preset("fair").map],
  source: "fair",
  swing: 0,
  drawing: false,
  paint: 0,
  step: 0,
  focusCell: 0,
};

const N = TOWN.rows * TOWN.cols;
const SIZE = districtSize(TOWN);
const MAJORITY = seatsForMajority(TOWN);

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// ---------------------------------------------------------------------------
// The story

interface Action {
  label: string;
  run: () => void;
}

interface Step {
  title: string;
  body: () => string;
  actions: Action[];
  /** What the board shows when you arrive at this step. */
  enter: () => void;
}

const share0 = pct(townShare(TOWN));
const seatsOf = (id: PresetId, swing = 0) => seats(TOWN, preset(id).map, swing).orange;

function show(id: PresetId, swing = 0, drawing = false) {
  loadPreset(id);
  state.swing = swing;
  state.drawing = drawing;
}

const STEPS: Step[] = [
  {
    title: "Meet Swing Town",
    body: () => `
      <p>Swing Town is a made-up town of 36 blocks. Every block has 100 voters, and the number on a block is how many of them vote orange. The rest vote purple.</p>
      <p>The town elects 6 council members, one from each district. A district is ${SIZE} blocks that join up side to side, and whoever gets more votes in it wins its seat.</p>
      <p>On this map the districts are plain boxes. Orange has ${share0} of the votes and wins ${seatsOf("fair")} of the 6 seats.</p>`,
    actions: [{ label: "Show the fair boxes", run: () => show("fair") }],
    enter: () => show("fair"),
  },
  {
    title: "A greedy map",
    body: () => `
      <p>Same town, same voters, new lines. This map packs as many purple voters as it can into one district along the bottom, then cracks the rest so orange wins every other district by a hair.</p>
      <p>Now orange wins ${seatsOf("greedy")} of 6 seats with less than half the votes. Look at the district list: most of orange's wins are under 54%.</p>`,
    actions: [{ label: "Show the greedy map", run: () => show("greedy") }],
    enter: () => show("greedy"),
  },
  {
    title: "A small swing",
    body: () => `
      <p>Voters change their minds a little from one election to the next. Say every block moves 3 points toward purple: in each block, 3 of the 100 voters switch.</p>
      <p>Orange's thin wins fall together. ${seatsOf("greedy")} seats drop to ${seatsOf("greedy", -3)}. A map drawn to win as many seats as possible can backfire when the vote shifts. People sometimes call this a <i>dummymander</i>.</p>
      <p>Try the slider yourself. The chart shows orange's seats at every swing.</p>`,
    actions: [
      { label: "Swing 3 points toward purple", run: () => show("greedy", -3) },
      { label: "Back to no swing", run: () => show("greedy", 0) },
    ],
    enter: () => show("greedy", -3),
  },
  {
    title: "Safe seats",
    body: () => `
      <p>This map asks for less. Orange's voters are kept together in the top three rows, so orange wins only ${seatsOf("safe")} seats, but each by about 10 points or more.</p>
      <p>Slide the swing all the way to 10 points toward purple. Orange still has ${seatsOf("safe", -MAX_SWING)} seats. Fewer seats, but they hold.</p>`,
    actions: [
      { label: "Show the safe seats map", run: () => show("safe") },
      { label: "Swing 10 points toward purple", run: () => show("safe", -MAX_SWING) },
    ],
    enter: () => show("safe"),
  },
  {
    title: "Your turn",
    body: () => `
      <p><b>Challenge:</b> draw a map that keeps a majority of seats for orange (${MAJORITY} of 6) even after a ${CHALLENGE_POINTS}-point swing toward purple.</p>
      <p>Pick a district number, then tap or drag across blocks to paint them. Every district needs ${SIZE} blocks that join up side to side. The swing is set to ${CHALLENGE_POINTS} points toward purple, so you see the result as you draw.</p>`,
    actions: [
      { label: "Start from a blank map", run: () => startDrawing(true) },
      { label: "Start from the greedy map", run: () => { loadPreset("greedy"); startDrawing(false); } },
    ],
    enter: () => {
      state.swing = -CHALLENGE_POINTS;
    },
  },
];

function startDrawing(blank: boolean) {
  if (blank) {
    state.map = new Array(N).fill(null);
    state.source = "custom";
  }
  state.drawing = true;
  if (state.paint === null) state.paint = 0;
  state.swing = -CHALLENGE_POINTS;
}

function loadPreset(id: PresetId) {
  state.map = [...preset(id).map];
  state.source = id;
}

// ---------------------------------------------------------------------------
// The grid

const grid = $("grid");
const cells: HTMLElement[] = [];
const rowEls: HTMLElement[] = [];

function buildGrid() {
  for (let r = 0; r < TOWN.rows; r++) {
    const row = document.createElement("div");
    row.className = "grid-row";
    rowEls.push(row);
    for (let c = 0; c < TOWN.cols; c++) {
      const i = r * TOWN.cols + c;
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.i = String(i);
      cell.innerHTML = `<span class="dno" aria-hidden="true"></span><span class="num" aria-hidden="true"></span><span class="win" aria-hidden="true"></span>`;
      cells.push(cell);
      row.append(cell);
    }
    grid.append(row);
  }
}

/** Which sides of block i are a district border (or the edge of town). */
function borders(map: DistrictMap, i: number) {
  const r = Math.floor(i / TOWN.cols);
  const c = i % TOWN.cols;
  const d = map[i];
  const differs = (j: number) => d === null || map[j] === null || map[j] !== d;
  return {
    t: r === 0 || differs(i - TOWN.cols),
    b: r === TOWN.rows - 1 || differs(i + TOWN.cols),
    l: c === 0 || differs(i - 1),
    r: c === TOWN.cols - 1 || differs(i + 1),
  };
}

function borderClasses(map: DistrictMap, i: number): string {
  const b = borders(map, i);
  return [b.t && "bt", b.b && "bb", b.l && "bl", b.r && "br"].filter(Boolean).join(" ");
}

/** The first block (top-left-most) of each district, where its winner chip goes. */
function firstBlocks(map: DistrictMap): Map<number, number> {
  const out = new Map<number, number>();
  map.forEach((d, i) => {
    if (d !== null && !out.has(d)) out.set(d, i);
  });
  return out;
}

/**
 * How orange a block looks: a scale centred on 50 (the line between winning
 * and losing) and stretched, so 45 and 55 look clearly different.
 */
function tintFor(orange: number): number {
  return Math.max(0, Math.min(100, 50 + (orange - 50) * 2.2));
}

const CHIP = { orange: "O", purple: "P", tie: "=" } as const;

function renderGrid(valid: boolean) {
  const results = districtResults(TOWN, state.map, state.swing);
  const firsts = firstBlocks(state.map);
  const chipAt = new Map<number, number>();
  if (valid) for (const [d, i] of firsts) chipAt.set(i, d);

  grid.setAttribute("role", state.drawing ? "grid" : "img");
  grid.classList.toggle("is-drawing", state.drawing);
  if (state.drawing) {
    grid.setAttribute("aria-label", "Map of Swing Town. Paint blocks to draw districts.");
  } else {
    const s = seats(TOWN, state.map, state.swing);
    grid.setAttribute(
      "aria-label",
      `Map of Swing Town, ${TOWN.rows} by ${TOWN.cols} blocks in ${TOWN.districts} districts. Orange wins ${s.orange} seats, purple ${s.purple}${s.tie ? `, ${s.tie} tied` : ""}. The district list below has the details.`,
    );
  }
  rowEls.forEach((row) => (state.drawing ? row.setAttribute("role", "row") : row.removeAttribute("role")));

  cells.forEach((cell, i) => {
    const d = state.map[i];
    const v = swingBlock(TOWN.orange[i], state.swing);
    cell.className = `cell ${borderClasses(state.map, i)}${d === null ? " undrawn" : ""}`;
    cell.style.setProperty("--o", `${tintFor(v)}%`);
    (cell.querySelector(".num") as HTMLElement).textContent = String(v);
    (cell.querySelector(".dno") as HTMLElement).textContent = d === null ? "" : String(d + 1);
    const win = cell.querySelector(".win") as HTMLElement;
    const chipD = chipAt.get(i);
    if (chipD !== undefined) {
      const w = results[chipD].winner;
      win.textContent = CHIP[w];
      win.className = `win win-${w}`;
    } else {
      win.textContent = "";
      win.className = "win";
    }
    if (state.drawing) {
      const r = Math.floor(i / TOWN.cols) + 1;
      const c = (i % TOWN.cols) + 1;
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", `Row ${r}, column ${c}: ${v} orange voters, ${d === null ? "no district" : `district ${d + 1}`}`);
      cell.tabIndex = i === state.focusCell ? 0 : -1;
    } else {
      cell.removeAttribute("role");
      cell.removeAttribute("aria-label");
      cell.removeAttribute("tabindex");
    }
  });
}

function paintCell(i: number) {
  if (!state.drawing || i < 0 || i >= N) return;
  if (state.map[i] === state.paint) return;
  state.map[i] = state.paint;
  state.source = "custom";
  render();
}

function cellFromPoint(x: number, y: number): number | null {
  const el = document.elementFromPoint?.(x, y)?.closest<HTMLElement>(".cell");
  if (!el || !grid.contains(el)) return null;
  return Number(el.dataset.i);
}

let painting = false;

grid.addEventListener("pointerdown", (e) => {
  if (!state.drawing) return;
  const el = (e.target as HTMLElement).closest<HTMLElement>(".cell");
  if (!el) return;
  e.preventDefault();
  painting = true;
  try {
    grid.setPointerCapture(e.pointerId);
  } catch {
    /* not supported everywhere (jsdom) */
  }
  const i = Number(el.dataset.i);
  state.focusCell = i;
  paintCell(i);
  render();
});

grid.addEventListener("pointermove", (e) => {
  if (!painting || !state.drawing) return;
  const i = cellFromPoint(e.clientX, e.clientY);
  if (i !== null) paintCell(i);
});

const stopPainting = () => {
  painting = false;
};
grid.addEventListener("pointerup", stopPainting);
grid.addEventListener("pointercancel", stopPainting);
grid.addEventListener("lostpointercapture", stopPainting);

grid.addEventListener("keydown", (e) => {
  if (!state.drawing) return;
  const i = state.focusCell;
  const r = Math.floor(i / TOWN.cols);
  const c = i % TOWN.cols;
  let next: number | null = null;
  switch (e.key) {
    case "ArrowUp":
      next = r > 0 ? i - TOWN.cols : i;
      break;
    case "ArrowDown":
      next = r < TOWN.rows - 1 ? i + TOWN.cols : i;
      break;
    case "ArrowLeft":
      next = c > 0 ? i - 1 : i;
      break;
    case "ArrowRight":
      next = c < TOWN.cols - 1 ? i + 1 : i;
      break;
    case "Home":
      next = r * TOWN.cols;
      break;
    case "End":
      next = r * TOWN.cols + TOWN.cols - 1;
      break;
    case "Enter":
    case " ":
      e.preventDefault();
      paintCell(i);
      return;
    case "Delete":
    case "Backspace": {
      e.preventDefault();
      const keep = state.paint;
      state.paint = null;
      paintCell(i);
      state.paint = keep;
      render();
      return;
    }
    default:
      if (/^[1-9]$/.test(e.key) && Number(e.key) <= TOWN.districts) {
        e.preventDefault();
        state.paint = Number(e.key) - 1;
        render();
      }
      return;
  }
  e.preventDefault();
  state.focusCell = next;
  render();
  cells[next].focus();
});

// ---------------------------------------------------------------------------
// The palette

const palette = $("palette");

function buildPalette() {
  const make = (value: number | null, label: string) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = value === null ? "pal pal-erase" : "pal";
    b.dataset.d = value === null ? "" : String(value);
    b.innerHTML = `<span class="pal-name">${label}</span><span class="pal-count"></span>`;
    b.addEventListener("click", () => {
      state.paint = value;
      render();
    });
    palette.append(b);
  };
  for (let d = 0; d < TOWN.districts; d++) make(d, String(d + 1));
  make(null, "Eraser");
}

function renderPalette() {
  const counts = new Array(TOWN.districts).fill(0);
  for (const d of state.map) if (d !== null) counts[d]++;
  palette.querySelectorAll<HTMLButtonElement>(".pal").forEach((b) => {
    const value = b.dataset.d === "" ? null : Number(b.dataset.d);
    b.setAttribute("aria-pressed", String(state.paint === value));
    const count = b.querySelector(".pal-count") as HTMLElement;
    if (value === null) {
      count.textContent = "";
      b.setAttribute("aria-label", "Eraser");
    } else {
      count.textContent = `${counts[value]}/${SIZE}`;
      b.classList.toggle("pal-full", counts[value] === SIZE);
      b.classList.toggle("pal-over", counts[value] > SIZE);
      b.setAttribute("aria-label", `District ${value + 1}, ${counts[value]} of ${SIZE} blocks`);
    }
  });
}

// ---------------------------------------------------------------------------
// Everything else on the board

function mapName(): string {
  return state.source === "custom" ? "Your own map" : preset(state.source).name;
}

function renderScore(valid: boolean) {
  $("map-name").textContent = `${mapName()} · ${swingLabel(state.swing)}`;
  const seatsEl = $("seats");
  const note = $("score-note");
  if (!valid) {
    seatsEl.innerHTML = `<span class="seat-none">Map not finished</span>`;
    note.textContent = "Finish drawing every district to see who wins.";
    return;
  }
  const s = seats(TOWN, state.map, state.swing);
  const one = (n: number) => (n === 1 ? "seat" : "seats");
  seatsEl.innerHTML =
    `<span class="seat seat-o"><b>${s.orange}</b> ${one(s.orange)} orange</span>` +
    `<span class="seat seat-p"><b>${s.purple}</b> ${one(s.purple)} purple</span>` +
    (s.tie ? `<span class="seat seat-t"><b>${s.tie}</b> tied</span>` : "");
  const lose = pointsToLoseMajority(TOWN, state.map);
  let hold: string;
  if (lose === 0) hold = "With no swing, orange has no majority on this map.";
  else if (lose === null) hold = `Orange's majority holds even after a ${MAX_SWING}-point swing toward purple.`;
  else if (lose === 1) hold = "Orange's majority is lost at just a 1-point swing toward purple.";
  else hold = `Orange's majority holds up to a ${lose - 1}-point swing toward purple, and is lost at ${lose}.`;
  note.textContent = `Orange has ${pct(townShare(TOWN, state.swing))} of all the votes. ${MAJORITY} seats is a majority. ${hold}`;
}

function renderProblems(problems: string[]) {
  const el = $("problems");
  if (!problems.length) {
    el.innerHTML = "";
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.innerHTML = `<p class="problems-title">To finish this map:</p><ul>${problems.map((p) => `<li>${p}</li>`).join("")}</ul>`;
}

function renderDistricts(valid: boolean) {
  const results = districtResults(TOWN, state.map, state.swing);
  $("district-list").innerHTML = results
    .map((r) => {
      const name = `District ${r.district + 1}`;
      if (r.blocks !== SIZE || !valid) {
        return `<li class="d d-unfinished"><span class="d-name">${name}</span><span class="d-info">${r.blocks} of ${SIZE} blocks</span></li>`;
      }
      // How far over half the winner is: the swing it can take before the seat is tied.
      const over = Math.abs(r.orangeShare - 50);
      const by = r.winner === "tie" ? "exactly half each" : `${over.toFixed(1)} points over half`;
      return `<li class="d d-${r.winner}"><span class="d-name">${name}</span><span class="d-info">${pct(r.orangeShare)} orange</span><span class="d-win">${winnerLabel(r.winner)} <span class="d-by">${by}</span></span></li>`;
    })
    .join("");
}

function renderChallenge(valid: boolean) {
  const panel = $("challenge");
  panel.hidden = !(state.step === STEPS.length - 1 || state.drawing);
  const status = $("challenge-status");
  status.classList.remove("ok");
  if (!valid) {
    status.textContent = `Not yet: finish your map first. Every district needs ${SIZE} blocks that join up.`;
    return;
  }
  const after = seats(TOWN, state.map, -CHALLENGE_POINTS).orange;
  if (meetsChallenge(TOWN, state.map, CHALLENGE_POINTS)) {
    status.classList.add("ok");
    const lose = pointsToLoseMajority(TOWN, state.map);
    const extra = lose === null ? ` It even holds at ${MAX_SWING} points.` : lose - 1 > CHALLENGE_POINTS ? ` It holds up to ${lose - 1} points.` : "";
    status.textContent = `You did it! After a ${CHALLENGE_POINTS}-point swing toward purple, orange still wins ${after} of 6 seats.${extra}`;
  } else {
    status.textContent = `Not yet. After a ${CHALLENGE_POINTS}-point swing toward purple, orange wins ${after} of 6 seats with this map. It needs ${MAJORITY}.`;
  }
}

function renderChart(valid: boolean) {
  const chart = $("chart");
  if (!valid) {
    chart.innerHTML = `<p class="empty">The chart appears when the map is finished.</p>`;
    $("curve-table").innerHTML = "";
    return;
  }
  const curve = seatCurve(TOWN, state.map);
  chart.innerHTML = chartSvg(curve, state.swing, TOWN.districts, MAJORITY);
  $("curve-table").innerHTML = curveTableHtml(curve, state.swing);
}

let storyShown = -1;

/** Rebuilt only when the step changes, so buttons keep keyboard focus. */
function renderStory() {
  if (storyShown === state.step) return;
  storyShown = state.step;
  const step = STEPS[state.step];
  $("step-count").textContent = `Step ${state.step + 1} of ${STEPS.length}`;
  $("step-title").textContent = step.title;
  $("step-body").innerHTML = step.body();
  const actions = $("step-actions");
  actions.innerHTML = "";
  step.actions.forEach((a, k) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = k === 0 ? "btn btn-go" : "btn btn-quiet";
    b.textContent = a.label;
    b.addEventListener("click", () => {
      a.run();
      render();
      revealBoard();
    });
    actions.append(b);
  });
  ($("step-back") as HTMLButtonElement).disabled = state.step === 0;
  const next = $("step-next") as HTMLButtonElement;
  next.hidden = state.step === STEPS.length - 1;
  $("step-dots").innerHTML = STEPS.map(
    (s, k) => `<li><button type="button" class="dot${k === state.step ? " is-now" : ""}" data-step="${k}" aria-label="Step ${k + 1}: ${s.title}"${k === state.step ? ' aria-current="step"' : ""}></button></li>`,
  ).join("");
}

function renderPrint(valid: boolean, problems: string[]) {
  const results0 = districtResults(TOWN, state.map, 0);
  const resultsS = districtResults(TOWN, state.map, state.swing);
  const withSwing = state.swing !== 0;
  const cellsHtml = TOWN.orange
    .map((v, i) => {
      const d = state.map[i];
      return `<div class="pcell ${borderClasses(state.map, i)}"><span class="dno">${d === null ? "" : d + 1}</span><span class="num">${v}</span></div>`;
    })
    .join("");
  const districtRows = results0
    .map((r, k) => {
      const s = resultsS[k];
      const cols = valid
        ? `<td>${pct(r.orangeShare)}</td><td>${winnerLabel(r.winner)}</td>${withSwing ? `<td>${pct(s.orangeShare)}</td><td>${winnerLabel(s.winner)}</td>` : ""}`
        : `<td colspan="${withSwing ? 4 : 2}">${r.blocks} of ${SIZE} blocks</td>`;
      return `<tr><th scope="row">District ${r.district + 1}</th>${cols}</tr>`;
    })
    .join("");
  const head = `<tr><th scope="col">District</th><th scope="col">Orange share, no swing</th><th scope="col">Winner, no swing</th>${withSwing ? `<th scope="col">Orange share, ${swingLabel(state.swing).toLowerCase()}</th><th scope="col">Winner</th>` : ""}</tr>`;
  const s0 = seats(TOWN, state.map, 0);
  $("print-sheet").innerHTML = `
    <header class="p-head">
      <h1>Swing Town</h1>
      <p>Map: <b>${mapName()}</b>. ${valid ? `With no swing, orange wins ${s0.orange} of 6 seats and purple wins ${s0.purple}${s0.tie ? ` (${s0.tie} tied)` : ""}.` : "This map isn't finished yet."}</p>
    </header>
    <div class="p-top">
      <div class="p-map">
        <div class="pgrid">${cellsHtml}</div>
        <p class="p-legend">Each block has 100 voters. The big number is how many vote orange, before any swing. The small number is the district. Thick lines are district borders.</p>
      </div>
      <div class="p-districts">
        <h2>Districts</h2>
        ${valid ? "" : `<ul>${problems.map((p) => `<li>${p}</li>`).join("")}</ul>`}
        <table class="curve">${head}${districtRows}</table>
        <p class="p-note">A swing of 3 points toward purple means that in every block, 3 of the 100 voters switch from orange to purple. A district needs more than half its votes to win. Exactly half is a tie.</p>
      </div>
    </div>
    ${valid ? `<h2>Seats at every swing</h2>${curveTableHtml(seatCurve(TOWN, state.map), null)}` : ""}
    <p class="p-foot">Swing Town is a made-up town; orange and purple aren't parties. The uniform swing is a simplification, not a model of real elections. An unofficial companion to the gerrymandering puzzle from the Julia Robinson Mathematics Festival (${JRMF_PUZZLE_URL}), not made by or affiliated with JRMF.</p>`;
}

function render() {
  const check = checkMap(TOWN, state.map);
  const problems = check.problems.map(describeProblem);
  const valid = check.ok;

  document.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach((b) => {
    b.setAttribute("aria-pressed", String(state.source === b.dataset.preset));
  });
  const toggle = $("draw-toggle");
  toggle.setAttribute("aria-pressed", String(state.drawing));
  $("draw").hidden = !state.drawing;
  $("legend-swing").textContent = state.swing === 0 ? "" : `, after a swing of ${swingLabel(state.swing).toLowerCase()}`;

  const slider = $("swing") as HTMLInputElement;
  if (Number(slider.value) !== state.swing) slider.value = String(state.swing);
  slider.setAttribute("aria-valuetext", swingLabel(state.swing));
  $("swing-out").textContent = swingLabel(state.swing);

  renderStory();
  renderGrid(valid);
  renderPalette();
  renderScore(valid);
  renderProblems(state.drawing || !valid ? problems : []);
  renderDistricts(valid);
  renderChallenge(valid);
  renderChart(valid);
  renderPrint(valid, problems);
}

function revealBoard() {
  if (!window.matchMedia?.("(max-width: 899px)").matches) return;
  const score = $("score");
  const box = score.getBoundingClientRect();
  if (box.top < 0 || box.top > window.innerHeight * 0.5) {
    score.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
  }
}

function goToStep(k: number) {
  state.step = Math.max(0, Math.min(STEPS.length - 1, k));
  STEPS[state.step].enter();
  render();
  $("step-title").focus({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Wiring

function init() {
  buildGrid();
  buildPalette();

  for (const p of PRESETS) {
    document.querySelector(`[data-preset="${p.id}"]`)?.addEventListener("click", () => {
      loadPreset(p.id);
      render();
    });
  }
  $("draw-toggle").addEventListener("click", () => {
    state.drawing = !state.drawing;
    if (state.drawing && state.paint === null) state.paint = 0;
    render();
    if (state.drawing) cells[state.focusCell].focus({ preventScroll: true });
  });
  $("draw-done").addEventListener("click", () => {
    state.drawing = false;
    render();
    $("draw-toggle").focus();
  });
  $("clear-map").addEventListener("click", () => {
    state.map = new Array(N).fill(null);
    state.source = "custom";
    render();
  });
  $("swing").addEventListener("input", (e) => {
    state.swing = Number((e.target as HTMLInputElement).value);
    render();
  });
  $("step-next").addEventListener("click", () => goToStep(state.step + 1));
  $("step-back").addEventListener("click", () => goToStep(state.step - 1));
  $("step-dots").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-step]");
    if (b) goToStep(Number(b.dataset.step));
  });
  $("print-btn").addEventListener("click", () => window.print());

  ($("idea-link") as HTMLAnchorElement).href = IDEA_URL;
  ($("repo-link") as HTMLAnchorElement).href = REPO_URL;
  ($("wish-link") as HTMLAnchorElement).href = POST_IDEA_URL;
  ($("jrmf-link") as HTMLAnchorElement).href = JRMF_PUZZLE_URL;

  render();
}

init();
