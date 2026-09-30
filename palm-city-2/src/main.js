// Palm City 2 — bootstrap + main loop.
import * as THREE from "../vendor/three.module.js";
import { createRenderer, isMobile } from "./render.js";
import { buildCity, Collider, groundY, blockC, PLAZA, HALF } from "./world.js";
import { createSky } from "./sky.js";
import { createCity } from "./city.js";
import { createOcean } from "./ocean.js";

const bootBar = document.getElementById("bootbar");
const step = async (pct) => { bootBar.style.width = pct + "%"; await new Promise(r => requestAnimationFrame(() => r())); };

const R = createRenderer(document.getElementById("c"));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.3, 1400);
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); R.resize(); });

await step(10);
const plan = buildCity();
const collider = new Collider(plan.buildings);
await step(25);
const sky = createSky(scene, R.renderer);
await step(40);
const city = createCity(scene, plan, groundY);
await step(70);
const ocean = createOcean(scene, sky);
await step(90);

const focus = new THREE.Vector3(blockC(PLAZA.i), 0, blockC(PLAZA.j));
const cam = { mode: "orbit", a: 0.6, r: 110, h: 42 };
let time = 0, last = performance.now(), frozen = false;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (frozen) return;
  time += dt;
  if (cam.mode === "orbit") {
    cam.a += dt * 0.04;
    camera.position.set(focus.x + Math.sin(cam.a) * cam.r, cam.h, focus.z + Math.cos(cam.a) * cam.r);
    camera.lookAt(focus.x, 6, focus.z);
  }
  sky.update(dt, time, focus, camera);
  city.update(time, sky.state.night);
  ocean.update(time, scene.fog);
  R.render(scene, camera, time);
}
await step(100);
document.getElementById("boot").classList.add("gone");
requestAnimationFrame(frame);

// debug / test hooks
globalThis.__pc2 = {
  THREE, scene, camera, R, sky, city, plan, collider, focus, cam,
  freeze: v => { frozen = v; }, renderOnce: () => R.render(scene, camera, time),
  setTime: t => sky.set(t),
  look: (px, py, pz, tx, ty, tz) => { cam.mode = "fixed"; camera.position.set(px, py, pz); camera.lookAt(tx, ty, tz); },
};
