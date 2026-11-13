import { View, div, image, PathBuilder } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, spaces, terminals, panes, focused, props, run, exec, nextCommand, shared, setShared, openOverlay } from "herdr";
import { DATA } from "./data.js";
import { DEMO } from "./demo.js";
import { DESIGN, fit, layoutScene, bubbleText, bubbleWidth, bubbleLevels, walkMs, hash } from "./scene.js";
import {
  CABIN_WIDTH,
  KEY_TAG_X,
  activeCabin,
  agentName,
  agentsBySpace,
  cabinRepoKeys,
  cabinSigns,
  cwdOf,
  endOf,
  fenceRuns,
  focusTarget,
  forestKeyCommand,
  greetPoses,
  idleShells,
  keyPlankRest,
  labelWidth,
  nextOf,
  plankGrainPoints,
  plankOutlinePoints,
  repoMovePlan,
  searchSets,
  signShape,
  SIGN_MIN_TEXT,
  SIGN_MIN_W,
  SIGN_PAD_X,
  SIGN_PAD_Y,
  SIGN_TEXT,
  silentAgents,
  spaceRows,
  stepBy,
  tokensOf,
  xOrder,
} from "./forest.js";

const ART = "mods/inkpaw-forest/art/";
const UI = "mods/inkpaw-forest/ui/";
const L = DATA.layout;
const INK = DATA.palette.ink;
const PAPER = DATA.palette.paper;
const ACCENT = "#c46a3a";
const ACTIVE_PLANK = "#f6dfc9";
const GREET_ZOOM = 1.4;
const FONT = "Gowun Dodum";
const HEADING_FONT = "Patrick Hand";
// The keyboard plank hangs from the top vine on two cords, clear of the traffic lights.
const KEY_TAG = {
  vine: 14,
  text: "in the forest",
  hint: "← → walk · Space visit · ↩ go · ? more",
};
const KEY_DROP = 40;
const MUTED = "#7d6f60";
const KEY_DROP_MS = 420;
const KEY_RISE_MS = 260;
const CABINS = L.cabins.length;
const STATUS = { blocked: "Lantern lit", working: "At work", done: "Home again", idle: "Resting" };
const REPO_MS = 30 * 1000;
const FOCUS_WATCH_MS = 100;
// The gable apex of each cabin's base.svg, in design y; cabin.x is the apex's x. The base art is
// fixed, so the signs hang from these points rather than guessing a shared roof line.
const ROOF_PEAK = [80, 76, 82, 78, 76, 82, 80, 78];
const GROUND = L.groundY;
const HELP = [
  "← →   Walk between animals",
  "⌥ ← →  First · last",
  "Space  The waiting one",
  "⇧Space  The finished one",
  "↩   Go to them",
  "Esc  Step back",
  "⌘⌫  Clear the search",
  "?   Fold this note",
];

function meta(file) {
  const m = DATA.files[file];
  if (!m) throw new Error(`inkpaw-forest: no ${file} in manifest`);
  return m;
}

function animalName(kind) {
  return kind ? kind[0].toUpperCase() + kind.slice(1) : "";
}

function quiet(ms) {
  const m = Math.floor(ms / 60000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`;
}

// Turns point runs into one stroked path.
function strokePath(segments, width) {
  let builder = PathBuilder.stroke(width);
  for (const segment of segments) {
    segment.forEach(([x, y], index) => {
      builder = index ? builder.line_to(x, y) : builder.move_to(x, y);
    });
  }
  return builder.build();
}

function fillPath(points) {
  return PathBuilder.fill().add_polygon(points, true).build();
}

export default class LineArtBand extends View {
  init(_props, cx) {
    this.demo = props()?.demo === true;
    this.size = { width: DESIGN.width, height: DESIGN.height };
    this.pos = new Map();
    this.ready = false;
    this.handle = cx.focus_handle();
    this.repos = {};
    this.reading = false;
    this.lastMove = null;
    this.turns = {};
    this.showKeys = false;
    this.focusKey = null;
    this.hopKey = null;
    this.hopUp = false;
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "focus") {
          this.handle.focus();
          cx.notify();
        } else if (command === "toggle") {
          // The forest's own keyboard toggle, so the key can hand the keyboard back as well as take it.
          if (this.handle.is_focused()) run("pane.go", { direction: "down" });
          else this.handle.focus();
          cx.notify();
        }
      }
    });
    cx.timer.every(REPO_MS, (cx) => this.readRepos(cx));
    cx.timer.every(REPO_MS, (cx) => cx.notify());
    // pane.go and bare clicks move the keyboard without this view being told.
    cx.timer.every(FOCUS_WATCH_MS, (cx) => this.watchFocus(cx));
    this.readRepos(cx);
  }

  // An absolutely placed picture whose anchor sits on design point (ax, ay).
  box(f, file, ax, ay, extra = {}) {
    const m = meta(file);
    const w = m.w * f.s, h = m.h * f.s;
    let el = div()
      .absolute()
      .left(f.X(ax - m.anchor[0]) + (extra.dx || 0))
      .top(f.Y(ay - m.anchor[1]) + (extra.dy || 0))
      .w(w)
      .h(h);
    if (extra.id) el = el.id(extra.id);
    return { el, w, h };
  }

  pic(f, file, ax, ay, extra = {}) {
    const { el } = this.box(f, file, ax, ay, extra);
    return el.child(image(ART + file).size_full());
  }

  // A UI picture placed by its top-left corner, in design coordinates.
  uiPic(f, file, x, y, w, h) {
    return image(UI + file).absolute().left(f.X(x)).top(f.Y(y)).w(w * f.s).h(h * f.s);
  }

  // Two poses that trade places by cross-fading forever: the only "frame" motion herdr runs natively.
  pair(fileA, fileB, period) {
    return [
      image(ART + fileA).absolute().left(0).top(0).size_full().loop("opacity", { from: 1, to: 0, period }),
      image(ART + fileB).absolute().left(0).top(0).size_full().loop("opacity", { from: 0, to: 1, period }),
    ];
  }

  scenery(f, nodes) {
    const tile = DESIGN.width;
    const reach = Math.ceil(f.left / (tile * f.s)) + 1;
    const offsets = [];
    for (let k = -reach; k <= reach; k++) offsets.push(k * tile);

    for (const k of offsets) nodes.push(this.pic(f, "bg/sky.svg", 800 + k, 100));
    nodes.push(this.pic(f, "bg/sun.svg", L.sun[0], L.sun[1]));
    L.clouds.forEach((c, i) => {
      const drift = 18 + (i % 2) * 14;
      nodes.push(this.pic(f, c.file, c.x, c.y).loop("left", {
        from: f.X(c.x - meta(c.file).anchor[0] - drift),
        to: f.X(c.x - meta(c.file).anchor[0] + drift),
        period: 38000 + i * 9000,
      }));
    });
    [[520, 46, 0], [560, 38, 1], [1180, 52, 2]].forEach(([x, y, i]) => {
      const { el } = this.box(f, "bg/bird-a.svg", x, y);
      const top = f.Y(y - meta("bg/bird-a.svg").anchor[1]);
      nodes.push(el.loop("top", { from: top, to: top - 4, period: 5200 + i * 700 })
        .children(this.pair("bg/bird-a.svg", "bg/bird-b.svg", 700 + i * 90)));
    });
    // Leaves drifting down across the sky: the deco art sits outside the manifest, so it is placed by hand.
    [[300, 0], [860, 1], [1360, 2]].forEach(([x, i]) => {
      const size = 14 * f.s;
      const left = f.X(x), top = f.Y(20 + i * 6);
      nodes.push(div().absolute().left(left).top(top).w(size).h(size)
        .loop("top", { from: top, to: top + 70 * f.s, period: 9000 + i * 2300, easing: "ease-in-out" })
        .loop("left", { from: left, to: left + 26 * f.s, period: 4200 + i * 900 })
        .child(image(UI + "deco/leaf-a.svg").absolute().left(0).top(0).size_full()
          .loop("opacity", { from: 0.9, to: 0, period: 1800 + i * 300 }))
        .child(image(UI + "deco/leaf-b.svg").absolute().left(0).top(0).size_full()
          .loop("opacity", { from: 0, to: 0.9, period: 1800 + i * 300 })));
    });
    for (const k of offsets) nodes.push(this.pic(f, "bg/hedge.svg", 800 + k, 100));
    for (const k of offsets) {
      for (const t of L.trees) {
        if (k !== 0 && !t.file.includes("pine")) continue;
        nodes.push(this.pic(f, t.file, t.x + k, t.y));
      }
    }
  }

  // Low fences join the cabins of one repository.
  fences(f, runs, nodes) {
    for (const run of runs) {
      nodes.push(this.uiPic(f, "fence.svg", run.left, GROUND - 16, run.width, 16));
    }
  }

  // One glow per cabin, so moving the active space cross-fades instead of popping: the wrapper
  // transitions, the picture inside it breathes.
  cabinGlow(f, i, x, on, nodes) {
    const size = CABIN_WIDTH * 1.4;
    nodes.push(div().id(`cabin-glow-${i}`).absolute()
      .left(f.X(x - size / 2)).top(f.Y(L.baseY - 48 - size / 2))
      .w(size * f.s).h(size * f.s)
      .opacity(on ? 1 : 0).transition("opacity", { duration: 400 })
      .child(image(ART + "fx/glow.svg").absolute().left(0).top(0).size_full()
        .loop("opacity", { from: 0.35, to: 0.6, period: 3200, easing: "ease-in-out" })));
  }

  // Its two poses trade places every 900 ms; one per cabin, so the wrapper cross-fades with the glow.
  cabinPennant(f, i, x, peak, on, nodes) {
    const size = 20;
    const art = (pose) => image(UI + `pennant-${pose}.svg`).absolute().left(0).top(0).size_full();
    nodes.push(div().id(`cabin-pennant-${i}`).absolute()
      .left(f.X(x + 30 - 4)).top(f.Y(peak + 8 - 19))
      .w(size * f.s).h(size * f.s)
      .opacity(on ? 1 : 0).transition("opacity", { duration: 400 })
      .child(art("a").loop("opacity", { from: 1, to: 0, period: 900 }))
      .child(art("b").loop("opacity", { from: 0, to: 1, period: 900 })));
  }

  cabins(f, cabins, dim, nodes, after, active) {
    cabins.forEach((c, i) => this.cabinGlow(f, i, L.cabins[i].x, i === active && !dim[i], nodes));
    cabins.forEach((c, i) => {
      const spot = L.cabins[i];
      const dir = `cabins/cabin-${i + 1}/`;
      const m = meta(dir + "base.svg");
      const w = m.w * f.s, h = m.h * f.s;
      const on = i === active && !dim[i];
      let house = div().id(`cabin-${i}`).absolute()
        .left(f.X(spot.x - m.anchor[0])).top(f.Y(L.baseY - m.anchor[1]))
        .w(w).h(h)
        .opacity(dim[i] ? 0.18 : 1)
        .transition("opacity", { duration: 400 })
        .child(image(ART + dir + "base.svg").absolute().left(0).top(0).w(w).h(h));
      if (c.awake) {
        house = house.child(image(ART + dir + "lit.svg").absolute().left(0).top(0).w(w).h(h));
      }
      nodes.push(house);
      if (c.working) {
        [1, 2, 3].forEach((n) => {
          const file = `${dir}smoke-${n}.svg`;
          const sm = meta(file);
          const { el } = this.box(f, file, spot.chimney[0], spot.chimney[1] - 4);
          const top = f.Y(spot.chimney[1] - 4 - sm.anchor[1]);
          const period = 5200 + n * 1300 + i * 170;
          nodes.push(el
            .loop("top", { from: top, to: top - (16 + n * 8) * f.s, period, easing: "ease-out" })
            .child(image(ART + file).size_full().loop("opacity", { from: 0.7, to: 0, period, easing: "ease-in" })));
        });
      }
      after.push(this.pic(f, dir + "mailbox.svg", spot.mailbox[0], spot.mailbox[1]));
      if (c.unread) after.push(this.pic(f, dir + "mailbox-flag.svg", spot.mailbox[0], spot.mailbox[1]));
      this.cabinPennant(f, i, spot.x, ROOF_PEAK[i], on, after);
    });
  }

  campfire(f, nodes) {
    const [x, y] = L.campfire;
    nodes.push(this.pic(f, "fx/glow.svg", x, y - 12).loop("opacity", { from: 0.55, to: 0.95, period: 3400 }));
    nodes.push(this.pic(f, "fx/campfire-logs.svg", x, y));
    const { el } = this.box(f, "fx/campfire-flame-a.svg", x, y);
    nodes.push(el.children(this.pair("fx/campfire-flame-a.svg", "fx/campfire-flame-b.svg", 1100)));
  }

  // Where an agent stands now, and whether it is still walking there.
  motion(a, cx, now) {
    let p = this.pos.get(a.address);
    if (!p) {
      const edge = a.x < DESIGN.width / 2 ? -40 : DESIGN.width + 40;
      p = { x: this.ready ? edge : a.x, y: a.y, until: 0, ms: 0, dir: 1, hold: this.ready };
      this.pos.set(a.address, p);
      if (p.hold) cx.timer.after(80, (c) => { p.hold = false; c.notify(); });
    }
    if (!p.hold && (p.x !== a.x || p.y !== a.y)) {
      p.ms = walkMs(p.x, a.x);
      p.dir = a.x > p.x ? 1 : -1;
      p.until = now + p.ms;
      p.x = a.x;
      p.y = a.y;
      cx.timer.after(p.ms + 80, (c) => c.notify());
    }
    return { x: p.x, walking: now < p.until, ms: p.ms, dir: p.dir };
  }

  // The hover label a found animal shows: its topic (from the journal's scan) or title, then who and how it is.
  animalTip(a, topic) {
    return [topic || a.title || a.tab_name || a.address,
      `${animalName(a.kind)} · ${STATUS[a.status] ?? STATUS.idle}`].join("\n");
  }

  actor(f, a, cx, now, fx, dim, selected) {
    const { x, walking, ms, dir } = this.motion(a, cx, now);
    const kind = a.kind;
    const dirFile = `animals/${kind}/`;
    const seed = hash(a.address);
    let poseA, poseB, period;
    if (selected) {
      ({ poseA, poseB, period } = greetPoses(DATA.files, kind, a.scarf));
    } else if (walking) {
      poseA = dir > 0 ? "walk-a" : "walk-a-left";
      poseB = dir > 0 ? "walk-b" : "walk-b-left";
      period = 640;
    } else if (a.mood === "sleep") {
      poseA = poseB = "sleep";
    } else {
      poseA = `${a.mood}-a`;
      poseB = `${a.mood}-b`;
      period = { work: 1700, wave: 1300, lantern: 2600 }[a.mood] + (seed % 500);
    }
    // The greeting animal grows from its feet so the wave reads at band size.
    const zoom = selected ? GREET_ZOOM : 1;
    // foot.json was measured on the side poses; the sleep and greet art already rests on the anchor line.
    const foot = poseA === "sleep" || poseA.startsWith("greet") ? 0 : (DATA.foot[kind] || 0) * f.s * zoom;
    const m = meta(dirFile + "walk-a.svg");
    const w = m.w * f.s * zoom, h = m.h * f.s * zoom;
    const hopping = selected && this.hopUp;
    const left = f.X(x) - m.anchor[0] * f.s * zoom;
    const top = f.Y(a.y) - m.anchor[1] * f.s * zoom + foot - (hopping ? 5 * f.s : 0);

    const layers = (pose) => {
      const out = [ART + dirFile + pose + ".svg"];
      if (a.scarf !== null && DATA.files[dirFile + `scarf-${pose}.svg`]) {
        out.push(`${ART}${dirFile}scarf-${pose}.${a.scarf}.svg`);
      }
      return out;
    };
    let inner;
    if (poseA === poseB) {
      inner = layers(poseA).map((src) => image(src).absolute().left(0).bottom(0).w_full().h_full());
      inner = [div().absolute().left(0).bottom(0).w(w).h(h)
        .loop("height", { from: h, to: h * 0.955, period: 4200 + (seed % 900) })
        .children(inner)];
    } else {
      const fade = (src, from, to) =>
        image(src).absolute().left(0).top(0).size_full().loop("opacity", { from, to, period });
      const sil = (pose) => image(`${ART}${dirFile}sil-${pose}.svg`).absolute().left(0).top(0).size_full();
      inner = [
        sil(poseA),
        sil(poseB),
        ...layers(poseA).map((s) => fade(s, 1, 0)),
        ...layers(poseB).map((s) => fade(s, 0, 1)),
      ];
    }

    const node = div()
      .id(`animal-${a.address}`)
      .absolute()
      .left(left)
      .top(top)
      .w(w)
      .h(h)
      .opacity(dim ? 0.18 : 1)
      .transition("left", { duration: walking ? Math.max(ms, 300) : selected ? 260 : 90, easing: "linear" })
      .transition("top", { duration: hopping ? 160 : selected ? 220 : walking ? Math.max(ms, 300) : 90, easing: "ease-in-out" })
      .transition("opacity", { duration: 400 })
      .transition("width", { duration: selected ? 260 : 90, easing: "ease-out" })
      .transition("height", { duration: selected ? 260 : 90, easing: "ease-out" })
      .cursor_pointer()
      .tooltip(this.animalTip(a, fx.topics[a.address]))
      .on_click(() => this.goTo(a.address))
      .on_mouse_down("left", (_event, cx2) => cx2.stop_propagation())
      .children(inner);

    if (!walking && !selected && a.mood === "lantern") {
      fx.glow.push(this.pic(f, "fx/glow.svg", x + 10, a.y - 22)
        .loop("opacity", { from: 0.35, to: 0.7, period: 2600 + (seed % 500) }));
      fx.top.push(this.bubble(f, x, a.y - 50 - 24 * (fx.levels.get(a.address) || 0), bubbleText(a.title || a.tab_name)));
    }
    if (!walking && a.mood === "sleep") {
      [0, 1, 2].forEach((n) => {
        const zx = x + 8 + n * 6, zy = a.y - 26 - n * 9;
        const { el } = this.box(f, "fx/z.svg", zx, zy);
        const zt = f.Y(zy - meta("fx/z.svg").anchor[1]);
        const scale = 0.7 + n * 0.25;
        const period = 3600 + n * 500 + (seed % 400);
        fx.top.push(el.w(10 * scale * f.s).h(12 * scale * f.s)
          .loop("top", { from: zt, to: zt - 6 * f.s, period })
          .child(image(ART + "fx/z.svg").size_full().loop("opacity", { from: 0.85, to: 0.15, period })));
      });
    }
    return node;
  }

  bubble(f, x, y, text) {
    if (!text) return div();
    const midW = (bubbleWidth(text) - 16) * f.s;
    const capW = 8 * f.s, h = Math.max(22 * f.s, 14);
    const left = f.X(x) - (midW + capW * 2) / 2;
    const top = f.Y(y) - h;
    return div()
      .absolute()
      .left(left)
      .top(top)
      .w(midW + capW * 2)
      .h(h + 9 * f.s)
      .loop("top", { from: top, to: top - 2, period: 3000 })
      .child(image(ART + "fx/bubble-left.svg").absolute().left(0).top(0).w(capW).h(h))
      .children(Array.from({ length: Math.ceil(midW / capW) }, (_, i) =>
        image(ART + "fx/bubble-mid.svg").absolute().left(capW + Math.min(i * capW, midW - capW)).top(0).w(capW).h(h)))
      .child(image(ART + "fx/bubble-right.svg").absolute().left(capW + midW).top(0).w(capW).h(h))
      .child(image(ART + "fx/bubble-tail.svg").absolute().left((midW + capW * 2) / 2 - 5 * f.s).top(h - 1).w(10 * f.s).h(10 * f.s))
      .child(div().absolute().left(capW).top(0).w(midW).h(h).flex().items_center().justify_center()
        .text_size(Math.max(11, 11 * f.s)).font_family(FONT).text_color(INK).whitespace_nowrap().child(text));
  }

  // ---- forest features ----

  // A cabin's signboard: ink planks hung from the roof peak by two cords, stacked upward into the
  // sky. Each plank fits its own label and never grows past the cabin; rows that no longer fit
  // count into "+N".
  signboard(f, index, shape, spaceById, crewBySpace, idleBySpace, dim) {
    const fade = (el) => el.opacity(dim ? 0.18 : 1).transition("opacity", { duration: 400 });
    const nodes = [];

    shape.cords.forEach((cord, i) => {
      const [x1, y1] = cord.from;
      const [x2, y2] = cord.to;
      const left = Math.min(x1, x2) - 1, top = Math.min(y1, y2) - 1;
      const w = Math.max(2, Math.abs(x2 - x1) + 2), h = Math.max(2, Math.abs(y2 - y1) + 2);
      const path = strokePath([[[x1 - left, y1 - top], [x2 - left, y2 - top]]], 1);
      nodes.push(fade(div().id(`signboard-${index}-cord-${i}`).absolute()
        .left(f.left + left).top(f.top + top).w(w).h(h)
        .child(window.paint_path(path, INK).absolute().left(0).top(0).w(w).h(h))));
    });

    shape.planks.forEach((plank, i) => {
      const seed = index * 11 + i;
      const outline = plankOutlinePoints(plank.w, plank.h, seed);
      const grain = plankGrainPoints(plank.w, plank.h, seed);
      const active = Boolean(shape.rows[i]?.active);
      const nail = (x) => div().absolute().left(x).top(plank.h / 2 - 1).w(2).h(2).rounded(1).bg(INK);
      nodes.push(fade(div().id(`signboard-${index}-${i}`).absolute()
        .left(f.left + plank.x).top(f.top + plank.y).w(plank.w).h(plank.h)
        .child(window.paint_path(fillPath(outline), active ? ACTIVE_PLANK : PAPER)
          .absolute().left(0).top(0).w(plank.w).h(plank.h))
        .child(window.paint_path(strokePath([outline], 1.2), active ? ACCENT : INK)
          .absolute().left(0).top(0).w(plank.w).h(plank.h))
        .child(window.paint_path(strokePath([grain], 0.8), "#4b42392e")
          .absolute().left(0).top(0).w(plank.w).h(plank.h))
        .child(nail(4)).child(nail(plank.w - 6))));
    });

    shape.rows.forEach((row, n) => {
      const plank = shape.planks[n];
      let overlay = div().id(`sign-${index}-${n}`).absolute()
        .left(f.left + plank.x).top(f.top + plank.y)
        .w(plank.w).h(plank.h)
        .flex().items_center().justify_center().cursor_pointer()
        .opacity(dim ? 0.18 : 1).transition("opacity", { duration: 400 })
        .tooltip(this.spaceTip(row.spaceId, spaceById, crewBySpace, idleBySpace))
        .on_click(() => this.selectRow(row))
        .on_mouse_down("left", (_event, cx2) => cx2.stop_propagation())
        .on_mouse_down("right", () => openOverlay({
          mod: "menu", kind: "popup", width: 200, height: 260,
          props: { tab: "space", target: { id: row.spaceId } },
        }))
        .child(div().w_full().truncate().text_center().text_size(shape.textSize).font_family(HEADING_FONT)
          .text_color(row.active ? ACCENT : INK).child(row.label));
      nodes.push(overlay);
    });

    if (shape.plus) {
      const plank = shape.planks[shape.shown];
      nodes.push(fade(div().absolute().left(f.left + plank.x).top(f.top + plank.y)
        .w(plank.w).h(plank.h).flex().items_center().justify_center()
        .child(div().text_size(shape.textSize).font_family(HEADING_FONT).text_color(INK)
          .child(plank.label))));
    }
    return nodes;
  }

  spaceTip(spaceId, spaceById, crewBySpace, idleBySpace) {
    const space = spaceById.get(spaceId);
    const crew = (crewBySpace.get(spaceId) ?? []).map(agentName).filter(Boolean);
    const idle = idleBySpace.get(spaceId) ?? [];
    return [
      space?.name ?? spaceId,
      crew.length ? crew.join(", ") : null,
      idle.length ? `idle shell ${idle.length} · ${quiet(Math.max(...idle))}` : null,
    ].filter(Boolean).join("\n");
  }

  selectRow(row) {
    run("space.select", { id: row.spaceId });
    if (row.tabId) run("tab.select", { id: row.tabId });
  }

  // The signpost at the band's left edge: + makes a space, the gear opens settings.
  signpost(f) {
    const x = 40;
    const plank = (file, top, tip, action) => div().id(`post-${file}`).absolute()
      .left(f.X(x - 2)).top(f.Y(top)).w(34 * f.s).h(16 * f.s)
      .cursor_pointer().tooltip(tip).on_click(action)
      .on_mouse_down("left", (_event, cx2) => cx2.stop_propagation())
      .child(image(UI + file).absolute().left(0).top(0).w(34 * f.s).h(16 * f.s));
    return [
      this.uiPic(f, "post.svg", x - 5, GROUND - 58, 10, 58),
      plank("post-plus.svg", GROUND - 56, "New cabin", () => run("space.new")),
      plank("post-gear.svg", GROUND - 38, "Settings", () => run("app.settings")),
    ];
  }

  // A small sign in the top-right sky, clear of the cabin roofs, with the query and its count.
  searchSign(f, query, count) {
    const w = 132, h = 32;
    const x = DESIGN.width - 8 - w, y = 8;
    const textSize = Math.max(11, 7 * f.s);
    return [
      this.uiPic(f, "search-sign.svg", x, y, w, h),
      div().absolute().left(f.X(x + 8)).top(f.Y(y + 3)).w((w - 16) * f.s).h(18 * f.s)
        .flex().items_center().gap(4 * f.s)
        .child(div().flex_1().min_w(0).truncate().text_size(textSize).font_family(FONT).text_color(INK)
          .child(`Looking for: ${query}`))
        .child(div().flex_none().text_size(textSize).font_family(FONT).text_color(INK).child(String(count))),
    ];
  }

  // The "?" note, a wide slip of paper in the top-right sky beside the search sign: three lines a
  // column, so it stays above the roofs.
  legend(f) {
    const w = 320, h = 52;
    const x = DESIGN.width - 8 - 132 - 8 - w, y = 8;
    const textSize = Math.max(11, 7 * f.s);
    const column = (lines) => div().flex().flex_col().flex_none()
      .children(lines.map((line) => div().text_size(textSize).font_family(FONT).text_color(INK)
        .whitespace_nowrap().child(line)));
    return [
      this.uiPic(f, "note.svg", x, y, w, h),
      div().absolute().left(f.X(x + 9)).top(f.Y(y + 6)).w((w - 18) * f.s)
        .flex().gap(10)
        .children([column(HELP.slice(0, 3)), column(HELP.slice(3, 6)), column(HELP.slice(6))]),
    ];
  }

  // The firefly over the chosen animal's head; it flies when the choice moves.
  firefly(f, a) {
    const glow = 22;
    const dot = 8;
    const left = f.X(a.x) - glow / 2;
    const top = f.Y(a.y - 44 * GREET_ZOOM) - glow / 2;
    return div().id("forest-firefly").absolute().left(left).top(top).w(glow).h(glow)
      .transition("left", { duration: 600, easing: "ease-in-out" })
      .transition("top", { duration: 600, easing: "ease-in-out" })
      .loop("opacity", { from: 0.55, to: 1, period: 1600 })
      .child(image(UI + "firefly-glow.svg").absolute().left(0).top(0).w(glow).h(glow))
      .child(div().absolute().left((glow - dot) / 2).top((glow - dot) / 2)
        .w(dot).h(dot).rounded(dot / 2).bg("#f7d06a"));
  }

  // The keyboard plank: a cabin signboard hanging from the top vine on two cords. It drops in when
  // the forest takes the keyboard and rises away when it gives it back, staying rendered above the
  // band while hidden so both moves can play.
  keyTag(f, planks = []) {
    const on = Boolean(this.handle?.is_focused?.());
    const textSize = Math.max(SIGN_MIN_TEXT, SIGN_TEXT * f.s);
    const h = textSize + SIGN_PAD_Y * 2;
    const textW = labelWidth(KEY_TAG.text, textSize, 0.52);
    const hintW = labelWidth(KEY_TAG.hint, textSize, 0.52);
    const w = Math.max(SIGN_MIN_W * f.s, textW + hintW + 6 + SIGN_PAD_X * 2);
    const scale = f.s || 1;
    const rest = keyPlankRest({ x: KEY_TAG_X, w: w / scale, h: h / scale, planks });
    // -40 is band-local, so the hidden plank sits above the band whatever the letterboxing.
    const top = on ? f.Y(rest.y) : -KEY_DROP;
    const duration = on ? KEY_DROP_MS : KEY_RISE_MS;
    const easing = on ? "ease-out" : "ease-in";
    const reach = Math.min(10, w / 3);
    const cordLen = Math.max(0, top - f.Y(KEY_TAG.vine));
    const cord = (left) => div().absolute().left(left).top(f.Y(KEY_TAG.vine)).w(1).h(cordLen)
      .bg(INK).opacity(0.8).transition("height", { duration, easing });
    const seed = 5;
    const outline = plankOutlinePoints(w, h, seed);
    const grain = plankGrainPoints(w, h, seed);
    const nail = (left) => div().absolute().left(left).top(h / 2 - 1).w(2).h(2).rounded(1).bg(INK);
    return [
      cord(f.X(rest.x) + reach),
      cord(f.X(rest.x) + w - reach),
      div().id("forest-key-tag").absolute().left(f.X(rest.x)).top(top).w(w).h(h)
        .transition("top", { duration, easing })
        .child(window.paint_path(fillPath(outline), PAPER).absolute().left(0).top(0).w(w).h(h))
        .child(window.paint_path(strokePath([outline], 1.2), INK).absolute().left(0).top(0).w(w).h(h))
        .child(window.paint_path(strokePath([grain], 0.8), "#4b42392e").absolute().left(0).top(0).w(w).h(h))
        .child(nail(4)).child(nail(w - 6))
        .child(h_flex().absolute().left(0).top(0).w(w).h(h).items_center().justify_center().gap(6)
          .child(div().text_size(textSize).font_family(HEADING_FONT).text_color(ACCENT).whitespace_nowrap()
            .child(KEY_TAG.text))
          .child(div().text_size(textSize).font_family(HEADING_FONT).text_color(MUTED).whitespace_nowrap()
            .child(KEY_TAG.hint))),
    ];
  }

  // ---- shared state ----

  // Writes only the keys that changed: setShared redraws every mod, so a same-value write must not happen.
  publish(patch) {
    const current = shared("inkpaw") ?? {};
    const changed = Object.keys(patch).some(
      (key) => JSON.stringify(current[key] ?? null) !== JSON.stringify(patch[key] ?? null));
    if (!changed) return;
    setShared("inkpaw", { ...current, ...patch });
  }

  // The owner and the selection that follows the focused pane are written from here, never from
  // render: setShared is not documented as safe there and redraws every mod.
  syncShared() {
    const state = shared("inkpaw") ?? {};
    const keyboard = Boolean(this.handle?.is_focused?.());
    const owner = keyboard ? "forest" : (state.owner === "forest" ? null : state.owner ?? null);
    const patch = {};
    if ((state.owner ?? null) !== owner) patch.owner = owner;
    if (!keyboard && owner == null) {
      const here = focused()?.terminal ?? null;
      if (here && here !== (state.selected ?? null)) patch.selected = here;
    }
    if (Object.keys(patch).length) this.publish(patch);
  }

  watchFocus(cx) {
    const key = `${this.handle?.is_focused?.() ? 1 : 0}|${focused()?.terminal ?? ""}`;
    if (key === this.focusKey) return;
    this.focusKey = key;
    this.syncShared();
    cx.notify();
  }

  pick(address) {
    if (address) this.publish({ selected: address });
  }

  goTo(terminal) {
    if (!terminal) return;
    this.publish({ selected: terminal });
    const target = focusTarget(terminal, this.agentsNow(), this.panesNow());
    if (target) run("pane.focus", target);
  }

  // Demo mode draws the gallery fixture; every other mode reads Herdr.
  spacesNow() { return this.demo ? DEMO.spaces : spaces(); }
  agentsNow() {
    if (this.demo) return DEMO.agents;
    const listed = agents();
    return [...listed, ...silentAgents(terminals(), listed, panes(), spaces())];
  }
  terminalsNow() { return this.demo ? DEMO.terminals : terminals(); }
  panesNow() { return this.demo ? DEMO.panes : panes(); }

  key(event, cx) {
    const modifiers = event.modifiers ?? {};
    const alt = Boolean(modifiers.alt);
    const shift = Boolean(modifiers.shift);
    const command = Boolean(modifiers.platform);
    const control = Boolean(modifiers.control);
    const name = event.key;
    const state = shared("inkpaw") ?? {};
    const query = state.query ?? "";
    const selected = this.demo ? DEMO.selected : state.selected ?? null;
    const actors = xOrder(layoutScene(this.spacesNow(), this.agentsNow()).actors);
    const plain = !command && !control && !alt;
    const journal = forestKeyCommand(event, query);
    let handled = true;

    if (journal) {
      run(`inkpaw-journal.${journal}`);
    } else if (name === "escape") {
      if (query) this.publish({ query: "" });
      else if (selected != null) this.publish({ selected: null });
      else {
        run("pane.go", { direction: "down" });
        handled = false;
      }
    } else if (name === "left" && alt) this.pick(endOf(actors, "first"));
    else if (name === "right" && alt) this.pick(endOf(actors, "last"));
    else if (name === "left") this.pick(stepBy(actors, selected, -1));
    else if (name === "right") this.pick(stepBy(actors, selected, 1));
    else if (name === "space" && plain && query) this.publish({ query: query + " " });
    else if (name === "space" && plain) {
      // Same as the cards strip: the jump goes to that terminal, not just the firefly.
      this.goTo(nextOf(shift ? state.done : state.needs, selected));
    } else if (name === "enter" && plain) {
      this.goTo(selected);
    } else if (name === "backspace" && plain) {
      if (query) this.publish({ query: query.slice(0, -1) });
      else handled = false;
    } else if (name === "backspace" && command && !alt && !control) {
      if (query) this.publish({ query: "" });
      else handled = false;
    } else if (name === "backspace" && alt && !command && !control) {
      if (query) this.publish({ query: query.replace(/\S*\s*$/, "") });
      else handled = false;
    } else if ((name === "?" || (name === "/" && shift)) && !query) {
      this.showKeys = !this.showKeys;
    } else if (event.key_char && event.key_char.length === 1 && plain) {
      if (query || event.key_char.trim()) this.publish({ query: query + event.key_char });
      else handled = false;
    } else handled = false;

    if (handled) {
      cx.stop_propagation();
      cx.notify();
    }
  }

  // ---- repositories ----

  // SpaceInfo.folder is where new terminals start, not where they are, so the repo comes from where a
  // terminal's program runs now (cwdOf).
  readRepos(cx) {
    if (this.reading || this.demo) return;
    this.reading = true;
    const folders = [...new Set(terminals().map(cwdOf).filter(Boolean))];
    cx.spawn(async (later) => {
      const next = {};
      for (const cwd of folders) {
        try {
          const r = await exec("git", ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir", "--show-toplevel"]);
          const [common, top] = String(r.stdout ?? "").trim().split("\n");
          next[cwd] = r.code === 0 && common ? { common, base: Boolean(top) && `${top}/.git` === common } : null;
        } catch {
          next[cwd] = null;
        }
      }
      this.repos = next;
      this.reading = false;
      this.reorderSpaces();
      later.notify();
    });
  }

  // Keeps the spaces of one repository next to each other in Herdr's own order (base checkout first).
  reorderSpaces() {
    const plan = repoMovePlan(spaceRows(spaces(), terminals(), panes(), this.repos));
    if (!plan || !plan.moves.length || plan.key === this.lastMove) return;
    this.lastMove = plan.key;
    for (const move of plan.moves) run("space.move", { id: move.id, index: move.index });
  }

  render(cx) {
    const f = fit(this.size.width, this.size.height);
    const now = Date.now();
    const spaceList = this.spacesNow();
    const agentList = this.agentsNow();
    const termList = this.terminalsNow();
    const paneList = this.panesNow();
    const { actors, cabins, hidden, cabinOf } = layoutScene(spaceList, agentList);

    const state = shared("inkpaw") ?? {};
    const query = state.query ?? "";
    const tokens = tokensOf(query);
    const topics = state.topics ?? {};
    const selected = this.demo ? DEMO.selected : state.selected ?? null;

    const cwdByAddress = new Map(termList.map((terminal) => [terminal.address, cwdOf(terminal)]));
    const rows = spaceRows(spaceList, termList, paneList, this.repos);
    const repoBySpace = new Map(rows.map((row) => [row.space.id, row.repo]));
    const idleBySpace = new Map();
    for (const row of rows) {
      const idle = idleShells(row.mine, this.turns, now);
      this.turns = idle.turns;
      idleBySpace.set(row.space.id, idle.idle);
    }

    const found = tokens.length
      ? searchSets({ spaces: spaceList, agents: agentList, cabinOf, cabinCount: CABINS, tokens, topics, cwdByAddress })
      : null;
    const cabinDim = Array.from({ length: CABINS }, (_, i) => Boolean(found && !found.cabins[i]));

    const live = new Set(actors.map((a) => a.address));
    for (const k of [...this.pos.keys()]) if (!live.has(k)) this.pos.delete(k);

    const back = [], front = [];
    this.scenery(f, back);
    const cabinRepos = cabinRepoKeys(spaceList, cabinOf, CABINS, repoBySpace);
    this.fences(f, fenceRuns(L.cabins.map((cabin) => cabin.x), cabinRepos), back);
    const crewBySpace = agentsBySpace(agentList);
    const spaceById = new Map(spaceList.map((space) => [space.id, space]));
    const signs = cabinSigns(spaceList, agentList, cabinOf, CABINS);
    this.cabins(f, cabins, cabinDim, back, front, activeCabin(signs));
    back.push(this.pic(f, "bg/ground.svg", 800, 100));
    for (const k of [-1, 1]) back.push(this.pic(f, "bg/ground.svg", 800 + k * DESIGN.width, 100));
    const chosen = actors.find((a) => a.address === selected);
    // Only an animal picked with the forest's own keyboard greets; once the keyboard leaves for a
    // session, it shrinks back at once.
    const greeting = this.handle?.is_focused?.() ? chosen : null;
    // A greeting animal drops its speech bubble, which would cover its grown head.
    const levels = bubbleLevels(actors.filter((a) => a.mood === "lantern" && a !== greeting)
      .map((a) => ({ address: a.address, x: a.x, width: bubbleWidth(bubbleText(a.title || a.tab_name)) })));
    const fx = { glow: [], top: [], levels, topics };
    // The greeting animal hops once when the choice arrives: up over 160 ms, then down over 220 ms.
    if (greeting && greeting.address !== this.hopKey) {
      this.hopKey = chosen.address;
      this.hopUp = true;
      cx.timer.after(160, (later) => { this.hopUp = false; later.notify(); });
    } else if (!greeting) {
      this.hopKey = null;
    }
    // The greeting animal is drawn last so its larger pose stays in front of its neighbours.
    const drawOrder = greeting ? [...actors.filter((a) => a !== greeting), greeting] : actors;
    const animals = drawOrder.map((a) => this.actor(f, a, cx, now, fx,
      Boolean(found && !found.animals.has(a.address)), a.address === greeting?.address));
    this.campfire(f, back);
    // A vine strung along the top edge frames the band like a window.
    const vineW = 400 * f.s, vineH = 16 * f.s;
    for (let x = 0; x < this.size.width; x += vineW) {
      front.push(image(UI + "deco/branch.svg").absolute().left(x).top(2).w(vineW).h(vineH));
    }

    if (hidden > 0) {
      fx.top.push(div().absolute().left(f.X(L.campfire[0]) - 20).top(f.Y(L.groundY + 6))
        .w(40).text_size(11).font_family(FONT).text_color(INK).text_center().child(`+${hidden}`));
    }

    const signShapes = signs.map((sign, i) => (sign.rows.length || sign.more)
      ? signShape(sign.rows, sign.more, {
        size: SIGN_TEXT, scale: f.s, width: CABIN_WIDTH,
        peak: { x: L.cabins[i].x, y: ROOF_PEAK[i] }, top: 0,
      })
      : null);
    const signNodes = signShapes.flatMap((shape, i) =>
      shape ? this.signboard(f, i, shape, spaceById, crewBySpace, idleBySpace, cabinDim[i]) : []);
    // The keyboard plank rests above these planks; signShape works in screen pixels.
    const scale = f.s || 1;
    const signPlanks = signShapes.filter(Boolean).flatMap((shape) => shape.planks.map((plank) => ({
      x: plank.x / scale, y: plank.y / scale, w: plank.w / scale, h: plank.h / scale,
    })));

    const overlay = [...this.signpost(f)];
    if (tokens.length) overlay.push(...this.searchSign(f, query, found.animals.size));
    if (this.showKeys) overlay.push(...this.legend(f));
    overlay.push(...this.keyTag(f, signPlanks));
    if (chosen) overlay.push(this.firefly(f, chosen));
    this.ready = true;

    return div()
      .id("root")
      .relative()
      .size_full()
      .overflow_hidden()
      .bg(PAPER)
      .track_focus(this.handle)
      .tab_index(0)
      .on_key_down((event, cx2) => this.key(event, cx2))
      .on_size_change((size, cx2) => {
        if (size.width !== this.size.width || size.height !== this.size.height) {
          this.size = size;
          cx2.notify();
        }
      })
      // The greeting animal also sits above the neighbours' speech bubbles.
      .children([...back, ...front, ...fx.glow, ...signNodes, ...(greeting ? animals.slice(0, -1) : animals),
        ...fx.top, ...(greeting ? animals.slice(-1) : []), ...overlay]);
  }
}
