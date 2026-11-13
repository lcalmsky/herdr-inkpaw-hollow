// Copied into the other inkpaw mods by tools/install.sh; edit this file, not the copies.
// Must stay in step with mods/inkpaw-forest/scene.js looks(): same hash, same order, so a terminal
// shows the same animal in the forest band, the rail, the cards and the accounts.
export const KINDS = ["bear", "rabbit", "fox", "raccoon", "cat", "duck", "hedgehog", "squirrel"];
export const WHO = {
  bear: "Bear", rabbit: "Rabbit", fox: "Fox", raccoon: "Raccoon",
  cat: "Cat", duck: "Duck", hedgehog: "Hedgehog", squirrel: "Squirrel",
};

export function charFor(key) {
  let h = 2166136261;
  const text = String(key || "");
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return KINDS[(h >>> 0) % KINDS.length];
}

export function faceSrc(kind, sick = false) {
  return `mods/inkpaw-journal/faces/${kind}${sick ? "_sick" : ""}.svg`;
}

// Card moods -> a pose from the forest band's art.
const POSE = { needs: "lantern-a", wait: "lantern-a", attention: "lantern-a", working: "work-a", done: "wave-a", stall: "sleep", idle: "sleep" };
export function poseSrc(kind, mood) {
  return `mods/inkpaw-forest/art/animals/${kind}/${POSE[mood] || "walk-a"}.svg`;
}

// The two poses a card band cross-fades between, with the paper silhouettes that keep the body
// from turning see-through midway. A sleeping animal has one pose and no b.
export function posePair(kind, mood) {
  const base = POSE[mood] || "walk-a";
  const dir = `mods/inkpaw-forest/art/animals/${kind}/`;
  if (base === "sleep") return { a: `${dir}sleep.svg`, b: null };
  const stem = base.slice(0, -2);
  return {
    a: `${dir}${stem}-a.svg`, b: `${dir}${stem}-b.svg`,
    silA: `${dir}sil-${stem}-a.svg`, silB: `${dir}sil-${stem}-b.svg`,
  };
}
