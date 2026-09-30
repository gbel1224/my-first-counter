// Palm City — the arcade-cabinet canvas mini-games (bug smash / lucky spin / quick reflex).
// Split out of game.js; the economy hooks (earn/save/state) and haptics are injected once via
// initArcade(). Uses Math.random() by design — pure cosmetics, never the seeded world stream.
import { AudioSys } from "./audio.js";

const dom = id => document.getElementById(id);
let earn = null, save = null, state = null, buzz = null;
export function initArcade(deps) { earn = deps.earn; save = deps.save; state = deps.state; buzz = deps.buzz; }

const ARCADE_NAMES = { smash: "🐛 BUG SMASH", spin: "🎰 LUCKY SPIN", reflex: "⚡ QUICK REFLEX" };
const SPIN_SYM = ["🍒", "🍋", "🔔", "⭐", "7️⃣", "💎"], SPIN_PAY = [120, 140, 180, 240, 600, 360];
export const ARC_BY_CAB = ["smash", "spin", "reflex", "smash"];
export let arcadeOpen = false, ag = null, as = {};
const elArcade = dom("arcade"), acv = dom("arcadecanvas"), actx = acv.getContext("2d");
const ARCW = 300, ARCH = 400;
export function openArcade(game) {
  ag = game; arcadeOpen = true;
  if (game === "smash") as = { time: 25, hits: 0, bugs: [], spawn: 0, done: false };
  else if (game === "reflex") as = { round: 0, total: 0, phase: "wait", wait: 0.9 + Math.random() * 1.6, t: 0, done: false };
  else as = { reels: [0, 0, 0], spinning: false, spinT: 0, msg: "Tap SPIN ($25)", done: false };
  dom("actitle").textContent = ARCADE_NAMES[game]; dom("acinfo").textContent = "";
  elArcade.style.display = "flex";
}
export function closeArcade() { arcadeOpen = false; ag = null; elArcade.style.display = "none"; }
function arcadeReward(amt, msg) { const got = earn(Math.max(0, amt)); dom("acinfo").textContent = msg + (amt > 0 ? "  +$" + got : ""); if (amt > 0) AudioSys.play("cash", 0.6); save(); }
function resolveSpin() {
  const [a, b, c] = as.reels; let win = 0;
  if (a === b && b === c) { win = SPIN_PAY[a]; as.msg = "JACKPOT " + SPIN_SYM[a] + "!"; }
  else if (a === b || b === c || a === c) { win = 45; as.msg = "Pair! Tap SPIN ($25)"; }
  else as.msg = "No win — Tap SPIN ($25)";
  if (win > 0) arcadeReward(win, as.msg);
}
function arcadeTap(x, y) {
  if (as.done) { closeArcade(); return; }
  if (ag === "smash") { for (let i = as.bugs.length - 1; i >= 0; i--) { const b = as.bugs[i]; if ((x - b.x) ** 2 + (y - b.y) ** 2 < b.r * b.r) { as.bugs.splice(i, 1); as.hits++; AudioSys.play("blip", 0.4); buzz(8); break; } } }
  else if (ag === "reflex") {
    if (as.phase === "wait") { as.t = 0; as.wait = 0.9 + Math.random() * 1.7; dom("acinfo").textContent = "Too early!"; AudioSys.play("blip", 0.3); }
    else { const rt = Math.round(as.t * 1000); as.total += rt; as.round++; if (as.round >= 5) { const avg = as.total / 5; as.done = true; arcadeReward(Math.round((650 - avg) * 0.7), "Avg " + Math.round(avg) + "ms"); } else { as.phase = "wait"; as.t = 0; as.wait = 0.9 + Math.random() * 1.7; } }
  } else if (ag === "spin") {
    if (!as.spinning && x > ARCW / 2 - 60 && x < ARCW / 2 + 60 && y > ARCH - 90 && y < ARCH - 40) { if (state.money < 25) { as.msg = "Need $25"; return; } state.money -= 25; as.spinning = true; as.spinT = 1.3; as.msg = "…"; AudioSys.play("blip", 0.5); }
  }
}
export function updateArcade(dt) {
  actx.fillStyle = "#0a0a12"; actx.fillRect(0, 0, ARCW, ARCH); actx.textAlign = "center";
  if (ag === "smash") {
    if (!as.done) { as.time -= dt; if (as.time <= 0) { as.done = true; arcadeReward(as.hits * 15, "Time! " + as.hits + " bugs"); } else { as.spawn -= dt; if (as.spawn <= 0) { as.spawn = 0.45 + Math.random() * 0.55; as.bugs.push({ x: 28 + Math.random() * (ARCW - 56), y: 50 + Math.random() * (ARCH - 120), ttl: 1.3, r: 24 }); } for (const b of as.bugs) b.ttl -= dt; as.bugs = as.bugs.filter(b => b.ttl > 0); } }
    actx.fillStyle = "#9fe0ff"; actx.font = "bold 18px sans-serif"; actx.textAlign = "left"; actx.fillText("⏱ " + Math.max(0, Math.ceil(as.time)), 12, 26); actx.textAlign = "right"; actx.fillText("🐛 " + as.hits, ARCW - 12, 26); actx.textAlign = "center";
    actx.font = "40px serif"; for (const b of as.bugs) actx.fillText("🐛", b.x, b.y + 14);
    if (as.done) { actx.fillStyle = "#ffd166"; actx.font = "bold 22px sans-serif"; actx.fillText("Tap to exit", ARCW / 2, ARCH / 2); }
  } else if (ag === "reflex") {
    if (!as.done) { as.t += dt; if (as.phase === "wait" && as.t >= as.wait) { as.phase = "go"; as.t = 0; } }
    const go = as.phase === "go" && !as.done;
    actx.fillStyle = go ? "#1f7a3a" : "#7a1f1f"; actx.fillRect(0, 0, ARCW, ARCH);
    actx.fillStyle = "#fff"; actx.font = "bold 30px sans-serif"; actx.fillText(as.done ? "DONE" : go ? "TAP!" : "WAIT…", ARCW / 2, ARCH / 2);
    actx.font = "bold 15px sans-serif"; actx.fillText("Round " + Math.min(5, as.round + 1) + "/5", ARCW / 2, 40);
    if (as.done) actx.fillText("Tap to exit", ARCW / 2, ARCH - 30);
  } else {
    if (as.spinning) { as.spinT -= dt; if (as.spinT <= 0) { as.spinning = false; resolveSpin(); } else for (let i = 0; i < 3; i++) as.reels[i] = Math.floor(Math.random() * SPIN_SYM.length); }
    actx.fillStyle = "#221a30"; actx.fillRect(28, ARCH / 2 - 60, ARCW - 56, 120);
    actx.font = "58px serif"; for (let i = 0; i < 3; i++) actx.fillText(SPIN_SYM[as.reels[i]], ARCW / 2 - 78 + i * 78, ARCH / 2 + 20);
    actx.fillStyle = "#ffd166"; actx.fillRect(ARCW / 2 - 60, ARCH - 90, 120, 50); actx.fillStyle = "#3d2410"; actx.font = "bold 20px sans-serif"; actx.fillText(as.spinning ? "…" : "SPIN $25", ARCW / 2, ARCH - 58);
    actx.fillStyle = "#9fe0ff"; actx.font = "14px sans-serif"; actx.fillText(as.msg, ARCW / 2, 52); actx.fillText("$" + Math.floor(state.money), ARCW / 2, ARCH - 16);
  }
}
acv.addEventListener("pointerdown", e => { e.preventDefault(); const r = acv.getBoundingClientRect(); arcadeTap((e.clientX - r.left) / r.width * ARCW, (e.clientY - r.top) / r.height * ARCH); });
dom("acx").addEventListener("click", closeArcade);
