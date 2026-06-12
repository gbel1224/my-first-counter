/* Event bus: gameplay publishes, audio/UI/challenges subscribe — zero coupling. */
export const EV = {
  FIRE: 'FIRE', HIT: 'HIT', TAG: 'TAG', RESPAWN: 'RESPAWN',
  PAD_TAKEN: 'PAD_TAKEN', JUMP_PAD: 'JUMP_PAD',
  MATCH_POINT: 'MATCH_POINT', MATCH_START: 'MATCH_START', MATCH_END: 'MATCH_END',
  LEADER_PING: 'LEADER_PING', COUNTDOWN: 'COUNTDOWN',
  SHIELD_BREAK: 'SHIELD_BREAK', RANK_CHANGE: 'RANK_CHANGE',
  CHALLENGE_DONE: 'CHALLENGE_DONE', REFUSAL: 'REFUSAL',
};

export function createBus() {
  const subs = new Map();
  return {
    on(type, fn) {
      if (!subs.has(type)) subs.set(type, new Set());
      subs.get(type).add(fn);
      return () => subs.get(type).delete(fn);
    },
    emit(type, payload) {
      const set = subs.get(type);
      if (set) for (const fn of set) fn(payload);
    },
    clear() { subs.clear(); },
  };
}
