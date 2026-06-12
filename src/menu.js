/* Menu: navigation (keyboard/mouse/touch/gamepad), settings wiring, ranked card,
   challenges grid, loadout pickers. Keeps menu.html's exact structure & styling. */
import { STRINGS, BEAM_COLORS } from './config.js';
import { rankName, rankBadgeShort, persist } from './save.js';

const $ = id => document.getElementById(id);

export function createMenu({ save, audio, onStart }) {
  const screens = document.querySelectorAll('.screen');

  function go(id) {
    screens.forEach(s => s.classList.toggle('active', s.id === id));
    const f = document.querySelector('.screen.active .btn');
    if (f) f.focus();
    if (id === 'ranked') refreshRanked();
    if (id === 'challenges') refreshChallenges();
    if (id === 'settings') refreshLoadout();
  }

  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { audio.ensure(); go(b.dataset.go); }));
  document.querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', () => {
    audio.ensure();
    const a = b.dataset.action;
    if (a === 'quick') onStart('quick');
    else if (a === 'ranked') onStart('ranked');
    else if (a === 'rematch') onStart(lastMode);
  }));
  let lastMode = 'quick';

  document.addEventListener('keydown', e => {
    if (document.body.classList.contains('ingame')) return;
    if (e.code === 'Enter' && $('title').classList.contains('active')) go('single');
    if (e.code === 'Escape') { const back = document.querySelector('.screen.active .btn.back'); if (back) back.click(); }
  });

  /* ---------- settings ---------- */
  const s = save.settings;
  const bindRange = (id, key, apply) => {
    const el = $(id);
    el.value = s[key];
    apply(s[key]);
    el.addEventListener('input', () => { s[key] = +el.value; apply(s[key]); persist(save); });
  };
  const bindToggle = (id, key, apply) => {
    const el = $(id);
    const sync = () => { el.classList.toggle('on', s[key]); el.setAttribute('aria-checked', s[key]); apply(s[key]); };
    sync();
    const flip = () => { s[key] = !s[key]; sync(); persist(save); };
    el.addEventListener('click', flip);
    el.addEventListener('keydown', e => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); flip(); } });
  };
  bindRange('set-sens', 'sens', () => {});
  bindRange('set-music', 'music', v => audio.setMusic(v));
  bindRange('set-sfx', 'sfx', v => audio.setSfx(v));
  bindRange('set-tscale', 'tscale', v => document.documentElement.style.setProperty('--uiscale', v / 10));
  bindToggle('set-shake', 'shake', () => {});
  bindToggle('set-flash', 'flash', () => {});
  bindToggle('set-hc', 'hc', v => document.body.classList.toggle('hc', v));

  /* ---------- ranked card ---------- */
  function refreshRanked() {
    const r = save.rank;
    $('rk-badge').textContent = rankBadgeShort(r);
    $('rk-name').textContent = rankName(r);
    const loss = r.tier === STRINGS.tiers.length - 1 ? 20 : 15;
    $('rk-info').textContent = `${r.rp} / 100 RP · Win +20 (+margin) · Loss −${loss}${r.shielded ? ' · shield used' : ''}`;
    $('rk-bar').style.width = r.rp + '%';
    document.querySelectorAll('#rk-ladder span').forEach(el =>
      el.classList.toggle('now', el.dataset.tier === STRINGS.tiers[r.tier]));
  }

  /* ---------- challenges grid ---------- */
  function refreshChallenges() {
    document.querySelectorAll('.ch').forEach(el => {
      const id = el.dataset.ch;
      const isDone = !!save.challenges[id];
      el.classList.toggle('done', isDone);
      const b = el.querySelector('b');
      const base = STRINGS.challenges[id].name;
      b.textContent = isDone ? '✓ ' + base : base;
    });
  }

  /* ---------- loadout (challenge unlocks) ---------- */
  const CROSS_OPTS = ['default', 'dot', 'hex', 'chevron'];
  function refreshLoadout() {
    const beamWrap = $('lo-beam'), crossWrap = $('lo-cross');
    beamWrap.innerHTML = ''; crossWrap.innerHTML = '';
    for (const name of Object.keys(BEAM_COLORS)) {
      const btn = document.createElement('button');
      btn.textContent = name;
      const owned = save.unlocks.beam.includes(name);
      btn.classList.toggle('lock', !owned);
      btn.classList.toggle('now', save.loadout.beam === name);
      if (owned) btn.addEventListener('click', () => { save.loadout.beam = name; persist(save); refreshLoadout(); });
      beamWrap.appendChild(btn);
    }
    for (const name of CROSS_OPTS) {
      const btn = document.createElement('button');
      btn.textContent = name;
      const owned = save.unlocks.crosshair.includes(name);
      btn.classList.toggle('lock', !owned);
      btn.classList.toggle('now', save.loadout.crosshair === name);
      if (owned) btn.addEventListener('click', () => { save.loadout.crosshair = name; persist(save); refreshLoadout(); });
      crossWrap.appendChild(btn);
    }
  }

  /* ---------- results ---------- */
  function showResults({ over, won, meScore, rp, toasts }) {
    go('results');
    $('res-title').textContent = over.winner === null ? STRINGS.draw : (won ? STRINGS.victory : STRINGS.defeat);
    const rows = over.scores.slice().sort((a, b) => b.score - a.score)
      .map(sc => `<p style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="color:${sc.id === 0 ? 'var(--cyan)' : 'var(--magenta)'}">${sc.name}</span>
        <span>${sc.score} tags · ${Math.round(sc.accuracy * 100)}% acc · ${sc.deaths} downs</span></p>`).join('');
    let rpLine = '';
    if (rp) {
      rpLine = `<p style="margin-top:10px"><b style="color:#ffd866">${rankName(save.rank)}</b>
        · ${STRINGS.rpDelta(rp.delta)}${rp.events.some(e => e[0] === 'shield') ? ' · ' + STRINGS.demotionShield : ''}</p>`;
    }
    $('res-body').innerHTML = `<h3>${over.reason === 'time' ? STRINGS.timeUp : STRINGS.finalScore}</h3>${rows}${rpLine}`;
    const tw = $('res-toasts');
    tw.innerHTML = '';
    for (const t of toasts) {
      const d = document.createElement('div');
      d.className = 'ch done';
      d.innerHTML = `<b>✓ ${STRINGS.challengeDone(t.name)}</b><p>${STRINGS.unlocked(t.unlock)}</p>`;
      tw.appendChild(d);
    }
  }

  /* ---------- gamepad navigation ---------- */
  function gamepadNav(edge) {
    if (!edge) return;
    const active = document.querySelector('.screen.active');
    if (!active) return;
    const btns = [...active.querySelectorAll('.btn:not(.locked)')];
    if (!btns.length) return;
    let idx = btns.indexOf(document.activeElement);
    if (edge.down) { idx = (idx + 1) % btns.length; btns[idx].focus(); }
    if (edge.up) { idx = idx <= 0 ? btns.length - 1 : idx - 1; btns[idx].focus(); }
    if (edge.a) (document.activeElement?.classList.contains('btn') ? document.activeElement : btns[0]).click();
    if (edge.b) { const back = active.querySelector('.btn.back'); if (back) back.click(); }
  }

  // auto-show how-to once on first launch
  if (save.firstLaunch) {
    save.firstLaunch = false;
    persist(save);
    go('how');
  }

  return { go, showResults, gamepadNav, refreshRanked, setLastMode: m => { lastMode = m; } };
}
