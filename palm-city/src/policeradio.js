// Palm City — the police radio. While they're after you, dispatch talks: where you are, what you're in,
// which way you're heading, when they lose you and when they've got you back, the chopper coming up,
// roadblocks, spike strips, the PIT, officers going on foot, and how it ends. It's a real voice: every
// line is built from recorded phrases the way a dispatcher's are ("Suspect heading" + "north" + "near
// Palm Customs.") and played over the radio (vo.js), with the words as a subtitle too, so it works with
// the sound off. (Without the recordings, the browser's own voice reads it.) It only ever says what's
// actually happening.
import { DIRECTORY } from "./phoneapps.js";
import { areaName } from "./phone.js";

const pick = a => a[(Math.random() * a.length) | 0];
const COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
// every phrase she has, word for word as recorded (tools/vo/spec.json)
const SAY = {
  d_reported: "All units, we have a suspect", d_heading: "Suspect heading", d_vehicle: "Suspect vehicle,", d_on_foot: "Suspect is on foot.",
  d_pursuit: "Units in pursuit,", d_lost: "We've lost visual. Units, search the area.", d_perimeter: "Suspect is out of sight. Set up a perimeter.",
  d_spotted: "Visual on suspect! Moving in.", d_eyes: "Units have eyes on the suspect.", d_air: "Air One is overhead. We have eyes on the suspect.",
  d_swat_armor: "SWAT armour deployed. All units, keep your distance.", d_roadblock: "Roadblock is set. Box him in.",
  d_spikes: "Spikes got him! Suspect's tyres are out.", d_pit: "PIT maneuver successful! Move in.", d_foot: "Suspect is on foot. Officers in pursuit.",
  d_custody: "Suspect is in custody. Good work, everyone.", d_down: "Suspect is down. Send a medic.", d_gone: "All units, we've lost the suspect. Resume patrol.",
  d_standdown: "All units, call it off. Return to patrol.", d_w2: "Suspect is not stopping. Requesting additional units.",
  d_w3: "Shots fired! All units, code three.", d_w4: "Suspect is extremely dangerous. Air support requested.", d_w5: "SWAT is rolling. Clear the streets.",
  d_speed: "Suspect is travelling at high speed!",
  p_customs: "near Palm Customs.", p_guns: "near Ammu-Palm.", p_clothes: "near Threads.", p_barber: "near Fade City.", p_tattoo: "near Ink and Palms.",
  p_hospital: "near Palm General.", p_police: "near the police station.", p_gas: "near Palm Fuel.", p_arcade: "near Palm Bowl.",
  p_gallery: "near the Palm Gallery.", p_plaza: "near the Plaza.",
  a_downtown: "downtown.", a_midtown: "in midtown.", a_east: "in the east end.", a_west: "on the west side.", a_north: "in the north blocks.", a_beach: "on the beachfront.",
  t_sedan: "sedan.", t_sports: "sports car.", t_suv: "SUV.", t_motorbike: "motorbike.", t_pickup: "pickup.", t_van: "van.", t_vehicle: "vehicle.",
};
for (const h of COMPASS) SAY["h_" + h] = h;
const PLACE = { guns: "p_guns", clothes: "p_clothes", barber: "p_barber", tattoo: "p_tattoo", customs: "p_customs", hospital: "p_hospital", police: "p_police",
  gas1: "p_gas", gas2: "p_gas", arcade: "p_arcade", gallery: "p_gallery", fountain: "p_plaza" };
const AREA = { "the beachfront": "a_beach", downtown: "a_downtown", "the west side": "a_west", "the east end": "a_east", "the north blocks": "a_north", midtown: "a_midtown" };
// what a vehicle is called on the radio (anything she has no word for is just a "vehicle")
const TYPE = { sedan: "t_sedan", taxi: "t_sedan", sports: "t_sports", coupe: "t_sports", muscle: "t_sports", suv: "t_suv", pickup: "t_pickup",
  van: "t_van", ambulance: "t_van", motorbike: "t_motorbike" };

// a car's colour in words a dispatcher would use
function colourName(hex) {
  if (hex === undefined || hex === null) return "";
  const r = (hex >> 16 & 255) / 255, g = (hex >> 8 & 255) / 255, b = (hex & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 0.08) return l > 0.8 ? "white" : l > 0.55 ? "silver" : l > 0.22 ? "grey" : "black";
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
  return h < 15 || h >= 340 ? "red" : h < 40 ? "orange" : h < 65 ? "yellow" : h < 160 ? "green" : h < 200 ? "teal" : h < 255 ? "blue" : h < 300 ? "purple" : "pink";
}
// the phrases joined into what she says: "Units have eyes on the suspect." + "near the Plaza." reads as one sentence
function words(ids) {
  let s = "";
  for (const id of ids) {
    const t = SAY[id] || "";
    if (!s) s = t;
    else if (/^[a-z]/.test(t) && /\.$/.test(s)) s = s.slice(0, -1) + " " + t;
    else s += " " + t;
  }
  return s;
}

export function makePoliceRadio(g) {
  // g: { crime, footcops, roadblocks, vo, focus() -> {x,z,car,vx,vz,h,speed}, squelch(), muted(), subtitle(text, secs) }
  const S = g.crime.S;
  let prev = null, gapT = 0, updT = 10, q = [], footT = 0;
  let voice = null, talkT = 0, tts = false;            // talkT: since we last started speaking; tts: that was the browser's voice

  function where(x, z) {
    let best = null, bd = 140 * 140;
    for (const p of DIRECTORY) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd && PLACE[p.id]) { bd = d; best = p; } }
    return best ? PLACE[best.id] : AREA[areaName(x, z)] || "a_midtown";
  }
  function heading(F) {
    const vx = F.vx || 0, vz = F.vz || 0, sp = Math.hypot(vx, vz);
    const a = sp > 2 ? Math.atan2(vx, -vz) : Math.atan2(Math.sin(F.h || 0), -Math.cos(F.h || 0));   // world north is -z
    return "h_" + COMPASS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
  }
  // the suspect's description: on foot, or what they're driving (colour if she can name it)
  function suspect(F) {
    if (!F.car) return ["d_on_foot"];
    const c = F.car;
    if (c.kind && c.kind !== "bike") return [];                // a boat, a chopper: she just says where
    const t = c.kind === "bike" ? "t_motorbike" : TYPE[c.type] || "t_vehicle", col = colourName(c.color);
    return ["d_vehicle", ...(col ? ["c_" + col] : []), t];
  }
  // queue a line: higher priority first; anything that's gone stale by the time it'd be said is dropped
  function say(ids, pri = 1) {
    const text = words(ids);
    if (q.some(l => l.text === text)) return;
    q.push({ ids, text, pri, t: 0 }); q.sort((a, b) => b.pri - a.pri); if (q.length > 3) q.length = 3;
  }
  function speak(l) {
    let dur = g.vo ? g.vo.radio(l.ids) : 0;
    tts = false;
    if (!dur && !g.muted() && typeof speechSynthesis !== "undefined") {
      // no recordings to hand: the browser reads it, keyed up with a burst of squelch
      g.squelch();
      if (!voice) { const vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)); voice = vs.find(v => /male|daniel|fred|alex|david/i.test(v.name)) || vs[0] || null; }
      const u = new SpeechSynthesisUtterance(l.text);
      if (voice) u.voice = voice;
      u.rate = 1.15; u.pitch = 0.82; u.volume = 0.8;
      u.onend = () => g.squelch(0.6);
      speechSynthesis.speak(u); tts = true;
      dur = l.text.length * 0.06;
    }
    g.subtitle("📻 <b>DISPATCH</b> · " + l.text, Math.max(3, (dur || l.text.length * 0.06) + 1.2));
    talkT = 0;
    return dur;
  }

  function update(dt) {
    const F = g.focus();
    const cur = {
      wanted: S.wanted, searching: S.searching, heli: g.crime.heli.active && !g.crime.heli.fall, pits: S.pits || 0,
      foot: g.footcops ? g.footcops.officers.filter(o => o.mode === "chase").length : 0,
      block: g.roadblocks ? g.roadblocks.B.active : false, flat: F.car ? (F.car.flat || 0) : 0, units: g.crime.units.filter(u => u.active && !u.tank).length,
      tank: g.crime.units.some(u => u.tank && u.active),
    };
    if (prev) {
      const at = where(F.x, F.z);
      if (cur.wanted > 0 && prev.wanted === 0) say(["d_reported", at, ...suspect(F)], 3);
      else if (cur.wanted > prev.wanted && cur.wanted > 0 && cur.wanted <= 5) say(["d_w" + Math.max(2, cur.wanted)], 3);
      if (cur.wanted > 0 && cur.searching && !prev.searching) say([pick(["d_lost", "d_perimeter"])], 2);
      if (cur.wanted > 0 && !cur.searching && prev.searching) say(pick([["d_spotted"], ["d_eyes", at]]), 3);
      if (cur.heli && !prev.heli) say(["d_air"], 2);
      if (cur.tank && !prev.tank) say(["d_swat_armor"], 2);
      if (cur.block && !prev.block) say(["d_roadblock"], 2);
      if (cur.flat > prev.flat) say(["d_spikes"], 2);
      if (cur.pits > prev.pits) say(["d_pit"], 3);
      if (cur.foot > 0 && prev.foot === 0 && footT <= 0) { say(["d_foot"], 2); footT = 25; }   // (once, as they first get out)
      if (cur.wanted === 0 && prev.wanted > 0) {
        const e = S.ended; S.ended = null;
        say([e === "busted" ? "d_custody" : e === "wasted" ? "d_down" : e === "lost" ? "d_gone" : "d_standdown"], 4);   // (else: a fresh paint job, a word from the lawyer…)
      }
      // the running commentary while they're on you
      updT -= dt;
      if (cur.wanted > 0 && !cur.searching && updT <= 0) {
        updT = 13 + Math.random() * 6;
        const sp = Math.hypot(F.vx || 0, F.vz || 0) * 3.6;
        say(sp > 120 && Math.random() < 0.5 ? ["d_speed"] : pick([["d_heading", heading(F), at], ["d_pursuit", at, ...suspect(F)], ["d_heading", heading(F), at]]), 1);
      }
      if (cur.wanted === 0) updT = 8;
    }
    prev = cur;
    if (footT > 0) footT -= dt;
    // say the next thing once the air's clear (and drop anything that's old news)
    gapT -= dt;
    for (const l of q) l.t += dt;
    q = q.filter(l => l.t < 6 || l.pri >= 4);
    // (the browser's voice can hold the next line back, but never for long: some devices never report it finished)
    talkT += dt;
    const busy = tts && typeof speechSynthesis !== "undefined" && speechSynthesis.speaking && talkT < 7;
    if (q.length && gapT <= 0 && !busy) {
      const l = q.shift(), dur = speak(l); gapT = Math.max(dur, 1.5) + 1.4;
    }
  }
  return { update, _q: () => q, words };
}
