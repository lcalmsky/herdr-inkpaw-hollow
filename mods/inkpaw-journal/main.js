// The keeper's notebook: one ruled paper page recording the forest. scan.sh reads the sessions
// every 3 s; everything here is the page itself: a red margin rule, lines every 22 px, a today's
// entry, a stepping-stone checklist, three letter sections and a paper-note link menu.
// The page and the forest share query, selection, owner, topics, needs, done and notice
// through shared("inkpaw"), writing only when a value changes.

import { View, div, image, PathBuilder } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, run, appHome, settings, readTextFile, writeTextFile, terminals, panes, agents, focused, nextCommand, props, shared, setShared, openOverlay, closeOverlay } from "herdr";
import { charFor, WHO, faceSrc } from "./animals.js";
import { fieldsOf, fold, matchesQuery, tokensOf } from "./search.js";
import {
  arrowSegments,
  circlePoints,
  handWidth,
  highlighterPoints,
  sectionCaption,
  sectionTint,
  squigglePoints,
  starPoints,
} from "./ink.js";
import { DEMO } from "./demo.js";

export { fold };

const PAPER = "#f8f1e3";
const INK = "#4b4239";
const PENCIL = "#7d6f60";
const FAINT = "#9a8b78";
const RULE = "#d8cab0";
const MARGIN = "#c46a3a";
const HIGHLIGHT = "#efe6d4";
const TITLE_FONT = "Gowun Dodum";
const BODY_FONT = "Gowun Dodum";
// The hand font is only for headings, labels and margin notes; the rows stay in Gowun Dodum.
const HEADING_FONT = "Patrick Hand";
const HEADING_SIZE = 18;
const CAPTION_SIZE = 14;
const SWIPE_H = 13;

const ROW = 22;
const HEAD_ROW = 28;
const MARGIN_X = 28;
const PAGE_PAD_L = 40;
const PAGE_PAD_R = 14;
const STEP_ROWS = 6;

export const SHARED_KEY = "inkpaw";
const SEEN_KEY = "inkpaw.journal.seen";
const VIEWED_KEY = "inkpaw.journal.viewed";
const POLL_MS = 3000;
const FOCUS_WATCH_MS = 100;
const STALL_MS = 10 * 60 * 1000;
const SNOOZE_MS = 10 * 60 * 1000;
const STALE_MS = 30 * 60 * 1000;
export const MAX_DONE = 5;
const UNDO_MS = 6000;
const HISTORY_MAX = 50;
const NAV_SETTLE_MS = 1000;
const ATTACH_GRACE_MS = 15000;
export const NONE = "\u0000none";

// The commands the forest sends while it holds the keyboard, each the key this page's key()
// already answers, run on the selection carried by shared("inkpaw").
export const COMMAND_KEYS = {
  read: { key: "backspace", modifiers: {} },
  undo: { key: "z", modifiers: { platform: true } },
  links: { key: "enter", modifiers: { platform: true } },
  page: { key: "enter", modifiers: { shift: true } },
  oldest_page: { key: "tab", modifiers: {} },
  steps_up: { key: "up", modifiers: {} },
  steps_down: { key: "down", modifiers: {} },
};

const BADGES = { "herdr-app": "herdr", herdr: "herdr", tmux: "tmux", orca: "orca" };

export function whereTag(where) {
  if (where?.kind === "orca") return "in Orca";
  if (where?.kind === "tmux") return "in tmux";
  return null;
}

export const LINKS_W = 300;

// The checklist integration's button sends one of these: while a turn runs the prompt is queued
// and tells the skill to leave the checklist off when that work leaves nothing to do.
export const CHECKLIST_PROMPT = "Use the deadhd skill to show this session's checklist.";
export const CHECKLIST_QUEUED_PROMPT = "Use the deadhd skill to show this session's checklist. This was queued by the enable button while previous work was running. If that work leaves nothing to do, do not enable it; just reply in one line.";

// cmd +/-/0 in this layout change the terminals' text size in settings.json, never the zoom.
export const TERM_FONT = 14, TERM_FONT_MIN = 8, TERM_FONT_MAX = 32;
export function nextSettings(person, command, shown = TERM_FONT) {
  const next = { ...person };
  if (command === "font_reset") {
    delete next.font_size;
    next.zoom = 1;
    return next;
  }
  const d = command === "font_in" ? 1 : command === "font_out" ? -1 : 0;
  if (!d) return null;
  const now = Number(next.font_size ?? shown) || TERM_FONT;
  next.font_size = Math.max(TERM_FONT_MIN, Math.min(TERM_FONT_MAX, Math.round(now) + d));
  return next;
}

function clean(value) {
  if (typeof value !== "string") return null;
  const collapsed = value.trim().split(/\s+/).join(" ");
  return collapsed || null;
}

function clip(value, limit) {
  const text = clean(value);
  if (!text) return null;
  return text.length > limit ? text.slice(0, limit) : text;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return null;
}

// Shares of `size` sit a little above CoreText measures of Gowun Dodum 12, so a kept line still
// fits before gpui's truncate cuts it.
export function textWidth(text, size) {
  let width = 0;
  for (const ch of String(text ?? "")) {
    const code = ch.codePointAt(0);
    if (code >= 0x2e80) width += size * 0.9;
    else if (/[\s.,:;!'|]/.test(ch)) width += size * 0.3;
    else if (/[A-Z]/.test(ch)) width += size * 0.7;
    else if (/[0-9]/.test(ch)) width += size * 0.62;
    else width += size * 0.55;
  }
  return width;
}

// Lines of `text` at `size` px that fit `width`, at most `lines`; the last one ends in "…" when
// text is left over. gpui clips but has no multi-line ellipsis, so the page cuts its text itself.
export function wrapLines(text, size, width, lines, firstIndent = 0) {
  const source = clean(text);
  if (!source || lines <= 0) return [];
  const all = [];
  let current = "";
  let room = width - firstIndent;
  for (const ch of source) {
    if (textWidth(current + ch, size) <= room) { current += ch; continue; }
    const cut = current.lastIndexOf(" ");
    if (ch !== " " && cut > 0) {
      all.push(current.slice(0, cut));
      current = current.slice(cut + 1) + ch;
    } else {
      all.push(current);
      current = ch === " " ? "" : ch;
    }
    room = width;
  }
  if (current.trim()) all.push(current);
  if (all.length <= lines) return all.map((line) => line.trim());
  const kept = all.slice(0, lines).map((line) => line.trim());
  const lastRoom = lines === 1 ? width - firstIndent : width;
  let last = kept[lines - 1];
  while (last && textWidth(`${last}…`, size) > lastRoom) {
    const cut = last.lastIndexOf(" ");
    last = cut > 0 ? last.slice(0, cut) : last.slice(0, -1);
  }
  kept[lines - 1] = `${last.trimEnd()}…`;
  return kept;
}

// One stroked path through several point runs (an arrow's shaft and barbs, say).
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

// A Jira-style key: two to ten letters or digits, a hyphen, then a number.
const KEY_RE = /\b([A-Z][A-Z0-9]{1,9}-\d+)\b/i;

// Where a session runs, ticket key first: `cserver-PAW-12` is PAW-12 / cserver.
export function placeOf(cwd) {
  const parts = String(cwd ?? "").split("/").filter(Boolean);
  if (!parts.length) return { key: null, rest: null, repo: null, label: null };
  let repo = null;
  let leaf = parts.at(-1);
  const workspaces = parts.indexOf("workspaces");
  const worktrees = parts.lastIndexOf("worktrees");
  if (workspaces >= 0 && parts[workspaces + 2]) {
    repo = parts[workspaces + 1];
    leaf = parts[workspaces + 2];
  } else if (worktrees >= 2 && parts[worktrees - 1] === ".claude" && parts[worktrees + 1]) {
    repo = parts[worktrees - 2];
    leaf = parts[worktrees + 1];
  }
  const match = leaf.match(KEY_RE);
  if (!match) return { key: null, rest: null, repo, label: leaf };
  let rest = leaf.replace(match[1], " ");
  if (repo && rest.startsWith(`${repo}-`)) rest = rest.slice(repo.length + 1);
  rest = rest.split(/[\s-]+/).filter(Boolean).join("-")
    .replace(/(^|-)rd-\d{8}-\d{6}(?=-|$)/, "").replace(/(^|-)(?=[0-9a-f]*[a-f])[0-9a-f]{6}(?=-|$)/, "")
    .replace(/^-+|-+$/g, "") || null;
  return { key: match[1].toUpperCase(), rest, repo, label: [rest, repo].filter(Boolean).join(" · ") || match[1].toUpperCase() };
}

// A session name someone chose (`claude -n`, `/rename`), not one a launcher generated.
export function chosenTitle(name) {
  const text = clean(name);
  if (!text || /-(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])-\d{2}$/.test(text)) return null;
  return text;
}

// What a session is about, from scan.sh's identity: the handoff it started from, a pasted brief's
// heading, else the first sentence of its first prompt.
export function topicOf(identity, key = null) {
  if (!identity) return null;
  const first = (value) => String(value).split(/(?<=[.?!])\s/)[0];
  let topic = identity.handoff ?? identity.paste ?? null;
  if (!topic && identity.firstPrompt) {
    topic = first(String(identity.firstPrompt).replace(/https?:\/\/\S+/g, " ").replace(/\[Image #\d+\]/g, " ").replace(/`/g, "")
      .replace(/(?:~|\/)[\w.-]*(?:\/[\w.-]+){2,}/g, " ").replace(/^\s*\/[\w-]+\s+/, "")
      .split(/\s+/).join(" ").trim());
  }
  if (!topic) return null;
  topic = topic.replace(/<@[A-Z0-9]+>/g, "")
    .replace(/\s*\([^)]*(?:\d{4}-\d\d-\d\d|ts \d)[^)]*\)/g, "");
  topic = clean(topic);
  if (topic && key && topic.toUpperCase().startsWith(key)) topic = clean(topic.slice(key.length).replace(/^[\s—:-]+/, ""));
  return topic;
}

// A reply as one plain line: links, markdown marks and list bullets go.
export function cleanMessage(value) {
  if (typeof value !== "string") return null;
  return clean(value.replace(/https?:\/\/\S+/g, "")
    .replace(/\*\*[^*]+\*\*\s*(?=-\s)/g, "")
    .replace(/\*\*/g, "").replace(/`/g, "")
    .replace(/(^|\s)-\s+/g, "$1"));
}

// A session that is not Claude Code names its agent first.
export function footerOf(item) {
  const place = item.spot?.label ?? item.place ?? "";
  const agent = item.raw?.agent === "codex" ? "Codex" : item.raw?.agent === "gemini" ? "Gemini" : null;
  if (!agent) return place;
  return place ? `${agent} · ${place}` : agent;
}

// A ticket key is plain text unless the session itself wrote a full URL that contains it.
function ticketUrl(key, raw) {
  if (!key) return null;
  const text = [raw?.lastAnswer, raw?.lastPrompt, raw?.currentAction, raw?.lastSentence].filter(Boolean).join(" ");
  const escaped = String(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`https?://[^\\s]*${escaped}[^\\s]*`, "i"));
  return match ? match[0].replace(/[)\]}>,;.]+$/, "") : null;
}

// A card's links in the order its menu lists them: ticket, pull requests, pages.
export function linksOf(item) {
  const links = [];
  if (item.jiraKey && item.jiraUrl) links.push({ kind: "jira", label: "Ticket", meta: item.jiraKey, url: item.jiraUrl, hot: "j" });
  (item.prLinks ?? []).forEach((pr, i) => links.push({ kind: "pr", label: "Pull request", meta: pr.tag, url: pr.url, hot: i === 0 ? "p" : null }));
  (item.pages ?? []).filter((page) => page.openable).forEach((page, i) => links.push({ kind: "page", label: page.label || "Page", meta: null, url: page.url, hot: i === 0 ? "g" : null }));
  return links.filter((link) => link.url);
}

// The link note's height: 8 px padding, a 30 px head, a hairline, then 28 px rows and a closing rule.
export function linksNoteHeight(count, checklist = false, stop = false) {
  const rows = (stop ? 1 : 0) + (checklist ? 1 : 0) + (count || 1) + (count ? 1 : 0);
  return 8 + 30 + 1 + rows * 28 + 1 + 8;
}

function minutesOf(ms) {
  return Math.max(0, Math.floor(ms / 60000));
}

function shortDuration(ms) {
  const minutes = Math.max(1, Math.floor(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

function agoText(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function quietText(ms) {
  const minutes = minutesOf(ms);
  if (minutes < 60) return `Quiet ${minutes}m`;
  return `Quiet ${Math.floor(minutes / 60)}h`;
}

function etaText(eta, now) {
  if (!Number.isFinite(eta)) return null;
  const minutes = Math.ceil((eta - now) / 60000);
  return minutes > 0 ? `~${minutes}m left` : null;
}

function normalizeLabel(value) {
  return String(value ?? "").toLowerCase().replace(/[-_]/g, "");
}

function ackSession(key) {
  const index = key.lastIndexOf("+");
  return index > 0 ? key.slice(0, index) : key;
}

// The session name: the terminal title without leading symbols, else the tab, else the program.
function agentName(a) {
  const live = String(a.title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
  if (live && !/^[~/]/.test(live) && !live.includes("@") && live !== a.program?.name) return live;
  return a.tab_name && !/^\d+$/.test(a.tab_name) ? a.tab_name : a.program?.name ?? a.address;
}

// The pane already running `claude attach` for a background session, from the scan's view of it.
function attachedFocus(where, live = liveTerminals()) {
  if (where.paneId && panes().some((candidate) => candidate.pane === where.paneId)) return { pane: where.paneId };
  if (!where.terminalId || !live.some((terminal) => terminal.address === where.terminalId)) return null;
  const pane = panes().find((candidate) => candidate.terminal === where.terminalId);
  return pane ? { pane: pane.pane } : { terminal: where.terminalId };
}

function liveTerminals() {
  return terminals().filter((terminal) => terminal.state === "live" && !String(terminal.address ?? "").includes("/"));
}

// The Herdr terminal a session runs in: by its foreground pid, else by its terminal id
// while that terminal still sits in the session's folder.
export function terminalOf(raw, live) {
  const byPid = live.find((terminal) => Number(terminal.foreground?.pid) === Number(raw.pid));
  if (byPid) return byPid;
  const id = raw.where?.terminalId;
  const terminal = id ? live.find((candidate) => candidate.address === id) : null;
  const folder = (path) => String(path ?? "").replace(/\/+$/, "");
  const here = [terminal?.foreground?.cwd, terminal?.cwd].filter(Boolean).map(folder);
  return terminal && raw.cwd && here.includes(folder(raw.cwd)) ? terminal : null;
}

// Sending a conversation to the background leaves the interactive record frozen at the hand-off,
// still "busy", with `parkedJobId` naming that job; the pair is one conversation.
export function foldHandoffs(sessions) {
  const jobs = new Map(sessions.filter((raw) => raw.kind === "bg" && raw.jobId).map((raw) => [raw.jobId, raw]));
  const heirs = new Map();
  for (const old of sessions) {
    const bg = old.kind !== "bg" && old.parkedJobId ? jobs.get(old.parkedJobId) : null;
    if (bg && !heirs.has(bg)) heirs.set(bg, old);
  }
  if (!heirs.size) return sessions;
  const replaced = new Set(heirs.values());
  return sessions.filter((raw) => !replaced.has(raw)).map((raw) => {
    const old = heirs.get(raw);
    return old ? { ...raw, where: old.where ?? raw.where, deadhd: raw.deadhd ?? old.deadhd } : raw;
  });
}

// The terminals visited, in visit order; list[at] is where the user is and the later entries are the forward ones.
export function visitHistory(history, terminal) {
  if (!terminal || history.list[history.at] === terminal) return history;
  let list = [...history.list.slice(0, history.at + 1), terminal];
  if (list.length > HISTORY_MAX) list = list.slice(list.length - HISTORY_MAX);
  return { list, at: list.length - 1 };
}

// A dead terminal is skipped rather than stopping the walk: the person asked for the previous one still open.
export function stepHistory(history, delta, alive) {
  const { list, at } = history;
  for (let index = at + delta; index >= 0 && index < list.length; index += delta) {
    const terminal = list[index];
    if (alive.has(terminal) && terminal !== list[at]) return { history: { list, at: index }, target: terminal };
  }
  return { history, target: null };
}

// The forest's search side wants the notebook's topic per terminal, its Needs you order (oldest
// first, stalls left out) and its Done order (oldest first).
export function topicsOf(items) {
  const topics = {};
  for (const item of items) if (item.terminal && item.topic) topics[item.terminal] = item.topic;
  return topics;
}

export function needsOrder(attention) {
  return (attention ?? []).filter((item) => item.bucket !== "stall" && item.terminal).map((item) => item.terminal);
}

export function doneOrder(done) {
  return [...(done ?? [])].reverse().filter((item) => item.terminal).map((item) => item.terminal);
}

function pageOrder(pages) {
  return (pages ?? []).filter((page) => page.openable);
}

// Opens a page URL, then deletes the alert files behind it. Resolves true when it opened.
async function openPageFiles(page) {
  let opened = false;
  try {
    const result = await exec("open", [page.url]);
    opened = result.code === 0;
  } catch {}
  if (!opened) return false;
  try {
    await exec("rm", ["-f", ...(page.files ?? [])]);
  } catch {}
  return true;
}

export default class LineartJournal extends View {
  init(_props, cx) {
    this.role = props()?.role ?? "journal";
    this.demo = props()?.demo === true;
    if (this.role === "links") {
      this.handle = cx.focus_handle();
      this.active = 0;
      this.error = null;
      this.stopError = null;
      // Focus can't change during render; the timer catches the popup once it is on screen.
      this.handle.focus();
      cx.timer.after(50, () => this.handle.focus());
      return;
    }
    this.handle = cx.focus_handle();
    this.sessions = [];
    this.meta = { roots: 0, pages: [], unreadablePages: [] };
    this.err = null;
    this.notice = null;
    this.noticeAction = null;
    this.noticeTokenKey = null;
    this.sel = null;
    this.selAnchor = null;
    this.selDirty = false;
    this.sharedSelected = null;
    this.publishQueued = false;
    this.doneCursor = null;
    this.replyCursor = null;
    this.query = "";
    this.expanded = new Set();
    this.stepTop = {};
    this.showAllDone = false;
    this.snoozed = {};
    this.since = {};
    this.seen = this.loadSeen();
    this.viewed = this.loadViewed();
    this.scanning = false;
    this.sentQuery = null;
    this.history = { list: [], at: -1 };
    this.navTarget = null;
    this.pageH = 0;
    this.pageW = 0;
    if (this.demo) {
      this.sessions = DEMO.sessions;
      this.meta = DEMO.meta;
    }
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "focus") {
          this.handle.focus();
          cx.notify();
        } else if (command === "toggle") {
          if (this.handle.is_focused()) run("pane.go", { direction: "down" });
          else this.handle.focus();
          cx.notify();
        } else if (command === "font_in" || command === "font_out" || command === "font_reset") {
          await this.changeTermFont(command);
        } else if (command === "back" || command === "forward") {
          this.navigate(command === "back" ? -1 : 1);
        } else if (COMMAND_KEYS[command]) {
          this.runCommand(command, cx);
        }
      }
    });
    cx.timer.every(POLL_MS, (cx) => this.poll(cx));
    // Herdr's pane.go moves focus without notifying this view.
    cx.timer.every(FOCUS_WATCH_MS, (cx) => this.watchFocus(cx));
    this.poll(cx);
  }

  // settings.json is the person's file; a stale snapshot is retried like Herdr's Settings does.
  async changeTermFont(command) {
    const file = `${appHome()}/settings.json`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const raw = await readTextFile(file);
        const person = raw ? JSON.parse(raw) : {};
        const next = nextSettings(person, command, Number(settings()?.font_size) || TERM_FONT);
        if (!next) return;
        await writeTextFile(file, JSON.stringify(next, null, 2) + "\n", raw);
        return;
      } catch {}
    }
  }

  loadSeen() {
    try {
      const raw = localStorage.getItem(SEEN_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter((key) => typeof key === "string") : [];
    } catch {
      return [];
    }
  }

  saveSeen() {
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(this.seen));
    } catch {}
  }

  loadViewed() {
    try {
      const raw = localStorage.getItem(VIEWED_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter((key) => typeof key === "string") : [];
    } catch {
      return [];
    }
  }

  saveViewed() {
    try {
      localStorage.setItem(VIEWED_KEY, JSON.stringify(this.viewed));
    } catch {}
  }

  poll(cx) {
    if (this.scanning || this.demo) return;
    this.scanning = true;
    cx.spawn(async (cx) => {
      let error = null;
      let sessions = this.sessions;
      let meta = this.meta;
      try {
        const result = await exec("sh", [`${appHome()}/mods/inkpaw-journal/scan.sh`]);
        if (result.code !== 0) {
          throw new Error((result.stderr || result.stdout || "").trim() || `scan.sh exited ${result.code}`);
        }
        const parsed = this.parseScan(result.stdout ?? "");
        if (!parsed.meta) throw new Error("scan.sh returned no meta line");
        sessions = parsed.sessions;
        meta = parsed.meta;
      } catch (error_) {
        error = String(error_?.message ?? error_);
      }
      this.scanning = false;
      if (error) {
        this.err = String(error).replace(/\.$/, "");
      } else {
        this.err = meta.error ? String(meta.error).replace(/\.$/, "") : null;
        this.sessions = sessions;
        this.meta = meta;
        this.pruneSeen();
      }
      cx.notify();
    });
  }

  parseScan(output) {
    const sessions = [];
    let meta = null;
    for (const line of output.split("\n")) {
      if (!line.trim()) continue;
      let value;
      try {
        value = JSON.parse(line);
      } catch {
        continue;
      }
      if (value?.t === "s") sessions.push(value);
      else if (value?.t === "meta") meta = value;
    }
    return { sessions, meta };
  }

  pruneSeen() {
    const live = new Set(this.sessions.map((session) => session.sessionId));
    for (const a of this.agentsNow()) live.add(`agent:${a.address}`);
    const kept = this.seen.filter((key) => live.has(ackSession(key)));
    if (kept.length !== this.seen.length) {
      this.seen = kept;
      this.saveSeen();
    }
    const viewed = this.viewed.filter((key) => live.has(ackSession(key)));
    if (viewed.length !== this.viewed.length) {
      this.viewed = viewed;
      this.saveViewed();
    }
  }

  flash(cx, message, action = null) {
    const token = {};
    this.notice = message;
    this.noticeAction = action;
    this.noticeTokenKey = String(Date.now());
    this.noticeToken = token;
    cx.notify();
    cx.timer.after(UNDO_MS, (later) => {
      if (this.noticeToken === token) {
        this.notice = null;
        this.noticeAction = null;
        later.notify();
      }
    });
  }

  undoNotice(cx) {
    if (this.noticeAction?.kind === "undo") this.noticeAction.run();
    this.notice = null;
    this.noticeAction = null;
    if (cx) cx.notify();
  }

  retryScan(cx) {
    this.err = null;
    this.poll(cx);
  }

  noticePayload() {
    if (this.err) return { text: this.err, action: "retry", token: `err:${this.err}` };
    if (this.notice) return { text: this.notice, action: this.noticeAction?.kind ?? null, token: this.noticeTokenKey };
    return null;
  }

  // Herdr agents the scan doesn't list, as letters: blocked -> Needs you, working -> Working,
  // done and idle -> Done. Claude Code agents are left to the scan's own rows.
  // Demo mode draws the gallery fixture; every other mode reads Herdr and scan.sh.
  agentsNow() { return this.demo ? DEMO.agents : agents(); }
  liveNow() { return this.demo ? DEMO.terminals : liveTerminals(); }

  agentItems(now, claimed) {
    const items = [];
    const list = this.agentsNow();
    const present = new Set(list.map((a) => a.address));
    for (const address of Object.keys(this.since)) if (!present.has(address)) delete this.since[address];
    for (const a of list) {
      if (this.since[a.address]?.s !== a.status) this.since[a.address] = { s: a.status, at: now };
      if (claimed.has(a.address) || a.app === "claude-code") continue;
      const group = a.status === "blocked" ? "attention" : a.status === "working" ? "working" : "done";
      const since = this.since[a.address].at;
      const sessionId = `agent:${a.address}`;
      const ackKey = `${sessionId}+${a.seq}`;
      items.push({
        sessionId,
        pid: null,
        agent: a,
        raw: { status: a.status, cwd: null, name: agentName(a) },
        bucket: group === "attention" ? "wait" : group,
        group,
        title: clip(agentName(a), 60) ?? a.address,
        since,
        updatedAt: since,
        sortDate: since,
        place: clip(a.space_name, 40),
        spot: { key: null, rest: null, repo: null, label: clip(a.space_name, 40) },
        topic: null,
        round: null,
        keyTag: null,
        jiraKey: null,
        jiraUrl: null,
        prTag: null,
        extraPRs: [],
        prLinks: [],
        hasChecklist: false,
        counts: null,
        total: null,
        progress: null,
        stepStates: null,
        steps: [],
        progressStale: false,
        blocked: group === "attention",
        eta: null,
        nowLabel: null,
        nowLine: a.program?.name ? `${a.program.name} is working` : null,
        answer: "Waiting for your reply",
        prompt: null,
        replyTail: null,
        lastSentence: null,
        background: null,
        pages: [],
        where: { kind: "herdr", terminalId: a.address },
        terminal: a.address,
        ackKey,
        viewed: this.viewed.includes(ackKey),
        badge: "herdr",
        charKey: a.address,
      });
    }
    return items;
  }

  buildModel(now) {
    const seen = new Set(this.seen);
    const live = this.liveNow();
    const claimed = new Set();
    const items = [];
    for (const raw of foldHandoffs(this.sessions)) {
      const deadhd = raw.deadhd ?? null;
      const hasChecklist = Boolean(deadhd && !deadhd.off && deadhd.counts && (deadhd.total ?? 0) > 0);
      const counts = hasChecklist ? deadhd.counts : null;
      const background = raw.background ?? { shells: 0, agents: 0, monitors: 0, total: 0 };
      const terminal = terminalOf(raw, live);
      if (terminal) claimed.add(terminal.address);

      let bucket;
      if (raw.status === "waiting") bucket = "wait";
      else if (raw.status === "busy") {
        const hasBackground = (background.total ?? 0) > 0;
        const last = raw.lastMeaningfulAt;
        bucket = !hasBackground && last && now - last > STALL_MS ? "stall" : "working";
      } else if (raw.status === "shell") {
        bucket = (counts?.blocked ?? 0) > 0 ? "wait" : "working";
      } else if (raw.status === "idle") {
        bucket = "done";
      } else {
        bucket = "working";
      }
      // A native agent's approval prompt is never on disk; Herdr's blocked status tells us instead.
      if (raw.agent && raw.agent !== "claude" && terminal) {
        const spoke = agents().find((entry) => entry.address === terminal.address);
        if (spoke?.status === "blocked") bucket = "wait";
      }

      let group = bucket === "wait" || bucket === "stall" ? "attention" : bucket === "done" ? "done" : "working";
      if (group === "attention" && bucket === "stall" && (this.snoozed[raw.sessionId] ?? 0) > now) {
        group = "working";
      }

      const since = raw.statusUpdatedAt ?? raw.startedAt ?? null;
      const updatedAt = Math.max(raw.statusUpdatedAt ?? 0, raw.lastMeaningfulAt ?? 0) || null;
      const title = clip(firstNonEmpty(
        hasChecklist ? deadhd.title : null,
        raw.customTitle,
        raw.agentName,
        raw.name,
        raw.lastPrompt ? clip(raw.lastPrompt, 60) : null,
      ), 60) ?? "Untitled session";

      const location = clip(raw.location, 40);
      const place = location && normalizeLabel(location) !== normalizeLabel(title) ? location : null;
      const keyTag = deadhd?.key && deadhd.key.toLowerCase() !== title.trim().toLowerCase() ? deadhd.key : null;
      const identity = raw.identity ?? null;
      const spot = placeOf(raw.cwd);
      if (!spot.key && deadhd?.key) spot.key = String(deadhd.key).toUpperCase();
      const topic = clip(firstNonEmpty(chosenTitle(raw.customTitle), hasChecklist ? deadhd.title : null, topicOf(identity, spot.key)), 120);
      const round = spot.key && Number.isFinite(identity?.round) ? identity.round : null;

      const prs = [];
      if (hasChecklist && deadhd.pr?.href) {
        prs.push({ url: deadhd.pr.href, label: deadhd.pr.text ?? null, number: deadhd.pr.number ?? 0 });
      }
      if (raw.pr?.url && !prs.some((pr) => pr.url === raw.pr.url)) {
        prs.push({ url: raw.pr.url, label: raw.pr.label ?? null, number: raw.pr.number ?? 0 });
      }
      const prRepo = (url) => String(url ?? "").split("/")[4] ?? null;
      const prTag = prs[0] ? (prs[0].label ?? (prs[0].number
        ? `${spot.repo && prRepo(prs[0].url) && prRepo(prs[0].url) !== spot.repo ? prRepo(prs[0].url) : ""}#${prs[0].number}`
        : null)) : null;
      const extraPRs = prs.slice(1).map((pr) => pr.label ?? (pr.number ? `#${pr.number}` : pr.url)).filter(Boolean);

      const progress = hasChecklist && (deadhd.total ?? 0) > 0
        ? { done: Math.max(0, counts.done), total: deadhd.total }
        : null;
      const steps = hasChecklist && Array.isArray(deadhd.items) ? deadhd.items : [];
      const eta = hasChecklist && Number.isFinite(deadhd.eta) ? etaText(deadhd.eta, now) : null;
      const nowLabel = clean(hasChecklist ? deadhd.nowLabel : null);
      const currentAction = clean(raw.currentAction);
      const lastSentence = clean(raw.lastSentence);
      let nowLine = null;
      if (nowLabel) nowLine = `▶ ${nowLabel}`;
      else if (currentAction) nowLine = currentAction;
      else if (lastSentence) nowLine = lastSentence;

      let answer;
      if (bucket === "stall") {
        const quiet = Math.max(1, minutesOf(now - (raw.lastMeaningfulAt ?? since ?? now)));
        answer = `No new activity for ${quiet} minute${quiet === 1 ? "" : "s"}. Check whether it is stuck`;
      } else if (hasChecklist && (counts?.blocked ?? 0) > 0 && deadhd.blockedAsk) {
        answer = deadhd.blockedAsk;
      } else {
        answer = clean(raw.lastAnswer)
          ?? (raw.waitingFor === "permission prompt" ? "Waiting for permission approval" : "Waiting for your reply");
      }

      const pages = Array.isArray(raw.pages) ? raw.pages : [];
      const ackKey = `${raw.sessionId}+${since != null ? Math.floor(since / 1000) : "none"}`;
      const sortDate = since ?? updatedAt;

      if (group === "done" && seen.has(ackKey)) continue;

      items.push({
        sessionId: raw.sessionId,
        pid: raw.pid,
        raw,
        bucket,
        group,
        title,
        since,
        updatedAt,
        sortDate,
        place,
        spot,
        topic,
        round,
        keyTag,
        jiraKey: deadhd?.key ?? spot.key ?? null,
        jiraUrl: deadhd?.keyHref ?? ticketUrl(deadhd?.key ?? spot.key, raw),
        prTag,
        extraPRs,
        prLinks: prs.map((pr, i) => ({ url: pr.url, tag: (i === 0 ? prTag : extraPRs[i - 1]) ?? pr.url })),
        hasChecklist,
        counts,
        total: deadhd?.total ?? null,
        progress,
        stepStates: deadhd?.states ?? null,
        steps,
        progressStale: Boolean(deadhd?.dataAt && now - deadhd.dataAt > STALE_MS),
        blocked: (counts?.blocked ?? 0) > 0,
        eta,
        nowLabel,
        nowLine,
        answer,
        replyTail: clean(raw.lastAnswer),
        lastSentence,
        background,
        pages,
        where: raw.where ?? {},
        ackKey,
        viewed: this.viewed.includes(ackKey) || Boolean(raw.demoViewed),
        badge: BADGES[raw.where?.kind] ?? null,
        terminal: terminal?.address ?? null,
        charKey: terminal?.address ?? raw.sessionId,
        backgrounded: raw.kind === "bg" && !attachedFocus(raw.where ?? {}, live),
      });
    }

    for (const item of this.agentItems(now, claimed)) {
      if (item.group === "done" && seen.has(item.ackKey)) continue;
      items.push(item);
    }

    const sortAsc = (a, b) => {
      if (a.sortDate == null && b.sortDate == null) return a.sessionId < b.sessionId ? -1 : 1;
      if (a.sortDate == null) return 1;
      if (b.sortDate == null) return -1;
      if (a.sortDate !== b.sortDate) return a.sortDate - b.sortDate;
      return a.sessionId < b.sessionId ? -1 : 1;
    };
    const sortDesc = (a, b) => {
      if (a.sortDate == null && b.sortDate == null) return a.sessionId < b.sessionId ? -1 : 1;
      if (a.sortDate == null) return 1;
      if (b.sortDate == null) return -1;
      if (a.sortDate !== b.sortDate) return b.sortDate - a.sortDate;
      return a.sessionId < b.sessionId ? -1 : 1;
    };

    // Replies first, then stalls, so Space (which skips stalls) always starts at the oldest letter.
    const stalled = (item) => (item.bucket === "stall" ? 1 : 0);
    const attention = items.filter((item) => item.group === "attention").sort((a, b) => stalled(a) - stalled(b) || sortAsc(a, b));
    const working = items.filter((item) => item.group === "working").sort(sortAsc);
    const done = items.filter((item) => item.group === "done").sort(sortDesc);
    return {
      attention,
      working,
      done,
      counts: { attention: attention.length, working: working.length, done: done.length },
    };
  }

  // The same rule as the forest (shared/search.js), over the notebook's shape.
  searchFields(item) {
    return fieldsOf({
      topic: item.topic,
      title: item.title,
      space: [item.place, item.spot?.label, item.raw?.name],
      cwd: item.raw?.cwd,
      ticket: [item.jiraKey, item.keyTag],
      pr: [item.prTag, ...(item.extraPRs ?? []), ...(item.prLinks ?? []).flatMap((pr) => [pr.tag, pr.url])],
    });
  }

  matches(item) {
    return matchesQuery(this.query, this.searchFields(item));
  }

  viewData(now = Date.now()) {
    const model = this.buildModel(now);
    const tokens = tokensOf(this.query);
    const filter = (list) => (tokens.length ? list.filter((item) => this.matches(item)) : list);
    const attention = filter(model.attention);
    const working = filter(model.working);
    const doneAll = filter(model.done);
    const doneVisible = this.showAllDone || tokens.length ? doneAll : doneAll.slice(0, MAX_DONE);
    const hiddenDone = doneAll.length - doneVisible.length;
    // allGroups stays unfiltered so a selection the search hides still reaches the shared contract.
    const allGroups = [
      { id: "attention", title: "Lanterns lit", items: model.attention, count: model.attention.length },
      { id: "working", title: "At work", items: model.working, count: model.working.length },
      { id: "done", title: "Mailbox", items: model.done, count: model.done.length },
    ];
    const groups = [
      { ...allGroups[0], items: attention, count: attention.length },
      { ...allGroups[1], items: working, count: working.length },
      { ...allGroups[2], items: doneVisible, count: doneAll.length },
    ];
    return { model, groups, allGroups, hiddenDone, now, counts: model.counts };
  }

  allItems(data) {
    return (data.allGroups ?? data.groups ?? []).flatMap((group) => group.items);
  }

  selectedItem(data) {
    if (this.sel === NONE || this.sel == null) return null;
    return this.allItems(data).find((item) => item.sessionId === this.sel) ?? null;
  }

  // The record at the top: the chosen letter, else the oldest lantern, else the oldest working session.
  recordItem(data) {
    const selected = this.selectedItem(data);
    if (selected) return selected;
    const attention = data.groups.find((group) => group.id === "attention")?.items ?? [];
    const working = data.groups.find((group) => group.id === "working")?.items ?? [];
    return attention[0] ?? working[0] ?? null;
  }

  // The other side's search and selection arrive through shared("inkpaw"); ours is skipped by token.
  // A selection with no letter here clears this side's own: pointing at a stale letter would publish
  // it back over the forest's choice.
  adoptShared(data) {
    const state = shared(SHARED_KEY) ?? {};
    if (typeof state.query === "string" && state.query !== this.query && state.query !== this.sentQuery) {
      this.query = state.query;
    }
    const selected = state.selected ?? null;
    if (selected !== (this.sharedSelected ?? null)) {
      this.sharedSelected = selected;
      const item = selected ? this.allItems(data).find((entry) => entry.terminal === selected) : null;
      this.sel = selected ? (item ? item.sessionId : NONE) : null;
      this.selAnchor = this.sel;
    }
  }

  // With neither the notebook nor the forest holding the keyboard, the selection follows the focused pane.
  followFocus(data) {
    const owner = shared(SHARED_KEY)?.owner ?? null;
    const terminal = focused()?.terminal ?? null;
    if (this.handle?.is_focused?.() || owner === "forest") {
      this.followed = null;
      return;
    }
    if (!terminal || terminal === this.followed) return;
    const item = this.allItems(data).find((entry) => entry.terminal === terminal);
    if (!item) return;
    this.followed = terminal;
    this.markViewed(item);
    this.sel = item.sessionId;
  }

  // A one-shot after render: render must not call setShared, which redraws every mod.
  publishSoon(cx) {
    if (this.publishQueued) return;
    this.publishQueued = true;
    cx.timer.after(0, () => {
      this.publishQueued = false;
      this.publish(this.viewData(), Boolean(this.handle?.is_focused?.()));
    });
  }

  // What the forest reads, written as a patch of only the keys that changed (setShared redraws
  // every mod). `selected` is written only when the notebook moved it: selAnchor is the selection
  // as last agreed with the forest, so adopting the forest's choice never rewrites it back.
  publish(data, focused) {
    const items = this.allItems(data);
    const model = data.model ?? { attention: [], working: [], done: [] };
    const current = shared(SHARED_KEY) ?? {};
    const selected = this.selectedItem(data)?.terminal ?? null;
    const next = {
      query: this.query,
      owner: focused ? "journal" : current.owner === "journal" ? null : current.owner ?? null,
      topics: topicsOf(items),
      needs: needsOrder(model.attention),
      done: doneOrder(model.done),
      notice: this.noticePayload(),
    };
    const patch = {};
    for (const [key, value] of Object.entries(next)) {
      if (!(key in current) || JSON.stringify(current[key] ?? null) !== JSON.stringify(value ?? null)) patch[key] = value;
    }
    const moved = this.selDirty || !("selected" in current) || this.sel !== this.selAnchor;
    if (moved) patch.selected = selected;
    if (!Object.keys(patch).length) {
      this.sentQuery = this.query;
      return false;
    }
    setShared(SHARED_KEY, { ...current, ...patch });
    this.sentQuery = this.query;
    if (moved) {
      this.sharedSelected = selected;
      this.selAnchor = this.sel;
    }
    this.selDirty = false;
    return true;
  }

  stepWindow(steps) {
    const states = steps.map((step) => step.state);
    const total = states.length;
    const first = (state) => { const at = states.indexOf(state); return at >= 0 ? at : null; };
    const focus = first("now") ?? first("side") ?? first("blocked") ?? first("left") ?? total - 1;
    return { total, focus };
  }

  stepMaxTop(item) {
    return Math.max(0, item.steps.length - STEP_ROWS);
  }

  openSteps(item) {
    const { focus } = this.stepWindow(item.steps);
    this.stepTop[item.sessionId] = Math.min(Math.max(focus - 1, 0), this.stepMaxTop(item));
    this.expanded.add(item.sessionId);
  }

  scrollSteps(item, delta) {
    const top = this.stepTop[item.sessionId] ?? 0;
    this.stepTop[item.sessionId] = Math.max(0, Math.min(this.stepMaxTop(item), top + delta));
  }

  visibleSteps(item) {
    const top = Math.min(this.stepTop[item.sessionId] ?? 0, this.stepMaxTop(item));
    return item.steps.slice(top, top + STEP_ROWS);
  }

  stepStatesOf(item) {
    const total = item.progress?.total ?? 0;
    const counts = item.counts ?? { done: 0, now: 0, blocked: 0 };
    if (Array.isArray(item.stepStates) && item.stepStates.length === total) return item.stepStates;
    const states = [];
    for (let i = 0; i < Math.max(0, counts.done); i++) states.push("done");
    for (let i = 0; i < Math.max(0, counts.now); i++) states.push("now");
    for (let i = 0; i < Math.max(0, counts.blocked); i++) states.push("blocked");
    while (states.length < total) states.push("left");
    if (states.length > total) states.splice(total);
    return states;
  }

  currentStep(item) {
    const states = this.stepStatesOf(item);
    const at = states.findIndex((state) => state === "now" || state === "side");
    const fallback = states.findIndex((state) => state === "blocked");
    const index = at >= 0 ? at : fallback;
    return index >= 0 ? item.steps[index] ?? null : null;
  }

  markViewed(item) {
    if (!item || item.group !== "done") return false;
    if (this.viewed.includes(item.ackKey)) return false;
    this.viewed = [...this.viewed, item.ackKey];
    this.saveViewed();
    return true;
  }

  markSeen(item, cx) {
    if (!item || item.group !== "done") return false;
    if (this.seen.includes(item.ackKey)) return false;
    this.seen = [...this.seen, item.ackKey];
    this.saveSeen();
    const key = item.ackKey;
    if (cx) this.flash(cx, "Marked as read", { kind: "undo", run: () => {
      this.seen = this.seen.filter((candidate) => candidate !== key);
      this.saveSeen();
    } });
    return true;
  }

  snooze(item, cx) {
    if (!item || item.bucket !== "stall") return false;
    const until = this.snoozed[item.sessionId] ?? 0;
    this.snoozed[item.sessionId] = Date.now() + SNOOZE_MS;
    if (cx) this.flash(cx, "Snoozed", { kind: "undo", run: () => {
      this.snoozed[item.sessionId] = until;
    } });
    return true;
  }

  acknowledge(item, cx) {
    if (!item) return;
    if (item.group === "done") this.markSeen(item, cx);
    else if (item.group === "attention" && item.bucket === "stall") this.snooze(item, cx);
  }

  // Space: the session that has waited longest for a reply, cycling on repeat; stalls are skipped.
  // Shift+Space: every Done letter from the oldest, leftward, cycling on repeat.
  jump(kind, data, cx) {
    let target = null;
    if (kind === "reply") {
      const candidates = data.model.attention.filter((item) => item.bucket !== "stall");
      if (candidates.length) {
        const at = candidates.findIndex((item) => item.sessionId === this.replyCursor);
        target = at < 0 ? candidates[0] : candidates[(at + 1) % candidates.length];
        this.replyCursor = target.sessionId;
      }
    } else {
      const candidates = [...data.model.done].reverse();
      if (candidates.length) {
        const at = candidates.findIndex((item) => item.sessionId === this.doneCursor);
        target = at < 0 ? candidates[0] : candidates[(at + 1) % candidates.length];
        this.doneCursor = target.sessionId;
      }
    }
    if (!target) {
      this.flash(cx, kind === "reply" ? "No session is waiting for a reply" : "No finished sessions");
      return;
    }
    this.goTo(target, cx);
    if (kind === "done") this.showAllDone = true;
    this.sel = target.sessionId;
  }

  goTo(item, cx) {
    if (!item) return;
    if (item.group === "done") this.markViewed(item);
    if (item.agent) {
      run("pane.focus", { pane: item.agent.pane });
      return;
    }
    const terminal = terminalOf(item.raw ?? item, this.liveNow());
    if (terminal) {
      const pane = panes().find((candidate) => candidate.terminal === terminal.address);
      run("pane.focus", pane ? { pane: pane.pane } : { terminal: terminal.address });
      return;
    }
    const where = item.where ?? {};
    if (where.kind === "claude-bg") {
      const focus = attachedFocus(where, this.liveNow());
      if (focus) {
        run("pane.focus", focus);
        return;
      }
      // The scan that would report the new attach pane runs seconds later; a second click meanwhile must not open another.
      const opened = this.attachOpened?.[where.attachId];
      if (opened && Date.now() - opened < ATTACH_GRACE_MS) return;
      this.attachOpened = { ...this.attachOpened, [where.attachId]: Date.now() };
      run("pane.split", { direction: "right", argv: ["claude", "attach", where.attachId] });
      return;
    }
    if (where.kind === "tmux" && where.paneId) {
      const base = where.socket ? ["-S", where.socket] : [];
      const calls = [
        ["switch-client", "-t", where.paneId],
        ["select-window", "-t", where.paneId],
        ["select-pane", "-t", where.paneId],
      ];
      cx.spawn(async (later) => {
        let reached = false;
        for (const call of calls) {
          try {
            const result = await exec("tmux", [...base, ...call]);
            reached = reached || result.code === 0;
          } catch {}
        }
        if (!reached) this.flash(later, "Couldn't reach that tmux terminal");
      });
      return;
    }
    if (where.handle) {
      cx.spawn(async (later) => {
        try {
          const result = await exec("/Applications/Orca.app/Contents/Resources/bin/orca",
            ["terminal", "switch", "--terminal", where.handle, "--json"]);
          if (result.code !== 0) this.flash(later, "Couldn't reach that Orca terminal");
          else await exec("open", ["-a", "Orca"]);
        } catch {
          this.flash(later, "Couldn't reach that Orca terminal");
        }
      });
      return;
    }
    this.flash(cx, "Not in Herdr, tmux or Orca — open its terminal first");
  }

  pageGroup(item) {
    return item?.pages?.[0] ?? null;
  }

  progressTarget(item) {
    const path = item.raw.deadhd?.pagePath;
    if (path) return { url: path, openable: true, files: [] };
    return this.pageGroup(item);
  }

  dropPage(page) {
    const same = (candidate) => candidate
      && candidate.pageId === page.pageId
      && candidate.worktree === page.worktree
      && candidate.url === page.url;
    if (this.meta?.pages) this.meta.pages = this.meta.pages.filter((candidate) => !same(candidate));
    for (const session of this.sessions) {
      if (Array.isArray(session.pages)) session.pages = session.pages.filter((candidate) => !same(candidate));
    }
  }

  openPage(page, cx) {
    if (!page) {
      this.flash(cx, "No page to open — try again after the next scan");
      return;
    }
    if (!page.openable) {
      this.flash(cx, "This page cannot be opened — check the file is still there");
      return;
    }
    cx.spawn(async (later) => {
      if (!(await openPageFiles(page))) {
        this.flash(later, "This page cannot be opened — check the file is still there");
        return;
      }
      this.dropPage(page);
      later.notify();
      this.poll(later);
    });
  }

  openOldestPage(cx) {
    const pages = pageOrder(this.meta?.pages);
    if (!pages.length) {
      this.flash(cx, "No page to open — try again after the next scan");
      return;
    }
    this.openPage(pages[0], cx);
  }

  focusKey() {
    return `${Boolean(this.handle?.is_focused?.())}|${focused()?.terminal ?? ""}`;
  }

  watchFocus(cx) {
    this.trackVisit();
    if (this.focusKey() !== this.drawnFocus) cx.notify();
  }

  // After a back/forward the terminal being left can still show as focused for a few watches;
  // recording it would drop the forward entries.
  trackVisit(now = Date.now()) {
    const terminal = focused()?.terminal ?? null;
    if (!terminal) return;
    if (this.navTarget) {
      if (terminal === this.navTarget) {
        this.navTarget = null;
        return;
      }
      if (now < this.navUntil) return;
      this.navTarget = null;
    }
    this.history = visitHistory(this.history, terminal);
  }

  navigate(delta) {
    const alive = new Set(this.liveNow().map((terminal) => terminal.address));
    const { history, target } = stepHistory(this.history, delta, alive);
    if (!target) return;
    this.history = history;
    this.navTarget = target;
    this.navUntil = Date.now() + NAV_SETTLE_MS;
    run("pane.focus", { terminal: target });
  }

  // A command from the forest runs the branch its cards-strip key ran, on the shared selection.
  // It arrives without this page's focus, so there is no event dispatch to stop.
  runCommand(command, cx) {
    const keys = COMMAND_KEYS[command];
    if (!keys) return false;
    this.adoptShared(this.viewData());
    this.key({ ...keys, is_held: false }, {
      notify: () => cx.notify(),
      stop_propagation() {},
      spawn: (body, opts) => cx.spawn(body, opts),
      timer: cx.timer,
    });
    return true;
  }

  key(event, cx) {
    const modifiers = event.modifiers ?? {};
    const alt = Boolean(modifiers.alt);
    const shift = Boolean(modifiers.shift);
    const command = Boolean(modifiers.platform);
    const control = Boolean(modifiers.control);
    const key = event.key;
    const data = this.viewData();
    const items = data.groups.flatMap((group) => group.items);
    const selected = this.selectedItem(data);
    const index = items.findIndex((item) => item.sessionId === selected?.sessionId);

    const choose = (next) => {
      if (!items.length) return;
      const target = items[Math.max(0, Math.min(items.length - 1, next))];
      this.sel = target.sessionId;
      if (target.group === "done") this.markViewed(target);
    };

    const plain = !command && !control && !alt;
    const searching = Boolean(this.query);
    let handled = true;
    if (key === "p" && control && alt && !command) {
      run("pane.go", { direction: "down" });
    } else if (key === "escape") {
      if (searching) this.query = "";
      else if (this.sel !== NONE || (shared(SHARED_KEY)?.selected ?? null) != null) {
        // Esc clears the shared selection too, not just this page's.
        this.sel = NONE;
        this.selDirty = true;
      } else {
        run("pane.go", { direction: "down" });
        handled = false;
      }
    } else if (key === "backspace" && plain) {
      if (searching) this.query = this.query.slice(0, -1);
      else if (!event.is_held) this.acknowledge(selected, cx);
    } else if (key === "backspace" && searching && command && !control && !alt) {
      this.query = "";
    } else if (key === "backspace" && searching && alt && !command && !control) {
      this.query = this.query.replace(/\S*\s*$/, "");
    } else if (key === "down") {
      if (selected?.steps.length) {
        if (!this.expanded.has(selected.sessionId)) this.openSteps(selected);
        else if ((this.stepTop[selected.sessionId] ?? 0) < this.stepMaxTop(selected)) this.scrollSteps(selected, 1);
        else choose(index + 1);
      } else choose(index < 0 ? 0 : index + 1);
    } else if (key === "up") {
      if (selected?.steps.length && this.expanded.has(selected.sessionId)) {
        if ((this.stepTop[selected.sessionId] ?? 0) > 0) this.scrollSteps(selected, -1);
        else this.expanded.delete(selected.sessionId);
      } else choose(index < 0 ? 0 : index - 1);
    } else if (key === "enter") {
      if (command && !shift && !control && !alt) {
        if (selected) this.openLinks(selected, cx);
      } else if (shift) {
        const page = selected && selected.group !== "done" ? this.progressTarget(selected) : this.pageGroup(selected);
        if (page) this.openPage(page, cx);
        else this.flash(cx, "No page to open on this row");
      } else this.goTo(selected, cx);
    } else if (key === "space" && plain && !searching) {
      this.jump(shift ? "done" : "reply", data, cx);
    } else if (key === "tab" && plain && !shift) {
      if (searching) handled = false;
      else this.openOldestPage(cx);
    } else if (key === "z" && command && !shift && !control && !alt) {
      if (this.noticeAction) this.undoNotice(cx);
      else handled = false;
    } else if (event.key_char && event.key_char.length === 1 && plain) {
      if (searching || event.key_char.trim()) this.query += event.key_char;
      else handled = false;
    } else {
      handled = false;
    }

    if (handled) {
      cx.stop_propagation();
      cx.notify();
    }
  }

  // A row's links in a note at the pointer, and the row selected.
  openLinks(item, cx) {
    if (!item) return;
    this.sel = item.sessionId;
    cx.notify();
    const links = linksOf(item);
    const showChecklist = Boolean(item.terminal) && item.raw?.t === "s" && !item.hasChecklist;
    const stopId = item.backgrounded ? item.raw.jobId ?? item.where.attachId ?? null : null;
    openOverlay({ mod: "inkpaw-journal", kind: "popup", width: LINKS_W, height: linksNoteHeight(links.length, showChecklist, Boolean(stopId)),
      props: { role: "links", head: item.jiraKey ?? item.spot?.label ?? "Session",
        topic: item.topic ?? item.title ?? null, links, showChecklist, stopId, terminal: item.terminal ?? null,
        working: item.raw?.status === "busy" } });
  }

  // props().role "links": the paper note openLinks() opens. X stops a background session no pane
  // shows, C asks for the checklist, J, P, S and G open the first link of each kind.
  linksNote() {
    const { head, topic, links = [], showChecklist = false, stopId = null } = props() ?? {};
    const rows = [...(stopId ? [{ stop: true }] : []), ...(showChecklist ? [{ checklist: true }] : []), ...links];
    const offset = (stopId ? 1 : 0) + (showChecklist ? 1 : 0);
    const row = (id, label, meta, hot, active, action, error = null, tint = INK) => h_flex().id(id).h(28).flex_none().pl(24).pr(10).gap(8)
      .items_center().cursor_pointer().border_b(1).border_color(RULE)
      .when(active, (el) => el.bg(HIGHLIGHT))
      .hover((style) => style.bg(HIGHLIGHT))
      .on_click((_event, cx) => action(cx))
      .child(div().flex_1().min_w(0).truncate().text_size(12).font_family(BODY_FONT).text_color(tint).child(label))
      .when(Boolean(error), (el) => el.child(div().flex_none().max_w(110).truncate().text_size(12).font_family(BODY_FONT)
        .text_color(MARGIN).child(error)))
      .when(Boolean(meta), (el) => el.child(div().flex_none().max_w(100).truncate().text_size(12).font_family(BODY_FONT)
        .text_color(PENCIL).child(meta)))
      .when(Boolean(hot), (el) => el.child(div().flex_none().text_size(12).font_family(BODY_FONT).text_color(FAINT)
        .child(String(hot).toUpperCase())));

    const copy = (cx) => this.copyLinks(links, cx);
    return v_flex().id("journal-links").relative().size_full().bg(PAPER).pt(8).pb(8)
      .track_focus(this.handle)
      .on_key_down((event, cx) => this.linksKey(event.key, rows, cx))
      .child(div().absolute().left(14).top(0).bottom(0).w(1).bg(MARGIN).opacity(0.5))
      .child(h_flex().h(30).flex_none().pl(24).pr(10).gap(8).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(16).font_family(TITLE_FONT).text_color(INK).child(head ?? ""))
        .when(Boolean(topic), (el) => el.child(div().flex_none().max_w(140).truncate().text_size(12).font_family(BODY_FONT)
          .text_color(FAINT).child(topic))))
      .child(div().h(1).flex_none().bg(RULE).opacity(0.8))
      .when(Boolean(stopId), (el) => el.child(row("link-stop", "Stop the background session", null, "x", this.active === 0,
        (cx) => this.stopSession(cx), this.stopError, MARGIN)))
      .when(showChecklist, (el) => el.child(row("link-checklist", "Request checklist", null, "c", this.active === (stopId ? 1 : 0),
        (cx) => this.enableChecklist(cx), this.error)))
      .when(links.length === 0, (el) => el.child(h_flex().h(28).pl(24).pr(10).items_center().border_b(1).border_color(RULE)
        .child(div().text_size(12).font_family(BODY_FONT).text_color(FAINT).child("No links on this row"))))
      .children(links.map((link, index) => row(`link-${index}`, link.label, link.meta, link.hot,
        index + offset === this.active, (cx) => this.openLink(link, cx))))
      .when(links.length > 0, (el) => el
        .child(div().h(1).flex_none().bg(RULE).opacity(0.8))
        .child(row("link-copy", "Copy all links", null, null, false, copy, null, PENCIL)));
  }

  // The note's keys: a row's letter runs it, ↑↓ move, ↩ runs the highlighted row, Esc closes.
  linksKey(key, rows, cx) {
    const hot = rows.find((row) => (row.stop ? key === "x" : row.checklist ? key === "c" : row.hot === key));
    if (hot?.stop) this.stopSession(cx);
    else if (hot?.checklist) this.enableChecklist(cx);
    else if (hot) this.openLink(hot, cx);
    else if (key === "down" && rows.length) this.active = (this.active + 1) % rows.length;
    else if (key === "up" && rows.length) this.active = (this.active - 1 + rows.length) % rows.length;
    else if (key === "enter" && rows[this.active]) {
      if (rows[this.active].stop) this.stopSession(cx);
      else if (rows[this.active].checklist) this.enableChecklist(cx);
      else if (rows[this.active].url) this.openLink(rows[this.active], cx);
      else this.copyLinks(props()?.links ?? [], cx);
    } else if (key === "escape") closeOverlay(props().overlay);
    else return;
    cx.stop_propagation();
    cx.notify();
  }

  // Asks the session to show its checklist through Herdr's CLI. The terminal and prompt are positional
  // args, so neither is parsed by the shell. Claude Code queues input typed during a turn.
  enableChecklist(cx) {
    const { terminal, working, overlay } = props() ?? {};
    if (!terminal) return;
    const prompt = working ? CHECKLIST_QUEUED_PROMPT : CHECKLIST_PROMPT;
    this.error = null;
    cx.spawn(async (cx) => {
      let result = null;
      try { result = await exec("sh", ["-lc", 'hc send "$1" "$2"', "x", terminal, prompt]); } catch {}
      if (!result || result.code !== 0) {
        this.error = (((result?.stderr || result?.stdout) ?? "").trim().replace(/\.$/, ""))
          || "Could not reach the terminal — focus it in Herdr and try again";
        cx.notify();
        return;
      }
      closeOverlay(overlay);
    });
  }

  // `claude stop` keeps the conversation, so `claude attach` can bring it back.
  stopSession(cx) {
    const { stopId, overlay } = props() ?? {};
    if (!stopId) return;
    this.stopError = null;
    cx.spawn(async (cx) => {
      let result = null;
      try { result = await exec("sh", ["-lc", 'claude stop "$1"', "x", stopId]); } catch {}
      if (!result || result.code !== 0) {
        this.stopError = (((result?.stderr || result?.stdout) ?? "").trim().replace(/\.$/, ""))
          || "Could not stop it — run claude stop in the terminal";
        cx.notify();
        return;
      }
      closeOverlay(overlay);
    });
  }

  // http(s) goes to the system's URL handler; a local page file to `open`.
  openUrl(url, cx) {
    if (/^https?:\/\//.test(url)) cx.open_url(url);
    else exec("open", [url]);
  }

  openLink(link, cx) {
    this.openUrl(link.url, cx);
    closeOverlay(props().overlay);
  }

  copyLinks(links, cx) {
    cx.write_to_clipboard(links.map((link) => link.url).join("\n"));
    closeOverlay(props().overlay);
  }

  // ---- drawing ----

  timeText(item, now) {
    if (item.group === "done") return item.sortDate != null ? agoText(now - item.sortDate) : "";
    if (item.group === "working") return item.eta ?? (item.since != null ? shortDuration(now - item.since) : "");
    if (item.bucket === "stall") return quietText(now - (item.raw.lastMeaningfulAt ?? item.since ?? now));
    return item.since != null ? shortDuration(now - item.since) : "";
  }

  leadText(item) {
    if (item.group === "working") {
      const waiting = item.raw.status === "shell";
      if (waiting) return item.nowLabel ? `▶ ${item.nowLabel}` : "Waiting for background work";
      return item.nowLine;
    }
    if (item.group === "attention") return item.answer;
    return item.replyTail;
  }

  face(item, size) {
    return image(faceSrc(charFor(item.charKey))).w(size).h(size).flex_none();
  }

  // The session's home app when it is not Herdr, in the heading's hand right before its time.
  placeTag(item) {
    const text = whereTag(item.where);
    if (!text) return null;
    return div().flex_none().text_size(12).font_family(HEADING_FONT).text_color(FAINT).child(text);
  }

  contentWidth() {
    const width = this.pageW || 340;
    return Math.max(120, width - PAGE_PAD_L - PAGE_PAD_R - 4);
  }

  // The rules live inside the scrolled page, so a line stays under the writing that scrolled there.
  // The first rule sits under the 28 px header row, the rest every 22 px.
  rules(height) {
    const count = Math.max(1, Math.ceil((height - HEAD_ROW) / ROW));
    const lines = [];
    for (let i = 0; i <= count; i++) {
      lines.push(div().absolute().left(0).right(0).top(HEAD_ROW + i * ROW).h(1).bg(RULE).opacity(0.6));
    }
    return div().absolute().left(0).top(0).right(0).h(height).overflow_hidden()
      .child(div().absolute().left(MARGIN_X).top(0).bottom(0).w(1).bg(MARGIN).opacity(0.35))
      .children(lines);
  }

  line(text, options = {}) {
    return div().h(ROW).flex_none().min_w(0).truncate()
      .text_size(options.size ?? 12)
      .line_height(`${ROW}px`)
      .font_family(options.font ?? BODY_FONT)
      .font_weight(options.weight ?? 400)
      .text_color(options.color ?? PENCIL)
      .child(text ?? "");
  }

  // One line with a hand-drawn arrow in the left margin pointing at it.
  arrowed(line) {
    return div().relative().h(ROW).flex_none().w_full()
      .child(line)
      .child(window.paint_path(strokePath(arrowSegments(22, 3), 1.3), MARGIN)
        .absolute().left(-MARGIN_X).top(6).w(24).h(12));
  }

  // A section heading: the hand font over a marker swipe, the count circled in ink, then the
  // caption that says what the section's state means.
  heading(text, count = null, height = ROW, key = null) {
    const tint = sectionTint(key ?? "");
    // The swipe covers the heading and 6 px more; the caption starts at least 8 px past its end.
    const width = handWidth(text, HEADING_SIZE) + 6;
    const title = div().relative().h(height).flex_none().min_w(width)
      .when(Boolean(tint), (el) => el.child(window.paint_path(fillPath(highlighterPoints(width, SWIPE_H, width)), tint)
        .absolute().left(-1).top(Math.round((height - SWIPE_H) / 2)).w(width).h(SWIPE_H)))
      .child(div().text_size(HEADING_SIZE).line_height(`${height}px`).font_family(HEADING_FONT)
        .text_color(INK).child(text));
    const caption = sectionCaption(key ?? "");
    return h_flex().h(height).flex_none().gap(8).items_center()
      .child(title)
      .when(count != null, (el) => el.child(this.circledCount(count)))
      .when(Boolean(caption), (el) => el.child(div().flex_1().min_w(0).truncate()
        .text_size(CAPTION_SIZE).line_height(`${height}px`)
        .font_family(HEADING_FONT).text_color(FAINT).child(caption)));
  }

  // A count with a hand-drawn ink circle round it.
  circledCount(count) {
    const size = 18;
    return div().relative().w(size).h(size).flex_none()
      .child(window.paint_path(strokePath([circlePoints((size - 2) / 2, 5)], 1.1), MARGIN)
        .absolute().left(1).top(1).w(size - 2).h(size - 2))
      .child(div().absolute().left(0).top(0).w(size).h(size).flex().items_center().justify_center()
        .text_size(12).font_family(BODY_FONT).text_color(MARGIN).child(String(count)));
  }

  textLink(label, on_click, color = PENCIL, id = null) {
    let el = div();
    if (id) el = el.id(id);
    return el.flex_none().underline().cursor_pointer()
      .text_size(12).line_height(`${ROW}px`).font_family(BODY_FONT).text_color(color)
      .hover((style) => style.text_color(INK))
      .on_click(on_click).child(label);
  }

  searchLine() {
    return h_flex().h(ROW).flex_none().gap(4).items_center()
      .child(div().text_size(12).line_height(`${ROW}px`).font_family(BODY_FONT).text_color(FAINT).child("Finding:"))
      .child(div().min_w(0).truncate().text_size(12).line_height(`${ROW}px`).font_family(BODY_FONT).text_color(INK).child(this.query));
  }

  noticeLine(notice, cx) {
    const label = notice.action === "undo" ? "Undo" : notice.action === "retry" ? "Retry" : null;
    return h_flex().h(ROW).flex_none().gap(6).items_center()
      .child(div().flex_1().min_w(0).truncate().text_size(12).line_height(`${ROW}px`).font_family(BODY_FONT)
        .text_color(PENCIL).child(`— ${notice.text}`))
      .when(Boolean(label), (el) => el.child(this.textLink(label, (_event, cx) => {
        if (notice.action === "undo") this.undoNotice(cx);
        else this.retryScan(cx);
      }, MARGIN, `notice-${notice.action}`)));
  }

  tagRow(item, cx) {
    const parts = [];
    const sep = () => div().flex_none().text_size(12).line_height(`${ROW}px`).font_family(BODY_FONT).text_color(FAINT).child("·");
    if (item.jiraKey && item.jiraUrl) parts.push(this.textLink(`#${item.jiraKey}`, (event, cx) => this.openUrl(item.jiraUrl, cx), PENCIL, "tag-jira"));
    else if (item.jiraKey) parts.push(div().flex_none().text_size(12).line_height(`${ROW}px`).font_family(BODY_FONT).text_color(PENCIL).child(`#${item.jiraKey}`));
    if (item.round) parts.push(div().flex_none().text_size(12).line_height(`${ROW}px`).font_family(BODY_FONT).text_color(PENCIL).child(`Round ${item.round}`));
    (item.prLinks ?? []).forEach((pr, i) => parts.push(this.textLink(`PR ${pr.tag}`, (event, cx) => this.openUrl(pr.url, cx), PENCIL, `tag-pr-${i}`)));
    if (!parts.length) return null;
    return h_flex().h(ROW).flex_none().gap(6).items_center()
      .children(parts.flatMap((part, index) => (index ? [sep(), part] : [part])));
  }

  stone(state) {
    if (state === "now" || state === "side") {
      return div().size(10).flex_none().rounded(5).bg(MARGIN).loop("opacity", { from: 0.3, to: 1, period: 1600 });
    }
    if (state === "done") return div().size(10).flex_none().rounded(5).bg(INK);
    if (state === "blocked") return div().size(10).flex_none().rounded(5).border(1.2).border_color(MARGIN);
    return div().size(10).flex_none().rounded(5).border(1).border_color(FAINT);
  }

  stepGlyph(state) {
    if (state === "done") return div().text_size(12).font_family(BODY_FONT).text_color(FAINT).child("✓");
    if (state === "blocked") return div().text_size(12).font_family(BODY_FONT).font_weight(700).text_color(MARGIN).child("!");
    if (state === "now" || state === "side") return div().text_size(12).font_family(BODY_FONT).text_color(MARGIN).loop("opacity", { from: 0.3, to: 1, period: 1300 }).child("•");
    return div().text_size(12).font_family(BODY_FONT).text_color(FAINT).child("○");
  }

  stepRow(step) {
    return h_flex().h(ROW).flex_none().gap(6).items_center().min_w(0)
      .child(h_flex().w(14).flex_none().items_center().justify_center().child(this.stepGlyph(step.state)))
      .child(div().flex_1().min_w(0).truncate().text_size(12).line_height(`${ROW}px`).font_family(BODY_FONT)
        .text_color(step.state === "done" ? FAINT : INK).child(step.label ?? ""))
      .when(Boolean(step.sub ?? step.ask), (el) => el.child(div().flex_none().max_w(90).truncate().text_size(12)
        .font_family(BODY_FONT).text_color(FAINT).child(step.state === "blocked" ? step.ask ?? step.sub : step.sub)));
  }

  stonesRows(item) {
    if (!item.hasChecklist || !item.progress) return [];
    const states = this.stepStatesOf(item);
    const rows = [h_flex().h(ROW).flex_none().gap(5).items_center().pl(2)
      .when(item.progressStale, (el) => el.opacity(0.45))
      .children(states.map((state) => this.stone(state)))
      .child(div().ml(6).flex_none().text_size(12).font_family(BODY_FONT).text_color(PENCIL)
        .child(`${item.progress.done}/${item.progress.total}`))];
    const current = this.currentStep(item);
    if (current?.label) rows.push(this.line(current.label, { size: 12, color: FAINT }));
    if (this.expanded.has(item.sessionId) && item.steps.length) {
      rows.push(...this.visibleSteps(item).map((step) => this.stepRow(step)));
    }
    return rows;
  }

  todayRows(data, cx) {
    const rows = [this.heading("Today's entry", null, HEAD_ROW, "today")];
    const item = this.recordItem(data);
    if (!item) {
      rows.push(this.line("Nothing written yet", { color: FAINT }));
      return rows;
    }
    const tag = this.placeTag(item);
    rows.push(h_flex().h(28).flex_none().gap(8).items_center()
      .child(this.face(item, 28))
      .child(div().flex_1().min_w(0).truncate().text_size(15).line_height("28px").font_family(TITLE_FONT)
        .text_color(INK).child(WHO[charFor(item.charKey)] ?? ""))
      .when(Boolean(tag), (el) => el.child(tag))
      .child(div().flex_none().text_size(12).font_family(BODY_FONT).text_color(PENCIL).child(this.timeText(item, data.now))));
    // The 28 px face row plus this spacer returns the following lines to the 22 px rule grid.
    rows.push(div().h(16).flex_none());
    const width = this.contentWidth();
    const topic = wrapLines(item.topic ?? item.title, 14, width, 2);
    topic.forEach((text, index) => {
      const line = this.line(text, { size: 14, weight: 700, color: INK });
      rows.push(index === 0 ? this.arrowed(line) : line);
    });
    const lead = cleanMessage(this.leadText(item));
    for (const text of wrapLines(lead, 12, width, 3)) rows.push(this.line(text));
    const tags = this.tagRow(item, cx);
    if (tags) rows.push(tags);
    rows.push(...this.stonesRows(item));
    const wood = (item.background?.shells ?? 0) + (item.background?.agents ?? 0) + (item.background?.monitors ?? 0);
    const meta = [footerOf(item), wood > 0 ? `${wood} logs` : null, item.badge && item.badge !== "herdr" ? item.badge : null]
      .filter(Boolean).join(" · ");
    if (meta) rows.push(this.line(meta, { size: 12, color: FAINT }));

    const actions = [];
    actions.push(this.textLink("Go", (event, cx) => this.goTo(item, cx), PENCIL, "today-go"));
    actions.push(this.textLink("Open page", (event, cx) => {
      const page = item.group !== "done" ? this.progressTarget(item) : this.pageGroup(item);
      if (page) this.openPage(page, cx);
      else this.flash(cx, "No page to open on this row");
    }, PENCIL, "today-page"));
    actions.push(this.textLink("Links…", (event, cx) => this.openLinks(item, cx), PENCIL, "today-links"));
    if (Boolean(item.terminal) && item.raw?.t === "s" && !item.hasChecklist) {
      actions.push(this.textLink("Request checklist", (event, cx) => {
        const prompt = item.raw?.status === "busy" ? CHECKLIST_QUEUED_PROMPT : CHECKLIST_PROMPT;
        cx.spawn(async (later) => {
          let result = null;
          try { result = await exec("sh", ["-lc", 'hc send "$1" "$2"', "x", item.terminal, prompt]); } catch {}
          if (!result || result.code !== 0) this.flash(later, "Could not reach the terminal — focus it in Herdr and try again");
        });
      }, PENCIL, "today-checklist"));
    }
    if (item.backgrounded) {
      const stopId = item.raw.jobId ?? item.where.attachId ?? null;
      if (stopId) actions.push(this.textLink("Stop", (event, cx) => {
        cx.spawn(async (later) => {
          let result = null;
          try { result = await exec("sh", ["-lc", 'claude stop "$1"', "x", stopId]); } catch {}
          if (!result || result.code !== 0) this.flash(later, "Could not stop it — run claude stop in the terminal");
        });
      }, MARGIN, "today-stop"));
    }
    rows.push(h_flex().h(ROW).flex_none().gap(14).items_center().children(actions));
    return rows;
  }

  itemRow(item, data, cx) {
    const selected = item.sessionId === this.sel;
    const stall = item.bucket === "stall";
    const width = this.contentWidth();
    const row = h_flex().id(`journal-${item.sessionId}`).relative().h(ROW).flex_none().gap(8).items_center().pl(2).pr(2).cursor_pointer()
      .when(item.group === "done" && item.viewed && !selected, (el) => el.opacity(0.5))
      .tooltip([item.topic ?? item.title, WHO[charFor(item.charKey)], footerOf(item)].filter(Boolean).join("\n"))
      .on_click((_event, cx) => {
        this.sel = item.sessionId;
        this.markViewed(item);
        this.goTo(item, cx);
        this.handle.focus();
        cx.notify();
      })
      .on_mouse_down("right", (_event, cx) => this.openLinks(item, cx));
    const mark = this.marginMark(item, stall);
    if (mark) row.child(mark);
    row
      .child(this.face(item, 16))
      .child(div().flex_1().min_w(0).truncate().text_size(12).line_height(`${ROW}px`).font_family(BODY_FONT)
        .text_color(selected ? INK : PENCIL).child(item.topic ?? item.title ?? ""));
    const tag = this.placeTag(item);
    if (tag) row.child(tag);
    if (stall) {
      row.child(div().flex_none().text_size(12).font_family(BODY_FONT).text_color(FAINT).child(this.timeText(item, data.now)));
      row.child(this.textLink("Snooze", (_event, cx) => { this.snooze(item, cx); cx.notify(); }, MARGIN,
        `snooze-${item.sessionId}`));
    } else {
      row.child(div().flex_none().text_size(12).font_family(BODY_FONT).text_color(FAINT).child(this.timeText(item, data.now)));
    }
    if (selected) {
      row.child(window.paint_path(strokePath([squigglePoints(width, 1.2, 6, item.sessionId.length)], 1.3), MARGIN)
        .absolute().left(0).bottom(0).w(width).h(4));
    }
    return row;
  }

  // The left margin's note for a row: a red star on a lantern waiting for a reply, "zz" on a stall.
  marginMark(item, stall) {
    if (stall) {
      return div().absolute().left(-MARGIN_X).top(2).w(16).h(ROW)
        .child(div().text_size(14).font_family(HEADING_FONT).text_color(FAINT).child("zz"));
    }
    if (item.group !== "attention") return null;
    return window.paint_path(strokePath([starPoints(7, item.sessionId.length)], 1.2), MARGIN)
      .absolute().left(-MARGIN_X + 2).top(4).w(14).h(14);
  }

  sectionRows(group, data, cx) {
    const rows = [this.heading(group.title, group.count, ROW, group.id)];
    if (group.id === "attention" && !(data.model?.attention ?? []).length) {
      rows.push(div().h(ROW).flex_none().pl(2)
        .child(div().text_size(CAPTION_SIZE).line_height(`${ROW}px`).font_family(HEADING_FONT)
          .text_color(FAINT).child("nothing waiting ✓")));
    }
    for (const item of group.items) rows.push(this.itemRow(item, data, cx));
    if (group.id === "done" && data.hiddenDone > 0) {
      rows.push(h_flex().h(ROW).flex_none().pl(26).items_center()
        .child(this.textLink(`${data.hiddenDone} more letters`, (_event, cx) => {
          this.showAllDone = true;
          this.handle.focus();
          cx.notify();
        }, MARGIN, "done-more")));
    }
    return rows;
  }

  pageRows(data, cx) {
    const rows = [];
    if (this.query) rows.push(this.searchLine());
    rows.push(...this.todayRows(data, cx));
    const notice = shared(SHARED_KEY)?.notice;
    if (notice?.text) rows.push(this.noticeLine(notice, cx));
    // One empty ruled line between the sections.
    for (const group of data.groups) {
      rows.push(div().h(ROW).flex_none());
      rows.push(...this.sectionRows(group, data, cx));
    }
    return rows;
  }

  render(cx) {
    if (this.role === "links") return this.linksNote();
    const data = this.viewData();
    this.adoptShared(data);
    this.followFocus(data);
    this.publishSoon(cx);
    this.drawnFocus = this.focusKey();
    const rows = this.pageRows(data, cx);
    // "Today's entry" sits in a 28 px row level with the terminal's pane header.
    const pageHeight = rows.length * ROW + (HEAD_ROW - ROW);
    return div().id("inkpaw-journal").relative().size_full().bg(PAPER).text_color(INK)
      .font_family(BODY_FONT).text_size(12)
      .track_focus(this.handle)
      .on_key_down((event, cx) => this.key(event, cx))
      .on_size_change((size, cx) => {
        if (size.height === this.pageH && size.width === this.pageW) return;
        this.pageH = size.height;
        this.pageW = size.width;
        cx.notify();
      })
      .child(v_flex().absolute().left(0).top(0).right(0).bottom(0).overflow_y_scroll()
        .child(div().relative().w_full().h(pageHeight)
          .child(this.rules(pageHeight))
          .child(v_flex().relative().w_full().pl(PAGE_PAD_L).pr(PAGE_PAD_R).children(rows))));
  }
}
