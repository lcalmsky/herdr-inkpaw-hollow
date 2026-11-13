// Copied into the Inkpaw Hollow forest and the notebook by tools/install.sh; edit this file, not the
// copies. The forest and the notebook must match a query the same way, so the rule lives here.

// Case and accents folded away, so "Café" and "cafe" compare equal.
export function fold(value) {
  const decomposed = String(value ?? "").normalize("NFD");
  return Array.from(decomposed).filter((ch) => {
    const code = ch.codePointAt(0);
    return code < 0x300 || code > 0x36f;
  }).join("").toLowerCase();
}

export function tokensOf(query) {
  return fold(query).split(/\s+/).filter(Boolean);
}

// One searchable shape for both mods: topic, title, space name, tab name, full cwd,
// ticket key and PR number or url. Values may be arrays; empty ones drop out.
export function fieldsOf({ topic, title, space, tab, cwd, ticket, pr } = {}) {
  return [topic, title, space, tab, cwd, ticket, pr].flat().filter(Boolean);
}

// Every whitespace-separated token must appear in at least one field; no token matches anything.
export function matchesQuery(query, fields) {
  const tokens = tokensOf(query);
  if (!tokens.length) return true;
  const haystack = (fields ?? []).filter(Boolean).map(fold);
  return tokens.every((token) => haystack.some((field) => field.includes(token)));
}
