// Palm City voice: draw a clip's loudness over time as text (one character per 50 ms) to see pauses,
// breaths and tails without listening.   node tools/vo/envelope.mjs id [id ...]
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import fs from "fs"; import path from "path"; import url from "url";
const DIR = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..", "assets", "vo");
const b = await chromium.launch(); const p = await b.newPage(); await p.setContent("<html></html>");
for (const id of process.argv.slice(2)) {
  const b64 = fs.readFileSync(path.join(DIR, id + ".mp3")).toString("base64");
  const s = await p.evaluate(async b64 => {
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const buf = await new OfflineAudioContext(1, 1, 24000).decodeAudioData(u.buffer);
    const d = buf.getChannelData(0), W = Math.round(buf.sampleRate * 0.05), fr = [];
    for (let i = 0; i + W <= d.length; i += W) { let q = 0; for (let j = i; j < i + W; j++) q += d[j] * d[j]; fr.push(Math.sqrt(q / W)); }
    const top = Math.max(...fr);
    return fr.map(v => v < top * 0.03 ? "." : v < top * 0.12 ? "-" : v < top * 0.35 ? "=" : "#").join("");
  }, b64);
  console.log(id.padEnd(22), s);
}
await b.close();
