// Headless smoke run: drives the full 8-chapter story route against real Three.js.
// Usage: node tools/smoke.mjs   (run from sunset-city/)
import { mkdtempSync, readFileSync, writeFileSync, cpSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---- DOM/browser stubs ----
const listeners = {};
const on = (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); };
const fire = (t, ev) => { for (const fn of listeners[t] || []) fn(ev); };

function fakeCtx() {
  const noop = () => {};
  return new Proxy({ measureText: () => ({ width: 10 }) }, {
    get: (o, k) => (k in o ? o[k] : (typeof k === "string" ? noop : undefined)),
    set: () => true,
  });
}
function fakeEl() {
  return {
    style: {}, textContent: "", innerHTML: "", className: "",
    width: 300, height: 150,
    getContext: () => fakeCtx(),
    addEventListener: () => {}, append: () => {}, appendChild: () => {},
    insertBefore: () => {}, closest: () => null, cloneNode() { return this; },
  };
}
const els = {};
globalThis.document = {
  getElementById: id => (els[id] = els[id] || fakeEl()),
  createElement: () => fakeEl(),
  body: { insertBefore: () => {}, innerHTML: "" },
  documentElement: {},
  addEventListener: on,
  hidden: false,
};
globalThis.addEventListener = on;
globalThis.innerWidth = 390; globalThis.innerHeight = 844;
globalThis.devicePixelRatio = 2;
globalThis.requestAnimationFrame = () => 0;
Object.defineProperty(globalThis, "localStorage", { value: { getItem: () => null, setItem: () => {}, removeItem: () => {} }, configurable: true });
Object.defineProperty(globalThis, "navigator", { value: { getGamepads: () => [] }, configurable: true });
Object.defineProperty(globalThis, "location", { value: { search: "" }, configurable: true });
globalThis.FakeRenderer = class {
  constructor() { this.domElement = fakeEl(); this.info = { render: { calls: 0, triangles: 0 } }; }
  setPixelRatio() {} setSize() {} render() {}
};

// ---- load a copy of the game with the renderer stubbed ----
const dir = mkdtempSync(join(tmpdir(), "sc-"));
mkdirSync(join(dir, "vendor"), { recursive: true });
cpSync(join(root, "vendor/three.module.js"), join(dir, "vendor/three.module.js"));
cpSync(join(root, "strings.js"), join(dir, "strings.js"));
cpSync(join(root, "audio.js"), join(dir, "audio.js"));
writeFileSync(join(dir, "game.js"),
  readFileSync(join(root, "game.js"), "utf8").replace("new THREE.WebGLRenderer", "new globalThis.FakeRenderer"));
await import(pathToFileURL(join(dir, "game.js")).href);

const h = globalThis.__palmCity;
const assert = (c, msg) => { if (!c) { console.error("FAIL:", msg, h.debug(), "money", h.state.money); process.exit(1); } };

const run = n => { for (let i = 0; i < n; i++) h.update(1 / 60); };
const talk = () => { let g = 0; while (h.debug().dlg && g++ < 50) h.advanceDialogue(); };
const goto_ = (x, z) => { h.player.x = x; h.player.z = z; };
const gotoCar = (x, z) => { h.cars[0].x = x; h.cars[0].z = z; };
const key = code => { fire("keydown", { code, preventDefault: () => {} }); run(2); fire("keyup", { code }); };

h.beginPlay();
run(80); assert(h.debug().dlg, "chapter 1 intro should open");
talk(); assert(h.debug().mState === "active", "chapter 1 active");

goto_(-44, -33); run(5); talk(); run(120); talk();          // M1 done -> M2 active
assert(h.state.mi === 1 && h.debug().mState === "active", "chapter 2 active");

goto_(-114, -40); run(5); goto_(44, -100); run(5); talk(); run(120); talk();
assert(h.state.mi === 2 && h.debug().mState === "active", "chapter 3 active");

goto_(-30, 8); run(3); key("KeyE"); run(3);
assert(h.debug().driving, "entered the starter car");
gotoCar(-188, 132); run(5); talk(); run(120); talk();
assert(h.state.mi === 3, "chapter 4 active");

gotoCar(99, 132); run(5); gotoCar(132, -180); run(5); talk(); run(120); talk();
assert(h.state.mi === 4, "chapter 5 active");

gotoCar(182, 132); run(5); gotoCar(-182, -132); run(5); gotoCar(44, -182); run(5); talk(); run(120); talk();
assert(h.state.mi === 5, "chapter 6 active (side jobs unlocked)");

key("KeyE"); run(3); assert(!h.debug().driving, "exited the car");
h.state.money = 600; goto_(-16, -16); run(3); key("KeyB"); run(5);
assert(h.state.owned.dogs, "bought the hot dog cart");
talk(); run(120); talk(); assert(h.state.mi === 6, "chapter 7 active");

h.state.money = 2500; run(5);
goto_(-100, 44); run(3); key("KeyB"); run(5);
assert(h.state.owned.wash, "bought the car wash");
talk(); run(120); talk(); assert(h.state.mi === 7, "chapter 8 active");

h.state.money = 99999;
goto_(100, -44); run(3); key("KeyB"); run(5); assert(h.state.owned.burger, "bought the burger joint");
goto_(188, -202); run(3); key("KeyB"); run(5); assert(h.state.owned.club, "bought the club");
talk(); run(10);
assert(h.state.mi === 8, "story complete");

// ---- act 2: chapters 9-12 ----
run(120); talk(); assert(h.state.mi === 8 && h.debug().mState === "active", "chapter 9 active");
goto_(-44, -52); run(5); talk(); run(120); talk();           // meet Vince
assert(h.state.mi === 9 && h.debug().mState === "active", "chapter 10 active");

goto_(-16, -16); run(5); goto_(-100, 44); run(5);            // rally all four crews
goto_(100, -44); run(5); goto_(188, -202); run(5);
talk(); run(120); talk();
assert(h.state.mi === 10, "chapter 11 active (loyalty boost won)");

h.cars[0].x = h.player.x + 2; h.cars[0].z = h.player.z;      // grab a car for Rosa's ride
key("KeyE"); run(3); assert(h.debug().driving, "driving for chapter 11");
gotoCar(128, -188); run(5); gotoCar(-44, -88); run(5);
gotoCar(-176, 0); run(5); gotoCar(-44, -88); run(5);
talk(); run(120); talk();
assert(h.state.mi === 11, "chapter 12 active (the race)");

gotoCar(-176, -176); run(5);                                  // reach the start line
assert(h.debug().mStep === 1, "race armed at the start line");
gotoCar(0, -176); run(101 * 60);                              // drive off, let the clock run out
assert(h.debug().mStep === 0, "race timeout resets to the start line");
gotoCar(-176, -176); run(5);
gotoCar(176, -176); run(5); gotoCar(176, 176); run(5);
gotoCar(-88, 176); run(5); gotoCar(-88, -88); run(5); gotoCar(88, 0); run(5);
talk(); run(10);
assert(h.state.mi === 12, "full 12-chapter story complete");

// ---- economy: upgrades, new businesses, tips ----
key("KeyE"); run(3); assert(!h.debug().driving, "back on foot");
h.state.money = 99999;
goto_(-16, -16); run(3); key("KeyB"); run(3);
assert(h.state.owned.dogs === 2, "hot dog cart upgraded to Lv2");
key("KeyB"); run(3); assert(h.state.owned.dogs === 3, "hot dog cart maxed at Lv3");
goto_(-44, 110); run(3); key("KeyB"); run(3); assert(h.state.owned.taxi === 1, "bought the taxi company");
goto_(220, 196); run(3); key("KeyB"); run(3); assert(h.state.owned.marina === 1, "bought the marina");

goto_(0, 0); run(2700);                                       // let tip jars fill (45s)
assert(h.debug().tips0 >= 5, "tip jar filled at the cart");
goto_(-16, -16); run(5);
assert(h.debug().tips0 < 1, "tips collected at the cart");

// freeplay side job loop
goto_(-188, 132); run(5); assert(h.debug().side === "carry", "picked up a depot package");
const before = h.state.money;
goto_(h.debug().sx, h.debug().sz); run(5);
assert(h.state.money > before, "side job paid out");

// collectibles: Golden Palms
const palmsBefore = h.debug().palms;
goto_(-176, 88); run(8);
assert(h.debug().palms > palmsBefore, "collected a golden palm");

// wanted system: rack up stars, a cop spawns, then get busted
h.forceCrime(); h.forceCrime(); h.forceCrime();
assert(h.debug().wanted === 3, "three wanted stars");
run(30);
assert(h.police.some(p => p.active), "police activated by wanted level");
const moneyPreBust = h.state.money;
h.police[0].active = true; h.police[0].x = h.player.x; h.police[0].z = h.player.z;
run(5);
assert(h.debug().wanted === 0, "busted clears the wanted level");
assert(h.state.money < moneyPreBust, "bust deducted a fine");

// stunt ramp: launch a car off a ramp and earn air time
h.cars[0].x = h.player.x + 1; h.cars[0].z = h.player.z; h.cars[0].y = 0; h.cars[0].vy = 0;
key("KeyE"); run(2);
assert(h.debug().driving, "in a car for the ramp test");
h.cars[0].x = -88; h.cars[0].z = -44; h.cars[0].h = 0; h.cars[0].speed = 22;
h.cars[0].rampCD = 0; h.cars[0].y = 0; h.cars[0].vy = 0;
let jumped = false;
for (let i = 0; i < 240; i++) { h.update(1 / 60); if (h.debug().bestJump > 0) { jumped = true; break; } }
assert(jumped, "stunt ramp launched the car for air time");
key("KeyE"); run(2);

// ---- garage: showroom -> buy, drive, and repaint a personal car ----
const pcar = h.cars.find(c => c.personal);
assert(pcar && pcar.locked, "a personal car starts locked at the garage");
h.state.money = 99999;
goto_(pcar.x, pcar.z); run(3); key("KeyB"); run(3);
assert(h.debug().garage, "showroom panel opens at a personal car");
h.buyCurrent();
assert(!pcar.locked && h.state.cars[pcar.pid] != null, "bought a personal car from the showroom");
h.closeGarage();
goto_(pcar.x, pcar.z); run(3); key("KeyE"); run(3);
assert(h.debug().driving, "can drive the bought personal car");
key("KeyE"); run(3); assert(!h.debug().driving, "exited the personal car");
goto_(pcar.x, pcar.z); run(3); key("KeyB"); run(3);
assert(h.debug().garage, "showroom reopens for the owned car");
h.paint(0x123456);
assert(h.state.cars[pcar.pid] === 0x123456, "repaint persists the chosen color");
h.closeGarage();

// ---- street races (freeplay): start at the gate, hit checkpoints, win, then time out ----
goto_(0, -3);                                   // away from the garage so we drive cars[0], not a personal car
h.cars[0].x = 0; h.cars[0].z = 0; h.cars[0].y = 0; h.cars[0].vy = 0;
key("KeyE"); run(3); assert(h.debug().driving, "in a car for the street race");
gotoCar(0, 0); run(3);                         // leave the gate so the race arms
gotoCar(-88, 88); run(3);                      // roll into the start gate
assert(h.debug().race === "active", "street race started at the gate");
const moneyPreRace = h.state.money;
gotoCar(88, 88); run(3); gotoCar(88, -88); run(3); gotoCar(-88, -88); run(3); gotoCar(-88, 88); run(3);
assert(h.debug().race === "idle", "street race finished");
assert(h.state.money > moneyPreRace, "street race paid a reward");
assert(h.state.races.downtown > 0, "best lap time was recorded for the Downtown Loop");
assert((h.state.medals.downtown || 0) >= 1, "earned a medal on the Downtown Loop");

gotoCar(0, 0); run(3); gotoCar(-88, 88); run(3);
assert(h.debug().race === "active", "street race re-armed and restarted");
run(53 * 60);                                  // let the 52s clock run out
assert(h.debug().race === "idle", "street race times out");
key("KeyE"); run(2);

// ---- achievements + progress panel ----
h.refreshAch();
for (const id of ["story", "race1", "car1", "biz6", "tycoon"])
  assert(h.state.ach.includes(id), "achievement unlocked: " + id);
h.openStats(); assert(h.debug().stats, "progress panel opens");
h.closeStats(); assert(!h.debug().stats, "progress panel closes");

run(600); // idle robustness: traffic, NPCs, income, day/night, police despawn
console.log("SMOKE PASS — 12 chapters + economy + palms + wanted + stunts + garage + races + achievements, money:", Math.floor(h.state.money));
process.exit(0);
