/* Input: keyboard/mouse, touch (dual virtual zones), gamepad → one command frame.
   Physical key codes only. Look: latest-method-wins. Move: sources summed, clamped. */

export function createInput() {
  const keys = new Set();
  let mouseDX = 0, mouseDY = 0, mouseFire = false;
  let lastLook = 'mouse';           // latest-method-wins for look
  const lookStamp = { mouse: 0, touch: 0, pad: 0 };

  addEventListener('keydown', e => {
    if (e.code === 'Tab') return;
    keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code) && document.body.classList.contains('ingame')) e.preventDefault();
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  addEventListener('mousemove', e => {
    if (document.pointerLockElement) {
      mouseDX += e.movementX; mouseDY += e.movementY;
      lookStamp.mouse = performance.now(); lastLook = 'mouse';
    }
  });
  addEventListener('mousedown', e => { if (e.button === 0 && document.pointerLockElement) mouseFire = true; });
  addEventListener('mouseup', e => { if (e.button === 0) mouseFire = false; });

  /* ---------- touch: left stick zone, right look zone, fire/jump buttons ---------- */
  const touch = { mx: 0, mz: 0, lookDX: 0, lookDY: 0, fire: false, jump: false, active: false };
  const stickEl = document.getElementById('stick');
  const knobEl = document.getElementById('stickknob');
  let stickId = null, stickCX = 0, stickCY = 0, lookId = null, lookPX = 0, lookPY = 0;

  function markTouch() {
    if (!touch.active) { touch.active = true; document.body.classList.add('touch'); }
  }
  addEventListener('touchstart', markTouch, { once: true, passive: true });

  const stickZone = document.getElementById('stickzone');
  const lookZone = document.getElementById('lookzone');
  const STICK_R = 48;

  stickZone.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    stickId = t.identifier; stickCX = t.clientX; stickCY = t.clientY;
    stickEl.style.display = 'block';
    stickEl.style.left = stickCX + 'px'; stickEl.style.top = stickCY + 'px';
  }, { passive: false });
  stickZone.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== stickId) continue;
      let dx = t.clientX - stickCX, dy = t.clientY - stickCY;
      const m = Math.hypot(dx, dy);
      if (m > STICK_R) { dx *= STICK_R / m; dy *= STICK_R / m; }
      knobEl.style.left = `calc(50% + ${dx}px)`; knobEl.style.top = `calc(50% + ${dy}px)`;
      touch.mx = dx / STICK_R; touch.mz = dy / STICK_R;
    }
  }, { passive: false });
  const stickEnd = e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== stickId) continue;
      stickId = null; touch.mx = 0; touch.mz = 0;
      stickEl.style.display = 'none';
      knobEl.style.left = '50%'; knobEl.style.top = '50%';
    }
  };
  stickZone.addEventListener('touchend', stickEnd);
  stickZone.addEventListener('touchcancel', stickEnd);

  lookZone.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    lookId = t.identifier; lookPX = t.clientX; lookPY = t.clientY;
  }, { passive: false });
  lookZone.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== lookId) continue;
      touch.lookDX += t.clientX - lookPX; touch.lookDY += t.clientY - lookPY;
      lookPX = t.clientX; lookPY = t.clientY;
      lookStamp.touch = performance.now(); lastLook = 'touch';
    }
  }, { passive: false });
  const lookEnd = e => { for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; };
  lookZone.addEventListener('touchend', lookEnd);
  lookZone.addEventListener('touchcancel', lookEnd);

  for (const [id, prop] of [['btnfire', 'fire'], ['btnjump', 'jump']]) {
    const el = document.getElementById(id);
    el.addEventListener('touchstart', e => { e.preventDefault(); touch[prop] = true; }, { passive: false });
    el.addEventListener('touchend', e => { e.preventDefault(); touch[prop] = false; }, { passive: false });
    el.addEventListener('touchcancel', () => { touch[prop] = false; });
  }

  /* ---------- gamepad ---------- */
  const DEAD = 0.16;
  function dz(v) { return Math.abs(v) > DEAD ? v : 0; }
  function readPad() {
    for (const gp of navigator.getGamepads?.() ?? []) {
      if (gp && gp.connected) return gp;
    }
    return null;
  }

  /* One command frame for the player slot. dt in seconds, sens 1–10. */
  function poll(dt, sens) {
    const out = { mx: 0, mz: 0, lookDX: 0, lookDY: 0, fire: false, jump: false };

    // move: keyboard + touch stick + left pad stick (summed, opposite keys cancel)
    let kx = 0, kz = 0;
    if (keys.has('KeyA')) kx -= 1;
    if (keys.has('KeyD')) kx += 1;
    if (keys.has('KeyW')) kz -= 1;
    if (keys.has('KeyS')) kz += 1;
    out.mx = kx + touch.mx; out.mz = kz + touch.mz;

    const gp = readPad();
    if (gp) {
      out.mx += dz(gp.axes[0] ?? 0);
      out.mz += dz(gp.axes[1] ?? 0);
      const rx = dz(gp.axes[2] ?? 0), ry = dz(gp.axes[3] ?? 0);
      if (rx || ry) { lookStamp.pad = performance.now(); lastLook = 'pad'; }
      if (gp.buttons[7]?.value > 0.4 || gp.buttons[7]?.pressed) out.fire = true; // RT
      if (gp.buttons[0]?.pressed) out.jump = true;                               // A
      // stash pad look for the latest-wins pick below
      gpLookX = rx; gpLookY = ry;
    } else { gpLookX = 0; gpLookY = 0; }

    const m = Math.hypot(out.mx, out.mz);
    if (m > 1) { out.mx /= m; out.mz /= m; }

    // look: latest-method-wins
    const sensScale = 0.0011 * (0.4 + sens * 0.12);
    if (lastLook === 'mouse') { out.lookDX = mouseDX * sensScale; out.lookDY = mouseDY * sensScale; }
    else if (lastLook === 'touch') { out.lookDX = touch.lookDX * sensScale * 2.2; out.lookDY = touch.lookDY * sensScale * 2.2; }
    else if (lastLook === 'pad') { out.lookDX = gpLookX * dt * (1.2 + sens * 0.25); out.lookDY = gpLookY * dt * (1.0 + sens * 0.2); }
    mouseDX = 0; mouseDY = 0; touch.lookDX = 0; touch.lookDY = 0;

    out.fire = out.fire || mouseFire || touch.fire;
    out.jump = out.jump || keys.has('Space') || touch.jump;
    return out;
  }
  let gpLookX = 0, gpLookY = 0;

  /* Gamepad menu navigation edge detection. */
  let navPrev = { up: false, down: false, a: false, b: false };
  function pollMenuNav() {
    const gp = readPad();
    if (!gp) return null;
    const y = gp.axes[1] ?? 0;
    const cur = {
      up: y < -0.6 || gp.buttons[12]?.pressed,
      down: y > 0.6 || gp.buttons[13]?.pressed,
      a: gp.buttons[0]?.pressed,
      b: gp.buttons[1]?.pressed,
    };
    const edge = {
      up: cur.up && !navPrev.up, down: cur.down && !navPrev.down,
      a: cur.a && !navPrev.a, b: cur.b && !navPrev.b,
    };
    navPrev = cur;
    return edge;
  }

  return { poll, pollMenuNav, keys, get touchActive() { return touch.active; }, get hasPad() { return !!readPad(); } };
}
