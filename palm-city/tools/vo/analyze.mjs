// Palm City voice: measure every clip in assets/vo (Chromium's own decoder, same as the game) and write
// assets/vo/manifest.json — where the speech starts and ends (the generator pads lines with up to a second
// and a half of silence, and now and then a click), the long pauses it leaves between sentences (cut down
// to a beat, so a shout lands like a shout), a gain that brings every line to the same loudness, the
// subtitle, and the story's "who|text" → clip map. Flags clips whose length doesn't fit their text.
//   node tools/vo/analyze.mjs
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import fs from "fs"; import path from "path"; import url from "url";
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const GAME = path.join(HERE, "..", "..");
const DIR = path.join(GAME, "assets", "vo");
const spec = JSON.parse(fs.readFileSync(path.join(HERE, "spec.json"), "utf8"));
const files = new Set(fs.readdirSync(DIR).filter(f => f.endsWith(".mp3")).map(f => f.slice(0, -4)));
// takes where the generator garbled a run-up before the real line (found by transcribing each part):
// the line proper starts at this many seconds into the file
const FROM = { d_standdown: 2.1, o_desmond_arrest: 1.7, o_reid_hands: 2.0, ped_archie_hit: 2.2, ped_celine_cops: 1.95, ped_cillian_gun: 1.85 };
// the longest pause to leave between two parts of a line
const PAUSE = { dispatch: 0.18, officer: 0.2, ped: 0.22, story: 0.5 };
const b = await chromium.launch();
const p = await b.newPage();
await p.setContent("<html></html>");
const clips = {}, sub = {}, story = {}, odd = [];
const TARGET = 0.11;                                     // speech RMS every line is brought to
for (const e of spec) {
  if (!files.has(e.id)) continue;
  const b64 = fs.readFileSync(path.join(DIR, e.id + ".mp3")).toString("base64");
  const r = await p.evaluate(async ([b64, from, pause]) => {
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const buf = await new OfflineAudioContext(1, 1, 24000).decodeAudioData(u.buffer);
    const d = buf.getChannelData(0), sr = buf.sampleRate, W = Math.round(sr * 0.01);
    // 10 ms frames: speech is where a frame's RMS clears a floor relative to the loudest frame
    const fr = []; for (let i = 0; i + W <= d.length; i += W) { let s = 0; for (let j = i; j < i + W; j++) s += d[j] * d[j]; fr.push(Math.sqrt(s / W)); }
    const f0 = Math.round(from * 100);
    let top = 0; for (let i = f0; i < fr.length; i++) top = Math.max(top, fr[i]);
    const th = Math.max(0.006, top * 0.05);
    // runs of speech (gaps under a quarter second are just between words)
    let seg = [];
    for (let i = f0; i < fr.length; i++) if (fr[i] >= th) {
      const l = seg[seg.length - 1];
      if (l && i - l[1] <= 25) l[1] = i; else seg.push([i, i]);
    }
    // a lone click or breath out on its own at either end isn't part of the line
    const loud = g => { let m = 0; for (let i = g[0]; i <= g[1]; i++) m = Math.max(m, fr[i]); return m; };
    const stray = (g, gap) => gap > 40 && (g[1] - g[0] < 15 || loud(g) < top * 0.25);
    while (seg.length > 1 && stray(seg[seg.length - 1], seg[seg.length - 1][0] - seg[seg.length - 2][1])) seg.pop();
    while (seg.length > 1 && stray(seg[0], seg[1][0] - seg[0][1])) seg.shift();
    const a = seg.length ? seg[0][0] : f0, z = seg.length ? seg[seg.length - 1][1] : fr.length - 1;
    // long pauses between the parts: keep a beat either side, skip the rest
    const cuts = [], keep = Math.round(pause * 50);       // (frames each side: half the pause)
    for (let k = 1; k < seg.length; k++) {
      const g0 = seg[k - 1][1] + 1, g1 = seg[k][0];
      if (g1 - g0 > pause * 100 + 10) cuts.push((g0 + keep) / 100, (g1 - keep) / 100);
    }
    let s2 = 0, n = 0, pk = 0; for (let i = a; i <= z; i++) { if (fr[i] > th) { s2 += fr[i] * fr[i]; n++; } }
    for (let i = a * W; i < (z + 1) * W && i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
    return { dur: d.length / sr, a: a * W / sr, z: (z + 1) * W / sr, rms: Math.sqrt(s2 / Math.max(1, n)), pk, cuts };
  }, [b64, FROM[e.id] || 0, PAUSE[e.group]]);
  const start = Math.max(FROM[e.id] || 0, r.a - 0.03), end = Math.min(r.dur, r.z + 0.06);
  const gain = Math.min(TARGET / Math.max(r.rms, 1e-4), 0.95 / Math.max(r.pk, 1e-4), 4);
  clips[e.id] = [+start.toFixed(3), +end.toFixed(3), +gain.toFixed(2), ...r.cuts.map(t => +t.toFixed(2))];
  sub[e.id] = e.sub;
  if (e.group === "story") story[e.who + "|" + e.sub] = e.id;
  // a normal read is ~10-20 letters a second; well outside that, listen to it
  let len = end - start; for (let k = 0; k < r.cuts.length; k += 2) len -= r.cuts[k + 1] - r.cuts[k];
  const cps = e.text.replace(/[^A-Za-z]/g, "").length / len;
  if (e.text.length > 6 && (cps < 6 || cps > 26)) odd.push([e.id, len.toFixed(2) + "s", cps.toFixed(1) + " letters/s", e.text]);
}
await b.close();
const man = { v: 2, clips, sub, story,
  voices: { officer: ["reid", "dylan", "desmond"], m: ["archie", "emmett", "cillian"], f: ["celine", "juno", "maeve"] } };
fs.writeFileSync(path.join(DIR, "manifest.json"), JSON.stringify(man));
const ls = Object.values(clips).map(c => { let l = c[1] - c[0]; for (let k = 3; k < c.length; k += 2) l -= c[k + 1] - c[k]; return l; });
console.log(Object.keys(clips).length, "clips; speech", Math.min(...ls).toFixed(2), "-", Math.max(...ls).toFixed(2), "s; pauses tightened in",
  Object.values(clips).filter(c => c.length > 3).length, "; manifest", fs.statSync(path.join(DIR, "manifest.json")).size, "bytes");
console.log("check these:", odd.length ? "" : "none"); for (const o of odd) console.log("  ", o.join("  "));
