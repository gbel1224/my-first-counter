// DOM HUD, minimap, dialogue and menu screens.
import * as THREE from 'three';
import { WORLD, heightAt, pathDistance, grassMask, SEGMENTS } from './terrain.js';

const $ = (id) => document.getElementById(id);

export const CONTROLS = [
  ['WASD', 'Move'], ['Shift', 'Sprint'], ['Mouse', 'Look (click to capture)'], ['Left click', 'Attack, click again to combo'],
  ['Right click', 'Block, tap as a blow lands to parry'], ['Space', 'Dodge roll'], ['E', 'Ember Burst (when charged)'],
  ['Q', 'Drink a potion'], ['F', 'Talk / pick up'], ['Esc', 'Pause'],
];

export class UI {
  constructor() {
    this.el = {
      hud: $('hud'), quest: $('quest'), questLabel: $('questLabel'), questTitle: $('questTitle'), questText: $('questText'),
      level: $('level'), lvlName: $('lvlName'), xpText: $('xpText'), xpBar: document.querySelector('#xpbar i'),
      hpBar: $('hpBar'), hpText: $('hpText'), stBar: $('stBar'), emBar: $('emBar'), emberSlot: $('emberSlot'),
      potions: $('potionCount'), gold: $('gold'), prompt: $('prompt'), toast: $('toast'), boss: $('bossbar'), bossName: $('bossName'),
      dialogue: $('dialogue'), hurt: $('hurt'),
    };
    this.cache = {};
    this.map = $('mapCanvas');
    this.mapCtx = this.map.getContext('2d');
    this.mapImage = null;
    this.hurtLevel = 0;
    for (const id of ['keysPause', 'keysHelp']) {
      $(id).innerHTML = CONTROLS.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    }
  }

  set(key, value, fn) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    fn(value);
  }

  showHUD(on) {
    this.el.hud.classList.toggle('on', on);
  }

  bar(el, frac, key) {
    const f = Math.max(0, Math.min(1, frac));
    this.set(key, f.toFixed(3), () => {
      el.querySelector('i').style.transform = `scaleX(${f})`;
      const lag = el.querySelector('b');
      if (lag) lag.style.transform = `scaleX(${f})`;
    });
  }

  vitals(p) {
    this.bar(this.el.hpBar, p.hp / p.maxHp, 'hp');
    this.set('hpText', `${Math.ceil(p.hp)} / ${p.maxHp}`, (v) => { this.el.hpText.textContent = v; });
    this.bar(this.el.stBar, p.stamina / 100, 'st');
    this.bar(this.el.emBar, p.ember / 100, 'em');
    this.set('emFull', p.ember >= 100, (v) => {
      this.el.emBar.classList.toggle('full', v);
      this.el.emberSlot.classList.toggle('ready', v);
    });
    this.set('level', p.level, (v) => {
      this.el.level.textContent = v;
      this.el.lvlName.textContent = `Level ${v} Knight`;
    });
    this.set('xp', `${p.xp}/${p.xpNext}`, () => {
      this.el.xpText.textContent = `${p.xp} / ${p.xpNext} xp`;
      this.el.xpBar.style.width = `${(p.xp / p.xpNext) * 100}%`;
    });
    this.set('potions', p.potions, (v) => { this.el.potions.textContent = v; });
    this.set('gold', Math.floor(p.gold), (v) => { this.el.gold.textContent = `${v} gold`; });
  }

  quest(label, title, text) {
    this.el.quest.hidden = false;
    this.el.questLabel.textContent = label;
    this.el.questTitle.textContent = title;
    this.el.questText.innerHTML = text;
    this.el.quest.classList.remove('flash');
    void this.el.quest.offsetWidth;
    this.el.quest.classList.add('flash');
  }

  questText(text) {
    this.set('questText', text, (v) => { this.el.questText.innerHTML = v; });
  }

  toast(big, small = '') {
    const t = this.el.toast;
    t.querySelector('.big').textContent = big;
    t.querySelector('.small').textContent = small;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
  }

  prompt(text) {
    this.set('prompt', text || '', (v) => {
      this.el.prompt.hidden = !v;
      if (v) this.el.prompt.innerHTML = v;
    });
  }

  bossBar(boss) {
    if (!boss) {
      this.el.boss.hidden = true;
      this.cache.bossShown = false;
      return;
    }
    if (!this.cache.bossShown) {
      this.el.boss.hidden = false;
      this.el.bossName.textContent = boss.cfg.name;
      this.cache.bossShown = true;
    }
    this.bar(this.el.boss.querySelector('.bar'), boss.hp / boss.maxHp, 'boss');
  }

  hurt(amount) {
    this.hurtLevel = Math.min(1, this.hurtLevel + amount * 3 + 0.25);
  }

  tick(dt, hpFrac) {
    this.hurtLevel = Math.max(hpFrac < 0.3 ? 0.35 + 0.15 * Math.sin(performance.now() / 180) : 0, this.hurtLevel - dt * 1.4);
    this.set('hurt', this.hurtLevel.toFixed(2), (v) => { this.el.hurt.style.opacity = v; });
  }

  // ----- Minimap ---------------------------------------------------------------------
  buildMapImage() {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const N = SEGMENTS + 1;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const wx = (x / size - 0.5) * WORLD;
        const wz = (y / size - 0.5) * WORLD;
        const h = heightAt(wx, wz);
        const gi = Math.round(((wx + WORLD / 2) / WORLD) * SEGMENTS);
        const gj = Math.round(((wz + WORLD / 2) / WORLD) * SEGMENTS);
        const grass = grassMask[gj * N + gi] / 255;
        let r;
        let gg;
        let b;
        if (h < 0) { r = 40; gg = 86; b = 98; } else if (h > 22) { r = 110; gg = 102; b = 96; } else {
          r = 92 - grass * 30; gg = 104 + grass * 24; b = 60 - grass * 10;
        }
        if (pathDistance(wx, wz) < 2.4 && h > 0) { r = 176; gg = 146; b = 104; }
        const shade = 0.75 + Math.min(0.35, h / 60);
        const o = (y * size + x) * 4;
        img.data[o] = r * shade;
        img.data[o + 1] = gg * shade;
        img.data[o + 2] = b * shade;
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    this.mapImage = c;
  }

  minimap(player, camYaw, { npcs, enemies, objective }) {
    if (!this.mapImage) this.buildMapImage();
    const g = this.mapCtx;
    const S = this.map.width;
    const R = S / 2;
    const k = S / 90;                       // pixels per world unit (90 units across)
    const px = player.position.x;
    const pz = player.position.z;
    g.save();
    g.clearRect(0, 0, S, S);
    g.beginPath();
    g.arc(R, R, R - 4, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#1a1624';
    g.fillRect(0, 0, S, S);
    g.translate(R, R);
    g.rotate(camYaw);
    const imgScale = (WORLD / this.mapImage.width) * k;
    g.imageSmoothingEnabled = true;
    g.drawImage(this.mapImage, (-px - WORLD / 2) * k, (-pz - WORLD / 2) * k, this.mapImage.width * imgScale, this.mapImage.height * imgScale);
    const dot = (x, z, color, r) => {
      g.beginPath();
      g.arc((x - px) * k, (z - pz) * k, r, 0, Math.PI * 2);
      g.fillStyle = color;
      g.fill();
    };
    for (const e of enemies) {
      if (!e.alive) continue;
      dot(e.position.x, e.position.z, e.state === 'dormant' ? 'rgba(216,65,58,0.45)' : '#ff5b4a', e.radius > 1 ? 9 : 5);
    }
    for (const n of npcs) dot(n.position.x, n.position.z, '#ffc35a', 6);
    g.restore();

    // Objective marker, clamped to the rim.
    if (objective) {
      const dx = objective.x - px;
      const dz = objective.z - pz;
      let sx = (dx * Math.cos(camYaw) - dz * Math.sin(camYaw)) * k;
      let sy = (dx * Math.sin(camYaw) + dz * Math.cos(camYaw)) * k;
      const l = Math.hypot(sx, sy);
      const lim = R - 14;
      if (l > lim) { sx *= lim / l; sy *= lim / l; }
      g.save();
      g.translate(R + sx, R + sy);
      g.rotate(Math.PI / 4);
      g.fillStyle = '#ff7a2f';
      g.strokeStyle = '#1b0d05';
      g.lineWidth = 3;
      g.strokeRect(-7, -7, 14, 14);
      g.fillRect(-7, -7, 14, 14);
      g.restore();
    }
    // Player arrow.
    const a = player.actor.yaw - camYaw;
    g.save();
    g.translate(R, R);
    g.rotate(Math.atan2(Math.cos(a), Math.sin(a)) + Math.PI / 2);
    g.beginPath();
    g.moveTo(0, -13);
    g.lineTo(9, 10);
    g.lineTo(0, 5);
    g.lineTo(-9, 10);
    g.closePath();
    g.fillStyle = '#efe3c8';
    g.strokeStyle = '#100d18';
    g.lineWidth = 3;
    g.stroke();
    g.fill();
    g.restore();
    // North tick.
    g.save();
    g.translate(R, R);
    g.rotate(camYaw);
    g.fillStyle = '#efe3c8';
    g.font = '700 22px "Alegreya Sans SC", sans-serif';
    g.textAlign = 'center';
    g.fillText('n', 0, -R + 26);
    g.restore();
    g.beginPath();
    g.arc(R, R, R - 4, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(239,227,200,0.35)';
    g.lineWidth = 3;
    g.stroke();
  }

  // ----- Dialogue ------------------------------------------------------------------------
  // lines: [{ who, text, choices?: [{ label, value }] }] -> resolves with the last choice value.
  talk(lines, audio) {
    const box = this.el.dialogue;
    const who = box.querySelector('.who');
    const line = box.querySelector('.line');
    const choices = box.querySelector('.choices');
    const next = box.querySelector('.next');
    box.hidden = false;
    return new Promise((resolve) => {
      let i = 0;
      let typing = null;
      let answer = null;
      const finishLine = () => {
        clearInterval(typing);
        typing = null;
        const l = lines[i];
        line.textContent = l.text;
        if (l.choices && !choices.children.length) {
          l.choices.forEach((c, n) => {
            const b = document.createElement('button');
            b.className = 'btn' + (c.ghost ? ' ghost' : '');
            b.textContent = `${n + 1}. ${c.label}`;
            b.addEventListener('click', (e) => {
              e.stopPropagation();
              answer = c.value;
              step();
            });
            choices.appendChild(b);
          });
        }
      };
      const show = () => {
        const l = lines[i];
        who.textContent = l.who;
        line.textContent = '';
        choices.innerHTML = '';
        next.hidden = !!l.choices;
        let n = 0;
        typing = setInterval(() => {
          n += 2;
          line.textContent = l.text.slice(0, n);
          if (n % 6 === 0) audio?.talk();
          if (n >= l.text.length) finishLine();
        }, 22);
      };
      const step = () => {
        i++;
        if (i >= lines.length) {
          cleanup();
          resolve(answer);
          return;
        }
        show();
      };
      const advance = () => {
        if (typing) return finishLine();
        if (lines[i].choices) return;          // must pick an answer
        step();
      };
      const onKey = (e) => {
        const k = e.key.toLowerCase();
        if (k === 'f' || k === 'enter' || k === ' ') {
          e.preventDefault();
          advance();
          return;
        }
        const l = lines[i];
        if (l?.choices && !typing && /^[1-9]$/.test(k) && l.choices[+k - 1]) {
          answer = l.choices[+k - 1].value;
          step();
        }
      };
      const onClick = () => advance();
      const cleanup = () => {
        clearInterval(typing);
        box.hidden = true;
        removeEventListener('keydown', onKey);
        box.removeEventListener('click', onClick);
      };
      addEventListener('keydown', onKey);
      box.addEventListener('click', onClick);
      show();
    });
  }

  screen(id, on) {
    $(id).hidden = !on;
  }

  stats(p, seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    $('stats').innerHTML = [
      ['time', `${m}:${String(s).padStart(2, '0')}`], ['level', p.level], ['skeletons felled', p.stats.kills],
      ['damage dealt', p.stats.damage], ['parries', p.stats.parries], ['falls', p.stats.deaths],
    ].map(([k, v]) => `<div><span class="label">${k}</span><b>${v}</b></div>`).join('');
  }
}

export function worldToScreen(v, camera) {
  const p = v.clone().project(camera);
  return new THREE.Vector2((p.x * 0.5 + 0.5) * innerWidth, (-p.y * 0.5 + 0.5) * innerHeight);
}
