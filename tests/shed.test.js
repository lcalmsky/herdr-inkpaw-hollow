// Tests for the woodshed: the folder-guarded launch, the axe's account and checked-mode init.
// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

await import("./stubs/register.js");
const { default: ClaudeAccounts, inFolder, launchFor } = await import("../mods/inkpaw-shed/main.js");

const sh = (script, env = {}) => spawnSync("sh", ["-c", script], {
  encoding: "utf8", env: { ...process.env, ...env },
});

test("inFolder never starts the session when the cd fails", () => {
  const guarded = sh(inFolder("/no/such/dir", "echo ran"));
  assert.notEqual(guarded.status, 0, "the guarded line exits");
  assert.equal(guarded.stdout.includes("ran"), false);

  const oldShape = sh("cd '/no/such/dir' && unset X; echo ran");
  assert.equal(oldShape.status, 0);
  assert.equal(oldShape.stdout.trim(), "ran", "the old shape runs the session outside the folder");

  const root = mkdtempSync(join(tmpdir(), "inkpaw-shed-"));
  const quoted = join(root, "it's");
  mkdirSync(quoted);
  const printed = sh(inFolder(quoted, "pwd"));
  assert.equal(printed.status, 0, printed.stderr);
  assert.equal(realpathSync(printed.stdout.trim()), realpathSync(quoted));

  const launched = sh(inFolder("/no/such/dir", launchFor("default", "", "echo")), { SHELL: "/bin/sh" });
  assert.notEqual(launched.status, 0);
  assert.equal(launched.stdout.trim(), "", "the launch command never ran");
});

function shedView(fields) {
  const view = new ClaudeAccounts();
  view.role = "shed";
  view.demo = false;
  view.accounts = [{ name: "default" }, { name: "work" }];
  view.focusKey = "";
  view.currentKey = "";
  view.current = "default";
  view.readError = null;
  Object.assign(view, fields);
  return view;
}

test("no focused Claude Code pane means no axe, whatever cca reports as current", () => {
  globalThis.herdrState = {};
  const view = shedView({});
  view.shed({});
  assert.equal(view.shedAxe, null);
});

test("the axe sits on the account the focused pane runs", () => {
  globalThis.herdrState = {
    agents: [{ address: "t1", focused: true }],
    terminals: [{ address: "t1", program: { key: "claude" }, foreground: { pid: 123 } }],
  };
  const view = shedView({ focusKey: "123", currentKey: "123", current: "work" });
  view.shed({});
  assert.equal(view.shedAxe, "work");
});

test("the gallery's demo shed keeps its axe on the fixture's current account", () => {
  const view = shedView({ demo: true, current: "work" });
  view.shed({});
  assert.equal(view.shedAxe, "work");
  delete globalThis.herdrState;
});

test("a checked woodshed reads nothing and registers no timers", () => {
  const counts = { spawn: 0, every: 0, after: 0 };
  const cx = {
    spawn() { counts.spawn++; },
    notify() {},
    timer: { after() { counts.after++; }, every() { counts.every++; } },
    focus_handle() { return { focus() {}, is_focused() { return false; } }; },
  };
  globalThis.herdrState = { props: { role: "shed" } };
  globalThis.herdrExec = [];
  globalThis.herdrChecking = true;
  new ClaudeAccounts().init({}, cx);
  assert.equal(counts.every, 0);
  assert.equal(globalThis.herdrExec.length, 0);
  delete globalThis.herdrChecking;
  delete globalThis.herdrState;
  delete globalThis.herdrExec;
});

test("a checked accounts menu, the role herdr-app check loads, runs nothing", () => {
  const counts = { spawn: 0 };
  const cx = {
    spawn() { counts.spawn++; },
    notify() {},
    timer: { after() {}, every() {} },
    focus_handle() { return { focus() {}, is_focused() { return false; } }; },
  };
  globalThis.herdrState = { props: {} };
  globalThis.herdrExec = [];
  globalThis.herdrChecking = true;
  new ClaudeAccounts().init({}, cx);
  assert.equal(counts.spawn, 0, "no launch-file read, no knownAgents, no cca");
  assert.equal(globalThis.herdrExec.length, 0);
  delete globalThis.herdrChecking;
  delete globalThis.herdrState;
  delete globalThis.herdrExec;
});
