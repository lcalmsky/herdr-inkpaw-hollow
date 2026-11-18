// Tests for the forest band: PR search, the keyboard plank's place, the "?" note's size and
// checked-mode init. Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";

await import("./stubs/register.js");
const {
  keyPlankRest, labelWidth, searchSets, signShape, tokensOf,
  SIGN_CLEAR, SIGN_MIN_TEXT, SIGN_MIN_W, SIGN_PAD_X, SIGN_PAD_Y, SIGN_TEXT,
  HELP_NOTE, helpNoteSize,
} = await import("../mods/inkpaw-forest/forest.js");
const { default: LineArtBand, HELP } = await import("../mods/inkpaw-forest/main.js");

test("a PR number in a query keeps the animal it belongs to and its cabin", () => {
  const spaces = [{ id: "s1", name: "garden" }];
  const agents = [{ address: "a1", space: "s1", space_name: "garden" }];
  const cabinOf = new Map([["s1", 0]]);
  const tokens = tokensOf("#77");
  assert.deepEqual(tokens, ["#77"]);

  const found = searchSets({ spaces, agents, cabinOf, cabinCount: 1, tokens, prs: { a1: ["#77"] } });
  assert.deepEqual([...found.animals], ["a1"]);
  assert.deepEqual(found.cabins, [true]);

  const without = searchSets({ spaces, agents, cabinOf, cabinCount: 1, tokens });
  assert.deepEqual([...without.animals], []);
  assert.deepEqual(without.cabins, [false]);
});

const peaks = [125, 280, 435, 590, 1010, 1165, 1320, 1475];
const labels = ["garden-api", "PAW-12 trail", "lantern-docs", "acorn-cli", "moss-ui", "PAW-31 tea", "fern-site", "PAW-44 seed"];

function reviewPlanks() {
  const scale = 1;
  const planks = [];
  peaks.forEach((x, i) => {
    const s = signShape([{ label: labels[i] }, { label: labels[i].slice(0, 4) + "2" }], 0,
      { size: SIGN_TEXT, scale, width: 180, peak: { x, y: 80 }, top: 0 });
    planks.push(...s.planks);
  });
  const textSize = Math.max(SIGN_MIN_TEXT, SIGN_TEXT * scale), h = textSize + SIGN_PAD_Y * 2;
  const full = Math.max(SIGN_MIN_W * scale,
    labelWidth("in the forest", textSize, 0.52) + labelWidth("← → walk · Space visit · ↩ go · ? more", textSize, 0.52) + 6 + SIGN_PAD_X * 2);
  const compact = Math.max(SIGN_MIN_W * scale, labelWidth("in the forest", textSize, 0.52) + SIGN_PAD_X * 2);
  return { planks, h, full, compact };
}

const crosses = (rest, w, h, p) => rest.x < p.x + p.w + SIGN_CLEAR && rest.x + w + SIGN_CLEAR > p.x
  && rest.y < p.y + p.h + SIGN_CLEAR && rest.y + h + SIGN_CLEAR > p.y;

test("the full keyboard plank says so when it has no clear place", () => {
  const { planks, h, full } = reviewPlanks();
  const rest = keyPlankRest({ w: full, h, planks });
  assert.equal(rest.clear, false, "before the fix it returned an overlapping spot without saying so");
});

test("the compact keyboard plank clears every signboard", () => {
  const { planks, h, compact } = reviewPlanks();
  const rest = keyPlankRest({ w: compact, h, planks });
  assert.equal(rest.clear, true);
  for (const p of planks) assert.equal(crosses(rest, compact, h, p), false, `crosses ${p.label}`);
});

test("a clear plank never overlaps a signboard or an avoided rect", () => {
  let seed = 0x1a2b3c4d;
  const rnd = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let n = 0; n < 500; n++) {
    const planks = [];
    for (let i = Math.floor(rnd() * 17); i > 0; i--) {
      planks.push({ x: rnd() * 1600, y: 20 + rnd() * 70, w: 30 + rnd() * 150, h: 10 + rnd() * 12 });
    }
    const avoid = rnd() < 0.25 ? [{ x: rnd() * 1600, y: 20 + rnd() * 40, w: 30 + rnd() * 150, h: 10 + rnd() * 12 }] : [];
    const w = 40 + rnd() * 380, h = 14 + rnd() * 8;
    const rest = keyPlankRest({ w, h, planks, avoid });
    assert.ok(rest.clear === true || rest.clear === false, `case ${n}: says whether it is clear`);
    if (rest.clear) {
      for (const p of [...planks, ...avoid]) assert.equal(crosses(rest, w, h, p), false, `case ${n}`);
    } else {
      assert.ok(rest.x + w <= 1600 || rest.x === 90, `case ${n}: ${rest.x} + ${w}`);
    }
  }
});

test("an avoided rect pushes the plank right; no rects leaves it at the tag's corner", () => {
  const pushed = keyPlankRest({ w: 100, h: 20, avoid: [{ x: 80, y: 0, w: 200, h: 60 }] });
  assert.ok(pushed.x >= 284, String(pushed.x));
  assert.equal(pushed.clear, true);

  assert.deepEqual(keyPlankRest({ w: 100, h: 20 }), { x: 90, y: 22, shifted: false, clear: true });
});

test("the ? note's paper grows so its three columns never run past the edge", () => {
  const columns = [HELP.slice(0, 3), HELP.slice(3, 6), HELP.slice(6)];
  const widest = (lines) => Math.max(0, ...lines.map((line) => labelWidth(line, 11, 0.52)));
  const textW = columns.reduce((sum, lines) => sum + widest(lines), 0) + HELP_NOTE.gap * 2;
  for (const scale of [1, 0.8, 0.6]) {
    const size = helpNoteSize(columns, 11, scale);
    assert.ok((size.w - 2 * HELP_NOTE.padX) * scale >= textW, `scale ${scale} width`);
    assert.ok((size.h - 2 * HELP_NOTE.padY) * scale >= 3 * size.lineH, `scale ${scale} height`);
  }
  assert.ok(320 - 2 * HELP_NOTE.padX < textW, "the old fixed paper was too narrow at scale 1");
});

test("a checked forest registers no timers, spawns nothing and runs nothing", () => {
  const counts = { spawn: 0, every: 0, after: 0 };
  const cx = {
    spawn() { counts.spawn++; },
    notify() {},
    timer: { after() { counts.after++; }, every() { counts.every++; } },
    focus_handle() { return { focus() {}, is_focused() { return false; } }; },
  };
  globalThis.herdrState = { props: {} };
  globalThis.herdrExec = [];
  globalThis.herdrChecking = true;
  new LineArtBand().init({}, cx);
  assert.deepEqual(counts, { spawn: 0, every: 0, after: 0 });
  assert.equal(globalThis.herdrExec.length, 0);
  delete globalThis.herdrChecking;
  delete globalThis.herdrState;
  delete globalThis.herdrExec;
});
