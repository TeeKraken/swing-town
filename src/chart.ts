import { swingShort } from "./logic/format";
import type { CurvePoint } from "./logic/town";

const W = 320;
const H = 176;
const LEFT = 26;
const RIGHT = 6;
const TOP = 10;
const PLOT_H = 120;

/**
 * A stacked bar for every swing: orange seats from the bottom, tied seats,
 * then purple seats on top. The current swing is outlined. Returned as SVG
 * markup built only from numbers, so it's safe to insert.
 */
export function chartSvg(curve: readonly CurvePoint[], swing: number, districts: number, majority: number): string {
  const n = curve.length;
  const step = (W - LEFT - RIGHT) / n;
  const bw = Math.max(4, step - 3);
  const y = (seats: number) => TOP + PLOT_H - (seats / districts) * PLOT_H;
  const parts: string[] = [];

  for (let s = 0; s <= districts; s += districts / 2) {
    parts.push(`<line class="gridline" x1="${LEFT}" x2="${W - RIGHT}" y1="${y(s)}" y2="${y(s)}"/>`);
    parts.push(`<text class="axis" x="${LEFT - 6}" y="${y(s) + 4}" text-anchor="end">${s}</text>`);
  }

  curve.forEach((p, i) => {
    const x = LEFT + i * step + (step - bw) / 2;
    const seg = (cls: string, from: number, count: number) => {
      if (!count) return;
      parts.push(`<rect class="${cls}" x="${x.toFixed(2)}" y="${y(from + count).toFixed(2)}" width="${bw.toFixed(2)}" height="${((count / districts) * PLOT_H).toFixed(2)}"/>`);
    };
    seg("bar-o", 0, p.orange);
    seg("bar-t", p.orange, p.tie);
    seg("bar-p", p.orange + p.tie, p.purple);
    if (p.swing === swing) {
      parts.push(`<rect class="now" x="${(x - 2).toFixed(2)}" y="${TOP - 3}" width="${(bw + 4).toFixed(2)}" height="${PLOT_H + 6}" rx="3"/>`);
      parts.push(`<path class="now-mark" d="M${(x + bw / 2).toFixed(2)} ${TOP + PLOT_H + 6}l5 8h-10z"/>`);
    }
  });

  parts.push(`<line class="majority" x1="${LEFT}" x2="${W - RIGHT}" y1="${y(majority)}" y2="${y(majority)}"/>`);
  parts.push(`<text class="majority-label" x="${LEFT + 3}" y="${y(majority) - 4}">majority</text>`);

  const base = TOP + PLOT_H + 28;
  parts.push(`<text class="axis" x="${LEFT}" y="${base}">${swingShort(curve[0].swing)}</text>`);
  parts.push(`<text class="axis" x="${LEFT + ((n - 1) / 2 + 0.5) * step}" y="${base}" text-anchor="middle">0</text>`);
  parts.push(`<text class="axis" x="${W - RIGHT}" y="${base}" text-anchor="end">${swingShort(curve[n - 1].swing)}</text>`);

  const now = curve.find((p) => p.swing === swing);
  const label = now
    ? `Bar chart of orange seats for every swing. At the current swing, orange wins ${now.orange} of ${districts} seats.`
    : "Bar chart of orange seats for every swing.";
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}" focusable="false">${parts.join("")}</svg>`;
}

/** The same curve as an HTML table (for screen readers, and for printing). */
export function curveTableHtml(curve: readonly CurvePoint[], swing: number | null): string {
  const rows = curve
    .map((p) => {
      const cls = p.swing === swing ? ' class="is-now"' : "";
      return `<tr${cls}><th scope="row">${swingShort(p.swing)}</th><td>${p.orange}</td><td>${p.purple}</td><td>${p.tie}</td></tr>`;
    })
    .join("");
  return `<table class="curve"><thead><tr><th scope="col">Swing (points)</th><th scope="col">Orange seats</th><th scope="col">Purple seats</th><th scope="col">Tied</th></tr></thead><tbody>${rows}</tbody></table>`;
}
