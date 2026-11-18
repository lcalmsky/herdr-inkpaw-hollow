// A chainable stand-in for gpui elements: every builder method returns the element itself.
// Elements remember their id and the handlers a test may call.
const element = () => {
  const handlers = {};
  const el = new Proxy(function () {}, {
    get: (target, key) => {
      if (key === "then") return undefined;
      if (key === "handlers") return handlers;
      if (key === "id") {
        return (id) => {
          target.id = id;
          if (globalThis.uiIds) globalThis.uiIds.set(id, el);
          return el;
        };
      }
      if (key === "when") return (cond, cb) => { if (cond) cb(el); return el; };
      if (typeof key === "string" && key.startsWith("on_")) {
        return (...args) => {
          const fn = args.find((arg) => typeof arg === "function");
          if (fn) handlers[key] = fn;
          return el;
        };
      }
      return (..._args) => el;
    },
  });
  return el;
};
export class View {}
export const div = element, image = element, svg = element, v_flex = element, h_flex = element;
export const ScrollHandle = {
  new: () => {
    const h = {
      calls: [],
      scroll_to_item(i) { h.calls.push(i); },
      scroll_to_bottom() {},
      release() { return true; },
    };
    globalThis.uiScrollHandles?.push(h);
    return h;
  },
};
export const VirtualListScrollHandle = ScrollHandle;
export const InputState = {
  new: (options = {}) => {
    let value = options.value ?? "";
    return {
      on: () => true,
      focus() {},
      value: () => value,
      set_value: (next) => { value = next; },
    };
  },
};
export const Input = { new: element };
export const PathBuilder = { stroke: element, fill: element };
export const Background = { linear_gradient: element, solid: element };
export const Scrollbar = { horizontal: element, vertical: element, new: element };
export const EditorState = {
  new: (options = {}) => {
    let value = options.value ?? "";
    return {
      value: () => value,
      set_value: (next) => { value = next; },
      on: () => true,
      release: () => true,
    };
  },
};
export const Editor = { new: element };
export const TextView = { html: () => element(), markdown: () => element() };
if (!globalThis.window) globalThis.window = {};
globalThis.window.paint_path ??= element;
