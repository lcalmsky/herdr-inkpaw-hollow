// Hand-drawn ink for the Inkpaw Hollow mods. Every builder answers plain [x, y] points in the
// element's own pixels, so the wobble is testable without a window; a mod hands them to
// PathBuilder and paints the result with window.paint_path. Copied into the mods by
// tools/install.sh; edit this file, not the copies.

// What each section's state means, written after its heading, and the marker behind that heading.
export const SECTION_CAPTIONS = {
  today: "— the one you picked",
  attention: "— waiting for you",
  working: "— busy right now",
  done: "— finished, not read yet",
  shed: "— account limits",
};

export const SECTION_TINTS = {
  today: "#f2d46b",
  attention: "#f0a487",
  working: "#a9d3b5",
  done: "#a9c7e3",
  shed: "#e3c49a",
};

export function sectionCaption(id) {
  return SECTION_CAPTIONS[id] ?? null;
}

// The tint at a marker's translucency, as an #rrggbbaa colour.
export function sectionTint(id, alpha = 0.45) {
  const hex = SECTION_TINTS[id];
  if (!hex) return null;
  const byte = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  return `${hex}${byte.toString(16).padStart(2, "0")}`;
}

// Deterministic ripple in [-1, 1], so a mark looks drawn but never changes from frame to frame.
function ripple(seed, i) {
  const value = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

// The width of a run of the heading font at `size`, enough to size its highlighter: a Latin
// character is 0.46 em of Patrick Hand, a CJK one a full em.
export function handWidth(text, size = 18) {
  let width = 0;
  for (const ch of String(text ?? "")) width += ch.codePointAt(0) >= 0x2e80 ? size : size * 0.46;
  return Math.round(width);
}

// A marker swipe: a band with a ragged top and bottom, a ragged start and end, and a slight tilt.
export function highlighterPoints(width, height, seed = 0) {
  const w = Math.max(4, width);
  const h = Math.max(3, height);
  const tilt = 0.6 + (seed % 4) * 0.4;
  const steps = Math.max(3, Math.round(w / 16));
  const point = (i, y, shift) => [((i / steps) * w), y + ripple(seed, i + shift) * 0.7 - tilt * (i / steps)];
  const points = [];
  for (let i = 0; i <= steps; i++) points.push(point(i, 0, 0));
  points.push([w - 1.6, h * 0.3], [w, h * 0.5], [w - 1, h * 0.72]);
  for (let i = steps; i >= 0; i--) points.push(point(i, h, 9));
  points.push([1.4, h * 0.74], [0, h * 0.5], [1.2, h * 0.24]);
  return points;
}

// A five-point star drawn in one stroke, the way it is in a margin: 0-2-4-1-3-0.
export function starPoints(radius, seed = 0) {
  const r = Math.max(3, radius);
  const corners = Array.from({ length: 5 }, (_, k) => {
    const angle = -Math.PI / 2 + (k * Math.PI * 2) / 5;
    const reach = r * (1 + 0.045 * ripple(seed, k));
    return [r + Math.cos(angle) * reach, r + Math.sin(angle) * reach];
  });
  return [0, 2, 4, 1, 3, 0].map((k) => corners[k]);
}

// A small ink circle that overshoots a little where the pen meets its start.
export function circlePoints(radius, seed = 0, steps = 16) {
  const r = Math.max(3, radius);
  const start = -0.4;
  const sweep = Math.PI * 2 + 0.25;
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const angle = start + sweep * (i / steps);
    const wobble = 1 + 0.05 * ripple(seed, i);
    points.push([r + Math.cos(angle) * r * wobble, r + Math.sin(angle) * r * wobble]);
  }
  return points;
}

// A quick underline that rises and falls instead of sitting on the rule.
export function squigglePoints(width, amp = 1.2, step = 6, seed = 0) {
  const w = Math.max(6, width);
  const points = [];
  let i = 0;
  for (let x = 0; x <= w; x += step, i++) {
    const height = (i % 2 ? amp : -amp) * (0.7 + 0.3 * ripple(seed, i));
    points.push([x, height]);
  }
  if (points.at(-1)[0] < w) points.push([w, ripple(seed, i) * amp]);
  return points;
}

// A hand-drawn gauge box: a pencil rectangle whose top and bottom edges wobble, closed so it
// can be stroked in one run.
export function gaugeOutlinePoints(w = 64, h = 10, seed = 0) {
  const width = Math.max(8, w);
  const height = Math.max(5, h);
  const bottom = height - 0.5;
  const wob = (i) => 0.3 * ripple(seed, i);
  return [
    [0.5, 0.5 + wob(0)],
    [width * 0.34, 0.5 + wob(1)],
    [width * 0.67, 0.5 + wob(2)],
    [width - 0.5, 0.5 + wob(3)],
    [width - 0.5, height / 2],
    [width - 0.5, bottom],
    [width * 0.67, bottom + wob(4)],
    [width * 0.34, bottom + wob(5)],
    [0.5, bottom + wob(6)],
    [0.5, height / 2],
    [0.5, 0.5 + wob(0)],
  ];
}

// Diagonal pencil hatching across the used share of a gauge, from the left edge: one stroke every
// 3 px, each climbing from the bottom edge to the top and cut off where the fill ends.
export function gaugeHatchSegments(w = 64, h = 10, used = 0) {
  const width = Math.max(8, w);
  const height = Math.max(5, h);
  const fill = (Math.max(0, Math.min(100, Number(used) || 0)) / 100) * width;
  const top = 1, bottom = height - 1;
  const rise = height - 2;
  const segments = [];
  for (let x = 0; x < fill - 0.5; x += 3) {
    const end = Math.min(fill, x + rise);
    if (end - x < 1) continue;
    segments.push([[x, bottom], [end, top]]);
  }
  return segments;
}

// A margin arrow pointing at the writing: a slightly bowed shaft and two barbs.
export function arrowSegments(length = 20, seed = 0) {
  const end = Math.max(10, length);
  const shaft = [];
  for (let i = 0; i <= 4; i++) shaft.push([(end * i) / 4, Math.sin((i / 4) * Math.PI) * 0.8 + ripple(seed, i) * 0.3]);
  return [shaft, [[end - 5, -3.2], [end, 0], [end - 5, 3.2]]];
}
