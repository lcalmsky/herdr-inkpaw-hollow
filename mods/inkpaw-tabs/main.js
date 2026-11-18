// Modified from Herdr's shipped `tabs` mod (0.1.12, Apache License 2.0, see LICENSE in this folder):
// an unnamed tab shows its agent's session name (or its space's name). The stored panels, the
// wheel and the scroll to the active tab follow the shipped 0.1.16.
//
// The bar is a clothesline: an ink line runs across the top 10 px and every tab is a paper tag
// hanging from a wooden clothespin. The active tag drops 4 px and its pin takes the accent.
// Keys, selection, renaming, dragging, the side panels and the window buttons are the shipped
// behaviors, redrawn.
import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle } from "gpui-base";
import { spaces, panes, run, openOverlay, window, shared, layout } from "herdr";

const INK = "#4b4239";
const PAPER = "#f8f1e3";
const WOOD = "#e9dfcb";
const RULE = "#d8cab0";
const DIM = "#7d6f60";
const FAINT = "#9a8b78";
const ACCENT = "#c46a3a";
const FIREFLY = "#c9a34e";
const THREAD = "#b9614f";
const HAND = "Gowun Dodum";

export const TAG_MAX_CHARS = 28;

// A tag fits its title up to 28 characters (CJK 1 em, Latin and digits 0.6 em); the rest
// truncates with an ellipsis.
export function tagWidth(text, size = 12) {
  let width = 0;
  let count = 0;
  for (const ch of String(text ?? "")) {
    if (count++ >= TAG_MAX_CHARS) break;
    width += ch.codePointAt(0) >= 0x2e80 ? size : size * 0.6;
  }
  return Math.max(24, Math.ceil(width));
}

const FOCUS_WATCH_MS = 100;

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// A tab-bar key: ←→ move to the neighbouring tab and wrap; ↩ and Space select the tab shown.
export function tabsKey(key, at, count) {
  if (!(count > 0)) return null;
  if (key === "right") return { at: (at + 1) % count, select: false };
  if (key === "left") return { at: (at - 1 + count) % count, select: false };
  if (key === "enter" || key === "space") return { at: Math.min(at, count - 1), select: true };
  return null;
}

// An unnamed tab shows its agent's session name (the terminal title Claude Code sets), else its
// space's name, not its position.
export function tabName(tab, space, list = []) {
  const withAgent = list.find((p) => p.tab === tab.id && p.program?.agent);
  const program = withAgent?.program ?? list.find((p) => p.tab === tab.id)?.program;
  const lead = withAgent ?? list.find((p) => p.tab === tab.id && p.focused);
  const live = (lead?.title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
  const telling = live && !/^[~/]/.test(live) && !live.includes("@") && live !== program?.name;
  if (!tab.named) return telling ? live : space?.name || tab.name;
  return /^tb\d+$/.test(tab.name) ? program?.name ?? "Terminal" : tab.name;
}

// The per-space panel choices; anything stored that isn't a plain object starts empty.
export function readPanels(raw) {
  let panels;
  try { panels = JSON.parse(raw ?? "{}"); } catch { panels = {}; }
  return panels && typeof panels === "object" && !Array.isArray(panels) ? panels : {};
}

// One tab per wheel notch. A touchpad or smooth-scrolling mouse sends many small events per
// gesture: a short swipe or one smoothed notch (about 25 px) switches one tab, a longer swipe
// keeps going a tab per 60 px, at most one every 100 ms so each shows. Returns the command or null.
export function wheelStep(swipe, e, now = Date.now()) {
  if (e.delta_lines) return e.delta_lines.y ? (e.delta_lines.y > 0 ? "tab.prev" : "tab.next") : null;
  const s = swipe, dy = e.delta?.y ?? 0;
  // Phases often arrive only as moves (a macOS touchpad included): a pause or a turn starts a new gesture.
  if (e.touch_phase === "started" || now - s.at > 250 || dy * s.acc < 0) Object.assign(s, { acc: 0, steps: 0 });
  s.at = now;
  s.acc += dy;
  const need = s.steps ? 60 : 20;
  if (Math.abs(s.acc) < need || now - s.last < 100) return null;
  s.acc -= Math.sign(s.acc) * need;
  s.steps++;
  s.last = now;
  return dy > 0 ? "tab.prev" : "tab.next";
}

export default class Tabs extends View {
  init(_props, cx) {
    this.pressed = null;
    this.at = 0;
    this.keyboard = false;
    this.handle = cx.focus_handle();
    this.panels = readPanels(localStorage.getItem("panels"));
    this.scroll = ScrollHandle.new();
    this.swipe = { acc: 0, steps: 0, at: 0, last: 0 };
    // A ring comes from is_focused(), and the shell redraws only on notify or reload.
    cx.timer.every(FOCUS_WATCH_MS, (cx) => this.watchFocus(cx));
  }

  focusKey() {
    return `${this.keyboard ? 1 : 0}|${this.handle?.is_focused?.() ? 1 : 0}`;
  }

  // Only the keyboard draws the tab's underline: a click focuses the bar too.
  watchFocus(cx) {
    const key = this.focusKey();
    if (key === this.drawnFocus) return;
    this.drawnFocus = key;
    cx.notify();
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  // Two wooden pegs over the line; the active tab's pin is the accent, the only color on the bar.
  pins(active) {
    const peg = () => div().w(3).h(9).flex_none().bg(active ? ACCENT : WOOD).border(1).border_color(INK);
    return h_flex().h(9).flex_none().gap(1).child(peg()).child(peg());
  }

  // working = a firefly blinking on the tag, blocked = the lantern lit, done = a red thread knot.
  statusMark(status) {
    if (status === "working") {
      return div().size(5).flex_none().rounded(3).bg(FIREFLY).loop("opacity", { from: 0.2, to: 1, period: 1600 });
    }
    if (status === "blocked") return div().size(5).flex_none().rounded(3).bg(ACCENT);
    if (status === "done") return svg("mods/inkpaw-tabs/knot.svg").size(9).flex_none().text_color(THREAD);
    return null;
  }

  stop(_e, cx) { cx.stop_propagation(); }

  paper(active, focused, mark, label, onClose) {
    return div().relative().mt(active ? 4 : 0).h(27).pl(7).pr(mark || onClose ? 13 : 7)
      .flex().items_center().bg(PAPER).border(1).border_color(active ? INK : RULE)
      .when(focused, (el) => el.border(2).border_color(ACCENT))
      .when(Boolean(mark), (el) => el.child(div().absolute().right(3).top(1).child(mark)))
      .when(Boolean(onClose), (el) => el.child(div()
        .absolute().right(1).bottom(0).w(14).h(14).flex().items_center().justify_center().cursor_pointer()
        .font_family(HAND).text_size(12).text_color(FAINT).hover((s) => s.text_color(THREAD))
        .on_mouse_down("left", (e, cx) => this.stop(e, cx))
        .on_click((_e, cx) => { cx.stop_propagation(); onClose(); }).child("×")))
      .child(div().w(tagWidth(label)).flex_none().truncate().font_family(HAND).text_size(12)
        .text_color(active ? INK : DIM).child(label));
  }

  tag(c, i, space, shown) {
    const active = Boolean(c.active);
    const focused = this.keyboard && i === this.at && Boolean(this.handle?.is_focused?.());
    const mark = this.statusMark(c.status);
    const name = tabName(c, space, panes());
    const label = c.zoomed ? `${name} Z` : name;
    const close = active ? () => run("tab.close", { id: c.id }) : null;
    return v_flex().id(`tab-${c.id}`).flex_none().items_start().pt(3).cursor_pointer()
      .role("tab").aria_selected(active)
      // A rename or status mark on this or an earlier tag can push the revealed one out.
      .when(i <= this.reveal, (el) => el.on_size_change((_size, cx) => { this.scroll.scroll_to_item(this.reveal); cx.notify(); }))
      .on_mouse_down("left", (e, cx) => {
        cx.stop_propagation();
        this.keyboard = false; this.at = i; this.pressed = i;
        if (e.click_count === 2) run("tab.rename", { id: c.id });
      })
      .on_mouse_up("left", () => {
        const from = this.pressed; this.pressed = null;
        if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex((x) => x.id === c.id) + 1 });
        else run("tab.select", { id: c.id });
      })
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } });
      })
      .child(this.pins(active))
      .child(this.paper(active, focused, mark, label, close));
  }

  // The empty clothespin at the end of the line holds nothing yet: a click asks what to hang.
  newPin() {
    return v_flex().id("tab-new").flex_none().items_start().pt(3).px(8).cursor_pointer()
      .hover((s) => s.opacity(0.7))
      .on_mouse_down("left", (e, cx) => this.stop(e, cx))
      .on_click(() => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 }))
      .child(this.pins(false))
      .child(div().h(20).px(5).flex().items_center().justify_center().bg(PAPER).border(1).border_color(RULE)
        .font_family(HAND).text_size(12).text_color(DIM).child("+"));
  }

  panelTag(id, label, on, action) {
    return v_flex().id(`panel-${id}`).flex_none().items_start().pt(3).cursor_pointer()
      .on_mouse_down("left", (e, cx) => this.stop(e, cx))
      .on_click(action)
      .child(this.pins(on))
      .child(div().h(22).px(7).flex().items_center().bg(PAPER).border(1).border_color(on ? INK : RULE)
        .font_family(HAND).text_size(12).text_color(on ? INK : DIM).child(label));
  }

  windowButton(id, label, action) {
    return div().id(id).flex_none().h(20).px(6).flex().items_center().cursor_pointer()
      .font_family(HAND).text_size(13).text_color(DIM)
      .hover((s) => s.text_color(INK)).on_click(action).child(label);
  }

  render() {
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    this.at = Math.min(Math.max(this.at ?? 0, 0), Math.max(0, shown.length - 1));
    const active = shown.findIndex((tab) => tab.active);
    // The keyboard's tag when it is moving through them, else the active one, stays in view.
    const reveal = this.keyboard ? this.at : active;
    this.reveal = reveal;
    const selected = `${shown[reveal]?.id}|${reveal}`;
    if (selected !== this.revealed) {
      this.revealed = selected;
      if (reveal >= 0) this.scroll.scroll_to_item(reveal);
    }
    this.drawnFocus = this.focusKey();
    const root = layout(), w = window();
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    this.syncPanel(space, panel, body, enabled);
    const panelTag = (id, label) => {
      const on = panel && !panel.hidden && body?.active === id;
      return this.panelTag(id, label, Boolean(on), () => {
        if (on) run("layout.hide", { id: "panel" });
        else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
      });
    };
    const winButton = (id, label, action) => this.windowButton(id, label, action);
    return div().relative().size_full().min_w(0)
      .track_focus(this.handle).tab_index(0)
      .on_mouse_down("left", () => { this.keyboard = false; })
      .on_key_down((event, cx) => {
        const next = tabsKey(event.key, this.at, shown.length);
        if (!next) return;
        this.keyboard = true;
        this.at = next.at;
        if (next.select) run("tab.select", { id: shown[this.at].id });
        cx.stop_propagation();
        cx.notify();
      })
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel((e) => { const step = wheelStep(this.swipe, e); if (step) run(step); })
      .child(div().absolute().left(6).right(6).top(10).h(1).bg("#4b42398c"))
      .child(h_flex().size_full().min_w(0).items_start()
        .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_start().gap(8).overflow_x_scroll()
          .track_scroll(this.scroll)
          .on_size_change((_size, cx) => { if (reveal >= 0) { this.scroll.scroll_to_item(reveal); cx.notify(); } })
          .children(shown.map((c, i) => this.tag(c, i, space, shown))))
        .child(this.newPin())
        // Without a side panel in the layout the buttons would show and hide nothing.
        .when(Boolean(panel && body) && enabled.includes("files"), el => el.child(panelTag("files", "Files")))
        .when(Boolean(panel && body) && enabled.includes("changes"), el => el.child(panelTag("changes", "Changes")))
        .when(Boolean(w?.buttons), el => el.child(h_flex().mt(10).flex_none().items_center().gap(2)
          .child(winButton("minimize", w.platform === "windows" ? svg("mods/inkpaw-tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
          .child(winButton("maximize", w.platform === "windows" ? svg(`mods/inkpaw-tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
          .child(winButton("close-window", w.platform === "windows" ? svg("mods/inkpaw-tabs/win-close.svg").size(16) : "×", () => run("window.close"))))));
  }
}
