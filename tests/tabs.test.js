// Tests for the tab bar: stored panels, the wheel's gesture, the scroll to the active tab and the
// side-panel tags. Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";

await import("./stubs/register.js");
const { default: Tabs, readPanels, wheelStep } = await import("../mods/inkpaw-tabs/main.js");

function fakeCx(counts = { spawn: 0, every: 0, after: 0 }) {
  return {
    stopped: false,
    notify() {},
    stop_propagation() { this.stopped = true; },
    spawn(fn) { counts.spawn++; return fn(this); },
    timer: { after() { counts.after++; }, every() { counts.every++; } },
    focus_handle() { return { focus() {}, is_focused() { return false; } }; },
  };
}

const spaceWith = (tabs) => ({ id: "s1", active: true, tabs });
const tab = (id, active = false) => ({ id, name: id, active });

test("stored panels that are not a plain object start empty", () => {
  assert.deepEqual(readPanels(null), {});
  assert.deepEqual(readPanels("null"), {});
  assert.deepEqual(readPanels("[1]"), {});
  assert.deepEqual(readPanels("not json"), {});
  assert.deepEqual(readPanels("7"), {});
  assert.deepEqual(readPanels('{"s1":"files"}'), { s1: "files" });
});

test("a stored null does not throw on init or render", () => {
  globalThis.herdrState = {
    spaces: [spaceWith([tab("t1", true)])],
    // The panel is in the layout, so render reaches the stored per-space choices.
    layout: { id: "root", children: [{ id: "panel", hidden: true, children: [{ id: "panel-body", active: null }] }] },
  };
  localStorage.setItem("panels", "null");
  const view = new Tabs();
  view.init({}, fakeCx());
  assert.doesNotThrow(() => view.render());
  localStorage.setItem("panels", "{}");
  delete globalThis.herdrState;
});

test("a trackpad gesture switches one tab, not one per event", () => {
  const swipe = { acc: 0, steps: 0, at: 0, last: 0 };
  const steps = [];
  for (let i = 0; i < 10; i++) {
    const step = wheelStep(swipe, { delta: { y: 3 }, touch_phase: "moved" }, 1000 + i * 16);
    if (step) steps.push(step);
  }
  assert.deepEqual(steps, ["tab.prev"]);

  const long = { acc: 0, steps: 0, at: 0, last: 0 };
  const longSteps = [];
  for (let i = 0; i < 40; i++) {
    const now = 1000 + i * 16;
    const step = wheelStep(long, { delta: { y: 6 }, touch_phase: "moved" }, now);
    if (step) longSteps.push(now);
  }
  assert.ok(longSteps.length > 1, "a long swipe keeps going");
  for (let i = 1; i < longSteps.length; i++) {
    assert.ok(longSteps[i] - longSteps[i - 1] >= 100, `steps at ${longSteps}`);
  }

  assert.equal(wheelStep({ acc: 0, steps: 0, at: 0, last: 0 }, { delta_lines: { x: 0, y: -1 } }), "tab.next");
  assert.equal(wheelStep({ acc: 0, steps: 0, at: 0, last: 0 }, { delta_lines: { x: 0, y: 0 } }), null);

  const paused = { acc: 0, steps: 0, at: 0, last: 0 };
  wheelStep(paused, { delta: { y: 19 }, touch_phase: "moved" }, 1000);
  assert.equal(wheelStep(paused, { delta: { y: 1 }, touch_phase: "moved" }, 1300), null,
    "19 px then a pause then 1 px is a new gesture, not a step");
});

test("render scrolls the active tab into view once", () => {
  globalThis.herdrState = {
    spaces: [spaceWith([tab("t0"), tab("t1"), tab("t2"), tab("t3"), tab("t4"), tab("t5", true), tab("t6"), tab("t7")])],
  };
  globalThis.uiScrollHandles = [];
  const view = new Tabs();
  view.init({}, fakeCx());
  const handle = globalThis.uiScrollHandles.at(-1);
  view.render();
  assert.ok(handle.calls.includes(5), String(handle.calls));
  const calls = handle.calls.length;
  view.render();
  assert.equal(handle.calls.length, calls, "an unchanged render scrolls nowhere");
  view.keyboard = true;
  view.at = 2;
  view.render();
  assert.ok(handle.calls.includes(2), String(handle.calls));
  delete globalThis.uiScrollHandles;
  delete globalThis.herdrState;
});

test("the Files and Changes tags need a side panel in the layout", () => {
  globalThis.herdrState = { spaces: [spaceWith([tab("t1", true)])] };
  const view = new Tabs();
  view.init({}, fakeCx());

  globalThis.herdrState.layout = { id: "root", children: [] };
  globalThis.uiIds = new Map();
  view.render();
  assert.equal(globalThis.uiIds.has("panel-files"), false);
  assert.equal(globalThis.uiIds.has("panel-changes"), false);

  globalThis.herdrState.layout = {
    id: "root",
    children: [{ id: "panel", hidden: true, children: [{ id: "panel-body", active: null }] }],
  };
  globalThis.uiIds = new Map();
  view.render();
  assert.equal(globalThis.uiIds.has("panel-files"), true);
  assert.equal(globalThis.uiIds.has("panel-changes"), true);

  delete globalThis.uiIds;
  delete globalThis.herdrState;
});
