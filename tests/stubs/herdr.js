// The live data the tests set: globalThis.herdrState = { agents, terminals, panes, spaces, ... }.
const state = () => globalThis.herdrState ?? {};
export const agents = () => {
  globalThis.herdrAgentCalls = (globalThis.herdrAgentCalls ?? 0) + 1;
  return state().agents ?? [];
};
export const terminals = () => state().terminals ?? [];
export const panes = () => state().panes ?? [];
export const spaces = () => state().spaces ?? [];
export const props = () => state().props ?? {};
export const shared = (name) => state().shared?.[name] ?? null;
export const setShared = (name, value) => {
  const s = state();
  s.shared = { ...(s.shared ?? {}), [name]: value };
  globalThis.herdrShared?.push([name, value]);
  return null;
};
export const run = (...args) => { globalThis.herdrRuns?.push(args); };
export const exec = async (...args) => {
  globalThis.herdrExec?.push(args);
  if (globalThis.herdrExecReject) throw globalThis.herdrExecReject;
  return globalThis.herdrExecResult ?? { code: 0, stdout: "", stderr: "" };
};
export const checking = () => globalThis.herdrChecking === true;
export const appHome = () => state().appHome ?? "/tmp";
export const settings = () => state().settings ?? { zoom: 1 };
export const readTextFile = async (path) => globalThis.herdrFiles?.[path] ?? null;
export const writeTextFile = async (path, text) => {
  if (globalThis.herdrWriteError) throw new Error(globalThis.herdrWriteError);
  if (globalThis.herdrFiles) globalThis.herdrFiles[path] = text;
  return null;
};
export const nextCommand = () => new Promise(() => {});
export const openOverlay = (spec) => { globalThis.herdrOverlays?.push(spec); return "o1"; };
export const closeOverlay = (id) => { globalThis.herdrClosed?.push(id); return null; };
export const focused = () => state().focused ?? null;
export const knownAgents = async () => state().knownAgents ?? [];
export const theme = () => state().theme ?? {};
export const layout = () => state().layout ?? null;
export const window = () => state().window ?? null;
export const home = () => state().home ?? "/Users/test";
export const hc = async (...args) => {
  globalThis.herdrHc?.push(args);
  return globalThis.herdrHcResult ?? { code: 0, stdout: "", stderr: "" };
};
export const pickFolder = async () => { globalThis.herdrPickFolder?.(); return globalThis.herdrPickedFolder ?? null; };
export const playSound = (name) => { globalThis.herdrSounds?.push(name); return null; };
export const setAgentOrder = (order) => { globalThis.herdrAgentOrder = order; return null; };
