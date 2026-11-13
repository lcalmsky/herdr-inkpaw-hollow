// Modified from Herdr's shipped `pane` mod (Apache License 2.0, see LICENSE in this folder):
// the header is a bare handwriting label instead of a framed card header.
// A pane's header, for layouts that frame their panes:
//   { "tab": "active", "pane": { "header": { "content": { "mod": "inkpaw-pane" } } } }
// Shows the program's name with the agent's status written out, and the folder faintly behind it.
// On hover four words split, re-split, zoom and close the pane. Props from the app:
// { pane, terminal }. Click: focus the pane.

import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, home } from "herdr";

const INK = "#4b4239";
const DIM = "#7d6f60";
const FAINT = "#9a8b78";
const ACCENT = "#c46a3a";
const HAND = "Gowun Dodum";
const BODY = "Gowun Dodum";

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

export default class Pane extends View {
  init() { this.hovered = false; }

  me() {
    return panes().find((p) => p.pane === props()?.pane);
  }

  // A word, not a button: the header is written on the terminal's paper edge, so controls appear
  // only under the pointer and read as pencil notes.
  word(id, t, command, args) {
    return div()
      .id(id)
      .flex_none()
      .px(3)
      .cursor_pointer()
      .font_family(HAND)
      .text_size(12)
      .text_color(DIM)
      .hover((s) => s.text_color(INK).underline())
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(t);
  }

  render() {
    const p = this.me();
    if (!p) return div();
    const name = ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    const st = p.status;
    const pane = p.pane;
    const status = st === "working" ? "working" : st === "blocked" ? "waiting" : st === "done" ? "done" : null;
    return h_flex()
      .id(`pane-head-${pane}`)
      .size_full()
      .px(10)
      .gap(8)
      .items_center()
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      .child(div().flex_none().truncate().max_w(260).font_family(HAND).text_size(13).text_color(INK).child(name))
      .child(div().flex_1().min_w(0).truncate().font_family(BODY).text_size(12).text_color(FAINT).child(folder(p.cwd)))
      .when(Boolean(status), (el) => el.child(h_flex().flex_none().gap(1).items_center()
        .child(div().font_family(BODY).text_size(12).text_color(st === "blocked" ? ACCENT : DIM).child(status))
        .when(st === "working", (e) => e.child(div().font_family(BODY).text_size(12).text_color(FAINT)
          .frames(["", ".", "..", "..."], 420)))))
      .when(this.hovered, el => el
        .child(this.word(`ph-r-${pane}`, "right", "pane.split", { direction: "right", pane }))
        .child(this.word(`ph-d-${pane}`, "down", "pane.split", { direction: "down", pane }))
        .child(this.word(`ph-z-${pane}`, "zoom", "pane.zoom", { pane }))
        .child(this.word(`ph-x-${pane}`, "close", "pane.close", { pane })));
  }
}
