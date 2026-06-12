/* Persistence: localStorage key lsa_save_v1
   {rank, rp, challenges, unlocks, settings, firstLaunch} + loadout. */
import { CONFIG, STRINGS } from './config.js';

const KEY = 'lsa_save_v1';

const DEFAULTS = {
  rank: { tier: 0, div: 0, rp: 0, shielded: false }, // div 0=III, 1=II, 2=I
  challenges: {},          // id → true
  unlocks: { beam: ['cyan'], crosshair: ['default'] },
  loadout: { beam: 'cyan', crosshair: 'default' },
  settings: { sens: 5, music: 6, sfx: 8, shake: true, flash: true, hc: false, tscale: 10 },
  firstLaunch: true,
};

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const data = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULTS), ...data,
      rank: { ...DEFAULTS.rank, ...data.rank },
      unlocks: { ...structuredClone(DEFAULTS.unlocks), ...data.unlocks },
      loadout: { ...DEFAULTS.loadout, ...data.loadout },
      settings: { ...DEFAULTS.settings, ...data.settings },
    };
  } catch { return structuredClone(DEFAULTS); }
}

export function persist(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode */ }
}

export function rankName(rank) {
  return `${STRINGS.tiers[rank.tier]} ${STRINGS.divisions[rank.div]}`;
}
export function rankBadgeShort(rank) {
  return STRINGS.tiers[rank.tier][0] + ' ' + STRINGS.divisions[rank.div];
}
export function rankDifficulty(rank) {
  return CONFIG.rankDifficulty[STRINGS.tiers[rank.tier]];
}

/* Ranked RP math. Returns {delta, events:[...]} and mutates save.rank. */
export function applyRankedResult(save, won, margin) {
  const r = save.rank;
  const ev = [];
  let delta;
  if (won) {
    delta = CONFIG.rpWin + Math.min(Math.max(margin, 0) * CONFIG.rpPerMargin, CONFIG.rpMarginCap);
    r.rp += delta;
    r.shielded = false;
    while (r.rp >= CONFIG.rpPerDivision) {
      if (r.tier === STRINGS.tiers.length - 1 && r.div === 2) { r.rp = CONFIG.rpPerDivision - 1; break; }
      r.rp -= CONFIG.rpPerDivision;
      r.div++;
      if (r.div > 2) { r.div = 0; r.tier++; ev.push(['rankUp', STRINGS.tiers[r.tier]]); }
      else ev.push(['rankUp', rankName(r)]);
    }
  } else {
    delta = r.tier === STRINGS.tiers.length - 1 ? CONFIG.rpLossChampion : CONFIG.rpLoss;
    if (r.rp + delta < 0) {
      if (r.rp > 0) r.rp = 0;
      else if (!r.shielded) { r.shielded = true; ev.push(['shield']); } // demotion shield: 1 free loss at 0
      else if (r.tier === 0 && r.div === 0) r.rp = 0;
      else {
        r.shielded = false;
        r.div--;
        if (r.div < 0) { r.div = 2; r.tier--; }
        r.rp = 60;
        ev.push(['rankDown', rankName(r)]);
      }
    } else r.rp += delta;
  }
  return { delta, events: ev };
}
