/* HUD: subscribes to the event bus + per-frame sync from sim state.
   Every critical signal ≥2 channels (color + shape + sound). */
import * as THREE from 'three';
import { CONFIG, STRINGS } from './config.js';
import { EV } from './core/events.js';

const $ = id => document.getElementById(id);

const CROSSHAIRS = { default: '+', dot: '•', hex: '⬡', chevron: '︿' };

export function createHud() {
  const els = {
    crosshair: $('crosshair'), pips: $('pips').children, shieldfx: $('shieldfx'),
    scYou: $('sc-you'), scFoe: $('sc-foe'), raceYou: $('race-you'), raceFoe: $('race-foe'),
    timer: $('timer'), feed: $('feed'), banner: $('banner'), countdown: $('countdown'),
    refusal: $('refusal'), boost: $('boost'), leadermark: $('leadermark'), rankbadge: $('rankbadge'),
  };
  let bloomT = 0, bannerT = 0, refusalT = 0, cdT = 0, shieldFxT = 0, hurt = false;
  let leaderT = 0, leaderPos = null;
  let shake = 0, shakeEnabled = true, flashEnabled = true;
  let playerId = 0;
  const _v = new THREE.Vector3();

  function feed(text, cls = '') {
    const d = document.createElement('div');
    d.textContent = text;
    if (cls) d.className = cls;
    els.feed.prepend(d);
    while (els.feed.children.length > 5) els.feed.lastChild.remove();
    setTimeout(() => d.remove(), 5000);
  }
  function banner(text, cls = '', secs = 2) {
    els.banner.textContent = text;
    els.banner.className = cls;
    els.banner.style.opacity = 1;
    bannerT = secs;
  }

  function attach(bus, pid, slots) {
    playerId = pid;
    bus.on(EV.HIT, e => {
      if (e.shooter === playerId) { els.crosshair.classList.add('bloom'); bloomT = .15; }
      if (e.victim === playerId) {
        hurt = true; shieldFxT = .35;
        if (shakeEnabled) shake = .5;
      }
    });
    bus.on(EV.TAG, e => {
      if (e.shooter === playerId) feed(STRINGS.youTagged(slots[e.victim].name), 'good');
      else if (e.victim === playerId) feed(STRINGS.taggedYou(slots[e.shooter].name), 'bad');
      else feed(STRINGS.tagged(slots[e.shooter].name, slots[e.victim].name));
      if (e.victim === playerId && flashEnabled) { hurt = true; shieldFxT = .7; }
      if (e.victim === playerId && shakeEnabled) shake = 1;
    });
    bus.on(EV.PAD_TAKEN, e => {
      if (e.slot === playerId) { els.boost.textContent = STRINGS.powerPadYou; }
      banner(STRINGS.powerPadTaken(slots[e.slot].name), 'green', 1.6);
    });
    bus.on(EV.MATCH_POINT, e => banner(STRINGS.matchPoint, e.slot === playerId ? 'cyan' : '', 2.4));
    bus.on(EV.LEADER_PING, e => {
      if (e.slot !== playerId) { leaderPos = e.pos; leaderT = 2.5; feed(STRINGS.leaderPing(e.name)); }
    });
    bus.on(EV.COUNTDOWN, e => {
      els.countdown.textContent = e.n > 0 ? e.n : STRINGS.countdownGo;
      els.countdown.style.opacity = 1;
      cdT = e.n > 0 ? 1 : .6;
    });
    bus.on(EV.REFUSAL, e => {
      if (e.slot === playerId) refusalT = .8;
    });
  }

  /* per-frame */
  function update(dt, sim, camera, t) {
    const slots = sim.state.slots;
    const me = slots[playerId];

    // shield pips: color + shape channel
    const sh = me.shield;
    for (let i = 0; i < 3; i++) {
      const el = els.pips[i];
      el.className = sh >= i + 1 ? '' : (sh > i ? 'regen' : 'off');
    }
    // screen-edge vignette = shield state backup channel
    if (shieldFxT > 0) {
      shieldFxT -= dt;
      els.shieldfx.classList.toggle('hurt', hurt);
      els.shieldfx.style.opacity = flashEnabled ? Math.min(shieldFxT * 3, .9) : Math.min(shieldFxT, .4);
    } else if (sh < CONFIG.shieldMax) {
      els.shieldfx.classList.remove('hurt');
      els.shieldfx.style.opacity = .25 * (1 - sh / CONFIG.shieldMax) + .1;
      hurt = false;
    } else { els.shieldfx.style.opacity = 0; hurt = false; }

    // score race bar: you (cyan) vs leading bot (magenta)
    let foe = null;
    for (const s of slots) if (s.id !== playerId && (!foe || s.score > foe.score)) foe = s;
    els.scYou.textContent = me.score;
    els.scFoe.textContent = foe ? foe.score : 0;
    els.raceYou.style.width = (me.score / sim.state.scoreLimit * 50) + '%';
    els.raceFoe.style.width = ((foe ? foe.score : 0) / sim.state.scoreLimit * 50) + '%';

    const left = Math.max(sim.state.timeLimit - sim.state.time, 0);
    els.timer.textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;

    if (bloomT > 0) { bloomT -= dt; if (bloomT <= 0) els.crosshair.classList.remove('bloom'); }
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) els.banner.style.opacity = 0; }
    if (cdT > 0) { cdT -= dt; if (cdT <= 0) els.countdown.style.opacity = 0; }

    // refusals visible: fire during respawn shows the reason
    if (!me.alive) {
      els.refusal.textContent = STRINGS.respawning(Math.ceil(me.respawnT));
      els.refusal.style.opacity = .9;
    } else if (refusalT > 0) {
      refusalT -= dt;
      els.refusal.textContent = STRINGS.fireRefusedRespawn;
      els.refusal.style.opacity = refusalT > 0 ? .9 : 0;
    } else els.refusal.style.opacity = 0;

    els.boost.style.opacity = me.padBoostT > 0 ? (Math.sin(t * 6) * .25 + .75) : 0;
    if (me.padBoostT > 0) els.boost.textContent = `2X POINTS — ${Math.ceil(me.padBoostT)}s`;

    // leader ping marker (projected)
    if (leaderT > 0 && leaderPos) {
      leaderT -= dt;
      _v.set(leaderPos.x, leaderPos.y + 2.2, leaderPos.z).project(camera);
      const onScreen = _v.z < 1;
      const x = Math.min(Math.max((_v.x * .5 + .5) * innerWidth, 40), innerWidth - 40);
      const y = Math.min(Math.max((-_v.y * .5 + .5) * innerHeight, 40), innerHeight - 40);
      els.leadermark.style.display = 'block';
      els.leadermark.style.left = (onScreen ? x : innerWidth - x) + 'px';
      els.leadermark.style.top = (onScreen ? y : 80) + 'px';
      if (leaderT <= 0) els.leadermark.style.display = 'none';
    }

    // camera shake (accessibility toggle)
    if (shake > 0) {
      shake = Math.max(shake - dt * 4, 0);
      return shake;
    }
    return 0;
  }

  function setCrosshair(kind) { els.crosshair.textContent = CROSSHAIRS[kind] ?? CROSSHAIRS.default; }
  function setRankBadge(text) {
    els.rankbadge.style.display = text ? 'block' : 'none';
    if (text) els.rankbadge.textContent = text;
  }
  function setToggles({ shake: s, flash: f }) { shakeEnabled = s; flashEnabled = f; }
  function reset() {
    els.feed.innerHTML = ''; els.banner.style.opacity = 0; els.refusal.style.opacity = 0;
    els.boost.style.opacity = 0; els.countdown.style.opacity = 0;
    els.leadermark.style.display = 'none'; els.shieldfx.style.opacity = 0;
    els.crosshair.classList.remove('bloom');
  }

  return { attach, update, feed, banner, setCrosshair, setRankBadge, setToggles, reset };
}
