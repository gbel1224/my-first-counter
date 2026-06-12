/* Boot: one scene, one loop. Menu orbit → camera dive → match → results → menu. */
import { CONFIG, STRINGS } from './config.js';
import { loadSave } from './save.js';
import { createScene } from './scene.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createMenu } from './menu.js';
import { createMatch } from './match.js';
import { createOverlay } from './overlay.js';

const save = loadSave();
window.CONFIG = CONFIG;   // runtime-tweakable via dev console
window.STRINGS = STRINGS;

document.documentElement.style.setProperty('--uiscale', save.settings.tscale / 10);
document.body.classList.toggle('hc', save.settings.hc);

const params = new URLSearchParams(location.search);
const SMOKE = params.has('smoke');

const mount = document.getElementById('arena3d');
const scene3d = await createScene(mount); // (vite target es2022 — TLA ok)
const input = createInput();
const audio = createAudio();
const hud = createHud();
const overlay = createOverlay(scene3d.renderer);

let mode = 'menu';        // menu | match
let match = null;
let paused = false;

const pauseveil = document.getElementById('pauseveil');
document.getElementById('pause-big').textContent = STRINGS.paused;
document.getElementById('pause-small').textContent = STRINGS.quitHint;

const menu = createMenu({
  save, audio,
  onStart: m => { menu.setLastMode(m); startMatch(m); },
});

function startMatch(matchMode) {
  audio.ensure();
  document.body.classList.add('ingame');
  paused = false;
  const speed = SMOKE ? Math.max(+(params.get('speed') ?? 1), 1) : 1;
  match = createMatch({ mode: matchMode, save, scene3d, hud, audio, input, smoke: SMOKE, speed });
  window.__match = match; // dev console / test hook
  mode = 'match';
  overlay.smokeReset();
  // pointer lock from the click gesture (desktop); touch/gamepad don't need it
  if (!SMOKE && !input.touchActive) {
    scene3d.renderer.domElement.requestPointerLock?.();
  }
}

function endToResults() {
  const result = match.finish();
  document.exitPointerLock?.();
  document.body.classList.remove('ingame');
  mode = 'menu';
  match = null;
  menu.showResults(result);
  if (SMOKE) {
    const rep = overlay.smokeReport();
    window.__smokeResult = rep;
    console.log('SMOKE RESULT', JSON.stringify(rep));
  }
}

function quitToMenu() {
  document.exitPointerLock?.();
  document.body.classList.remove('ingame');
  pauseveil.style.display = 'none';
  paused = false;
  mode = 'menu';
  match = null;
  menu.go('single');
}

/* pause on pointer-lock loss (Esc), resume on click */
document.addEventListener('pointerlockchange', () => {
  if (mode !== 'match' || SMOKE || input.touchActive) return;
  if (!document.pointerLockElement && match && match.phase === 'play') {
    paused = true;
    pauseveil.style.display = 'flex';
  }
});
pauseveil.addEventListener('click', () => {
  if (mode !== 'match') return;
  pauseveil.style.display = 'none';
  paused = false;
  scene3d.renderer.domElement.requestPointerLock?.();
});
addEventListener('keydown', e => {
  if (e.code === 'KeyQ' && paused && mode === 'match') quitToMenu();
});

/* touch: tap to start needs no pointer lock; show pause via long banner? Q only on kb */

let last = performance.now();
let menuClock = 0;
let navT = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const ms0 = performance.now();
  let dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const t = now / 1000;

  if (mode === 'menu') {
    menuClock += dt;
    scene3d.updateMenuIdle(menuClock, dt);
    scene3d.updateRings(menuClock, true);
    // gamepad menu navigation (throttle repeat)
    navT -= dt;
    if (navT <= 0) {
      const edge = input.pollMenuNav();
      if (edge && (edge.up || edge.down || edge.a || edge.b)) { menu.gamepadNav(edge); navT = 0.16; }
    }
  } else if (mode === 'match' && match) {
    const ended = match.update(dt, t, paused);
    if (ended) endToResults();
  }

  scene3d.updateBeams(dt);
  scene3d.updateSparks(dt);
  scene3d.renderer.render(scene3d.scene, scene3d.camera);

  const simInfo = match ? `sim t ${match.sim.state.time.toFixed(1)}s  phase ${match.phase}` : 'menu idle';
  overlay.frame(dt, performance.now() - ms0, simInfo);
}
requestAnimationFrame(frame);

if (SMOKE) startMatch(params.get('smoke') === 'ranked' ? 'ranked' : 'quick');
