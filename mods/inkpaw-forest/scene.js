// Pure scene logic for the Inkpaw Hollow band: no herdr or gpui imports, so tests run in node.
import { DATA } from "./data.js";

export const DESIGN = { width: 1600, height: 200 };
export const CABINS = DATA.layout.cabins.length; // 8
// [dx, dy] from a cabin door: two by the wall, two a step forward on the path.
const CABIN_SPOTS = [[-50, 0], [50, 0], [-22, 13], [26, 13]];
const FIRE = DATA.layout.campfire; // [x, y]
// Around the campfire, nearest first: blocked animals first, then animals with no cabin spot.
const FIRE_SPOTS = [
  [-56, 0], [56, 0], [-92, 0], [92, 0], [-30, 13], [34, 13],
  [-124, 0], [124, 0], [-66, 13], [70, 13], [-104, 13], [108, 13],
];
export const MAX_SHOWN = CABINS * CABIN_SPOTS.length + FIRE_SPOTS.length; // 44

// Stable small hash so an agent keeps its animal and scarf across restarts.
export function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function looks(address) {
  const h = hash(address);
  const kind = DATA.kinds[h % DATA.kinds.length];
  const scarf = (h >>> 8) % DATA.palette.scarf.length;
  return { kind, scarf: kind === "rabbit" ? null : scarf };
}

// herdr Status -> what the animal does.
export function mood(status) {
  if (status === "blocked") return "lantern";
  if (status === "done") return "wave";
  if (status === "working") return "work";
  // "unknown" is a running agent whose status report stopped; it rests like an idle one.
  return "sleep";
}

/**
 * Places every agent in design coordinates.
 * spaces: [{id}], agents: [{address, space, status, title, tab_name, space_name}]
 * Returns { actors, cabins, hidden, cabinOf } where actors carry x (feet), y (ground), mood,
 * kind, scarf, and cabinOf maps a space id to the cabin it belongs to.
 */
export function layoutScene(spaces, agents) {
  // One space per cabin while they fit; past eight, neighbouring spaces share a cabin in sidebar order.
  const cabinOf = new Map();
  const n = spaces.length;
  spaces.forEach((s, i) => cabinOf.set(s.id, n <= CABINS ? i : Math.floor((i * CABINS) / n)));

  const cabins = DATA.layout.cabins.map((c, i) => ({
    index: i,
    agents: 0,
    awake: false,
    working: false,
    unread: false,
  }));

  const used = new Map(); // cabin index -> count in front of it
  let fire = 0;
  const actors = [];
  const waiting = [];
  const ground = DATA.layout.groundY;
  const place = (a, m, home, spot, baseX) =>
    actors.push({ ...a, ...looks(a.address), mood: m, home, x: baseX + spot[0], y: ground + spot[1] });

  const sorted = [...agents].sort((a, b) => (a.address < b.address ? -1 : a.address > b.address ? 1 : 0));
  for (const a of sorted) {
    const m = mood(a.status);
    const home = cabinOf.has(a.space) ? cabinOf.get(a.space) : null;
    if (home !== null) {
      const c = cabins[home];
      c.agents += 1;
      if (m !== "sleep") c.awake = true;
      if (m === "work") c.working = true;
      if (m === "wave") c.unread = true;
    }
    if (m === "lantern" && fire < FIRE_SPOTS.length) {
      place(a, m, home, FIRE_SPOTS[fire++], FIRE[0]);
    } else if (home !== null && (used.get(home) || 0) < CABIN_SPOTS.length) {
      const n = used.get(home) || 0;
      used.set(home, n + 1);
      place(a, m, home, CABIN_SPOTS[n], DATA.layout.cabins[home].door[0]);
    } else {
      waiting.push([a, m, home]);
    }
  }
  let hidden = 0;
  for (const [a, m, home] of waiting) {
    if (fire < FIRE_SPOTS.length) place(a, m, home, FIRE_SPOTS[fire++], FIRE[0]);
    else hidden += 1;
  }
  actors.sort((p, q) => p.y - q.y || p.x - q.x);
  return { actors, cabins, hidden, cabinOf };
}

/** Fit the 1600x200 design into a band: never larger than 1, ground on the band's bottom. */
export function fit(width, height) {
  const s = Math.min(1, width / DESIGN.width, height / DESIGN.height);
  const w = DESIGN.width * s;
  const left = (width - w) / 2;
  const top = height - DESIGN.height * s;
  return { s, left, top, X: (x) => left + x * s, Y: (y) => top + y * s };
}

/** One line for a speech bubble: CJK-safe, cut on a space when one is near. */
export function bubbleText(text, max = 16) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const chars = Array.from(clean);
  if (chars.length <= max) return clean;
  const head = chars.slice(0, max).join("");
  const cut = head.lastIndexOf(" ");
  return (cut >= max * 0.6 ? head.slice(0, cut) : head).trimEnd() + "…";
}

/** How long a walk between two design x positions takes (ms). Slow and calm. */
export function walkMs(fromX, toX) {
  return Math.round(Math.min(9000, Math.max(900, Math.abs(toX - fromX) * 22)));
}

/** Design width of a bubble holding text (caps included). */
export function bubbleWidth(text) {
  const wide = Array.from(text).reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e80 ? 10 : 5.8), 0);
  return Math.max(16, wide + 4) + 16;
}

/** Stacks bubbles of neighbouring blocked animals so none overlap: address -> level (0 lowest). */
export function bubbleLevels(items) {
  const ends = [];
  const levels = new Map();
  for (const it of [...items].sort((a, b) => a.x - b.x)) {
    const left = it.x - it.width / 2;
    let level = ends.findIndex((end) => end + 4 <= left);
    if (level === -1) level = Math.min(ends.length, 2);
    ends[level] = it.x + it.width / 2;
    levels.set(it.address, level);
  }
  return levels;
}
