// Palm City — the logic behind the newer phone apps (Maps, PalmRide, Camera, Empire). No DOM:
// phoneui.js draws them; main.js does the things that touch the world (moving you, the camera).
import { PLACES } from "./places.js";

// ---- the directory: everywhere worth going, by kind ----
// (businesses and homes are added from the game's own lists, so they say whether they're yours)
export const DIRECTORY = [
  ["guns", "🔫", "Ammu-Palm", "Guns & ammo"],
  ["clothes", "👕", "Threads", "Clothes"],
  ["barber", "💈", "Fade City", "Haircuts & dye"],
  ["tattoo", "🖋️", "Ink & Palms", "Tattoos"],
  ["customs", "🔧", "Palm Customs", "Car mods & paint"],
  ["hospital", "🏥", "Palm General", "Hospital"],
  ["police", "🚓", "PCPD", "Police station"],
  ["gas1", "⛽", "Palm Fuel (west)", "Gas"],
  ["gas2", "⛽", "Palm Fuel (east)", "Gas"],
  ["arcade", "🎳", "Palm Bowl", "Bowling & arcade"],
  ["gallery", "🖼️", "Palm Gallery", "Art gallery"],
  ["fountain", "⛲", "The Plaza", "City centre"],
].filter(([id]) => PLACES[id]).map(([id, ico, name, sub]) => ({ id, ico, name, sub, x: PLACES[id].x, z: PLACES[id].z, face: PLACES[id].face }));

// ---- PalmRide: a flat pickup fee plus the meter ----
export const RIDE_BASE = 25, RIDE_PER_M = 0.09;
export const fare = d => Math.round(RIDE_BASE + d * RIDE_PER_M);

// ---- Camera: what makes a shot worth liking ----
// s: { wanted, fire, night, beach, car, carType, crowd, landmark, selfie, cops }
// returns { score, tags[] } — the tags become the caption's hashtags
export function rateShot(s) {
  let score = 10; const tags = [];
  if (s.selfie) { score += 8; tags.push("#selfie"); }
  if (s.wanted > 0) { score += 25 * s.wanted; tags.push("#onthelam"); }
  if (s.cops > 0) { score += 6 * Math.min(6, s.cops); tags.push("#pcpd"); }
  if (s.fire) { score += 40; tags.push("#chaos"); }
  if (s.beach) { score += 12; tags.push("#beachlife"); }
  if (s.night) { score += 10; tags.push("#citylights"); }
  if (s.car === "sports" || s.carType === "sports") { score += 18; tags.push("#whips"); }
  else if (s.car) { score += 6; tags.push("#cruising"); }
  if (s.crowd >= 6) { score += 8; tags.push("#crowd"); }
  if (s.landmark) { score += 14; tags.push("#" + s.landmark); }
  if (!tags.length) tags.push("#palmcity");
  return { score, tags };
}
// how many likes a post earns: what's in it, scaled by how many people follow you
// (fatigue: posts in the last minute — the same audience scrolls past a flood)
export const reachOf = followers => 1.5 + Math.sqrt(Math.max(0, followers)) * 0.9;
export const expectLikes = (score, followers, fatigue = 0) => Math.max(1, Math.round(score * reachOf(followers) / (1 + fatigue * 0.6)));
export function likesFor(score, followers, fatigue = 0) {
  return Math.max(1, Math.round(expectLikes(score, followers, fatigue) * (0.75 + Math.random() * 0.5)));
}
// a slice of everyone who liked it starts following
export const followGain = likes => likes * 0.3;

// ---- sponsors: brands pay once you're worth paying ----
export const SPONSORS = [
  { at: 100, brand: "Big Bun Burgers", pay: 500 },
  { at: 500, brand: "Palm Taxi Co.", pay: 2000 },
  { at: 2000, brand: "Neon Palms Club", pay: 6000 },
  { at: 8000, brand: "Bayside Marina", pay: 15000 },
  { at: 25000, brand: "Vigil Security Grp", pay: 40000 },
];
// the deals you've just crossed into (st.sponsor counts the ones already paid)
export function newSponsors(st) {
  const out = [];
  while ((st.sponsor || 0) < SPONSORS.length && (st.followers || 0) >= SPONSORS[st.sponsor || 0].at) { out.push(SPONSORS[st.sponsor || 0]); st.sponsor = (st.sponsor || 0) + 1; }
  return out;
}
export const nextSponsor = st => SPONSORS[st.sponsor || 0] || null;

// ---- the lawyer and the doctor ----
export const LAWYER_PER_STAR = 1000, LAWYER_MAX = 3, DOCTOR_FEE = 300;
