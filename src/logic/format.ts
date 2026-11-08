import type { Seats, Winner } from "./town";

/** "No swing", "3 points toward purple", "1 point toward orange". */
export function swingLabel(swing: number): string {
  if (swing === 0) return "No swing";
  const n = Math.abs(swing);
  return `${n} ${n === 1 ? "point" : "points"} toward ${swing < 0 ? "purple" : "orange"}`;
}

/** Short form for tables: "0", "3 to purple", "2 to orange". */
export function swingShort(swing: number): string {
  if (swing === 0) return "0";
  return `${Math.abs(swing)} to ${swing < 0 ? "purple" : "orange"}`;
}

/** One decimal place. Shares are whole voters out of 600, so this never shows 50.0% for a district someone won. */
export function pct(share: number): string {
  return `${share.toFixed(1)}%`;
}

export function winnerLabel(w: Winner): string {
  return w === "tie" ? "Tied" : w === "orange" ? "Orange wins" : "Purple wins";
}

export function seatsSentence(s: Seats): string {
  const parts = [`Orange ${s.orange}`, `Purple ${s.purple}`];
  if (s.tie) parts.push(`Tied ${s.tie}`);
  return parts.join(" · ");
}
