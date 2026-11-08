import { parseMap, type DistrictMap, type Town } from "./town";

/**
 * Swing Town: a made-up town of 36 blocks, 100 voters in each.
 * Each number is how many of a block's 100 voters vote orange.
 * Orange voters are spread across the north of town, purple voters
 * are concentrated in the south. Orange has 46.8% of all the votes.
 *
 * Every block is between 10 and 66, so a swing of up to 10 points never
 * pushes a block below 0 or above 100 (the clamp in `swingBlock` never
 * kicks in here, and district shares move by exactly the swing).
 */
export const TOWN: Town = {
  rows: 6,
  cols: 6,
  districts: 6,
  orange: [
    62, 66, 60, 64, 58, 62,
    66, 60, 64, 58, 66, 60,
    66, 64, 62, 46, 60, 64,
    44, 62, 34, 48, 32, 46,
    36, 44, 30, 38, 48, 34,
    14, 10, 18, 12, 16, 10,
  ],
};

export type PresetId = "fair" | "greedy" | "safe";

export interface Preset {
  id: PresetId;
  name: string;
  /** One plain sentence about how the map was drawn. */
  blurb: string;
  map: DistrictMap;
}

export const PRESETS: readonly Preset[] = [
  {
    id: "fair",
    name: "Fair boxes",
    blurb: "Plain boxes with no tricks. Orange has a bit under half the votes and wins half the seats.",
    map: parseMap(["111222", "111222", "333444", "333444", "555666", "555666"]),
  },
  {
    id: "greedy",
    name: "Greedy (packed and cracked)",
    blurb: "Purple voters are packed into one district, and the rest are cracked so orange gets four thin wins and one safer win.",
    map: parseMap(["123345", "123345", "123345", "122445", "112455", "666666"]),
  },
  {
    id: "safe",
    name: "Safe seats",
    blurb: "Orange voters are kept together, so orange wins three districts, each at least ten points above half, and lets purple win the other three.",
    map: parseMap(["111111", "222222", "333333", "444444", "555555", "666666"]),
  },
];

export function preset(id: PresetId): Preset {
  return PRESETS.find((p) => p.id === id)!;
}

/** The challenge: keep a majority of seats for orange after this many points of swing toward purple. */
export const CHALLENGE_POINTS = 5;
