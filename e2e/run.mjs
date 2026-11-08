// Real-browser checks that jsdom can't do: mixed mouse + keyboard painting,
// the grid's accessible name, and how many pages the printout takes.
// Run with `pnpm e2e` (builds first). Not part of CI, to keep CI light.
// Needs a Chromium: set CHROMIUM_PATH, or run `npx playwright-core install chromium`.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { preview } from "vite";

const server = await preview({ preview: { port: 0, host: "127.0.0.1", strictPort: false }, logLevel: "silent" });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let failed = false;

async function check(name, fn) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(url);
    await fn(page);
    assert.deepEqual(errors, [], "no page errors");
    console.log(`ok   ${name}`);
  } catch (e) {
    failed = true;
    console.log(`FAIL ${name}\n     ${e.message.split("\n").join("\n     ")}`);
  } finally {
    await page.close();
  }
}

const cell = (page, i) => page.locator("#grid .cell").nth(i);
const district = (page, i) => cell(page, i).locator(".dno").textContent();
const focusedIndex = (page) => page.evaluate(() => document.activeElement?.closest?.(".cell")?.dataset.i ?? null);

async function paintMap(page, rows) {
  const all = rows.join("");
  for (let d = 1; d <= 6; d++) {
    await page.locator("#palette .pal").nth(d - 1).click();
    for (let i = 0; i < 36; i++) if (Number(all[i]) === d) await cell(page, i).click();
  }
}

await check("mouse then keyboard edits the block that has focus", async (page) => {
  await page.click("#draw-toggle");
  assert.equal(await focusedIndex(page), "0");
  await page.keyboard.press("2");
  await page.keyboard.press("Enter");
  assert.equal(await district(page, 0), "2");
  await cell(page, 14).click(); // paints 14 with district 2 and moves focus there
  assert.equal(await focusedIndex(page), "14");
  assert.equal(await cell(page, 14).getAttribute("tabindex"), "0");
  assert.equal(await cell(page, 0).getAttribute("tabindex"), "-1");
  await page.keyboard.press("3");
  await page.keyboard.press("Enter");
  assert.equal(await district(page, 14), "3", "block 14 painted by keyboard");
  assert.equal(await district(page, 0), "2", "block 0 untouched");
  await page.keyboard.press("ArrowRight");
  assert.equal(await focusedIndex(page), "15", "arrows start from the clicked block");
  await page.keyboard.press("Enter");
  assert.equal(await district(page, 15), "3");
  // a drag moves focus along with it
  await page.locator("#palette .pal").nth(4).click();
  const a = await cell(page, 30).boundingBox();
  const b = await cell(page, 32).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
  assert.equal(await focusedIndex(page), "32");
  await page.keyboard.press("Delete");
  assert.equal(await district(page, 32), "");
  assert.equal(await district(page, 31), "5");
});

await check("an unfinished map announces no results", async (page) => {
  await page.click("#draw-toggle");
  await page.click("#clear-map");
  await page.click("#draw-done");
  const label = await page.locator("#grid").getAttribute("aria-label");
  assert.match(label, /isn't finished/);
  assert.doesNotMatch(label, /wins|tied/);
});

// Print: every case must fit one page on A4 and US Letter, framing included.
async function pages(page, format) {
  const pdf = await page.pdf({ format, printBackground: false });
  return (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
}

for (const [label, setup] of [
  ["fair boxes", async () => {}],
  ["greedy", async (page) => page.click('[data-preset="greedy"]')],
  [
    "a drawn challenge map",
    async (page) => {
      await page.click("#draw-toggle");
      await page.click("#clear-map");
      await paintMap(page, ["111223", "111233", "444223", "444253", "666553", "666555"]);
      assert.match(await page.textContent("#challenge-status"), /You did it/);
    },
  ],
]) {
  for (const swing of [0, -5]) {
    await check(`print fits one page, ${label}, swing ${swing}`, async (page) => {
      await setup(page);
      await page.locator("#swing").fill(String(swing));
      await page.emulateMedia({ media: "print" });
      // the framing sits right under the heading, before the worksheet
      const order = await page.evaluate(() => [...document.getElementById("print-sheet").children].map((c) => c.className));
      assert.equal(order[1], "p-frame");
      for (const format of ["A4", "Letter"]) assert.equal(await pages(page, format), 1, `${format} pages`);
    });
  }
}

await browser.close();
await new Promise((r) => server.httpServer.close(r));
if (failed) process.exit(1);
