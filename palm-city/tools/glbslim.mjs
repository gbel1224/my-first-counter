// Slim a GLB for the web: keep only the facial blendshapes the game drives (positions only, no
// morph normals), re-encode textures as WebP at most `max` px, and repack the binary chunk.
//   node tools/glbslim.mjs in.glb out.glb [maxTexturePx]
// Image re-encoding runs in headless Chromium (no native image libraries needed).
import fs from "fs";
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";

const [, , inp, out, maxArg] = process.argv;
const MAX = +(maxArg || 1024);
export const KEEP = new Set(("browDownLeft browDownRight browInnerUp browOuterUpLeft browOuterUpRight cheekSquintLeft cheekSquintRight cheekPuff " +
  "eyeBlinkLeft eyeBlinkRight eyeSquintLeft eyeSquintRight eyeWideLeft eyeWideRight eyesClosed " +
  "eyeLookDownLeft eyeLookDownRight eyeLookUpLeft eyeLookUpRight eyeLookInLeft eyeLookInRight eyeLookOutLeft eyeLookOutRight " +
  "jawOpen mouthOpen mouthClose mouthFunnel mouthPucker mouthSmile mouthSmileLeft mouthSmileRight mouthFrownLeft mouthFrownRight " +
  "mouthStretchLeft mouthStretchRight mouthUpperUpLeft mouthUpperUpRight mouthLowerDownLeft mouthLowerDownRight mouthRollLower mouthPressLeft mouthPressRight " +
  "noseSneerLeft noseSneerRight tongueOut viseme_aa viseme_O viseme_E viseme_U viseme_PP viseme_FF").split(" "));

const b = fs.readFileSync(inp);
const jl = b.readUInt32LE(12);
const J = JSON.parse(b.subarray(20, 20 + jl).toString());
const binStart = 20 + jl + 8;
const BIN = b.subarray(binStart, binStart + b.readUInt32LE(20 + jl));

// 1. blendshapes: keep the shapes we drive, and only on meshes they actually move
for (const m of J.meshes) {
  const names = (m.extras && m.extras.targetNames) || null;
  const nT = Math.max(0, ...m.primitives.map(p => (p.targets || []).length));
  if (!nT) continue;
  const moves = i => m.primitives.some(p => { const t = p.targets && p.targets[i]; if (!t) return false; const a = J.accessors[t.POSITION]; return !a.min || !a.max || Math.max(...a.min.map(Math.abs), ...a.max.map(Math.abs)) > 2e-4; });
  // lashes and brows only need to follow the lids and brows
  const nm = m.name.toLowerCase(), only = /lash/.test(nm) ? /^(eyeBlink|eyesClosed|eyeWide|eyeSquint)/ : /brow/.test(nm) ? /^(brow|eyeBlink|eyesClosed|eyeSquint)/ : null;
  const keepIdx = [...Array(nT).keys()].filter(i => (!names || (KEEP.has(names[i]) && (!only || only.test(names[i])))) && moves(i));
  for (const p of m.primitives) {
    if (!p.targets) continue;
    p.targets = keepIdx.map(i => ({ POSITION: p.targets[i].POSITION }));
    if (!p.targets.length) delete p.targets;
  }
  if (names) { m.extras.targetNames = keepIdx.map(i => names[i]); if (!keepIdx.length) delete m.extras.targetNames; }
  if (m.weights) { m.weights = keepIdx.map(i => m.weights[i]); if (!keepIdx.length) delete m.weights; }
}

// 1b. blendshapes as sparse accessors: only the vertices a shape moves are stored
const sparseOut = [];
for (const m of J.meshes) for (const p of m.primitives) for (const t of p.targets || []) {
  const a = J.accessors[t.POSITION];
  if (a.bufferView === undefined || a.sparse || a.componentType !== 5126) continue;
  const v = J.bufferViews[a.bufferView], stride = v.byteStride || 12, base = (v.byteOffset || 0) + (a.byteOffset || 0);
  const idx = [], val = [];
  for (let i = 0; i < a.count; i++) {
    const o = base + i * stride, x = BIN.readFloatLE(o), y = BIN.readFloatLE(o + 4), z = BIN.readFloatLE(o + 8);
    if (Math.abs(x) + Math.abs(y) + Math.abs(z) > 2e-6) { idx.push(i); val.push(x, y, z); }
  }
  if (idx.length > a.count * 0.6) continue;
  const big = a.count > 65535;
  const ib = Buffer.alloc(idx.length * (big ? 4 : 2)); idx.forEach((k, i) => big ? ib.writeUInt32LE(k, i * 4) : ib.writeUInt16LE(k, i * 2));
  const vb = Buffer.alloc(val.length * 4); val.forEach((k, i) => vb.writeFloatLE(k, i * 4));
  delete a.bufferView; delete a.byteOffset;
  if (!idx.length) { a.sparse = undefined; delete a.sparse; continue; }
  a.sparse = { count: idx.length, indices: { bufferView: -1, componentType: big ? 5125 : 5123 }, values: { bufferView: -1 } };
  sparseOut.push({ a, ib, vb });
}

// 2. images -> WebP via the browser
const browser = await chromium.launch();
const page = await browser.newPage();
// printed logos on the stock clothes are covered with a patch of plain fabric from the same texture:
// [dest x0, y0, x1, y1, source x0, y0] as fractions of the image
const PATCH = {
  longsleeve_Debed_Color_1K: [[0.49, 0.575, 0.725, 0.66, 0.49, 0.70]],
  female_casualsuit01_diffuse: [[0.68, 0.15, 0.785, 0.36, 0.565, 0.15], [0.775, 0.15, 0.88, 0.36, 0.57, 0.16]],
};
const newImg = [];
for (const im of J.images || []) {
  const bv = J.bufferViews[im.bufferView];
  const bytes = BIN.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  const b64 = await page.evaluate(async ({ data, mime, max, patch }) => {
    const bin = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bin], { type: mime }));
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    const x = c.getContext("2d"); x.drawImage(bmp, 0, 0, c.width, c.height);
    for (const [a, b, e, f, sx, sy] of patch || []) {
      const W = c.width, H = c.height, w = (e - a) * W, h = (f - b) * H;
      x.drawImage(c, sx * W, sy * H, w, h, a * W, b * H, w, h);
    }
    return c.toDataURL("image/webp", 0.86).split(",")[1];
  }, { data: Buffer.from(bytes).toString("base64"), mime: im.mimeType, max: MAX, patch: PATCH[im.name] });
  newImg.push(Buffer.from(b64, "base64"));
}
await browser.close();

// 3. repack: every accessor still referenced, every image
const used = new Set();
const markAcc = i => { if (i === undefined) return; const a = J.accessors[i]; if (a.bufferView !== undefined) used.add(a.bufferView); if (a.sparse) { used.add(a.sparse.indices.bufferView); used.add(a.sparse.values.bufferView); } };
for (const m of J.meshes) for (const p of m.primitives) {
  Object.values(p.attributes).forEach(markAcc); markAcc(p.indices);
  (p.targets || []).forEach(t => Object.values(t).forEach(markAcc));
}
for (const s of J.skins || []) markAcc(s.inverseBindMatrices);
for (const a of J.animations || []) for (const s of a.samplers) { markAcc(s.input); markAcc(s.output); }
const chunks = []; let off = 0;
const remap = new Map();
const views = [];
const push = (buf, view) => {
  const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; }
  const v = { ...view, buffer: 0, byteOffset: off, byteLength: buf.length };
  chunks.push(buf); off += buf.length; views.push(v); return views.length - 1;
};
J.bufferViews.forEach((v, i) => {
  if (!used.has(i)) return;
  remap.set(i, push(BIN.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength), v));
});
for (const a of J.accessors) {
  if (a.bufferView !== undefined) { if (remap.has(a.bufferView)) a.bufferView = remap.get(a.bufferView); else delete a.bufferView; }   // dropped: an unused morph
  if (a.sparse && a.sparse.indices.bufferView !== -1) {
    if (remap.has(a.sparse.indices.bufferView)) { a.sparse.indices.bufferView = remap.get(a.sparse.indices.bufferView); a.sparse.values.bufferView = remap.get(a.sparse.values.bufferView); }
    else delete a.sparse;
  }
}
for (const sp of sparseOut) { sp.a.sparse.indices.bufferView = push(sp.ib, {}); sp.a.sparse.values.bufferView = push(sp.vb, {}); }
(J.images || []).forEach((im, i) => { im.bufferView = push(newImg[i], {}); im.mimeType = "image/webp"; delete im.byteStride; });
J.bufferViews = views.map(v => { const o = { ...v }; if (o.target === undefined) delete o.target; return o; });
J.buffers = [{ byteLength: off }];
// drop accessors nobody uses any more? keep them (cheap); but ones without views must not be referenced
const bin = Buffer.concat(chunks);
let js = Buffer.from(JSON.stringify(J));
js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const binPad = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + binPad.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(binPad.length, 0); bh.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(out, Buffer.concat([head, jh, js, bh, binPad]));
console.log(inp, b.length, "->", out, fs.statSync(out).size);
