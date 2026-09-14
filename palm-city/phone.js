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

// Notifications the HUD drains and shows as a banner. Only the posts that came from something you
// DID get queued — ambient city chatter would turn a living feed into a nag.
let notifyQ = [];
export function takeNotify() { return notifyQ.shift() || null; }
function add(src, text, likeLo, likeHi, notable) {
  posts.unshift({
    id: nextId++, handle: src.handle, name: src.name, text,
    likes: Math.round(pr(likeLo || 3, likeHi || 400)), age: 0, liked: false,
  });
  if (posts.length > MAX_POSTS) posts.length = MAX_POSTS;
  unreadCount++;
  if (notable) { notifyQ.push({ name: src.name, text }); if (notifyQ.length > 3) notifyQ.shift(); }
}
export function toggleLike(id) {
  const p = posts.find(x => x.id === id); if (!p) return false;
  p.liked = !p.liked; p.likes += p.liked ? 1 : -1;
  return p.liked;
}
// your own posts: they don't mark themselves unread, and nobody notifies you about you
export function pushUserPost(text) {
  posts.unshift({ id: nextId++, handle: "@you", name: "You", text, likes: 0, age: 0, liked: false, mine: true });
  if (posts.length > MAX_POSTS) posts.length = MAX_POSTS;
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

export function pushHeist(name) { add(HANDLES.news, pick(HEIST)(name), 400, 4200, true); }
export function pushRampage(score, x, z) {
  add(pick([HANDLES.rando, HANDLES.rando2, HANDLES.gossip]), pick(RAMPAGE)(areaName(x, z)), 60, 1500, true);
}
export function pushLevel(lvl) { add(HANDLES.gossip, "word is somebody in this city just levelled up. again. (lvl " + lvl + ")", 20, 300); }
export function pushCustom(text) { add(HANDLES.news, text, 20, 800); }

// Edge-detected from a state snapshot rather than wired into a dozen call sites — the feed watches
// the game the way a city would, instead of every system having to remember to tell it.
export function updateFeed(dt, snap) {
  for (const p of posts) p.age += dt;
  if (prev) {
    if (snap.wanted > 0 && prev.wanted === 0) add(HANDLES.scanner, pick(HEAT_UP)(areaName(snap.x, snap.z)), 40, 900, true);
    if (snap.searching && !prev.searching) add(HANDLES.scanner, pick(SEARCHING)(areaName(snap.x, snap.z)), 80, 2000, true);
    if (snap.wanted === 0 && prev.wanted > 0) add(HANDLES.gossip, pick(CLEARED)(areaName(snap.x, snap.z)), 120, 2600, true);
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
export function resetFeed() { posts = []; unreadCount = 0; prev = null; ambientCD = 14; notifyQ = []; }

// ============================ BANK ============================
// The point of banking isn't a menu — it's that the death and bust fines only ever take CASH ON
// HAND. Money in the bank cannot be fined away, so walking into a heist with your fortune deposited
// is a real decision rather than a chore. Interest is the reward for leaving it there.
export const SAVINGS_RATE = 0.006;      // per minute of play, compounding
export const TERM_RATE = 0.08;          // paid at maturity
export const TERM_SECS = 180;           // three minutes locked

// A statement line per movement, newest first, each carrying the balance it left behind — which is
// what makes interest visible instead of a number that quietly drifts upward.
export function ledgerAdd(st, kind, amt) {
  if (!st.ledger) st.ledger = [];
  st.ledger.unshift({ k: kind, a: Math.round(amt), b: Math.round(st.bank) });
  if (st.ledger.length > 24) st.ledger.length = 24;
}
// Interest accrues every frame; a statement line every frame would be useless. Bank it up and post
// a single line once it's worth reading.
let interestAccum = 0, interestCD = 30;
export function bankTick(dt, st) {
  if (st.bank > 0) {
    const gain = st.bank * SAVINGS_RATE * (dt / 60);
    st.bank += gain; interestAccum += gain;
  }
  interestCD -= dt;
  if (interestCD <= 0) {
    interestCD = 30;
    if (interestAccum >= 1) { ledgerAdd(st, "Interest", interestAccum); interestAccum = 0; }
  }
  if (st.term && st.term.amt > 0) {
    st.term.left -= dt;
    if (st.term.left <= 0) {
      const payout = Math.round(st.term.amt * (1 + TERM_RATE));
      st.bank += payout;
      const gain = payout - st.term.amt;
      st.term = null;
      ledgerAdd(st, "Term matured", payout);
      add(HANDLES.news, "Palm City Savings & Loan posts another quarter of 'unremarkable' growth.", 8, 120);
      return { matured: true, payout, gain };
    }
  }
  return null;
}
export function deposit(st, amt) {
  amt = Math.floor(Math.min(amt, st.money));
  if (amt <= 0) return 0;
  st.money -= amt; st.bank += amt; ledgerAdd(st, "Deposit", amt); return amt;
}
export function withdraw(st, amt) {
  amt = Math.floor(Math.min(amt, st.bank));
  if (amt <= 0) return 0;
  st.bank -= amt; st.money += amt; ledgerAdd(st, "Withdrawal", -amt); return amt;
}
export function openTerm(st, amt) {
  if (st.term) return 0;
  amt = Math.floor(Math.min(amt, st.bank));
  if (amt <= 0) return 0;
  st.bank -= amt; st.term = { amt, left: TERM_SECS }; ledgerAdd(st, "Term locked", -amt); return amt;
}
export function breakTerm(st) {                 // early exit forfeits the interest, keeps the principal
  if (!st.term) return 0;
  const amt = st.term.amt; st.bank += amt; st.term = null; ledgerAdd(st, "Term broken", amt); return amt;
}

// ============================ STOCKS ============================
// Palm City tickers, each tied to somewhere you can actually walk into. That link is the whole
// design: rob a business and its stock craters, so the score you just pulled is also a tip-off you
// could have traded on. Mayhem quietly lifts the private-security ticker.
export const TICKERS = [
  { id: "PALM", name: "Palm Taxi Co.", base: 42, vol: 0.010 },
  { id: "BUNS", name: "Big Bun Burgers", base: 18, vol: 0.015 },
  { id: "NEON", name: "Neon Palms Club", base: 76, vol: 0.019 },
  { id: "WASH", name: "Marina Car Wash", base: 9, vol: 0.013 },
  { id: "BAY", name: "Bayside Marina", base: 130, vol: 0.016 },
  { id: "VIGL", name: "Vigil Security Grp", base: 55, vol: 0.014 },
];
let tickCD = 0;
export function ensurePrices(st) {
  if (!st.sprice) st.sprice = {};
  for (const t of TICKERS) if (!(st.sprice[t.id] > 0)) st.sprice[t.id] = t.base;
  if (!st.shares) st.shares = {};
}
export function stocksTick(dt, st) {
  ensurePrices(st);
  tickCD -= dt;
  if (tickCD > 0) return;
  tickCD = 3;                                    // a print every few seconds, not every frame
  for (const t of TICKERS) {
    const p = st.sprice[t.id];
    const drift = (t.base - p) / t.base * 0.02;  // gentle pull back toward fair value
    const noise = (prng() - 0.5) * 2 * t.vol;
    st.sprice[t.id] = Math.max(t.base * 0.2, Math.min(t.base * 4, p * (1 + drift + noise)));
  }
}
export function applyShock(st, id, pct) {
  ensurePrices(st);
  const t = TICKERS.find(x => x.id === id); if (!t) return;
  st.sprice[id] = Math.max(t.base * 0.2, Math.min(t.base * 4, st.sprice[id] * (1 + pct)));
}
// heists name their target by its display name; map that back to a ticker
export function shockByName(st, name, pct) {
  const t = TICKERS.find(x => x.name === name); if (!t) return null;
  applyShock(st, t.id, pct);
  add(HANDLES.news, "$" + t.id + " slides after the incident at " + t.name + ". Investors 'reviewing exposure'.", 50, 900);
  return t.id;
}
export function chaosShock(st) { applyShock(st, "VIGL", 0.06); }   // mayhem is good for the security business
export function buyShares(st, id, n) {
  ensurePrices(st);
  const p = st.sprice[id]; n = Math.floor(n);
  const cost = Math.ceil(p * n);
  if (n <= 0 || cost > st.money) return 0;
  st.money -= cost; st.shares[id] = (st.shares[id] || 0) + n; return cost;
}
export function sellShares(st, id, n) {
  ensurePrices(st);
  const have = st.shares[id] || 0; n = Math.min(Math.floor(n), have);
  if (n <= 0) return 0;
  const gain = Math.floor(st.sprice[id] * n);
  st.shares[id] = have - n; st.money += gain; return gain;
}
export function portfolioValue(st) {
  ensurePrices(st);
  let v = 0; for (const t of TICKERS) v += (st.shares[t.id] || 0) * st.sprice[t.id];
  return v;
}

export const _debug = {
  feed: () => posts, unread: () => unreadCount, push: pushCustom,
  tickers: () => TICKERS, forceTick: () => { tickCD = 0; },
};
