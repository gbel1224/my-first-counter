/* Challenge tracking runs entirely off the event bus (TAG, PAD_TAKEN, MATCH_END)
   — zero coupling to gameplay code. Completion toasts at match end only. */
import { STRINGS } from './config.js';
import { EV } from './core/events.js';

export function createChallengeTracker(save, playerId) {
  const newlyDone = [];

  function done(id) {
    if (save.challenges[id] || newlyDone.includes(id)) return;
    newlyDone.push(id);
  }

  /* Subscribe to one match's bus. `getScores()` → [{id, score}] for deficit tracking. */
  function attach(bus, getScores) {
    const tagTimes = [];
    let padTakes = 0, maxDeficit = 0;

    bus.on(EV.TAG, e => {
      if (e.shooter === playerId) {
        if (e.firstTag) done('firstBlood');
        if (e.shooterAirborne) done('airborne');
        tagTimes.push(e.time);
        if (tagTimes.filter(t => e.time - t <= 30).length >= 3) done('hatTrick');
        if (tagTimes.length >= 15 && e.time < 120) done('speedrun');
      }
      const scores = getScores();
      let mine = 0, best = 0;
      for (const s of scores) {
        if (s.id === playerId) mine = s.score;
        else best = Math.max(best, s.score);
      }
      maxDeficit = Math.max(maxDeficit, best - mine);
    });
    bus.on(EV.PAD_TAKEN, e => {
      if (e.slot === playerId) { padTakes++; if (padTakes >= 3) done('padLord'); }
    });
    bus.on(EV.MATCH_END, e => {
      const me = e.scores.find(s => s.id === playerId);
      if (e.winner === playerId) {
        if (me.deaths === 0) done('flawless');
        if (me.accuracy >= 0.8) done('sharpshooter');
        if (maxDeficit >= 5) done('comebackKid');
      }
    });
  }

  /* Commit at match end: persist unlocks + return toast list [{name, unlock}]. */
  function commit() {
    const toasts = [];
    for (const id of newlyDone) {
      save.challenges[id] = true;
      const ch = STRINGS.challenges[id];
      const [kind, value] = ch.reward;
      if (!save.unlocks[kind].includes(value)) save.unlocks[kind].push(value);
      toasts.push({ name: ch.name, unlock: ch.unlock });
    }
    newlyDone.length = 0;
    return toasts;
  }

  return { attach, commit };
}
