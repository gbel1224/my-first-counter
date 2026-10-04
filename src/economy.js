// Palm City — money. Businesses you buy and upgrade (passive income + tips waiting at the counter),
// properties (a place to respawn and rest), XP and levels (every payout gives XP; each level lifts
// all earnings 3%). Numbers match the original game so the balance carries over.
import { PLACES } from "./places.js";
import { TURF_INCOME } from "./gangs.js";

export const BIZ = [
  { id: "dogs", cost: 500, rate: 30 },
  { id: "wash", cost: 2000, rate: 90 },
  { id: "burger", cost: 5000, rate: 220 },
  { id: "club", cost: 10000, rate: 500 },
  { id: "taxi", cost: 3500, rate: 150 },
  { id: "marina", cost: 15000, rate: 700 },
].map(b => ({ ...b, tips: 0, p: PLACES[b.id] }));

export const PROPS = [
  { id: "apartment", flag: "apt", label: "Apartment", cost: 2500 },
  { id: "condo", flag: "home", label: "Condo", cost: 6000 },
  { id: "house", flag: "house", label: "House", cost: 12000 },
  { id: "bungalow", flag: "beach", label: "Ocean View Loft", cost: 9000, plan: "apartment" },
  { id: "villa", flag: "villa", label: "Palm Villa", cost: 22000, plan: "house" },
  { id: "penthouse", flag: "pent", label: "Skyline Penthouse", cost: 40000, plan: "condo" },
].map(p => ({ ...p, p: PLACES[p.id] }));

export const LVL_MAX = 30;
export const xpNeed = l => Math.round(80 + (l - 1) * 70);
export const lvlMult = st => 1 + (Math.max(1, st.lvl) - 1) * 0.03;

export function newState() {
  return { money: 25, xp: 0, lvl: 1, owned: {}, apt: false, home: false, house: false, mi: 0, stats: {} };
}

// per-minute income from everything you own, with the story's modifiers
export function incomeRate(st) {
  let s = 0;
  for (const b of BIZ) {
    const lvl = st.owned[b.id] || 0;
    if (!lvl) continue;
    let r = b.rate * lvl;
    if (b.id === "club" && st.mi > 10) r *= 1.25;     // Rosa runs the club (ch 11)
    s += r;
  }
  if (st.turf) for (const k in st.turf) if (st.turf[k]) s += TURF_INCOME;   // the blocks you hold pay up
  if (st.mi === 9) s *= 0.5;                          // Sterling's trucks bleed you (ch 10)
  if (st.mi > 9) s *= 1.1;                            // your crews' loyalty (won in ch 10)
  return Math.round(s * lvlMult(st));
}

export function makeEconomy(st, fx) {
  // fx: { toast, banner, sound, save, onLevel }
  function addXP(n) {
    if (!n || st.lvl >= LVL_MAX) return;
    st.xp += n;
    while (st.lvl < LVL_MAX && st.xp >= xpNeed(st.lvl)) {
      st.xp -= xpNeed(st.lvl);
      st.lvl++;
      const bonus = st.lvl * 150;
      st.money += bonus;
      fx.banner("LEVEL " + st.lvl, "Everything you earn is now worth " + Math.round((lvlMult(st) - 1) * 100) + "% more · +$" + bonus.toLocaleString());
      fx.sound("jingle", 0.9);
      if (fx.onLevel) fx.onLevel(st.lvl);
    }
    if (st.lvl >= LVL_MAX) st.xp = 0;
  }
  // every payout in the game goes through here: level-boosted, and it pays XP
  function earn(base) {
    const g = Math.round(base * lvlMult(st));
    st.money += g;
    addXP(Math.max(1, Math.round(base / 8)));
    return g;
  }
  // what the player can do at the spot they're standing on (buy / upgrade / collect / buy a home)
  function actionAt(x, z) {
    for (const b of BIZ) {
      if ((b.p.x - x) ** 2 + (b.p.z - z) ** 2 > 16) continue;
      const lvl = st.owned[b.id] || 0;
      if (!lvl) return { kind: "biz", b, mode: "buy", cost: b.cost, lvl: 1 };
      if (lvl < 3) return { kind: "biz", b, mode: "up", cost: b.cost * lvl, lvl: lvl + 1 };
      return { kind: "bizmax", b };
    }
    for (const pr of PROPS) {
      if ((pr.p.x - x) ** 2 + (pr.p.z - z) ** 2 > 16) continue;
      return st[pr.flag] ? { kind: "rest", pr } : { kind: "prop", pr, cost: pr.cost };
    }
    return null;
  }
  function doAction(a, names) {
    if (!a) return false;
    if (a.kind === "biz") {
      if (st.money < a.cost) { fx.toast("You need $" + Math.ceil(a.cost - st.money).toLocaleString() + " more"); fx.sound("door", 0.3); return true; }
      st.money -= a.cost; st.owned[a.b.id] = a.lvl;
      fx.banner(a.mode === "buy" ? "PROPERTY ACQUIRED" : "UPGRADED", names[a.b.id] + (a.mode === "buy" ? " is yours" : " · level " + a.lvl) + " · +$" + (a.b.rate * a.lvl) + "/min");
      fx.sound("cash", 1); fx.save(); return true;
    }
    if (a.kind === "prop") {
      if (st.money < a.cost) { fx.toast("You need $" + Math.ceil(a.cost - st.money).toLocaleString() + " more"); fx.sound("door", 0.3); return true; }
      st.money -= a.cost; st[a.pr.flag] = true;
      fx.banner("NEW HOME", "You bought the " + a.pr.label + " — you'll wake up here now"); fx.sound("jingle", 0.9); fx.save(); return true;
    }
    if (a.kind === "rest") { fx.toast("🛏 You rest up — time passes"); fx.rest && fx.rest(); fx.save(); return true; }
    return false;
  }
  // income ticks every frame; tips pile up at each business until you stop by and collect
  function tick(dt, x, z, onFoot) {
    st.money += incomeRate(st) / 60 * dt;
    for (const b of BIZ) {
      const lvl = st.owned[b.id] || 0;
      if (!lvl) continue;
      b.tips = Math.min(b.tips + b.rate * lvl * 0.1 / 60 * dt, b.rate * lvl);
      if (onFoot && b.tips >= 5 && (b.p.x - x) ** 2 + (b.p.z - z) ** 2 < 25) {
        const amt = Math.floor(b.tips); b.tips = 0;
        st.money += amt;
        fx.toast("💵 +$" + amt + " tips collected"); fx.sound("cash", 0.7);
      }
    }
  }
  // where you wake up: the best place you own
  const home = () => { let h = null; for (const pr of PROPS) if (st[pr.flag]) h = pr; return h; };
  return { addXP, earn, actionAt, doAction, tick, home, incomeRate: () => incomeRate(st) };
}
