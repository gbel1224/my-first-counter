// Palm City — named places. Every story stop, business, property and service lives at a real
// sidewalk spot in front of a real building, with a lit sign on the facade, so "go to Pronto
// Pizza" means walking up to an actual shopfront rather than a marker on an empty corner.
import * as THREE from "../vendor/three.module.js";
import { BLOCK, WALK, CURB, ROAD, blockMin, blockC, roadC, PLAZA, groundY as groundYAt } from "./world.js";

// a spot on block (i,j)'s sidewalk. side: "N" | "S" | "E" | "W"; off: metres along the side from its centre.
function walk(i, j, side, off = 0) {
  const x0 = blockMin(i), z0 = blockMin(j), c = BLOCK / 2, d = 2.2, wall = WALK + 1.25;
  if (side === "N") return { x: x0 + c + off, z: z0 + d, face: Math.PI, wx: x0 + c + off, wz: z0 + wall };
  if (side === "S") return { x: x0 + c + off, z: z0 + BLOCK - d, face: 0, wx: x0 + c + off, wz: z0 + BLOCK - wall };
  if (side === "W") return { x: x0 + d, z: z0 + c + off, face: -Math.PI / 2, wx: x0 + wall, wz: z0 + c + off };
  return { x: x0 + BLOCK - d, z: z0 + c + off, face: Math.PI / 2, wx: x0 + BLOCK - wall, wz: z0 + c + off };
}
const px = blockC(PLAZA.i), pz = blockC(PLAZA.j);

export const PLACES = {
  // story + service spots
  fountain:   { x: px, z: pz + 8.5, face: Math.PI, label: null },
  plazaNorth: { x: px, z: pz - 8.5, face: 0, label: null },
  pizza:      { ...walk(4, 10, "N", 6), label: "PRONTO PIZZA", bg: "#b8261e", fg: "#fff4d8" },
  flat:       { ...walk(8, 11, "W", -8), label: "SEAVIEW APTS", bg: "#28405a", fg: "#e8f0f8" },
  depot:      { ...walk(3, 8, "W", 4), label: "DEPOT", bg: "#e0a020", fg: "#1a1a1a" },
  rosaPick:   { ...walk(12, 8, "W", -6), label: null },
  studio:     { ...walk(8, 1, "S", 4), label: "ROSA STUDIO", bg: "#6a2a5a", fg: "#ffe8f8" },
  courier1:   { ...walk(12, 12, "N", 0), label: null },
  courier2:   { ...walk(1, 1, "S", 12.25), label: null },
  courier3:   { ...walk(6, 0, "S", -6), label: null },
  gallery:    { ...walk(6, 5, "S", 0), label: "PALM GALLERY", bg: "#1a1a1a", fg: "#f0e6d0" },
  prints:     { ...walk(3, 9, "W", -4), label: "PRINT SHOP", bg: "#2a6a8a", fg: "#ffffff" },
  // businesses you can buy
  dogs:       { x: px + 12, z: pz + 16, face: Math.PI / 4, label: null },
  wash:       { ...walk(3, 11, "E", 0), label: "MARINA CAR WASH", bg: "#1d6fa5", fg: "#ffffff" },
  burger:     { ...walk(11, 9, "W", 0), label: "BIG BUN BURGERS", bg: "#c8641e", fg: "#fff2c0" },
  club:       { ...walk(12, 1, "S", 0), label: "NEON PALMS", bg: "#16081e", fg: "#ff5ec8" },
  taxi:       { ...walk(7, 12, "N", 0), label: "PALM TAXI CO.", bg: "#f0c020", fg: "#1a1a1a" },
  marina:     { ...walk(9, 13, "S", 0), label: "BAYSIDE MARINA", bg: "#0e4a6e", fg: "#e8f8ff" },
  // services
  guns:       { ...walk(5, 11, "E", -6), label: "AMMU-PALM", bg: "#2a2a2a", fg: "#ff4a3a" },
  hospital:   { ...walk(9, 6, "E", 0), label: "PALM GENERAL", bg: "#f4f4f4", fg: "#c81e1e" },
  police:     { ...walk(4, 4, "S", 0), label: "PCPD", bg: "#10204a", fg: "#ffffff" },
  gas1:       { ...walk(2, 6, "E", 0), label: "PALM FUEL", bg: "#c81e1e", fg: "#ffffff" },
  gas2:       { ...walk(11, 6, "W", 0), label: "PALM FUEL", bg: "#c81e1e", fg: "#ffffff" },
  clothes:    { ...walk(7, 10, "N", 8), label: "THREADS", bg: "#1a1a1a", fg: "#f0d8a0" },
  barber:     { ...walk(10, 11, "N", -8), label: "FADE CITY", bg: "#2050a0", fg: "#ffffff" },
  arcade:     { ...walk(4, 7, "E", 6), label: "PALM BOWL", bg: "#3a1060", fg: "#ffd166" },
  customs:    { ...walk(10, 8, "E", -8), label: "PALM CUSTOMS", bg: "#101014", fg: "#ff7a1a" },
  // properties
  apartment:  { ...walk(11, 3, "S", 8), label: "APARTMENTS", bg: "#4a4238", fg: "#f0e8d8" },
  condo:      { ...walk(8, 8, "W", 6), label: "PALM CONDOS", bg: "#2a3a4a", fg: "#f4f0e8" },
  house:      { ...walk(1, 3, "E", -12.25), label: null },
  bungalow:   { ...walk(5, 13, "S", -10), label: null },
  villa:      { ...walk(1, 7, "E", -12.25), label: null },
  penthouse:  { ...walk(7, 4, "S", -10), label: null },
};
// race checkpoints sit on intersections
export const RACE = [[1, 1], [13, 1], [13, 12], [3, 6], [6, 9], [7, 7]].map(([i, j]) => ({ x: roadC(i), z: roadC(j) }));

// ---------------------------------------------------------------------------------------------
// facade signs: canvas-lettered boards that glow at night
function signTexture(text, bg, fg) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = "rgba(255,255,255,.18)"; g.lineWidth = 6; g.strokeRect(6, 6, 500, 116);
  g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
  let size = 70; g.font = `800 ${size}px Outfit, system-ui, sans-serif`;
  while (g.measureText(text).width > 470 && size > 20) { size -= 4; g.font = `800 ${size}px Outfit, system-ui, sans-serif`; }
  g.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
export function buildSigns(scene) {
  const signs = {};
  for (const [id, p] of Object.entries(PLACES)) {
    if (!p.label) continue;
    const tex = signTexture(p.label, p.bg, p.fg);
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.15, roughness: 0.5 });
    const w = 6.4, h = 1.6;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, h + 0.2, 0.18), new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.6 }));
    const g = new THREE.Group(); g.add(back, m); m.position.z = 0.1;
    // hang it on the wall behind the sidewalk spot, facing the street
    g.position.set(p.wx + Math.sin(p.face) * 0.12, CURB + 4.6, p.wz + Math.cos(p.face) * 0.12);
    g.rotation.y = p.face;
    back.castShadow = true;
    scene.add(g);
    signs[id] = { group: g, mat, p };
  }
  return signs;
}
export function setSignNight(signs, night) {
  for (const k in signs) signs[k].mat.emissiveIntensity = 0.15 + night * 1.6;
}

// ---------------------------------------------------------------------------------------------
// the objective beacon: a soft column of light and a pulsing ground ring
export function makeBeacon(scene, color) {
  const g = new THREE.Group();
  const col = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 40, 20, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
  col.position.y = 20;
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.2, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 4), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  arrow.rotation.x = Math.PI; arrow.position.y = 3.2;
  g.add(col, ring, arrow);
  g.visible = false;
  scene.add(g);
  return {
    group: g,
    set(p, r = 2) { if (!p) { g.visible = false; return; } g.visible = true; g.position.set(p.x, p.y || CURB * 0.5, p.z); g.scale.setScalar(Math.max(1, r / 3)); },
    update(t, camDist) {
      const pulse = 0.5 + Math.sin(t * 3.2) * 0.5;
      ring.scale.setScalar(1 + pulse * 0.35); ring.material.opacity = 0.75 - pulse * 0.4;
      arrow.position.y = 3.0 + Math.sin(t * 2.4) * 0.35; arrow.rotation.y = t * 1.5;
      col.material.opacity = 0.1 + Math.min(0.25, camDist / 400);   // columns read from far away, stay subtle up close
    },
  };
}

// ---------------------------------------------------------------------------------------------
// realtor boards outside the homes you can buy: FOR SALE and the price, on a post in the yard or
// on the sidewalk; gone once it's yours
function saleTexture(price) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 192;
  const g = c.getContext("2d");
  g.fillStyle = "#f4f1ea"; g.fillRect(0, 0, 256, 192);
  g.fillStyle = "#b8231c"; g.fillRect(0, 0, 256, 62);
  g.fillStyle = "#fff"; g.font = "900 44px Outfit, system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("FOR SALE", 128, 33);
  g.fillStyle = "#1a1a1a"; g.font = "800 40px Outfit, system-ui, sans-serif"; g.fillText("$" + price.toLocaleString(), 128, 102);
  g.fillStyle = "#555"; g.font = "700 20px Outfit, system-ui, sans-serif"; g.fillText("PALM REALTY · 555-0199", 128, 152);
  g.strokeStyle = "#b8231c"; g.lineWidth = 6; g.strokeRect(3, 3, 250, 186);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
export function buildSaleSigns(scene, props) {
  const post = new THREE.MeshStandardMaterial({ color: 0xece8e0, roughness: 0.6 });
  const list = props.map(pr => {
    const p = pr.p, grp = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.68, 0.03), [post, post, post, post, new THREE.MeshStandardMaterial({ map: saleTexture(pr.cost), roughness: 0.55 }), post]);
    board.position.y = 1.25; board.castShadow = true;
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.65, 0.07), post); pole.position.set(-0.5, 0.82, 0); pole.castShadow = true;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.06, 0.06), post); arm.position.set(-0.02, 1.62, 0);
    const hooks = [-0.3, 0.3].map(x => { const h = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.05, 0.015), post); h.position.set(x, 1.57, 0); return h; });
    grp.add(board, pole, arm, ...hooks);
    const tx = Math.cos(p.face), tz = -Math.sin(p.face);
    grp.position.set(p.x + tx * 1.9 - Math.sin(p.face) * 0.6, groundYAt(p.x + tx * 1.9, p.z + tz * 1.9), p.z + tz * 1.9 - Math.cos(p.face) * 0.6);
    grp.rotation.y = p.face;
    scene.add(grp);
    return { pr, grp };
  });
  return { update(st) { for (const s of list) s.grp.visible = !st[s.pr.flag]; } };
}
