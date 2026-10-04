// Palm City — input. Touch: a floating joystick anywhere on the left half, drag the right half
// to look around, context buttons bottom-right. Keyboard: WASD/arrows + Shift/Space/E/H.
// Gamepad: left stick, right stick look, A/B/X/Y + triggers. Everything lands in one `I` object.
export const I = {
  mx: 0, mz: 0,              // move (x right, z forward), -1..1
  lookX: 0, lookY: 0,        // accumulated look drag since last read (pixels)
  sprint: false, jump: false, handbrake: false, horn: false,
  action: false,             // edge-triggered: enter/exit vehicle, talk, etc.
  touch: false,
};
const keys = new Set();
let actionQ = false, jumpQ = false, cycleQ = false, fireQ = false, radioQ = false;

export function initInput(ui) {
  addEventListener("keydown", e => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if (e.repeat) { if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault(); return; }
    keys.add(e.code);
    if (e.code === "KeyE" || e.code === "Enter") actionQ = true;
    if (e.code === "Space") { jumpQ = true; e.preventDefault(); }
    if (e.code === "KeyQ" || e.code === "Tab") { cycleQ = true; e.preventDefault(); }
    if (e.code === "KeyF" || e.code === "KeyJ") fireQ = true;
    if (e.code === "KeyR") radioQ = true;
    if (e.code.startsWith("Arrow")) e.preventDefault();
    document.body.classList.add("kb");
  });
  addEventListener("keyup", e => keys.delete(e.code));
  addEventListener("blur", () => keys.clear());

  // ---- touch ----
  const joy = ui.joy, knob = ui.knob;
  let joyId = null, jx = 0, jy = 0, lookId = null, lx = 0, ly = 0;
  const R = 56;
  const onDown = e => {
    if (e.pointerType === "mouse") return;
    I.touch = true; document.body.classList.remove("kb");
    if (e.target.closest && e.target.closest(".btn,.pe")) return;
    if (e.clientX < innerWidth * 0.45 && joyId === null) {
      joyId = e.pointerId; jx = e.clientX; jy = e.clientY;
      joy.style.display = "block"; joy.style.left = jx + "px"; joy.style.top = jy + "px";
      knob.style.transform = "translate(0,0)";
    } else if (lookId === null) { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; }
  };
  const onMove = e => {
    if (e.pointerId === joyId) {
      let dx = e.clientX - jx, dy = e.clientY - jy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      I.mx = dx / R; I.mz = -dy / R;
      const m = Math.hypot(I.mx, I.mz);
      I.sprint = m > 0.96;                         // push to the rim to run
      if (m < 0.12) { I.mx = 0; I.mz = 0; }
    } else if (e.pointerId === lookId) {
      I.lookX += e.clientX - lx; I.lookY += e.clientY - ly; lx = e.clientX; ly = e.clientY;
    }
  };
  const onUp = e => {
    if (e.pointerId === joyId) { joyId = null; joy.style.display = "none"; I.mx = 0; I.mz = 0; I.sprint = false; }
    if (e.pointerId === lookId) lookId = null;
  };
  addEventListener("pointerdown", onDown, { passive: true });
  addEventListener("pointermove", onMove, { passive: true });
  addEventListener("pointerup", onUp); addEventListener("pointercancel", onUp);

  // mouse look on desktop: drag with the mouse anywhere
  let mdown = false, mx0 = 0, my0 = 0;
  addEventListener("mousedown", e => { if (e.target.closest && e.target.closest("button,.pe")) return; mdown = true; mx0 = e.clientX; my0 = e.clientY; });
  addEventListener("mousemove", e => { if (!mdown) return; I.lookX += e.clientX - mx0; I.lookY += e.clientY - my0; mx0 = e.clientX; my0 = e.clientY; });
  addEventListener("mouseup", () => { mdown = false; });

  const hold = (el, key) => {
    const on = e => { e.preventDefault(); I[key] = true; el.classList.add("down"); };
    const off = () => { I[key] = false; el.classList.remove("down"); };
    el.addEventListener("pointerdown", on); el.addEventListener("pointerup", off); el.addEventListener("pointercancel", off); el.addEventListener("pointerleave", off);
  };
  ui.bA.addEventListener("pointerdown", e => { e.preventDefault(); actionQ = true; });
  hold(ui.bB, "handbrake");      // on foot: jump (edge-triggered below); in a car: handbrake
  ui.bB.addEventListener("pointerdown", () => { jumpQ = true; });
  hold(ui.bC, "boostBtn");
  hold(ui.bF, "fireBtn");
  ui.bF.addEventListener("pointerdown", () => { fireQ = true; });
  ui.bW.addEventListener("pointerdown", e => { e.preventDefault(); cycleQ = true; });
  hold(ui.bD, "hornBtn");
  ui.bR.addEventListener("pointerdown", e => { e.preventDefault(); radioQ = true; });
}

let padPrevA = false, padPrevB = false;
export function pollInput() {
  const k = c => keys.has(c);
  let mx = (k("KeyD") || k("ArrowRight") ? 1 : 0) - (k("KeyA") || k("ArrowLeft") ? 1 : 0);
  let mz = (k("KeyW") || k("ArrowUp") ? 1 : 0) - (k("KeyS") || k("ArrowDown") ? 1 : 0);
  const kb = mx !== 0 || mz !== 0;
  let sprintKb = k("ShiftLeft") || k("ShiftRight");
  let hb = k("Space"), horn = k("KeyH");
  // gamepad
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g && g.connected) : null;
  let gpMove = false;
  if (gp) {
    const dz = v => Math.abs(v) < 0.18 ? 0 : v;
    const ax = dz(gp.axes[0] || 0), az = dz(gp.axes[1] || 0);
    if (ax || az) { mx = ax; mz = -az; gpMove = true; }
    const rt = gp.buttons[7] ? gp.buttons[7].value : 0, lt = gp.buttons[6] ? gp.buttons[6].value : 0;
    if (rt > 0.05 || lt > 0.05) { mz = rt - lt; gpMove = true; }
    I.lookX += dz(gp.axes[2] || 0) * 14; I.lookY += dz(gp.axes[3] || 0) * 10;
    const a = gp.buttons[3] && gp.buttons[3].pressed, b = gp.buttons[0] && gp.buttons[0].pressed;
    if (a && !padPrevA) actionQ = true; padPrevA = a;
    if (b && !padPrevB) jumpQ = true; padPrevB = b;
    if (b) hb = true;
    if (gp.buttons[2] && gp.buttons[2].pressed) sprintKb = true;
    if (gp.buttons[10] && gp.buttons[10].pressed) horn = true;
    if (gp.buttons[5] && gp.buttons[5].pressed) I.padFire = true; else I.padFire = false;
    if (gp.buttons[4] && gp.buttons[4].pressed && !I._padLB) cycleQ = true; I._padLB = !!(gp.buttons[4] && gp.buttons[4].pressed);
  }
  if (kb || gpMove) { I.mx = mx; I.mz = mz; I._kb = true; }
  else if (I._kb) { I.mx = 0; I.mz = 0; I._kb = false; }
  I.sprintHeld = sprintKb || I.sprint || !!I.boostBtn;
  I.handbrakeHeld = hb || !!I.handbrake;
  I.hornHeld = horn || !!I.hornBtn;
  I.action = actionQ; actionQ = false;
  I.jump = jumpQ; jumpQ = false;
  I.cycle = cycleQ; cycleQ = false;
  I.radio = radioQ; radioQ = false;
  I.fire = fireQ; fireQ = false;
  I.fireHeld = keys.has("KeyF") || keys.has("KeyJ") || !!I.fireBtn || !!I.padFire;
  return I;
}
