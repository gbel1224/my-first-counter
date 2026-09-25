// Keyboard, mouse (pointer lock) and touch controls merged into one intent object.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();      // edge-triggered this frame
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.buttons = new Set();
    this.move = { x: 0, y: 0 };
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.enabled = false;
    this.locked = false;
    this.lookTouch = null;
    this.stickTouch = null;
    this.stick = { x: 0, y: 0 };

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      this.pressed.add(k);
      if ([' ', 'tab'].includes(k) && this.enabled) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); });

    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked && !this.touch) this.lock();
      this.buttons.add(e.button);
      this.pressed.add('mouse' + e.button);
    });
    addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      } else if (this.buttons.has(0) || this.buttons.has(2)) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    canvas.addEventListener('wheel', (e) => { this.wheel = (this.wheel || 0) + Math.sign(e.deltaY); }, { passive: true });

    if (this.touch) this.setupTouch();
  }

  lock() {
    try {
      const p = this.canvas.requestPointerLock?.();
      p?.catch?.(() => {});
    } catch { /* pointer lock is optional */ }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  setupTouch() {
    document.body.classList.add('touch');
    const stick = document.getElementById('stick');
    const knob = stick.querySelector('i');
    const center = () => {
      const r = stick.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
    };
    stick.addEventListener('touchstart', (e) => {
      this.stickTouch = e.changedTouches[0].identifier;
      e.preventDefault();
    }, { passive: false });
    const moveStick = (t) => {
      const c = center();
      let dx = (t.clientX - c.x) / c.r;
      let dy = (t.clientY - c.y) / c.r;
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      this.stick.x = dx;
      this.stick.y = dy;
      knob.style.transform = `translate(${dx * 36}px, ${dy * 36}px)`;
    };
    addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stickTouch) moveStick(t);
        else if (t.identifier === this.lookTouch?.id) {
          this.mouseDX += (t.clientX - this.lookTouch.x) * 1.6;
          this.mouseDY += (t.clientY - this.lookTouch.y) * 1.6;
          this.lookTouch.x = t.clientX;
          this.lookTouch.y = t.clientY;
        }
      }
    }, { passive: true });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stickTouch) {
          this.stickTouch = null;
          this.stick.x = this.stick.y = 0;
          knob.style.transform = '';
        }
        if (t.identifier === this.lookTouch?.id) this.lookTouch = null;
      }
    };
    addEventListener('touchend', end);
    addEventListener('touchcancel', end);
    this.canvas.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      if (!this.lookTouch) this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
    }, { passive: true });
    const bind = (id, key, hold = false) => {
      const el = document.getElementById(id);
      el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.pressed.add(key);
        if (hold) this.keys.add(key);
      }, { passive: false });
      el.addEventListener('touchend', () => { if (hold) this.keys.delete(key); });
    };
    bind('tAttack', 'mouse0');
    bind('tDodge', ' ');
    bind('tBlock', 'block', true);
    bind('tPotion', 'q');
    bind('tEmber', 'e');
  }

  // Build this frame's intent.
  frame() {
    let x = 0;
    let y = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) y += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) y -= 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    x += this.stick.x;
    y -= this.stick.y;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    const has = (k) => this.pressed.has(k);
    const intent = {
      moveX: x,
      moveY: y,
      sprint: this.keys.has('shift') || (this.touch && Math.hypot(this.stick.x, this.stick.y) > 0.95),
      attack: has('mouse0') || has('j'),
      block: this.buttons.has(2) || this.keys.has('k') || this.keys.has('block'),
      blockPressed: has('mouse2') || has('k') || has('block'),
      dodge: has(' ') || has('l'),
      ember: has('e'),
      potion: has('q'),
      interact: has('f'),
      pause: has('escape') || has('p'),
      lookX: this.mouseDX,
      lookY: this.mouseDY,
      zoom: this.wheel || 0,
    };
    this.pressed.clear();
    this.mouseDX = this.mouseDY = 0;
    this.wheel = 0;
    return intent;
  }
}
