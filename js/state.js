/* ============================================================
   Game state: creation, mutation helpers, and the life engine
   (aging + random events). No DOM here — pure game logic so it
   stays testable and reusable.
   ============================================================ */

import { COUNTRIES, BACKGROUNDS, LIFE_EVENTS, STAT_META } from "./data/gameData.js";

export const STAT_MIN = 0;
export const STAT_MAX = 100;
export const MAX_TRAITS = 2;

let state = null;

export function getState() { return state; }
export function setState(s) { state = s; return state; }

export const clamp = (n, lo = STAT_MIN, hi = STAT_MAX) => Math.max(lo, Math.min(hi, n));
export const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function findCountry(code) {
  return COUNTRIES.find((c) => c.code === code) || COUNTRIES[0];
}

/* Build a fresh character from the creator's choices. */
export function createCharacter({ firstName, lastName, gender, avatar, countryCode, backgroundId, traits }) {
  const country = findCountry(countryCode);
  const bg = BACKGROUNDS.find((b) => b.id === backgroundId) || BACKGROUNDS[1];

  // Base stats: a random roll, then background modifiers, then traits.
  const stats = {
    health: clamp(randInt(55, 85) + bg.statMods.health),
    happiness: clamp(randInt(55, 85) + bg.statMods.happiness),
    smarts: clamp(randInt(40, 80) + bg.statMods.smarts),
    looks: clamp(randInt(40, 80) + bg.statMods.looks),
  };

  applyTraitBonuses(stats, traits);

  const startMoney = Math.round(bg.startMoney * country.wealth);

  return {
    version: 1,
    createdAt: Date.now(),
    character: {
      firstName,
      lastName,
      gender,
      avatar,
      countryCode: country.code,
      background: bg.id,
      traits: [...traits],
      age: 0,
      alive: true,
      stats,
      money: startMoney,
      education: { level: "none", enrolled: false, collegeYears: 0 },
      job: null,
      bank: { savings: 0, loans: [], creditScore: 600 },
    },
    log: [
      {
        age: 0,
        type: "event",
        text: `${firstName} ${lastName} was born in ${country.flag} ${country.name} into a ${bg.name.toLowerCase()} household.`,
      },
    ],
  };
}

function applyTraitBonuses(stats, traits) {
  if (traits.includes("athletic")) stats.health = clamp(stats.health + 8);
  if (traits.includes("genius")) stats.smarts = clamp(stats.smarts + 10);
  if (traits.includes("charming")) stats.looks = clamp(stats.looks + 8);
  if (traits.includes("optimist")) stats.happiness = clamp(stats.happiness + 8);
}

/* Add a line to the life log (most recent first is handled by UI). */
export function addLog(type, text) {
  state.log.push({ age: state.character.age, type, text });
}

function applyStatDelta(deltas = {}) {
  const c = state.character;
  for (const [key, val] of Object.entries(deltas)) {
    if (key in c.stats) c.stats[key] = clamp(c.stats[key] + val);
  }
}

/* Advance one year: apply passive drift, maybe fire a random event. */
export function ageUp() {
  const c = state.character;
  if (!c.alive) return { events: [] };

  c.age += 1;
  const events = [];

  // Passive yearly drift — small, trait-aware.
  const drift = { happiness: randInt(-2, 2), smarts: 0 };
  if (c.age > 50) drift.health = -randInt(1, 3);        // aging
  if (c.traits.includes("athletic")) drift.health = (drift.health || 0) + 1;
  applyStatDelta(drift);

  // Chance of a random life event appropriate to the age.
  const eligible = LIFE_EVENTS.filter((e) => c.age >= e.minAge && c.age <= e.maxAge);
  let eventChance = 0.6;
  if (c.traits.includes("lucky")) eventChance += 0.1;

  if (eligible.length && Math.random() < eventChance) {
    let ev = pick(eligible);

    // Resilient softens bad events; lucky biases toward good ones.
    if (ev.type === "bad" && c.traits.includes("resilient") && Math.random() < 0.5) {
      const softened = pick(eligible.filter((e) => e.type !== "bad"));
      if (softened) ev = softened;
    }

    if (ev.stats) applyStatDelta(ev.stats);
    if (ev.money) c.money += ev.money;
    addLog(ev.type, ev.text);
    events.push(ev);
  } else {
    addLog("event", `Age ${c.age}: a quiet, uneventful year.`);
  }

  checkDeath();
  return { events, age: c.age };
}

function checkDeath() {
  const c = state.character;
  if (c.stats.health <= 0) {
    c.alive = false;
    addLog("bad", `${c.firstName} passed away at age ${c.age}. Rest in peace.`);
    return;
  }
  // Old-age mortality rises past 70.
  if (c.age >= 70) {
    const risk = (c.age - 70) * 0.03 + 0.02;
    if (Math.random() < risk) {
      c.alive = false;
      addLog("bad", `${c.firstName} died peacefully of old age at ${c.age}.`);
    }
  }
}

/* Life stage label for the current age — flavor for the UI. */
export function lifeStage(age) {
  if (age <= 3) return "Baby";
  if (age <= 12) return "Child";
  if (age <= 17) return "Teenager";
  if (age <= 25) return "Young Adult";
  if (age <= 59) return "Adult";
  return "Senior";
}

export { STAT_META };
