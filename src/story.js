// Palm City — the 12-chapter story, the depot side jobs, and the dialogue that carries them.
// Mission logic mirrors the original (same steps, same rewards); the targets are the named
// places of the new city.
import { STORY } from "./strings.js";
import { PLACES, RACE } from "./places.js";
import { BIZ } from "./economy.js";

const P = PLACES;
const at = (p, r = 4, extra = {}) => ({ x: p.x, z: p.z, r, ...extra });
export const MISSIONS = [
  { reward: 100, steps: [at(P.fountain, 3.5)] },
  { reward: 150, steps: [at(P.pizza), at(P.flat)] },
  { reward: 200, steps: [{ cond: g => !!g.driving() && !!g.driving().marco, carTarget: true }, at(P.depot, 7, { needCar: true })] },
  { reward: 300, npc: "rosa", npcAt: "rosaPick", steps: [at(P.rosaPick, 6, { needCar: true, hideNpc: true }), at(P.studio, 7, { needCar: true })] },
  { reward: 500, steps: [at(P.courier1, 7, { needCar: true }), at(P.courier2, 7, { needCar: true }), at(P.courier3, 7, { needCar: true })] },
  { reward: 250, steps: [at(P.dogs, 4, { cond: g => !!g.st.owned.dogs })] },
  { reward: 750, steps: [{ cond: g => g.st.money >= 2000 }, at(P.wash, 4, { cond: g => !!g.st.owned.wash })] },
  { reward: 2000, steps: [at(P.burger, 4, { cond: g => !!g.st.owned.burger }), at(P.club, 4, { cond: g => !!g.st.owned.club })] },
  { reward: 300, npc: "vince", npcAt: "plazaNorth", steps: [at(P.plazaNorth, 3.5)] },
  { reward: 1500, steps: ["dogs", "wash", "burger", "club"].map(k => at(P[k], 5)) },
  { reward: 1000, npc: "rosa", npcAt: "studio", steps: [at(P.studio, 7, { needCar: true, hideNpc: true }), at(P.gallery, 7, { needCar: true }), at(P.prints, 7, { needCar: true }), at(P.gallery, 7, { needCar: true })] },
  { reward: 5000, race: { from: 1, limit: 100 }, steps: RACE.map(c => ({ x: c.x, z: c.z, r: 10, needCar: true })) },
];
export const CHAPTERS = STORY.missions;

// depot side jobs unlock after chapter 5
const SIDE_DROPS = ["courier1", "courier2", "courier3", "studio", "gallery", "flat", "burger", "club"];

export function makeStory(g) {
  // g: { st, fx: { toast, banner, sound, save, earn, dialogue }, pos(), driving, showNpc(id, place|null) }
  let mState = "idle", mStep = 0, mTimer = 0, raceT = null;
  let side = { stage: "idle" };
  const sideUnlocked = () => g.st.mi >= 5;

  function begin() {
    if (g.st.mi < MISSIONS.length) { mState = "wait"; mTimer = 1.0; }
    else mState = "done";
  }
  function start(i) {
    mState = "intro"; mStep = 0; raceT = null;
    const mis = MISSIONS[i];
    if (mis.npc) g.showNpc(mis.npc, PLACES[mis.npcAt]);
    g.fx.chapter(i + 1, CHAPTERS[i].title);
    g.fx.dialogue(CHAPTERS[i].intro, () => { mState = "active"; });
  }
  function complete() {
    const i = g.st.mi;
    const paid = g.fx.earn(MISSIONS[i].reward);
    g.fx.banner("MISSION PASSED", CHAPTERS[i].title + "  ·  +$" + paid.toLocaleString());
    g.fx.sound("jingle", 1);
    raceT = null; mState = "outro";
    g.fx.dialogue(CHAPTERS[i].outro, () => {
      g.st.mi++;
      if (MISSIONS[i].npc === "vince") g.showNpc("vince", null);
      g.fx.save();
      if (g.st.mi === 5) g.fx.toast("📦 Depot side jobs unlocked — grab a package any time");
      if (g.st.mi < MISSIONS.length) { mState = "wait"; mTimer = 1.6; }
      else { mState = "done"; g.fx.banner("THE CITY IS YOURS", "Freeplay — keep building, keep earning"); }
    });
  }
  function update(dt) {
    if (g.fx.talking()) return;
    if (mState === "wait") { mTimer -= dt; if (mTimer <= 0) start(g.st.mi); }
    else if (mState === "active") {
      const mis = MISSIONS[g.st.mi], step = mis.steps[mStep];
      if (mis.race) {
        if (mStep >= mis.race.from) {
          if (raceT === null) raceT = mis.race.limit;
          raceT -= dt;
          if (raceT <= 0) { raceT = null; mStep = 0; g.fx.toast("⏱ Too slow! Back to the start line…"); g.fx.sound("door", 0.5); return; }
        } else raceT = null;
      }
      const [px, pz] = g.pos();
      let ok;
      if (step.cond && step.x === undefined) ok = step.cond(g);
      else {
        ok = (px - step.x) ** 2 + (pz - step.z) ** 2 < step.r * step.r && (!step.needCar || !!g.driving());
        if (ok && step.cond) ok = step.cond(g);
      }
      if (ok) {
        if (step.hideNpc) g.showNpc(mis.npc, null);
        mStep++;
        g.fx.sound("blip", 0.7);
        if (mis.race && mStep < mis.steps.length) g.fx.toast("✔ Checkpoint " + mStep + "/" + (mis.steps.length - 1));
        if (mStep >= mis.steps.length) complete();
      }
    }
    // side jobs
    if (sideUnlocked() && mState !== "intro" && mState !== "outro") {
      const [px, pz] = g.pos();
      if (side.stage === "idle") side.stage = "pickup";
      if (side.stage === "pickup" && (px - P.depot.x) ** 2 + (pz - P.depot.z) ** 2 < 36) {
        const k = SIDE_DROPS[(Math.random() * SIDE_DROPS.length) | 0];
        side = { stage: "carry", x: P[k].x, z: P[k].z };
        g.fx.toast("📦 Package loaded — deliver it"); g.fx.sound("blip", 0.6);
      } else if (side.stage === "carry" && (px - side.x) ** 2 + (pz - side.z) ** 2 < 49) {
        const paid = g.fx.earn(75 + 25 * Object.keys(g.st.owned).length);
        g.fx.toast("📦 Package delivered  +$" + paid); g.fx.sound("cash", 0.8);
        side = { stage: "pickup" }; g.fx.save();
      }
    }
  }
  // what the HUD / beacon / minimap should point at right now
  function objective() {
    const i = g.st.mi;
    if (i < MISSIONS.length && mState === "active") {
      const step = MISSIONS[i].steps[mStep];
      let x = step.x, z = step.z;
      if (step.carTarget && g.marcoCar()) { const c = g.marcoCar(); x = c.x; z = c.z; }
      const timer = raceT !== null ? "  ·  ⏱ " + Math.ceil(raceT) + "s" : "";
      return { title: "Chapter " + (i + 1) + " · " + CHAPTERS[i].title, text: CHAPTERS[i].steps[mStep] + timer, x, z, r: step.r || 4, main: true };
    }
    if (i < MISSIONS.length && (mState === "wait" || mState === "intro")) return { title: "Chapter " + (i + 1) + " · " + CHAPTERS[i].title, text: "…" };
    if (sideUnlocked() && side.stage === "pickup" && i >= MISSIONS.length) return { title: "Side job", text: "Pick up a package at the depot", x: P.depot.x, z: P.depot.z, r: 5, side: true };
    if (side.stage === "carry") return { title: "Side job", text: "Deliver the depot package", x: side.x, z: side.z, r: 6, side: true };
    return null;
  }
  return { begin, update, objective, state: () => ({ mState, mStep, raceT }), debugComplete: () => { if (mState === "active") { mStep = MISSIONS[g.st.mi].steps.length - 1; } } };
}
