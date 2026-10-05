// Palm City — the police radio. While they're after you, dispatch talks: where you are, what you're in,
// which way you're heading, when they lose you and when they've got you back, the chopper coming up,
// roadblocks, spike strips, the PIT, officers going on foot, and how it ends. Every line is spoken (the
// browser's own voice, keyed up with a burst of radio squelch) and shown as a subtitle, so it works with
// the sound off too. It only ever says what's actually happening.
import { DIRECTORY } from "./phoneapps.js";
import { areaName } from "./phone.js";

const pick = a => a[(Math.random() * a.length) | 0];
const COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
const TYPE = { sports: "sports car", sedan: "sedan", suv: "SUV", compact: "compact", pickup: "pickup", van: "van", taxi: "taxi", muscle: "muscle car", bus: "bus", motorbike: "motorbike", truck: "truck" };

// a car's colour in words a dispatcher would use
function colourName(hex) {
  if (hex === undefined || hex === null) return "";
  const r = (hex >> 16 & 255) / 255, g = (hex >> 8 & 255) / 255, b = (hex & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 0.08) return l > 0.8 ? "white" : l > 0.55 ? "silver" : l > 0.22 ? "grey" : "black";
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
  return h < 15 || h >= 340 ? "red" : h < 40 ? "orange" : h < 65 ? "yellow" : h < 160 ? "green" : h < 200 ? "teal" : h < 255 ? "blue" : h < 300 ? "purple" : "pink";
}

export function makePoliceRadio(g) {
  // g: { crime, footcops, roadblocks, focus() -> {x,z,car,vx,vz,h,speed}, squelch(), muted(), subtitle(text) }
  const S = g.crime.S;
  let prev = null, gapT = 0, updT = 10, q = [];
  let voice = null, talkT = 0;              // talkT: how long since we last started speaking

  function where(x, z) {
    let best = null, bd = 140 * 140;
    for (const p of DIRECTORY) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = p; } }
    return best ? "near " + best.name : "in " + areaName(x, z);
  }
  function heading(F) {
    const vx = F.vx || 0, vz = F.vz || 0, sp = Math.hypot(vx, vz);
    const a = sp > 2 ? Math.atan2(vx, -vz) : Math.atan2(Math.sin(F.h || 0), -Math.cos(F.h || 0));   // world north is -z
    return COMPASS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
  }
  function suspect(F) {
    if (!F.car) return "on foot";
    const c = F.car, kind = c.kind === "bike" ? "motorbike" : c.kind ? c.kind : (TYPE[c.type] || "vehicle");
    const col = colourName(c.color); return "in a " + (col ? col + " " : "") + kind;
  }
  // queue a line: higher priority first; anything that's gone stale by the time it'd be said is dropped
  function say(text, pri = 1) {
    if (q.length && q.some(l => l.text === text)) return;
    q.push({ text, pri, t: 0 }); q.sort((a, b) => b.pri - a.pri); if (q.length > 3) q.length = 3;
  }
  function speak(text) {
    g.subtitle("📻 <b>DISPATCH</b> · " + text);
    if (g.muted() || typeof speechSynthesis === "undefined") return;
    g.squelch();
    if (!voice) { const vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)); voice = vs.find(v => /male|daniel|fred|alex|david/i.test(v.name)) || vs[0] || null; }
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.rate = 1.15; u.pitch = 0.82; u.volume = 0.8;
    u.onend = () => g.squelch(0.6);
    speechSynthesis.speak(u); talkT = 0;
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
      if (cur.wanted > 0 && prev.wanted === 0) say(pick(["All units, suspect reported " + at + ". Suspect " + suspect(F) + ".", "Dispatch to all units: we have a suspect " + at + ", " + suspect(F) + "."]), 3);
      else if (cur.wanted > prev.wanted && cur.wanted > 0) {
        const L = { 2: ["Suspect is not stopping. Requesting additional units.", "Suspect evading. More units responding."],
          3: ["Shots fired! All units, code three.", "Suspect is armed. Lethal force authorized."],
          4: ["Air unit, we need you over " + areaName(F.x, F.z) + ".", "Suspect is extremely dangerous. All available units."],
          5: ["SWAT is rolling. Clear the streets.", "Military support inbound. Take him down."] }[cur.wanted];
        if (L) say(pick(L), 3);
      }
      if (cur.wanted > 0 && cur.searching && !prev.searching) say(pick(["We've lost visual. Units, search the area " + at + ".", "Suspect out of sight. Set up a perimeter " + at + ".", "Lost him. Last seen " + at + ", heading " + heading(F) + "."]), 2);
      if (cur.wanted > 0 && !cur.searching && prev.searching) say(pick(["Visual on suspect! " + at + ".", "I've got eyes on him, " + at + "!", "Suspect spotted " + at + ". Moving in."]), 3);
      if (cur.heli && !prev.heli) say(pick(["Air One is overhead. We have eyes on the suspect.", "Air unit on scene, lighting him up."]), 2);
      if (cur.tank && !prev.tank) say("SWAT armour deployed. All units, keep your distance.", 2);
      if (cur.block && !prev.block) say(pick(["Roadblock is set, " + at + ". Box him in.", "Units are blocking the road ahead. Spike strip down."]), 2);
      if (cur.flat > prev.flat) say(pick(["Spikes got him! Suspect's tyres are out.", "He hit the strip! Tyres are shredded."]), 2);
      if (cur.pits > prev.pits) say(pick(["PIT maneuver successful!", "Spun him out! Move in, move in!"]), 3);
      if (cur.foot > prev.foot) say(pick(["Suspect on foot, I'm in pursuit!", "He's running! Foot pursuit!", "Bailing out, going after him on foot."]), 2);
      if (cur.wanted === 0 && prev.wanted > 0) {
        const e = S.ended; S.ended = null;
        if (e === "busted") say(pick(["Suspect is in custody. Good work, everyone.", "We got him. Suspect in custody."]), 4);
        else if (e === "wasted") say("Suspect is down. Send a medic.", 4);
        else if (e === "lost") say(pick(["All units, we've lost the suspect. Resume patrol.", "Search called off. Suspect is gone."]), 4);
        else say(pick(["Description doesn't match anything out here. Stand down.", "All units, call it off. Return to patrol."]), 4);   // a fresh paint job, a word from the lawyer…
      }
      // the running commentary while they're on you
      updT -= dt;
      if (cur.wanted > 0 && !cur.searching && updT <= 0) {
        updT = 13 + Math.random() * 6;
        const sp = Math.hypot(F.vx || 0, F.vz || 0) * 3.6;
        say(pick([
          "Suspect heading " + heading(F) + " " + at + ", " + suspect(F) + ".",
          "Suspect " + suspect(F) + ", " + heading(F) + "bound " + at + ".",
          sp > 120 ? "He's doing over " + Math.round(sp / 10) * 10 + " k's, heading " + heading(F) + "!" : "Units in pursuit " + at + ", heading " + heading(F) + ".",
        ]), 1);
      }
      if (cur.wanted === 0) updT = 8;
    }
    prev = cur;
    // say the next thing once the air's clear (and drop anything that's old news)
    gapT -= dt;
    for (const l of q) l.t += dt;
    q = q.filter(l => l.t < 6 || l.pri >= 4);
    // (the voice can hold the next line back, but never for long: some devices never report it finished)
    talkT += dt;
    const busy = typeof speechSynthesis !== "undefined" && speechSynthesis.speaking && talkT < 7;
    if (q.length && gapT <= 0 && !busy) {
      const l = q.shift(); speak(l.text); gapT = 3.5 + l.text.length * 0.045;
    }
  }
  return { update, _q: () => q };
}
