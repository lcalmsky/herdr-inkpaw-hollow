// Pure forest logic for the Inkpaw Hollow band: signboard rows, search matching, fence runs,
// repository order plans and keyboard order. No herdr or gpui imports, so node tests run it.
import { fieldsOf, fold, matchesQuery, tokensOf } from "./search.js";
export { fold, tokensOf };

export const MAX_SIGN_ROWS = 3;
export const SIGN_MIN_W = 44;
export const SIGN_TEXT = 14;
export const SIGN_MIN_TEXT = 12;
export const SIGN_PAD_X = 9;
export const SIGN_PAD_Y = 3;
export const SIGN_CORD = 12;
export const SIGN_GAP = 1;
export const SIGN_CLEAR = 4;
export const CABIN_WIDTH = 180;
export const IDLE_MS = 10 * 60 * 1000;
// The chosen animal greets twice as fast as an animal celebrating a finished turn.
export const GREET_PERIOD = 450;
// A Jira-style key: two to ten uppercase letters or digits, a hyphen, then a number.
const SPACE_KEY = /\b([A-Z][A-Z0-9]{1,9}-\d+)\b/i;

// The cabin art is 180 wide but the drawn house is 124 (28..152 in its viewBox), so half its
// body is 62. Cabin centres sit 155 apart except around the campfire courtyard, and a fence
// only crosses the narrow gap between two house walls.
export const CABIN_HALF = 62;
export const MAX_FENCE_GAP = 60;

// Where a terminal's program runs now; the recorded cwd is only where the terminal opened.
export function cwdOf(terminal) {
  return terminal?.foreground?.cwd || terminal?.cwd || null;
}

// A ticket key in a name, uppercase, or null.
export function spaceKey(name) {
  const match = String(name ?? "").match(SPACE_KEY);
  return match ? match[1].toUpperCase() : null;
}

// A sign row: the ticket key when the space name carries one, else its first ten characters.
export function signLabel(space) {
  const name = String(space?.name ?? "");
  const key = spaceKey(name);
  return key ?? [...name].slice(0, 10).join("");
}

// Screen pixels a sign label needs: CJK is about one em a character, Latin and digits 0.6 em
// (0.52 in Patrick Hand).
export function labelWidth(text, size = 11, latin = 0.6) {
  let width = 0;
  for (const ch of String(text ?? "")) {
    width += ch.codePointAt(0) >= 0x2e80 ? size : size * latin;
  }
  return width;
}

// A deterministic wobble in [-1, 1], so a hand-drawn plank never changes from frame to frame.
function woodWobble(seed, i) {
  const value = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

// The outline of a hand-cut plank in its own pixels: chamfered corners, a small notch at each end
// and a slowly wobbling edge. Closed, so PathBuilder.fill() takes it as it is.
export function plankOutlinePoints(w, h, seed = 0) {
  const width = Math.max(8, w);
  const height = Math.max(6, h);
  const left = 1, top = 1, right = width - 1, bottom = height - 1;
  const corner = Math.min(2.4, (right - left) / 5, (bottom - top) / 3);
  const notch = Math.min(1.2, (bottom - top) / 6);
  const midY = (top + bottom) / 2;
  const wob = (i) => 0.4 * woodWobble(seed, i);
  const points = [];
  points.push([left + corner, top + wob(0)]);
  points.push([left + (right - left) * 0.34, top + wob(1)]);
  points.push([left + (right - left) * 0.67, top + wob(2)]);
  points.push([right - corner, top + wob(3)]);
  points.push([right, top + corner]);
  points.push([right, midY - notch]);
  points.push([right - notch, midY]);
  points.push([right, midY + notch]);
  points.push([right, bottom - corner]);
  points.push([right - corner, bottom]);
  points.push([left + (right - left) * 0.67, bottom + wob(4)]);
  points.push([left + (right - left) * 0.34, bottom + wob(5)]);
  points.push([left + corner, bottom + wob(6)]);
  points.push([left, bottom - corner]);
  points.push([left, midY + notch]);
  points.push([left + notch, midY]);
  points.push([left, midY - notch]);
  points.push([left, top + corner]);
  return points;
}

// One faint grain stroke, a little above the bottom edge.
export function plankGrainPoints(w, h, seed = 0) {
  const width = Math.max(8, w);
  const y = Math.max(2, h - 3);
  const start = 5, end = width - 5;
  const steps = Math.max(3, Math.round((end - start) / 24));
  const points = [];
  for (let i = 0; i <= steps; i++) {
    points.push([start + ((end - start) * i) / steps, y + 0.5 * woodWobble(seed + 3, i)]);
  }
  return points;
}

// The keyboard plank hangs under the top vine at this design x and y, clear of the traffic lights.
export const KEY_TAG_X = 90;
export const KEY_TAG_Y = 22;
const KEY_TAG_MIN_Y = 20;

// Where the keyboard plank rests. It hangs under the vine, its bottom above the highest cabin
// signboard plank; when that would push it out of view, or it would cross something in `avoid`
// (the search sign, the "?" note), it slides right until it clears every rect it would cross, in
// design coordinates. With no clear place it rests where it crosses the fewest and returns
// clear: false, so the caller can try a narrower plank. Rects are {x, y, w, h} in the same space.
export function keyPlankRest({
  x = KEY_TAG_X, w, h, y = KEY_TAG_Y, minY = KEY_TAG_MIN_Y,
  planks = [], avoid = [], gap = SIGN_CLEAR, limit = 1600,
} = {}) {
  const width = Math.max(1, Number(w) || 0);
  const height = Math.max(1, Number(h) || 0);
  const finite = (list) => (Array.isArray(list) ? list : [])
    .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  const rects = finite(planks);
  const all = [...rects, ...finite(avoid)];
  const above = rects.length ? Math.min(...rects.map((p) => p.y)) - gap - height : Infinity;
  const top = above >= minY ? Math.min(y, above) : y;
  const crossing = (left) => all.filter((p) => left < p.x + p.w + gap && left + width + gap > p.x
    && top < p.y + p.h + gap && top + height + gap > p.y).length;
  let best = x, fewest = Infinity;
  for (let left = x; left + width <= limit; left += 1) {
    const count = crossing(left);
    if (!count) return { x: left, y: top, shifted: left !== x, clear: true };
    if (count < fewest) { fewest = count; best = left; }
  }
  return { x: best, y: top, shifted: best !== x, clear: !all.length };
}

// The "?" note in design px: its text never goes under 11 px on screen, so at a small scale the
// paper grows to hold the columns instead of the lines running past its edge. `gap` is screen px,
// like the note's flex gap; widths are estimated as labelWidth does, which runs wider than Gowun Dodum.
export const HELP_NOTE = { w: 320, h: 52, padX: 9, padY: 6, gap: 10 };
export function helpNoteSize(columns, textSize, scale) {
  const s = scale || 1;
  const lineH = Math.ceil(textSize * 1.3);
  const widest = (lines) => Math.max(0, ...lines.map((line) => labelWidth(line, textSize, 0.52)));
  const textW = columns.reduce((sum, lines) => sum + widest(lines), 0) + HELP_NOTE.gap * Math.max(0, columns.length - 1);
  const rows = Math.max(0, ...columns.map((lines) => lines.length));
  return {
    w: Math.max(HELP_NOTE.w, Math.ceil(textW / s) + HELP_NOTE.padX * 2),
    h: Math.max(HELP_NOTE.h, Math.ceil((rows * lineH) / s) + HELP_NOTE.padY * 2),
    lineH,
  };
}

// A cabin's signboard: planks hanging from the roof peak on two ink cords, stacked upward into
// the sky. Each plank is its own label plus 9 px at each end, never wider than the cabin. Rows
// that no longer fit above the peak count into "+N". `peak` and `top` are design coordinates;
// planks and cords come back in screen pixels from the design origin, for f.left/f.top to offset.
export function signShape(rows, more = 0, {
  size = SIGN_TEXT,
  scale = 1,
  width = CABIN_WIDTH,
  peak = { x: 0, y: 80 },
  top = 0,
  latin = 0.52,
} = {}) {
  const textSize = Math.max(SIGN_MIN_TEXT, size * scale);
  const rowH = textSize + SIGN_PAD_Y * 2;
  const maxW = width * scale;
  const cord = SIGN_CORD * scale;
  const peakX = peak.x * scale;
  const peakY = peak.y * scale;
  const ceiling = top * scale + SIGN_CLEAR;
  const fits = Math.max(0, Math.floor((peakY - cord - ceiling + SIGN_GAP) / (rowH + SIGN_GAP)));
  const total = rows.length + more;
  const needsMore = more > 0 || rows.length > fits;
  // One slot at the top is kept for "+N", but only when it leaves a label row standing.
  const reserve = needsMore && fits >= 2 ? 1 : 0;
  const shown = Math.min(rows.length, Math.max(0, fits - reserve));
  const plus = needsMore && fits > shown;
  const kept = rows.slice(0, shown);
  const plank = (label, kind, row, i) => {
    const textW = labelWidth(label, textSize, latin);
    const w = Math.min(Math.max(SIGN_MIN_W * scale, textW + SIGN_PAD_X * 2), maxW);
    return {
      kind, row, label, textW, w, h: rowH,
      x: peakX - w / 2,
      y: peakY - cord - rowH * (i + 1) - SIGN_GAP * i,
    };
  };
  const planks = kept.map((row, i) => plank(row.label, "row", i, i));
  if (plus) planks.push(plank(`+${total - shown}`, "more", null, shown));
  const low = planks[0];
  const reach = low ? Math.min(10, low.w / 3) : 0;
  const cords = low ? [
    { from: [peakX, peakY], to: [low.x + reach, low.y + low.h] },
    { from: [peakX, peakY], to: [low.x + low.w - reach, low.y + low.h] },
  ] : [];
  return {
    rows: kept,
    more: total - shown,
    textSize,
    rowH,
    textW: Math.max(0, ...kept.map((row) => labelWidth(row.label, textSize, latin))),
    boardW: Math.max(0, ...planks.map((item) => item.w)),
    planks,
    cords,
    shown,
    plus,
    fits,
  };
}

export function activeTab(space) {
  return space?.tabs?.find((tab) => tab.active) ?? null;
}

// A space's crew row name: the title without a leading symbol, else the tab, else the program.
export function agentName(agent) {
  const live = String(agent?.title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
  if (live && !/^[~/]/.test(live) && !live.includes("@") && live !== agent?.program?.name) return live;
  return agent?.tab_name && !/^\d+$/.test(agent.tab_name) ? agent.tab_name : agent?.program?.name ?? agent?.address ?? "";
}

export function agentsBySpace(agents) {
  const map = new Map();
  for (const agent of agents) {
    const list = map.get(agent.space);
    if (list) list.push(agent);
    else map.set(agent.space, [agent]);
  }
  return map;
}

// Lines under a cabin's signboard: one row per space, on its active tab.
export function signRows(space) {
  const tab = activeTab(space);
  return [{ spaceId: space.id, tabId: tab?.id ?? null, label: signLabel(space), active: Boolean(space.active) }];
}

// The cabin whose signboard shows the active space's row, or -1 when none does. Its glow and
// pennant mark where the keyboard is in the forest.
export function activeCabin(signs) {
  return signs.findIndex((sign) => sign.rows.some((row) => row.active));
}

// Each cabin's signboard rows, capped at three with the rest counted for "+N".
export function cabinSigns(spaces, agents, cabinOf, cabinCount) {
  const bySpace = agentsBySpace(agents);
  const all = Array.from({ length: cabinCount }, () => []);
  for (const space of spaces) {
    const at = cabinOf.get(space.id);
    if (at == null) continue;
    all[at].push(...signRows(space));
  }
  return all.map((rows) => ({ rows: rows.slice(0, MAX_SIGN_ROWS), more: Math.max(0, rows.length - MAX_SIGN_ROWS) }));
}

// ---- search ----

// Kept for callers that already hold folded tokens; matchesQuery does the folding either way.
export function matches(fields, tokens) {
  return matchesQuery(tokens.join(" "), fields);
}

export function agentFields(agent, topic, cwd, prs = []) {
  return fieldsOf({
    topic,
    title: agent?.title,
    space: agent?.space_name,
    tab: agent?.tab_name,
    cwd,
    ticket: [spaceKey(agent?.space_name), spaceKey(topic)],
    pr: prs,
  });
}

export function spaceFields(space) {
  return fieldsOf({
    space: space?.name,
    tab: (space?.tabs ?? []).map((tab) => tab.name),
    ticket: spaceKey(space?.name),
  });
}

// Animals and cabins a query keeps. A cabin stays when one of its spaces or one of its animals matches.
export function searchSets({ spaces, agents, cabinOf, cabinCount, tokens, topics = {}, prs = {}, cwdByAddress = new Map() }) {
  const query = tokens.join(" ");
  const animals = new Set();
  for (const agent of agents) {
    if (matchesQuery(query, agentFields(agent, topics[agent.address], cwdByAddress.get(agent.address), prs[agent.address]))) {
      animals.add(agent.address);
    }
  }
  const matchedSpaces = new Set(spaces.filter((space) => matchesQuery(query, spaceFields(space))).map((space) => space.id));
  const cabins = Array.from({ length: cabinCount }, () => false);
  for (const space of spaces) {
    const at = cabinOf.get(space.id);
    if (at == null) continue;
    if (matchedSpaces.has(space.id)) cabins[at] = true;
  }
  for (const agent of agents) {
    if (!animals.has(agent.address)) continue;
    const at = cabinOf.get(agent.space);
    if (at != null) cabins[at] = true;
  }
  return { animals, spaces: matchedSpaces, cabins };
}

// ---- keyboard order ----

export function xOrder(actors) {
  return [...actors].sort((a, b) => a.x - b.x || String(a.address).localeCompare(String(b.address)));
}

// The animal `delta` places from the current one, wrapping; nothing chosen starts at either end.
export function stepBy(order, current, delta) {
  if (!order.length) return null;
  const at = order.findIndex((actor) => actor.address === current);
  if (at < 0) return order[delta >= 0 ? 0 : order.length - 1].address;
  return order[(at + delta + order.length) % order.length].address;
}

export function endOf(order, side) {
  if (!order.length) return null;
  return (side === "last" ? order[order.length - 1] : order[0]).address;
}

// The entry after the current one in a shared needs/done list, cycling; an unknown current starts at the head.
export function nextOf(list, current) {
  const items = Array.isArray(list) ? list.filter((id) => typeof id === "string" && id) : [];
  if (!items.length) return null;
  const at = items.indexOf(current);
  return at < 0 ? items[0] : items[(at + 1) % items.length];
}

// The cards strip's journal keys, handed to the notebook while the forest holds the keyboard:
// the journal command for this key, or null when the forest answers the key itself. ⌫ only
// passes on with an empty query.
export function forestKeyCommand(event, query) {
  const modifiers = event?.modifiers ?? {};
  const alt = Boolean(modifiers.alt);
  const shift = Boolean(modifiers.shift);
  const command = Boolean(modifiers.platform);
  const control = Boolean(modifiers.control);
  const plain = !command && !control && !alt;
  const name = event?.key;
  if (name === "backspace" && plain) return query ? null : "read";
  if (name === "z" && command && !shift && !alt && !control) return "undo";
  if (name === "enter" && command && !shift && !alt && !control) return "links";
  if (name === "enter" && shift && !command && !alt && !control) return "page";
  if (name === "tab" && plain && !shift) return "oldest_page";
  if (name === "up" && plain && !shift) return "steps_up";
  if (name === "down" && plain && !shift) return "steps_down";
  return null;
}

// ---- repositories, fences and idle shells ----

// Each space's terminals, their live cwd and the repository git found there; repo is undefined
// while git has not been asked about that cwd yet.
export function spaceRows(spaces, terminals, panes, repos) {
  const byAddress = new Map(terminals.map((terminal) => [terminal.address, terminal]));
  return spaces.map((space) => {
    const tabs = new Set((space.tabs ?? []).map((tab) => tab.id));
    const mine = panes
      .filter((pane) => pane.terminal && tabs.has(pane.tab))
      .map((pane) => byAddress.get(pane.terminal))
      .filter(Boolean);
    const cwd = mine.map(cwdOf).find(Boolean) ?? null;
    return { space, mine, cwd, repo: cwd ? repos[cwd] : null };
  });
}

// The space.order that keeps one repository's spaces together, base checkout first. Each order
// is tried once: the plan carries a key so the view can skip a repeat.
export function repoMovePlan(rows) {
  if (!rows.length || rows.some((row) => row.repo === undefined)) return null;
  const groups = new Map();
  for (const row of rows) {
    const key = row.repo?.common ?? row.space.id;
    const members = groups.get(key);
    if (members) members.push(row);
    else groups.set(key, [row]);
  }
  const want = [...groups.values()].flatMap((members) => [
    ...members.filter((row) => row.repo?.base),
    ...members.filter((row) => !row.repo?.base),
  ]).map((row) => row.space.id);
  const have = rows.map((row) => row.space.id);
  const key = `${have.join(",")}>${want.join(",")}`;
  if (want.join(",") === have.join(",")) return { key, moves: [] };
  const order = [...have];
  const moves = [];
  want.forEach((id, index) => {
    if (order[index] === id) return;
    moves.push({ id, index: index + 1 });
    order.splice(order.indexOf(id), 1);
    order.splice(index, 0, id);
  });
  return { key, moves };
}

// The repository a cabin belongs to when all its known spaces share one, else null.
export function cabinRepoKeys(spaces, cabinOf, cabinCount, repoBySpace) {
  const keys = Array.from({ length: cabinCount }, () => null);
  const mixed = new Set();
  for (const space of spaces) {
    const at = cabinOf.get(space.id);
    if (at == null) continue;
    const common = repoBySpace.get(space.id)?.common ?? null;
    if (!common || mixed.has(at)) continue;
    if (keys[at] == null) keys[at] = common;
    else if (keys[at] !== common) {
      keys[at] = null;
      mixed.add(at);
    }
  }
  return keys;
}

// One fence between neighbouring cabins of one repository, on the narrow landing between the
// two house walls. The campfire courtyard is wider than a fence should cross, so it stays open.
export function fenceRuns(cabinXs, repoKeys) {
  const runs = [];
  for (let i = 0; i + 1 < cabinXs.length; i++) {
    if (!repoKeys[i] || repoKeys[i] !== repoKeys[i + 1]) continue;
    const landing = cabinXs[i + 1] - cabinXs[i] - 2 * CABIN_HALF;
    if (landing > MAX_FENCE_GAP) continue;
    runs.push({ cabin: i, left: cabinXs[i] + CABIN_HALF, width: landing });
  }
  return runs;
}

// hc reports no last-activity time. terminals() is typed any[] in herdr.d.ts, so a shell counts
// as idle from when this mod last saw that terminal's `turn` change. Returns the idle waits and
// the state to remember.
export function idleShells(list, turns, now) {
  const next = { ...turns };
  const idle = [];
  for (const terminal of list) {
    if (!terminal?.program?.shell) continue;
    const seen = next[terminal.address];
    if (!seen || seen.turn !== terminal.turn) next[terminal.address] = { turn: terminal.turn, at: now };
    const since = now - next[terminal.address].at;
    if (since >= IDLE_MS) idle.push(since);
  }
  return { idle, turns: next };
}

// Which two poses the chosen animal cross-fades, GREET_PERIOD apart: its own greeting art when the
// manifest has both frames (and the scarf's, for a scarfed animal), else the wave it already knows.
export function greetPoses(files, kind, scarf = null) {
  const has = (pose) => Boolean(files?.[`animals/${kind}/${pose}.svg`]);
  const ready = has("greet-a") && has("greet-b")
    && (scarf == null || (has("scarf-greet-a") && has("scarf-greet-b")));
  const pose = ready ? "greet" : "wave";
  return { poseA: `${pose}-a`, poseB: `${pose}-b`, period: GREET_PERIOD };
}

// Programs that report their own status over OSC. agents() lists only the terminals whose report
// is live, so a running claude with a stopped report would otherwise have no animal.
export const SILENT_APPS = ["claude", "codex", "pi", "gemini", "opencode", "aider"];

// AgentInfo-shaped entries for running agents that agents() leaves out because their status
// report stopped. A terminal whose agent exited has a shell foreground, so it gets no animal.
export function silentAgents(terminals, agents, panes, spaces) {
  const listed = new Set((agents ?? []).map((agent) => agent.address));
  const byId = new Map((spaces ?? []).map((space) => [space.id, space]));
  const paneOf = (address) => (panes ?? []).find((pane) => pane.terminal === address)?.pane ?? null;
  const silent = [];
  for (const terminal of terminals ?? []) {
    const address = terminal?.address;
    if (!address || listed.has(address)) continue;
    const argv0 = terminal?.foreground?.argv?.[0];
    const base = typeof argv0 === "string" ? argv0.split("/").pop() : "";
    if (!SILENT_APPS.includes(base)) continue;
    const spaceId = terminal?.labels?.["herdr.space"];
    const space = byId.get(spaceId);
    if (!space) continue;
    const tab = terminal?.labels?.["herdr.tab"] ?? null;
    const tabInfo = (space.tabs ?? []).find((item) => item.id === tab) ?? null;
    silent.push({
      address,
      pane: paneOf(address),
      space: spaceId,
      space_name: space.name,
      tab,
      tab_index: 0,
      tab_name: tabInfo?.name ?? null,
      status: "unknown",
      app: base === "claude" ? "claude-code" : base,
      program: { name: base },
      title: terminal?.title ?? "",
      silent: true,
    });
  }
  return silent;
}

// Where pane.focus should land for a terminal: the agent's pane, else the pane showing the
// terminal, else the terminal itself.
export function focusTarget(terminal, agents, panes) {
  if (!terminal) return null;
  const agent = agents.find((candidate) => candidate.address === terminal);
  if (agent?.pane) return { pane: agent.pane };
  const pane = panes.find((candidate) => candidate.terminal === terminal);
  return pane ? { pane: pane.pane } : { terminal };
}
