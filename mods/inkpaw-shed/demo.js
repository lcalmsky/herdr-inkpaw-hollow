// The gallery screenshot fixture. props().demo === true makes the forest, the notebook and the
// woodshed draw this instead of Herdr, scan.sh and cca; normal layouts never import it at runtime
// beyond the module load. It is copied into those three mods beside animals.js.

const NOW = Date.now();
const MIN = 60_000;
const ago = (minutes) => NOW - minutes * MIN;
const soon = (minutes) => Math.floor((NOW + minutes * MIN) / 1000);

const SPACES = [
  { id: "s-garden", name: "garden-api", branch: "main" },
  { id: "s-trail", name: "PAW-12 trail map", branch: "trail-planner" },
  { id: "s-lantern", name: "lantern-docs", branch: "main" },
  { id: "s-acorn", name: "acorn-cli", branch: "cache-eviction" },
  { id: "s-moss", name: "moss-ui", branch: "shadows" },
  { id: "s-tea", name: "PAW-31 tea timer", branch: "presets" },
  { id: "s-fern", name: "fern-site", branch: "main" },
  { id: "s-swap", name: "PAW-44 seed swap", branch: "swap-board" },
  { id: "s-hive", name: "hive-metrics", branch: "main" },
  { id: "s-pond", name: "pond-sync", branch: "ripple" },
  { id: "s-burrow", name: "PAW-52 burrow maps", branch: "burrows" },
  { id: "s-kiln", name: "kiln-queue", branch: "main" },
  { id: "s-wren", name: "wren-notes", branch: "main" },
  { id: "s-mill", name: "PAW-58 mill wheel", branch: "speed" },
];

const TITLES = {
  "s-garden": ["Refactor the seed catalog", "Add watering reminders"],
  "s-trail": ["Write tests for the trail planner", "Draw the ridge-line signposts"],
  "s-lantern": ["Rewrite the lantern care guide", "Sort the field notes"],
  "s-acorn": ["Fix the acorn cache eviction", "Add a --dry-run flag"],
  "s-moss": ["Tune the mossy button shadows", "Polish the settings drawer"],
  "s-tea": ["Ship the tea timer presets"],
  "s-fern": ["Port the fern site to static pages", "Add a dew-point widget"],
  "s-swap": ["Wire the seed swap board", "Sort the seed packet archive"],
  "s-hive": ["Graph the honey flow by week"],
  "s-pond": ["Debounce the pond sensor sync"],
  "s-burrow": ["Merge the burrow map layers"],
  "s-kiln": ["Retry stuck kiln jobs"],
  "s-wren": ["Tag the birdsong recordings"],
  "s-mill": ["Smooth the mill wheel speed graph"],
};

const STATUS = [
  ["s-garden", "working"], ["s-garden", "working"],
  ["s-trail", "blocked"], ["s-trail", "working"],
  ["s-lantern", "done"], ["s-lantern", "idle"],
  ["s-acorn", "blocked"], ["s-acorn", "working"],
  ["s-moss", "working"], ["s-moss", "done"],
  ["s-tea", "done"],
  ["s-fern", "working"], ["s-fern", "idle"],
  ["s-swap", "blocked"], ["s-swap", "done"],
  ["s-hive", "working"],
  ["s-pond", "idle"],
  ["s-burrow", "blocked"],
  ["s-kiln", "working"],
  ["s-wren", "done"],
  ["s-mill", "working"],
];

const LEADS = {
  "Refactor the seed catalog": "Split the catalog reader into one loader per bed.",
  "Add watering reminders": "The reminder sweep now runs after the morning bell.",
  "Write tests for the trail planner": "Two crossing routes still pick the wrong bridge — which one should win?",
  "Draw the ridge-line signposts": "Sketching the new signposts along the upper ridge.",
  "Rewrite the lantern care guide": "The care guide is rewritten and ready for a read.",
  "Sort the field notes": "Field notes are sorted by the week they were written.",
  "Fix the acorn cache eviction": "Eviction drops the warm cache entry before the cold one — safe to delete?",
  "Add a --dry-run flag": "The dry-run flag prints the plan without touching a single acorn.",
  "Tune the mossy button shadows": "Comparing three shadow ramps for the mossy buttons.",
  "Polish the settings drawer": "The settings drawer slides without a stutter now.",
  "Ship the tea timer presets": "Three presets are in: green, herbal and a very slow oolong.",
  "Port the fern site to static pages": "The fern pages render from the same markdown the trail uses.",
  "Add a dew-point widget": "The widget reads the morning damp off the garden sensor.",
  "Wire the seed swap board": "The swap board lists two dates — which calendar should win?",
  "Sort the seed packet archive": "The archive is sorted by sowing month and the labels are reprinted.",
  "Graph the honey flow by week": "The honey-flow chart now groups readings by week.",
  "Debounce the pond sensor sync": "Sensor bursts fold into one sync every ten seconds.",
  "Merge the burrow map layers": "Two layers disagree on the old oak tunnel — keep which one?",
  "Retry stuck kiln jobs": "Stuck kiln jobs retry twice, then wait for a person.",
  "Tag the birdsong recordings": "Every recording now carries its wren, robin or finch tag.",
  "Smooth the mill wheel speed graph": "Smoothing the speed graph without hiding the stalls.",
};

const CWD = {
  "s-garden": "/work/garden-api",
  "s-trail": "/work/trail-map",
  "s-lantern": "/work/lantern-docs",
  "s-acorn": "/work/acorn-cli",
  "s-moss": "/work/moss-ui",
  "s-tea": "/work/tea-timer",
  "s-fern": "/work/fern-site",
  "s-swap": "/work/seed-swap",
  "s-hive": "/work/hive-metrics",
  "s-pond": "/work/pond-sync",
  "s-burrow": "/work/burrow-maps",
  "s-kiln": "/work/kiln-queue",
  "s-wren": "/work/wren-notes",
  "s-mill": "/work/mill-wheel",
};

const STEPS = [
  ["Read the current shadow tokens", "done"],
  ["Trace the hover and pressed states", "done"],
  ["Pick a ramp that stays readable", "done"],
  ["Compare shadow ramps in the preview", "now"],
  ["Apply the ramp to the mossy buttons", "left"],
  ["Check the settings drawer", "left"],
  ["Take a fresh screenshot", "left"],
];

const usedTitles = new Map();
function sessionFor(index, spaceId, status) {
  const at = usedTitles.get(spaceId) ?? 0;
  usedTitles.set(spaceId, at + 1);
  const title = TITLES[spaceId][at % TITLES[spaceId].length];
  return { index, spaceId, status, title, lead: LEADS[title] };
}

const rows = STATUS.map(([spaceId, status], i) => sessionFor(i, spaceId, status));

const sessions = rows.map((row, i) => {
  const terminal = `t-${i + 1}`;
  const pid = 4100 + i;
  const waiting = row.status === "blocked";
  const done = row.status === "done" || row.status === "idle";
  const since = done ? ago(20 + i * 9) : waiting ? ago(14 + i) : ago(6 + i);
  const checklist = row.title === "Tune the mossy button shadows";
  return {
    t: "s",
    pid,
    sessionId: `demo-session-${i + 1}`,
    cwd: CWD[row.spaceId],
    name: row.title,
    kind: null,
    jobId: null,
    parkedJobId: null,
    status: waiting ? "waiting" : done ? "idle" : "busy",
    waitingFor: null,
    startedAt: ago(80 + i * 3),
    updatedAt: since,
    statusUpdatedAt: since,
    location: null,
    identity: { firstPrompt: row.title },
    customTitle: null,
    agentName: null,
    lastPrompt: row.title,
    lastAnswer: row.lead,
    lastSentence: row.lead,
    currentAction: done || waiting ? null : row.lead,
    lastToolName: null,
    lastToolAt: null,
    lastMeaningfulAt: done ? since : NOW - 30_000,
    pr: row.title === "Refactor the seed catalog"
      ? { url: "https://github.com/inkpaw-hollow/garden-api/pull/128", label: null, number: 128 }
      : null,
    background: row.title === "Refactor the seed catalog"
      ? { shells: 2, agents: 0, monitors: 0, total: 2 }
      : row.title === "Add a --dry-run flag"
        ? { shells: 1, agents: 0, monitors: 0, total: 1 }
        : { shells: 0, agents: 0, monitors: 0, total: 0 },
    completed: [],
    deadhd: checklist
      ? {
        title: row.title,
        counts: { done: 3, now: 1, blocked: 0, left: 3 },
        total: 7,
        states: STEPS.map(([, state]) => state),
        items: STEPS.map(([label, state]) => ({ label, state, sub: null, ask: null, doneAt: null })),
        nowLabel: "Comparing shadow ramps",
        key: "PAW-40",
        keyHref: null,
        pr: null,
        eta: NOW + 25 * MIN,
        dataAt: NOW - 40_000,
        pagePath: null,
        dataPath: null,
        blockedAsk: null,
        off: false,
      }
      : null,
    pages: [],
    where: { kind: "herdr-app", paneId: null, socket: null, handle: null, terminalId: terminal },
    agent: "claude",
    demoViewed: row.title === "Polish the settings drawer",
  };
});

export const DEMO = {
  // The animal the gallery shot shows greeting: the burrow-map session, which the notebook also picks.
  selected: "t-18",
  spaces: SPACES.map((space, i) => ({
    id: space.id,
    index: i + 1,
    name: space.name,
    named: true,
    folder: CWD[space.id],
    machine: null,
    branch: space.branch,
    active: space.id === "s-moss",
    status: rows.find((row) => row.spaceId === space.id)?.status ?? null,
    tabs: [{
      id: `tab-${i + 1}`,
      index: 1,
      name: "1",
      named: false,
      active: true,
      status: rows.find((row) => row.spaceId === space.id)?.status ?? null,
      panes: 1,
      zoomed: false,
      settled: false,
      settled_at: null,
      changed_at: NOW - 60_000,
      working_since: ago(6),
    }],
  })),
  agents: rows.map((row, i) => ({
    address: `t-${i + 1}`,
    pane: `p-${i + 1}`,
    space: row.spaceId,
    space_name: SPACES.find((space) => space.id === row.spaceId).name,
    tab: `tab-${SPACES.findIndex((space) => space.id === row.spaceId) + 1}`,
    tab_index: 1,
    tab_name: "1",
    status: row.status,
    app: "claude-code",
    program: { key: "claude", name: "claude", icon: null, tint: false, tile: null, color: null, shell: false, agent: true },
    title: row.title,
    seq: 100 - i,
    pinned: false,
    focused: i === 9,
  })),
  terminals: rows.map((row, i) => ({
    address: `t-${i + 1}`,
    state: "live",
    turn: i + 1,
    cwd: CWD[row.spaceId],
    foreground: { pid: 4100 + i, cwd: CWD[row.spaceId], name: "claude" },
    program: { key: "claude", name: "claude", shell: false, agent: true },
    title: row.title,
  })),
  panes: [],
  sessions,
  meta: { roots: 1, updatedAt: NOW, error: null, pages: [], unreadablePages: [] },
  shed: {
    current: "personal",
    globalDefault: "personal",
    accounts: [
      {
        name: "personal",
        email: "",
        label: null,
        plan: null,
        usage: { five: { used: 44, reset: soon(90) }, seven: { used: 60, reset: soon(60 * 30) }, fable: null },
      },
      {
        name: "studio",
        email: "",
        label: null,
        plan: null,
        usage: { five: { used: 12, reset: soon(150) }, seven: { used: 81, reset: soon(60 * 40) }, fable: null },
      },
      {
        name: "night-owl",
        email: "",
        label: null,
        plan: null,
        usage: { five: { used: 92, reset: soon(70) }, seven: { used: 35, reset: soon(60 * 90) }, fable: null },
      },
    ],
    codex: { active: "default", accounts: [] },
  },
};
