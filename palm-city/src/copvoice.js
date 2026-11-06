// Palm City — what the police shout. Officers on foot call it as they come after you (out of the
// cruiser: "Police! Stop right there!"; on your heels: "Freeze! Don't move!", "He's running! After him!";
// guns up from three stars: "Drop the weapon!"; the tackle: "Get on the ground!" … "You're under
// arrest!"). A cruiser on your bumper works its loudspeaker ("Pull over! Pull over now!"); stopped and
// boxed in, it's "Get out of the car! Now!". Fire near them: "Shots fired!"; one of theirs goes down:
// "Officer down! I need backup!". Each officer keeps his voice; it comes from where he stands (vo.js),
// with a bubble over him.
const pick = a => a[(Math.random() * a.length) | 0];

export function makeCopVoice(g) {
  // g: { crime, footcops, vo, focus(), armed(), muted(), subs(), bubble(who, text, secs) }
  const S = g.crime.S;
  let pullT = 5, shotT = 0, downT = 0, lastBust = 0, grabT = 0, footT = 0;   // footT: the officers on foot take turns
  const later = [];                                  // lines waiting their moment: { who, key, t, opts }

  // one line from an officer or a cruiser; 0 if it couldn't be heard (too far, too many talking)
  function say(who, key, opts = {}) {
    const id = g.vo.copLine(who, key); if (!id) return 0;
    let d = g.vo.shout(id, who.x, who.z, who, { urgent: true, ...opts });
    if (!d && !g.muted()) return 0;
    d = d || g.vo.len(id);
    if (g.subs()) g.bubble(who, g.vo.sub(id), d + 0.5);
    return d;
  }
  const cruisers = () => g.crime.units.filter(u => u.active && !u.tank);
  function nearest(list, F, R) {
    let best = null, bd = R * R;
    for (const u of list) { const d = (u.x - F.x) ** 2 + (u.z - F.z) ** 2; if (d < bd) { bd = d; best = u; } }
    return best;
  }

  function update(dt) {
    const F = g.focus();
    for (let i = later.length - 1; i >= 0; i--) { const l = later[i]; if ((l.t -= dt) <= 0) { later.splice(i, 1); if (S.wanted > 0 && !l.who.dead) say(l.who, l.key, l.opts); } }
    if (shotT > 0) shotT -= dt;
    if (grabT > 0) grabT -= dt;
    if (footT > 0) footT -= dt;
    if (downT > 0) downT -= dt;
    if (S.wanted <= 0) { pullT = 5; lastBust = 0; later.length = 0; for (const o of g.footcops.officers) o._vm = null; return; }
    // ---- officers on foot: one at a time, the nearest with something to say (just out of the car, guns
    // coming up) going first, every couple of seconds between them ----
    let who = null, wd = 46;
    for (const o of g.footcops.officers) {
      if (o.mode === "off" || o.hidden) { o._vm = null; continue; }
      if (o.dead) { if (!o._vDown) { o._vDown = true; officerDown(o); } continue; }
      o._vDown = false;
      if (o.mode !== "chase") { o._vm = o.mode; continue; }
      if (o._vm !== "chase") { o._vm = "chase"; o._vT = 0.4 + Math.random() * 0.5; o._first = true; o._aimed = false; }   // just out of the car
      o._vT -= dt;
      const d = Math.hypot(o.x - F.x, o.z - F.z) - (o._first || (o.aimT > 0 && !o._aimed) ? 30 : 0);
      if (o._vT <= 0 && o.sees && o.knocked <= 0 && d < wd) { wd = d; who = o; }
    }
    if (who && footT <= 0) {
      const o = who;
      let key;
      if (o.aimT > 0 && !o._aimed) { o._aimed = true; key = g.armed() ? pick(["drop", "drop", "armed"]) : "hands"; }
      else if (o._first) { o._first = false; key = pick(["stop", "stop", "freeze"]); }
      else key = (F.speed || 0) > 4 ? pick(["running", "stop", "freeze"]) : pick(["freeze", "hands", "ground"]);
      if (say(o, key)) { o._vT = 6 + Math.random() * 4; footT = 2.2 + Math.random() * 1.4; } else { o._vT = 1.5 + Math.random(); footT = 0.6; }
    }
    // ---- cruisers ----
    const near = nearest(cruisers().filter(u => u.sees), F, 30);
    pullT -= dt;
    if (F.car && near && (F.speed || 0) > 3 && S.wanted <= 3 && !S.searching && pullT <= 0) pullT = say(near, "pull", { pa: true }) ? 9 + Math.random() * 7 : 2;
    // a grab begins (stopped with them on you): the order to get out, or to freeze
    if (S.bustT > 0.2 && lastBust <= 0.2 && near && grabT <= 0) {
      grabT = 6;
      if (F.car) say(near, "car", { pa: true });
      else if (!g.footcops.grabbing()) say(near, pick(["freeze", "hands", "ground"]), { pa: true });
    }
    lastBust = S.bustT;
  }
  // one of theirs is down: whoever's close calls it in
  function officerDown(o) {
    if (downT > 0) return;
    const F = g.focus();
    const mate = nearest(g.footcops.officers.filter(m => m !== o && m.mode === "chase" && !m.dead && !m.hidden), o, 60) || nearest(cruisers(), o, 70);
    if (mate && Math.hypot(mate.x - F.x, mate.z - F.z) < 80) { later.push({ who: mate, key: "down", t: 0.6, opts: {} }); downT = 10; }
  }
  // you opened fire: the nearest officer with eyes on you calls it
  function shot() {
    if (shotT > 0 || S.wanted <= 0) return;
    const F = g.focus();
    const o = nearest(g.footcops.officers.filter(m => m.mode === "chase" && m.sees && !m.dead && !m.hidden), F, 50) || nearest(cruisers().filter(u => u.sees), F, 55);
    if (!o) return;
    shotT = 9;
    say(o, S.wanted >= 3 ? pick(["shots", "shots", "armed"]) : pick(["shots", "drop", "armed"]), o.foot ? {} : { pa: true });
  }
  // an officer brings you down: the order, then the words
  function tackle(o) { say(o, "ground"); later.push({ who: o, key: "arrest", t: 1.5, opts: {} }); }
  return { update, shot, tackle, say };
}
