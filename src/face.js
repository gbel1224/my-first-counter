// Palm City — faces. Eyes that blink and widen, brows that knit and lift, lips that smile, frown
// and part to show teeth and a tongue when someone talks, eats or screams, and beards for the men
// who grow them. Every face part is its own small mesh placed relative to the head, so the same
// code drives the player, the shop staff and (instanced) the whole crowd.
import * as THREE from "../vendor/three.module.js";
import { paint, merge, place } from "./geo.js";

// where things sit on the head (head-local metres; the head's front surface is about z = 0.11)
const EYE_Y = 0.206, EYE_X = 0.037, EYE_Z = 0.102;
const BROW_Y = 0.232, BROW_Z = 0.107;
const MOUTH_Y = 0.142, MOUTH_Z = 0.108, LIP_W = 0.023;

function buildFaceParts() {
  const F = {};
  // the white of the eye: a flattened ball set into the head
  F.eyeW = merge([place(paint(new THREE.SphereGeometry(0.0165, 12, 8), 0xffffff), 0, 0, 0, 0, 0, 0, 1.15, 0.78, 0.55)]);
  // iris and pupil (the instance colour is the iris colour, the pupil is painted black, plus a catchlight)
  F.iris = merge([
    place(paint(new THREE.CircleGeometry(0.0082, 14), 0xffffff), 0, 0, 0.0001),
    place(paint(new THREE.CircleGeometry(0.0038, 10), 0x050505), 0, 0, 0.0004),
    place(paint(new THREE.CircleGeometry(0.0016, 6), 0xffffff, 1), 0.0028, 0.003, 0.0007),
  ]);
  // the upper lid: a skin-coloured half shell that drops over the eye to blink, squint or glare
  F.lid = merge([place(paint(new THREE.SphereGeometry(0.0185, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xffffff), 0, 0, 0, 0, 0, 0, 1.18, 1, 0.82)]);
  // a brow: a short tapered bar of hair, thicker at the inner end
  {
    const b = new THREE.CapsuleGeometry(0.0042, 0.03, 3, 6); b.rotateZ(Math.PI / 2);
    const p = b.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) * (1.15 - x * 9)); p.setZ(i, p.getZ(i) * 0.6); }
    b.computeVertexNormals();
    F.brow = merge([paint(b, 0xffffff)]);
  }
  // the inside of the mouth: dark cavity, upper and lower teeth, tongue — scaled open and shut
  F.mouth = merge([
    place(paint(new THREE.SphereGeometry(0.02, 14, 8), 0x2a0a0c), 0, 0, -0.004, 0, 0, 0, 1.15, 0.55, 0.35),
    place(paint(new THREE.BoxGeometry(0.03, 0.006, 0.006), 0xf4f0e6), 0, 0.0062, 0.0015),
    place(paint(new THREE.BoxGeometry(0.026, 0.005, 0.006), 0xe8e2d4), 0, -0.0068, 0.0005),
    place(paint(new THREE.SphereGeometry(0.011, 10, 6), 0xc8505a), 0, -0.006, -0.002, 0, 0, 0, 1.2, 0.45, 0.8),
  ]);
  // half a lip, from the middle of the mouth out to one corner (the corner is what lifts in a smile)
  {
    const l = new THREE.CapsuleGeometry(0.0038, LIP_W - 0.005, 3, 8); l.rotateZ(Math.PI / 2); l.translate(LIP_W / 2 - 0.001, 0, 0);
    const p = l.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); const k = 1 - Math.max(0, x / LIP_W) * 0.45; p.setY(i, p.getY(i) * k); p.setZ(i, p.getZ(i) * 0.7 * k); }
    l.computeVertexNormals();
    F.lip = merge([paint(l, 0xffffff)]);
  }
  // beards: a full beard hugging the jaw (open at the mouth), a goatee, a mustache, stubble
  const mus = () => { const m = new THREE.CapsuleGeometry(0.0058, 0.034, 3, 8); m.rotateZ(Math.PI / 2); const p = m.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) - x * x * 9); } m.computeVertexNormals(); m.translate(0, MOUTH_Y + 0.0125, MOUTH_Z + 0.004); return paint(m, 0xffffff); };
  {
    const jaw = new THREE.SphereGeometry(0.083, 18, 9, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4);
    jaw.scale(1.18, 1.12, 1.28); jaw.translate(0, 0.158, 0.018);
    const sides = new THREE.SphereGeometry(0.083, 16, 4, Math.PI / 2 + 0.75, Math.PI * 2 - 1.5, Math.PI * 0.42, Math.PI * 0.2);
    sides.scale(1.27, 1.12, 1.3); sides.translate(0, 0.158, 0.018);
    F.beardFull = merge([paint(jaw, 0xffffff), paint(sides, 0xffffff), mus()]);
    const g = new THREE.SphereGeometry(0.016, 12, 8); g.scale(0.85, 1.1, 0.5); g.translate(0, 0.114, 0.104);
    F.beardGoatee = merge([paint(g, 0xffffff), mus()]);
    F.beardMus = merge([mus()]);
    const s = new THREE.SphereGeometry(0.0835, 18, 9, 0, Math.PI * 2, Math.PI * 0.58, Math.PI * 0.42);
    s.scale(1.12, 1.08, 1.2); s.translate(0, 0.158, 0.018);
    F.beardStubble = merge([paint(s, 0xffffff)]);
  }
  return F;
}
export const FACE = buildFaceParts();
export const BEARD_KIND = { full: "beardFull", goatee: "beardGoatee", mustache: "beardMus", stubble: "beardStubble" };

// ---------------------------------------------------------------------------------------------
// expressions: brow tilt (+ knits the inner ends down — anger; − lifts them — worry), brow raise,
// how open the eyes are (1 normal, <1 squint, >1 wide), mouth curve (+ smile, − frown), mouth open
export const EXPR = {
  neutral:   { tilt: 0.02, raise: 0, eye: 1, curve: 0.04, open: 0 },
  happy:     { tilt: -0.08, raise: 0.0015, eye: 0.78, curve: 0.85, open: 0.18 },
  laugh:     { tilt: -0.12, raise: 0.003, eye: 0.45, curve: 1, open: 0.8 },
  sad:       { tilt: -0.5, raise: 0.002, eye: 0.72, curve: -0.75, open: 0 },
  mad:       { tilt: 0.5, raise: -0.004, eye: 0.82, curve: -0.55, open: 0.32 },
  annoyed:   { tilt: 0.22, raise: -0.002, eye: 0.6, curve: -0.3, open: 0 },
  surprised: { tilt: -0.12, raise: 0.008, eye: 1.3, curve: 0.1, open: 0.5 },
  shocked:   { tilt: -0.25, raise: 0.01, eye: 1.45, curve: -0.2, open: 0.95 },
  scared:    { tilt: -0.55, raise: 0.007, eye: 1.38, curve: -0.6, open: 0.6 },
  flirty:    { tilt: 0.0, raise: 0.002, eye: 0.7, curve: 0.65, open: 0, wink: 1 },
  smug:      { tilt: 0.1, raise: 0.001, eye: 0.7, curve: 0.45, open: 0, smirk: 1 },
  disgusted: { tilt: 0.35, raise: -0.002, eye: 0.6, curve: -0.65, open: 0.15 },
  pain:      { tilt: 0.45, raise: -0.003, eye: 0.12, curve: -0.6, open: 0.45 },
  out:       { tilt: 0, raise: 0, eye: 0.04, curve: -0.1, open: 0.3 },
};
export const IRIS = [0x3a2414, 0x4a2e1a, 0x2a1a10, 0x3a5a7a, 0x4a6a3a, 0x5a4a2a, 0x2a2a2a, 0x6a8aa0];

// a face's live state, eased toward the target expression; talk makes the jaw chatter
export function newFace(seed = Math.random()) {
  return { expr: "neutral", base: "neutral", hold: 0, talk: 0, blinkT: 1 + seed * 4, blink: 0, seed, cur: { ...EXPR.neutral, wink: 0, smirk: 0 } };
}
export function setExpr(f, name, secs = 3) { if (!EXPR[name]) return; f.expr = name; f.hold = secs; }
export function tickFace(f, dt, t) {
  if (f.hold > 0) f.hold -= dt;
  else f.expr = f.base;
  if (f.talk > 0) f.talk = Math.max(0, f.talk - dt);
  const tg = EXPR[f.expr] || EXPR.neutral, c = f.cur, k = Math.min(1, dt * 9);
  for (const key of ["tilt", "raise", "eye", "curve", "open"]) c[key] += (tg[key] - c[key]) * k;
  c.wink += ((tg.wink || 0) - c.wink) * k; c.smirk += ((tg.smirk || 0) - c.smirk) * k;
  // blinking: every few seconds, faster when scared
  f.blinkT -= dt;
  if (f.blinkT <= 0) { f.blink = 0.13; f.blinkT = (f.expr === "scared" ? 1.2 : 2.6) + ((f.seed * 997 + t) % 1) * 3.5; }
  if (f.blink > 0) f.blink -= dt;
  // talking: the jaw works in syllables, with pauses between words
  const chat = f.talk > 0 ? Math.abs(Math.sin(t * 15 + f.seed * 9) * Math.sin(t * 6.3 + f.seed * 4)) * (0.55 + 0.45 * Math.sin(t * 2.1 + f.seed) ** 2) : 0;
  f.open = Math.min(1, c.open + chat * 0.75);
  f.eyeL = f.blink > 0 ? 0.05 : c.eye * (1 - c.wink * 0.92);
  f.eyeR = f.blink > 0 ? 0.05 : c.eye;
  return f;
}

// write every face part's world matrix for one head: emit(part, matrix, slot)
// slot tells left/right apart for parts drawn twice (eyes, lids, brows, lips)
const _a = new THREE.Matrix4(), _b = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function local(x, y, z, rx, ry, rz, sx, sy, sz) { return _b.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, "YXZ")), _s.set(sx, sy, sz)); }
export function faceMatrices(head, f, beard, emit) {
  const c = f.cur;
  for (const side of [-1, 1]) {
    const L = side < 0, open = L ? f.eyeL : f.eyeR;
    const ex = side * EYE_X;
    const wide = 1 + Math.max(0, open - 1) * 0.35;
    emit("eyeW", _a.copy(head).multiply(local(ex, EYE_Y, EYE_Z, 0, side * 0.12, 0, wide, wide, 1)), L ? 0 : 1);
    emit("iris", _a.copy(head).multiply(local(ex + side * 0.0004, EYE_Y - 0.0004, EYE_Z + 0.0094, 0, side * 0.12, 0, 1, 1, 1)), L ? 0 : 1);
    // the lid swings forward over the eye: tucked back for wide eyes, right down for a blink
    const lidA = -0.35 + (1 - Math.min(1.35, open)) * 1.9;
    emit("lid", _a.copy(head).multiply(local(ex, EYE_Y + 0.001, EYE_Z - 0.001, lidA, side * 0.12, 0, 1, 1, 1)), L ? 0 : 1);
    // brows: tilt raises or drops the inner end; a smirk or a flirt cocks one brow
    const bt = c.tilt, br = c.raise + (side > 0 ? c.smirk * 0.004 + c.wink * -0.002 : 0) + Math.max(0, open - 1) * 0.006;
    emit("brow", _a.copy(head).multiply(local(side * 0.039, BROW_Y + br, BROW_Z, 0, (L ? Math.PI : 0) + side * 0.15, bt - 0.06, 1, 1, 1)), L ? 0 : 1);
  }
  // mouth: the cavity opens, the lower lip drops with the jaw, the corners lift or fall
  const open = f.open, drop = open * 0.016, curve = c.curve, sm = c.smirk;
  emit("mouth", _a.copy(head).multiply(local(0, MOUTH_Y - drop * 0.5, MOUTH_Z, 0, 0, 0, 1 + open * 0.15 - Math.max(0, curve) * 0.05, 0.12 + open * 1.05, 1)), 0);
  for (const side of [-1, 1]) {
    const cv = curve + (side > 0 ? sm * 0.6 : 0);
    const a = side * (cv * 0.38);
    for (const up of [1, 0]) {
      const y = MOUTH_Y + (up ? 0.0042 + open * 0.0018 : -0.0042 - drop), w = 1 + open * 0.08;
      emit("lip", _a.copy(head).multiply(local(0, y, MOUTH_Z + (up ? 0.0012 : 0), 0, side < 0 ? Math.PI : 0, side < 0 ? -a : a, w, up ? 0.9 : 1.05, 1)), (side < 0 ? 0 : 2) + up);
    }
  }
  if (beard) emit(beard, _a.copy(head).multiply(local(0, -drop * 0.6, 0, 0, 0, 0, 1, 1, 1)), 0);
}
