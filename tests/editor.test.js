// Tests for the editor's Open as tab: a lone editor renames its tab, a shared one moves out.
// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";

await import("./stubs/register.js");
const { default: EditorView, loneTab } = await import("../mods/inkpaw-editor/main.js");

const FILE = "/Users/test/notes.md";
const editorPane = (pane = "p1", tab = "T1") => ({ pane, mod: "inkpaw-editor", tab });

test("loneTab names the editor's tab only when no other pane shares it", () => {
  assert.equal(loneTab([editorPane()], { pane: "p1" }), "T1");
  assert.equal(loneTab([editorPane(), { pane: "p2", terminal: "t", tab: "T1" }], { pane: "p1" }), null);
  assert.equal(loneTab([editorPane(), { pane: "p2", mod: "other", tab: "T2" }], { pane: "p2" }), null);
});

function toTab({ panes, focused }) {
  globalThis.herdrState = { panes, focused };
  globalThis.herdrRuns = [];
  const tasks = [];
  const cx = { notify() {}, spawn(fn) { tasks.push(fn(cx)); } };
  const view = new EditorView();
  view.file = FILE;
  view.inTab = false;
  view.dirty = false;
  view.stale = null;
  view.toTab(cx);
  return { view, runs: globalThis.herdrRuns, tasks };
}

test("Open as tab on a lone editor renames its own tab", () => {
  const { view, runs } = toTab({ panes: [editorPane()], focused: { pane: "p1" } });
  assert.deepEqual(runs, [["tab.rename", { id: "T1", name: "notes.md" }]]);
  assert.equal(view.inTab, true);
  delete globalThis.herdrState;
  delete globalThis.herdrRuns;
});

test("Open as tab on an editor sharing its tab opens a new tab and closes the pane", () => {
  const { runs } = toTab({
    panes: [editorPane(), { pane: "p2", terminal: "t2", tab: "T1" }],
    focused: { pane: "p1" },
  });
  assert.deepEqual(runs, [
    ["tab.new", { name: "notes.md", mod: "inkpaw-editor", props: { file: FILE, tab: true } }],
    ["pane.close", { pane: "p1" }],
  ]);
  delete globalThis.herdrState;
  delete globalThis.herdrRuns;
});

test("Open as tab with the focus elsewhere moves nothing and says why", () => {
  const { view, runs } = toTab({
    panes: [editorPane(), { pane: "p2", mod: "other", tab: "T2" }],
    focused: { pane: "p2" },
  });
  assert.deepEqual(runs, []);
  assert.equal(typeof view.stale, "string");
  assert.ok(view.stale.startsWith("Not moved"), view.stale);
  delete globalThis.herdrState;
  delete globalThis.herdrRuns;
});
