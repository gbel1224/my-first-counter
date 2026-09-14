// Palm City — the phone's brain: PALMGRAM, a city feed that reacts to what you actually do.
//
// The world already knew about your crimes — the police did, the gangs did — but nothing ever said
// so back to you. This is the city noticing. Posts are generated from real game state: the heat
// rising, the force losing your trail, a heist going off, a rampage banking. Between those it fills
// with ordinary Palm City chatter so the feed feels like a place rather than a notification log.
//
// Pure logic and data — no DOM. game.js renders it, which keeps the writing and the transition
// detection testable on their own. Own PRNG, never the seeded world stream.
import { mulberry32, HALF } from "./util.js";

const prng = mulberry32(0x9A11C0FE);
const pr = (a, b) => a + prng() * (b - a);
const pick = a => a[(prng() * a.length) | 0];

const MAX_POSTS = 40;
let posts = [];
let nextId = 1;
let unreadCount = 0;
let ambientCD = 14;
let prev = null;          // last snapshot, for edge detection

// rough place names so a post can say WHERE, which is most of what makes it feel local
export function areaName(x, z) {
  if (z > HALF * 0.62) return "the beachfront";
  if (Math.abs(x) < HALF * 0.28 && Math.abs(z) < HALF * 0.28) return "downtown";
  if (x < -HALF * 0.45) return "the west side";
  if (x > HALF * 0.45) return "the east end";
  if (z < -HALF * 0.45) return "the north blocks";
  return "midtown";
}

const HANDLES = {
  scanner: { handle: "@palm_scanner", name: "Palm City Scanner", tone: "police" },
  news:    { handle: "@pcnews_live", name: "PC News Live", tone: "news" },
  gossip:  { handle: "@sunsetgossip", name: "Sunset Gossip", tone: "gossip" },
  beach:   { handle: "@beachcam_pc", name: "Beach Cam", tone: "ambient" },
  traffic: { handle: "@pc_traffic", name: "Palm Traffic", tone: "ambient" },
  rando:   { handle: "@kaylaaa_vibes", name: "kayla 🌴", tone: "civilian" },
  rando2:  { handle: "@dmitri_lifts", name: "Dmitri", tone: "civilian" },
  rando3:  { handle: "@surfrat99", name: "surf rat", tone: "civilian" },
};

function add(src, text, likeLo, likeHi) {
  posts.unshift({
    id: nextId++, handle: src.handle, name: src.name, text,
    likes: Math.round(pr(likeLo || 3, likeHi || 400)), age: 0,
  });
  if (posts.length > MAX_POSTS) posts.length = MAX_POSTS;
  unreadCount++;
}

// ---- the reactive posts: these fire off real game state ----
const HEAT_UP = [
  a => "scanner going crazy over " + a + " right now. every unit in the city 😭",
  a => "do NOT drive through " + a + ", it's all lights and sirens",
  a => "whatever just happened in " + a + ", the cops are NOT happy",
];
const SEARCHING = [
  a => "cops crawling all over " + a + " looking for someone. they lost them 💀",
  a => "six cruisers parked up in " + a + " just... looking around. incredible",
  a => "PCPD sweeping " + a + ". suspect gone. absolutely gone.",
];
const CLEARED = [
  a => "whoever that was in " + a + "? never found them. legend",
  a => "search called off in " + a + ". they got away clean.",
  a => "and just like that the sirens stopped. wild day in " + a + ".",
];
const HEIST = [
  n => "🚨 BREAKING: " + n + " hit this afternoon. police have no suspect in custody.",
  n => "they robbed " + n + "?? in broad daylight??",
  n => "my cousin works at " + n + ". she says they were in and out before anyone moved.",
];
const RAMPAGE = [
  a => "there are cars ON FIRE in " + a + ". multiple. plural. why",
  a => "insurance premiums in " + a + " about to go through the roof",
  a => "someone is having a genuinely terrible day in " + a + " and I can hear all of it",
];
const AMBIENT = [
  [HANDLES.beach, () => "water's glassy this morning 🌊 get out here"],
  [HANDLES.beach, () => "shark warning still up past the buoys. swim smart."],
  [HANDLES.traffic, () => "lights out at two intersections " + pick(["downtown", "midtown", "the east end"]) + ". expect delays."],
  [HANDLES.traffic, () => "construction on the coast road again. of course."],
  [HANDLES.gossip, () => "spotted: someone buying a whole nightclub in cash. no notes."],
  [HANDLES.gossip, () => "the marina crowd is being very quiet this week and I think we all know why"],
  [HANDLES.rando, () => "palm city sunsets really do be like that 🌇"],
  [HANDLES.rando, () => "third jet ski of the summer. don't tell my landlord"],
  [HANDLES.rando2, () => "someone parked a helicopter on my street. a HELICOPTER."],
  [HANDLES.rando2, () => "you either own six businesses here or you own none. no middle"],
  [HANDLES.rando3, () => "found a golden palm on the boardwalk, not telling anyone where 🌴"],
  [HANDLES.rando3, () => "bowling alley arcade still eating my quarters. worth it"],
  [HANDLES.news, () => "City council 'reviewing' police response times. again."],
  [HANDLES.news, () => "Tourism board says Palm City is 'safer than ever'. Unclear what they are measuring."],
];

export function pushHeist(name) { add(HANDLES.news, pick(HEIST)(name), 400, 4200); }
export function pushRampage(score, x, z) {
  add(pick([HANDLES.rando, HANDLES.rando2, HANDLES.gossip]), pick(RAMPAGE)(areaName(x, z)), 60, 1500);
}
export function pushLevel(lvl) { add(HANDLES.gossip, "word is somebody in this city just levelled up. again. (lvl " + lvl + ")", 20, 300); }
export function pushCustom(text) { add(HANDLES.news, text, 20, 800); }

// Edge-detected from a state snapshot rather than wired into a dozen call sites — the feed watches
// the game the way a city would, instead of every system having to remember to tell it.
export function updateFeed(dt, snap) {
  for (const p of posts) p.age += dt;
  if (prev) {
    if (snap.wanted > 0 && prev.wanted === 0) add(HANDLES.scanner, pick(HEAT_UP)(areaName(snap.x, snap.z)), 40, 900);
    if (snap.searching && !prev.searching) add(HANDLES.scanner, pick(SEARCHING)(areaName(snap.x, snap.z)), 80, 2000);
    if (snap.wanted === 0 && prev.wanted > 0) add(HANDLES.gossip, pick(CLEARED)(areaName(snap.x, snap.z)), 120, 2600);
  }
  prev = { wanted: snap.wanted, searching: snap.searching, x: snap.x, z: snap.z };
  ambientCD -= dt;
  if (ambientCD <= 0) {
    ambientCD = pr(40, 95);
    const [src, fn] = pick(AMBIENT);
    add(src, fn(), 3, 260);
  }
}

export function feed() { return posts; }
export function unread() { return unreadCount; }
export function markRead() { unreadCount = 0; }
// "2m ago" style stamps — a feed without them reads like a log file
export function ageLabel(sec) {
  if (sec < 60) return "now";
  if (sec < 3600) return Math.floor(sec / 60) + "m";
  return Math.floor(sec / 3600) + "h";
}
// in-world clock for the status bar: the day cycle is one full turn every 240s
export function clockLabel(simTime, cycleOn) {
  const t = cycleOn ? (simTime / 240) % 1 : 0.5;
  const mins = Math.floor(t * 24 * 60), h24 = Math.floor(mins / 60), m = mins % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return h + ":" + String(m).padStart(2, "0") + (h24 < 12 ? " AM" : " PM");
}
export function resetFeed() { posts = []; unreadCount = 0; prev = null; ambientCD = 14; }
export const _debug = { feed: () => posts, unread: () => unreadCount, push: pushCustom };
