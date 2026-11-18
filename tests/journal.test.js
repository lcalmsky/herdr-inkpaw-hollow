// Tests for the notebook's link handling, checklist gate, PR search fields and checked-mode init.
// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";

await import("./stubs/register.js");
const { default: LineartJournal, canRequestChecklist, prFields, prsOf } = await import("../mods/inkpaw-journal/main.js");

function fakeCx(tasks = []) {
  const cx = {
    stopped: false,
    notices: 0,
    opened: null,
    stop_propagation() { this.stopped = true; },
    notify() { this.notices++; },
    open_url(url) { this.opened = url; },
    spawn(fn) { tasks.push(fn(cx)); },
    write_to_clipboard() {},
    timer: { after() {}, every() {} },
    focus_handle() { return { focus() {}, is_focused() { return false; } }; },
  };
  return { cx, tasks };
}

function reset() {
  delete globalThis.herdrState;
  delete globalThis.herdrExec;
  delete globalThis.herdrExecResult;
  delete globalThis.herdrExecReject;
  delete globalThis.herdrClosed;
  delete globalThis.herdrChecking;
}

test("a text link stops the click from reaching the stall row beneath it", () => {
  globalThis.uiIds = new Map();
  const order = [];
  const { cx } = fakeCx();
  cx.stop_propagation = () => order.push("stop");
  const view = Object.create(LineartJournal.prototype);
  const el = view.textLink("Snooze", () => order.push("snooze"), "#c46a3a", "row-snooze");
  assert.ok(el);
  const click = globalThis.uiIds.get("row-snooze")?.handlers?.on_click;
  assert.equal(typeof click, "function", "the link registers a click handler");
  click({}, cx);
  assert.deepEqual(order, ["stop", "snooze"], "the row's own on_click never runs");
  delete globalThis.uiIds;
});

test("Request checklist is offered to Claude sessions and sessions without an agent only", () => {
  assert.equal(canRequestChecklist({ terminal: "t1", raw: { t: "s", agent: "claude" } }), true);
  assert.equal(canRequestChecklist({ terminal: "t1", raw: { t: "s" } }), true, "no agent means Claude");
  assert.equal(canRequestChecklist({ terminal: "t1", raw: { t: "s", agent: "codex" } }), false);
  assert.equal(canRequestChecklist({ terminal: "t1", raw: { t: "s", agent: "gemini" } }), false);
  assert.equal(canRequestChecklist({ terminal: "t1", raw: { t: "s" }, hasChecklist: true }), false);
  assert.equal(canRequestChecklist({ terminal: null, raw: { t: "s" } }), false);
});

test("opening a local page says so when it fails", async () => {
  const view = Object.create(LineartJournal.prototype);
  const flashes = [];
  view.flash = (_cx, message) => flashes.push(message);

  globalThis.herdrExec = [];
  globalThis.herdrExecReject = new Error("no opener");
  let fake = fakeCx();
  view.openUrl("/tmp/page.html", fake.cx);
  await Promise.all(fake.tasks);
  assert.deepEqual(flashes, ["Couldn't open that page"]);
  assert.deepEqual(globalThis.herdrExec, [["open", ["/tmp/page.html"]]]);

  delete globalThis.herdrExecReject;
  globalThis.herdrExecResult = { code: 1, stdout: "", stderr: "" };
  fake = fakeCx();
  view.openUrl("/tmp/page.html", fake.cx);
  await Promise.all(fake.tasks);
  assert.deepEqual(flashes, ["Couldn't open that page", "Couldn't open that page"]);

  globalThis.herdrExecResult = { code: 0, stdout: "", stderr: "" };
  fake = fakeCx();
  view.openUrl("/tmp/page.html", fake.cx);
  await Promise.all(fake.tasks);
  assert.equal(flashes.length, 2, "a page that opened says nothing");

  globalThis.herdrExec.length = 0;
  fake = fakeCx();
  view.openUrl("https://x", fake.cx);
  assert.equal(fake.cx.opened, "https://x");
  assert.equal(globalThis.herdrExec.length, 0, "http(s) never runs open");
  reset();
});

test("the links note stays open with an error when a link fails, and closes when it opens", async () => {
  globalThis.herdrState = { props: { overlay: "o9" } };
  globalThis.herdrClosed = [];
  globalThis.herdrExec = [];
  const view = Object.create(LineartJournal.prototype);
  const link = { url: "/tmp/missing.html", text: "Pages" };

  globalThis.herdrExecResult = { code: 1, stdout: "", stderr: "" };
  let fake = fakeCx();
  view.openLink(link, fake.cx);
  await Promise.all(fake.tasks);
  assert.deepEqual(globalThis.herdrClosed, [], "a failure must not close the note");
  assert.deepEqual(view.linkError, { url: "/tmp/missing.html", text: "Couldn't open it" });
  assert.ok(fake.cx.notices > 0, "the note redraws with the error");

  globalThis.herdrExecResult = { code: 0, stdout: "", stderr: "" };
  fake = fakeCx();
  view.openLink(link, fake.cx);
  await Promise.all(fake.tasks);
  assert.deepEqual(globalThis.herdrClosed, ["o9"]);
  reset();
});

test("a checked notebook registers no timers, spawns nothing and runs nothing", () => {
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
  new LineartJournal().init({}, cx);
  assert.deepEqual(counts, { spawn: 0, every: 0, after: 0 });
  assert.deepEqual(globalThis.herdrExec, []);

  globalThis.herdrChecking = false;
  new LineartJournal().init({}, cx);
  assert.ok(counts.every > 0, "live mode polls");
  assert.ok(counts.spawn > 0, "live mode runs the command loop");
  reset();
});

test("an animal's search fields carry every PR on its terminal", () => {
  const item = {
    terminal: "t1",
    prTag: "#12",
    extraPRs: ["#13"],
    prLinks: [{ tag: "#12", url: "https://github.com/o/r/pull/12" }],
  };
  assert.deepEqual(prFields(item), ["#12", "#13", "#12", "https://github.com/o/r/pull/12"]);
  assert.deepEqual(prsOf([item, { terminal: "t2", prTag: null }, { prTag: "#99" }]), {
    t1: ["#12", "#13", "https://github.com/o/r/pull/12"],
  }, "deduped, order kept; a row without a terminal or a PR is left out");
});
