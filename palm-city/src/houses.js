// Palm City — the suburbs, house by house. Each lot gets a real roof (hip or gable, with eaves that
// overhang the walls, fascia boards, soffits, gutters and downspouts, ridge and hip caps) in Spanish
// barrel tile, architectural asphalt shingle or standing-seam metal, each a shader that builds the
// courses, tiles and seams in world metres with their own relief; plus chimneys, roof vents and
// solar panels; a porch with a portico and a light by the front door; an attached garage; a
// concrete driveway, a paver path, a wooden privacy fence round the back yard (a white picket
// fence or a hedge at the front), and often a pool with its deck, coping, ladder and loungers.
// Everything is merged per city tile (a few draw calls for the whole suburb) and culled by distance.
import * as THREE from "../vendor/three.module.js";
import { paint, place, merge, vcMaterial } from "./geo.js";
import { addTile } from "./cull.js";
import { CURB, WALK, BLOCK, mulberry32 } from "./world.js";

const G0 = CURB;          // lot ground level (the top of the block slab)
const TILE = 240;

// ---------------------------------------------------------------------------------------------
// materials
// ---------------------------------------------------------------------------------------------
// roofs: kind 0 barrel tile, 1 architectural shingle, 2 standing-seam metal. aR = (along the eave,
// up the slope) in metres; the vertex colour is the roof's base colour
function roofMaterial(glsl) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 aR; varying vec3 vR;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvR = aR;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vR;\n" + glsl)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float rH = 0.0, rRough = 0.8, rMetal = 0.0;
        {
          vec2 q = vR.xy; int kind = int(vR.z + 0.5);
          vec3 base = diffuseColor.rgb, col = base;
          float far = clamp(length(vViewPosition) / 60.0, 0.0, 1.0);
          if (kind == 0) {
            // Spanish barrel tile: courses 34 cm up the slope; across, alternating caps (convex, on
            // top) and pans (concave, below); each course's lower lip throws a shadow on the next
            float cv = q.y / 0.34, cu = q.x / 0.24;
            float row = floor(cv), cuS = cu + mod(row, 2.0) * 0.0;
            float col_i = floor(cuS), fu = fract(cuS), fv = fract(cv);
            float cap = mod(col_i, 2.0);
            float prof = sin(fu * 3.14159);
            rH = cap > 0.5 ? prof * 0.05 : -prof * 0.025;
            rH += (1.0 - fv) * 0.02;                                   // each course laps over the next
            float tv = h12(vec2(col_i, row) + 3.1);
            col = base * (0.78 + tv * 0.32) * (cap > 0.5 ? 0.85 + prof * 0.25 : 0.72 + prof * 0.12);
            col *= 1.0 - (1.0 - smoothstep(0.0, 0.1, fv)) * 0.35;      // shadow under the lip
            // sun-faded tops, black mildew streaking down from the courses, lichen spots
            col = mix(col, col * vec3(1.08, 1.03, 0.96), smoothstep(0.5, 0.9, vnoise(q * 0.4)) * 0.3);
            col *= 1.0 - smoothstep(0.55, 0.9, vnoise(vec2(q.x * 1.6, q.y * 0.25 + 9.0))) * 0.35;
            col = mix(col, col * vec3(0.55, 0.62, 0.42), smoothstep(0.84, 0.92, vnoise(q * 2.3 + 5.0)) * 0.45);
            rRough = 0.72;
          } else if (kind == 1) {
            // architectural shingles: 14 cm courses, random-width laminated tabs staggered course to
            // course, a dark shadow line under every course, granule speckle, algae streaks
            float cv = q.y / 0.142, row = floor(cv), fv = fract(cv);
            float off = h12(vec2(row, 1.7)) * 3.0;
            float tu = (q.x + off) / 0.38, tab = floor(tu), fu = fract(tu);
            float tk = h12(vec2(tab, row));
            float lam = step(0.55, fract(tu * 0.5 + tk)) * 0.12;      // the laminated second layer
            col = base * (0.72 + tk * 0.45) * (1.0 - lam);
            float slot = (1.0 - smoothstep(0.0, 0.025, fu)) * step(0.35, fv);
            col *= 1.0 - slot * 0.55;
            col *= 1.0 - (1.0 - smoothstep(0.0, 0.14, fv)) * 0.45;
            col *= mix(0.85 + h12(floor(q * 90.0)) * 0.3, 1.0, far); // granules
            col = mix(col, col * vec3(0.55, 0.57, 0.55), smoothstep(0.6, 0.85, vnoise(vec2(q.x * 0.9, q.y * 0.12 + 4.0))) * 0.6);
            rH = fv * 0.012 - slot * 0.006 + lam * 0.004;
            rRough = 0.92;
          } else {
            // standing-seam metal: raised seams every 45 cm, faint oil-canning between, chalky fade
            float su = q.x / 0.45, fu = fract(su), sw = max(0.04, fwidth(su) * 1.5);
            float seam = (1.0 - smoothstep(0.0, sw, min(fu, 1.0 - fu))) * (1.0 - smoothstep(0.3, 0.7, fwidth(su)));
            rH = seam * 0.035 * (1.0 - clamp(length(vViewPosition) / 25.0, 0.0, 1.0)) + vnoise(vec2(q.x * 0.8, q.y * 0.15)) * 0.004;
            col = base * (0.9 + vnoise(vec2(floor(su), q.y * 0.05)) * 0.12) * (1.0 + seam * 0.12);
            col = mix(col, col * 0.75 + 0.08, smoothstep(0.6, 0.9, vnoise(q * 0.3)) * 0.3);
            rRough = 0.38; rMetal = 0.55;
          }
          // dirt washes down to the eave
          col *= 1.0 - (1.0 - smoothstep(0.0, 0.9, q.y)) * 0.18;
          rH *= 1.0 - far;
          diffuseColor.rgb = col;
        }`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = rRough;")
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = rMetal;")
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = bumpN(normal, rH, vViewPosition);");
  };
  m.customProgramCacheKey = () => "roof";
  return m;
}
// paving: kind 0 broom-finished driveway concrete, 1 brick pavers (herringbone), 2 travertine deck,
// 3 smooth porch concrete; patterned in world x/z
function paveMaterial(glsl) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aPv; varying float vPv; varying vec3 vWp;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvPv = aPv; vWp = (modelMatrix * vec4(position, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vPv; varying vec3 vWp;\n" + glsl)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float pH = 0.0, pRough = 0.85;
        {
          vec2 p = vWp.xz; int k = int(vPv + 0.5); vec3 col;
          if (k == 0 || k == 3) {
            vec2 t = p / 3.0;
            float joint = 1.0 - band(t.x, 0.006, 1.0) * band(t.y, 0.006, 1.0);
            col = vec3(0.6, 0.58, 0.54) * (0.88 + vnoise(p * 0.7) * 0.14 + vnoise(p * 9.0) * 0.06);
            if (k == 0) {
              col *= 0.94 + 0.06 * sin(p.x * 60.0 + vnoise(p * 3.0) * 4.0);            // broom finish
              col *= 1.0 - smoothstep(0.62, 0.8, vnoise(p * 0.9 + 4.0)) * 0.22;        // tyre marks, oil
              col *= 1.0 - (1.0 - smoothstep(0.0, 0.5, length((fract(p / vec2(2.6, 5.0)) - 0.5) * vec2(2.6, 5.0)) - 0.2)) * 0.25 * step(0.6, h12(floor(p / vec2(2.6, 5.0))));
            }
            col *= 1.0 - joint * 0.45; pH = -joint * 0.01;
          } else if (k == 1) {
            // herringbone brick pavers, sand in the joints
            vec2 b = p / vec2(0.2, 0.2);
            float d = mod(floor(b.x) + floor(b.y), 4.0);
            vec2 f = d < 2.0 ? vec2(fract((b.x + floor(b.y)) / 2.0), fract(b.y)) : vec2(fract(b.x), fract((b.y + floor(b.x)) / 2.0));
            float jt = 1.0 - smoothstep(0.0, 0.06, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
            float tone = h12(floor(b) + d);
            col = mix(vec3(0.55, 0.3, 0.2), vec3(0.62, 0.42, 0.3), tone) * (0.88 + vnoise(p * 6.0) * 0.18);
            col = mix(col, vec3(0.62, 0.58, 0.5), jt * 0.8); pH = -jt * 0.008; pRough = 0.9;
          } else {
            // travertine pool deck: 40 x 60 tiles, cream with pitted holes and veins
            vec2 t = p / vec2(0.6, 0.4); t.x += mod(floor(t.y), 2.0) * 0.5;
            float joint = 1.0 - band(t.x, 0.02, 1.0) * band(t.y, 0.03, 1.0);
            float tone = h12(floor(t));
            col = mix(vec3(0.8, 0.74, 0.62), vec3(0.88, 0.83, 0.72), tone);
            col *= 0.94 + vnoise(vec2(p.x * 2.0, p.y * 14.0) + tone * 9.0) * 0.1;
            col *= 1.0 - step(0.82, vnoise(p * 30.0)) * 0.18;
            col *= 1.0 - joint * 0.3; pH = -joint * 0.006; pRough = 0.6;
          }
          diffuseColor.rgb = col;
        }`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = pRough;")
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = bumpN(normal, pH, vViewPosition);");
  };
  m.customProgramCacheKey = () => "pave";
  return m;
}
// wooden privacy fence: vertical boards with gaps and grain, weathered toward the bottom
function fenceMaterial(glsl) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWp; varying vec3 vNo;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWp = (modelMatrix * vec4(position, 1.0)).xyz; vNo = normal;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWp; varying vec3 vNo;\n" + glsl)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float fH = 0.0;
        {
          float u = abs(vNo.x) > 0.5 ? vWp.z : vWp.x;
          float bu = u / 0.14, f = fract(bu), bd = floor(bu);
          float gap = 1.0 - smoothstep(0.0, 0.05, min(f, 1.0 - f));
          float tone = h12(vec2(bd, 2.0));
          vec3 col = diffuseColor.rgb * (0.8 + tone * 0.3);
          col *= 0.9 + vnoise(vec2(u * 30.0, vWp.y * 2.0) + bd) * 0.18;           // grain
          col *= 1.0 - gap * 0.6;
          col = mix(col * vec3(0.8, 0.78, 0.75), col, smoothstep(0.2, 0.9, vWp.y - ${G0.toFixed(2)}));   // splash at the foot
          fH = -gap * 0.01;
          diffuseColor.rgb = col;
        }`)
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = bumpN(normal, fH, vViewPosition);");
  };
  m.customProgramCacheKey = () => "fence";
  return m;
}
// pool water: depth gradient from the shallow end, rippling caustics, a band of waterline tile,
// the underwater light glowing after dark
export function poolMaterial(U, glsl) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.04, metalness: 0, envMapIntensity: 1.2 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uNight = U.uNight;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aPool; varying vec2 vPool; varying vec3 vWp;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvPool = aPool; vWp = (modelMatrix * vec4(position, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime, uNight; varying vec2 vPool; varying vec3 vWp;\n" + glsl)
      .replace("#include <color_fragment>", `#include <color_fragment>
        vec3 pEmit = vec3(0.0); float pH = 0.0;
        {
          vec2 e = min(vPool, 1.0 - vPool);
          float edge = min(e.x * 6.6, e.y * 3.2);                    // metres to the nearest wall
          float deep = smoothstep(0.3, 0.9, vPool.x);
          vec3 col = mix(vec3(0.3, 0.75, 0.78), vec3(0.06, 0.38, 0.6), deep * 0.8 + smoothstep(0.0, 0.8, edge) * 0.2);
          // caustics: two drifting cell patterns, their bright seams where they cross
          vec2 c1 = vWp.xz * 2.2 + vec2(uTime * 0.25, uTime * 0.17), c2 = vWp.xz * 2.9 - vec2(uTime * 0.21, -uTime * 0.13);
          float k1 = abs(vnoise(c1) - 0.5), k2 = abs(vnoise(c2) - 0.5);
          float caus = pow(1.0 - min(k1, k2) * 2.0, 6.0);
          col += vec3(0.5, 0.6, 0.55) * caus * (1.0 - deep * 0.6) * (1.0 - uNight * 0.8);
          col = mix(col, vec3(0.08, 0.22, 0.42), (1.0 - smoothstep(0.0, 0.18, edge)) * 0.8);   // waterline tile
          pEmit = vec3(0.1, 0.55, 0.65) * uNight * (1.0 - smoothstep(0.0, 2.5, length((vPool - vec2(0.15, 0.5)) * vec2(6.6, 3.2)))) * 1.4
                + vec3(0.02, 0.12, 0.16) * uNight;
          pH = (vnoise(vWp.xz * 3.0 + uTime * 0.6) + vnoise(vWp.xz * 5.3 - uTime * 0.8)) * 0.01;
          diffuseColor.rgb = col * (1.0 - uNight * 0.6);
        }`)
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += pEmit;")
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = bumpN(normal, pH, vViewPosition);");
  };
  m.customProgramCacheKey = () => "pool";
  return m;
}
// white picket fence: an alpha-cut texture of pointed pickets
function picketMaterial() {
  const c = document.createElement("canvas"); c.width = 256; c.height = 128;
  const x = c.getContext("2d");
  for (let k = 0; k < 8; k++) {
    const x0 = k * 32 + 6, w = 20;
    x.fillStyle = "#f4f2ec"; x.beginPath(); x.moveTo(x0, 128); x.lineTo(x0, 26); x.lineTo(x0 + w / 2, 8); x.lineTo(x0 + w, 26); x.lineTo(x0 + w, 128); x.closePath(); x.fill();
    x.fillStyle = "rgba(0,0,0,0.08)"; x.fillRect(x0 + w - 4, 26, 4, 102);
  }
  x.fillStyle = "#e8e6de"; x.fillRect(0, 44, 256, 9); x.fillRect(0, 100, 256, 9);   // rails
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 });
}

// ---------------------------------------------------------------------------------------------
// geometry helpers
// ---------------------------------------------------------------------------------------------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// a box between two points (its length along p0 -> p1), w across, h up
function beam(p0, p1, w, h, hex, emit = 0) {
  const d = p1.clone().sub(p0), L = d.length(); d.normalize();
  const side = new THREE.Vector3().crossVectors(d, V(0, 1, 0)); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
  const up = new THREE.Vector3().crossVectors(side, d).normalize();
  const g = paint(new THREE.BoxGeometry(L, h, w), hex, emit);
  const m = new THREE.Matrix4().makeBasis(d, up, side).setPosition(p0.clone().add(p1).multiplyScalar(0.5));
  return g.applyMatrix4(m);
}
// a half-round cap along p0 -> p1 (ridge / hip tiles)
function capTube(p0, p1, r, hex) {
  const d = p1.clone().sub(p0), L = d.length();
  const g = paint(new THREE.CylinderGeometry(r, r, L, 7, 1, true, -Math.PI / 2, Math.PI), hex);
  g.applyMatrix4(new THREE.Matrix4().makeRotationZ(-Math.PI / 2));                     // along x
  d.normalize();
  const side = new THREE.Vector3().crossVectors(d, V(0, 1, 0)); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
  const up = new THREE.Vector3().crossVectors(side, d).normalize();
  return g.applyMatrix4(new THREE.Matrix4().makeBasis(d, up, side).setPosition(p0.clone().add(p1).multiplyScalar(0.5)));
}
// raw roof triangles: positions, normals, aR (u, v, kind), colour
class RoofBuf {
  constructor() { this.P = []; this.N = []; this.R = []; this.C = []; }
  // a planar polygon (fan) with its eave corner e0, eave direction ed and up-slope direction sd
  poly(pts, e0, ed, sd, kind, col) {
    const n = new THREE.Vector3().crossVectors(pts[1].clone().sub(pts[0]), pts[2].clone().sub(pts[0])).normalize();
    if (n.y < 0) { pts = pts.slice().reverse(); n.negate(); }
    const c = new THREE.Color(col);
    for (let i = 1; i < pts.length - 1; i++) for (const p of [pts[0], pts[i], pts[i + 1]]) {
      this.P.push(p.x, p.y, p.z); this.N.push(n.x, n.y, n.z);
      const q = p.clone().sub(e0);
      this.R.push(q.dot(ed), q.dot(sd), kind); this.C.push(c.r, c.g, c.b);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute("aR", new THREE.Float32BufferAttribute(this.R, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.C, 3));
    return g;
  }
}
const ROOF_COL = [
  [0xb05a36, 0xc0703e, 0x9a4a2e, 0xc8885a],          // terracotta, sandy, brown, buff
  [0x3e3f42, 0x6a5e52, 0x58616a, 0x7e766a],          // charcoal, weathered wood, slate, driftwood
  [0xb9bdc0, 0xe2e4e2, 0x3c5a4a, 0x4a6a8a],          // galvalume, white, forest green, blue
];
const CAP_COL = [0x9a4a2c, 0x2e2f32, 0xa0a4a8];

// a roof over a w x d box whose wall tops are at y (centre cx, cz). Returns its height function.
// out: { roof: RoofBuf, trim: [], } — trim gets the fascia, soffit, gutters, downspouts and caps
function buildRoof(out, cx, cz, w, d, y, o) {
  const { kind, hip, pitch, col, trim } = o;
  const alongX = w >= d, Lh = (alongX ? w : d) / 2 + o.over, Sh = (alongX ? d : w) / 2 + o.over;
  const t = Math.tan(pitch), y0 = y - o.over * t, yr = y0 + Sh * t;
  const W = (a, b, yy) => alongX ? V(cx + a, yy, cz + b) : V(cx + b, yy, cz + a);
  const AX = alongX ? V(1, 0, 0) : V(0, 0, 1), BX = alongX ? V(0, 0, 1) : V(1, 0, 0);
  const ridgeA = hip ? Math.max(0, Lh - Sh) : Lh;
  const slope = (dirH) => dirH.clone().multiplyScalar(Math.cos(pitch)).add(V(0, Math.sin(pitch), 0)).normalize();
  const R = out.roof;
  for (const sb of [1, -1]) {
    // the long sides: eave along a, rising toward the ridge (b = 0)
    const e0 = W(-Lh, sb * Sh, y0), ed = AX.clone(), sd = slope(BX.clone().multiplyScalar(-sb));
    R.poly([W(-Lh, sb * Sh, y0), W(Lh, sb * Sh, y0), W(ridgeA, 0, yr), W(-ridgeA, 0, yr)], e0, ed, sd, kind, col);
  }
  if (hip) for (const sa of [1, -1]) {
    const e0 = W(sa * Lh, -sa * Sh, y0), ed = BX.clone().multiplyScalar(sa), sd = slope(AX.clone().multiplyScalar(-sa));
    R.poly([W(sa * Lh, -sa * Sh, y0), W(sa * Lh, sa * Sh, y0), W(sa * ridgeA, 0, yr)], e0, ed, sd, kind, col);
  } else for (const sa of [1, -1]) {
    // gable end: a triangle of wall under the rake, with a louvred vent
    const a = sa * (Lh - o.over), b = Sh - o.over, top = y + b * t;
    const g = new THREE.BufferGeometry();
    const p = [W(a, -b, y), W(a, b, y), W(a, 0, top)];
    g.setAttribute("position", new THREE.Float32BufferAttribute([...p, p[0], p[2], p[1]].flatMap(v => [v.x, v.y, v.z]), 3));   // both faces
    g.computeVertexNormals();
    out.trim.push(paint(g, o.wall));
    const gv = W(a + sa * 0.03, 0, y + b * t * 0.45);
    out.trim.push(place(paint(new THREE.BoxGeometry(alongX ? 0.06 : 0.7, 0.5, alongX ? 0.7 : 0.06), trim), gv.x, gv.y, gv.z));
    // rake fascia along both sloped edges
    for (const sb of [1, -1]) out.trim.push(beam(W(sa * Lh, sb * Sh, y0 - 0.1), W(sa * Lh, 0, yr - 0.1), 0.06, 0.24, trim));
  }
  // fascia round the eaves, the soffit under them, gutters and downspouts
  const eaves = hip ? [[-1, 1], [1, 1], [1, -1], [-1, -1]] : null;
  const runs = hip ? [0, 1, 2, 3] : [0, 2];
  const corner = (k) => { const [sa, sb] = [[-1, 1], [1, 1], [1, -1], [-1, -1]][k % 4]; return W(sa * Lh, sb * Sh, y0); };
  for (const k of runs) {
    const p0 = corner(k), p1 = corner(k + 1);
    out.trim.push(beam(V(p0.x, y0 - 0.11, p0.z), V(p1.x, y0 - 0.11, p1.z), 0.05, 0.24, trim));
    // K-style gutter just outside the fascia
    const n = [BX, AX, BX.clone().negate(), AX.clone().negate()][k];
    const g0 = p0.clone().addScaledVector(n, 0.09), g1 = p1.clone().addScaledVector(n, 0.09);
    out.trim.push(beam(V(g0.x, y0 - 0.04, g0.z), V(g1.x, y0 - 0.04, g1.z), 0.13, 0.12, o.gutter));
    // a downspout at each end of the run, down the wall by the corner to a splash block
    if (k % 2 === 0 && o.down !== false) {
      const wallC = (j) => { const [sa, sb] = [[-1, 1], [1, 1], [1, -1], [-1, -1]][j % 4]; return W(sa * (Lh - o.over), sb * (Sh - o.over), 0); };
      const w0 = wallC(k), w1 = wallC(k + 1), dir = w1.clone().sub(w0).normalize();
      for (const [wc, sg] of [[w0, 1], [w1, -1]]) {
        const sp = wc.clone().addScaledVector(n, 0.07).addScaledVector(dir, sg * 0.25);
        out.trim.push(place(paint(new THREE.BoxGeometry(0.08, y0 - G0, 0.08), o.gutter), sp.x, G0 + (y0 - G0) / 2, sp.z));
        out.trim.push(place(paint(new THREE.BoxGeometry(0.08, 0.08, 0.3), o.gutter), sp.x + n.x * 0.13, y0 - 0.12, sp.z + n.z * 0.13, 0, Math.abs(n.x) > 0.5 ? Math.PI / 2 : 0, 0));   // elbow to the gutter
        const sb2 = sp.clone().addScaledVector(n, 0.3);
        out.trim.push(place(paint(new THREE.BoxGeometry(0.32, 0.05, 0.32), 0x9a968c), sb2.x, G0 + 0.03, sb2.z));
      }
    }
  }
  // soffit: one slab under the whole overhang (the walls hide its middle)
  {
    const sw = alongX ? Lh * 2 : Sh * 2, sd2 = alongX ? Sh * 2 : Lh * 2;
    out.trim.push(place(paint(new THREE.BoxGeometry(sw - 0.04, 0.04, sd2 - 0.04), 0xe6e2da), cx, y0 - 0.22, cz));
  }
  // ridge and hip caps
  const capC = CAP_COL[kind];
  const lift = kind === 0 ? 0.03 : 0.02;
  const cap = (p0, p1) => kind === 0 ? out.trim.push(capTube(p0, p1, 0.13, o.capCol || capC)) : out.trim.push(beam(p0, p1, 0.32, 0.06, kind === 2 ? col : capC));
  if (ridgeA > 0.01) cap(W(-ridgeA, 0, yr + lift), W(ridgeA, 0, yr + lift));
  if (hip) for (const [sa, sb] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) cap(W(sa * Lh, sb * Sh, y0 + lift), W(sa * ridgeA, 0, yr + lift));
  // height of the roof surface at a world point (and the slope plane it's on)
  return (x, z) => {
    const a = alongX ? x - cx : z - cz, b = alongX ? z - cz : x - cx;
    const db = Sh - Math.abs(b), da = hip ? Lh - Math.abs(a) : Infinity;
    return y0 + t * Math.max(0, Math.min(db, da));
  };
}

// ---------------------------------------------------------------------------------------------
// the suburb
// ---------------------------------------------------------------------------------------------
export function buildHouses(scene, plan, U, glsl) {
  const lots = plan.lots || [];
  const mats = { roof: roofMaterial(glsl), trim: vcMaterial({ roughness: 0.6 }), pave: paveMaterial(glsl), fence: fenceMaterial(glsl), pool: poolMaterial(U, glsl), picket: picketMaterial(), glow: vcMaterial({ roughness: 0.4, emitMul: 0 }) };
  const tiles = new Map();
  const T = (x, z) => {
    const k = Math.floor(x / TILE) + "," + Math.floor(z / TILE);
    if (!tiles.has(k)) tiles.set(k, { roof: { roof: new RoofBuf(), trim: [] }, trim: [], pave: [], fence: [], pool: [], picket: [], glow: [] });
    return tiles.get(k);
  };
  const lights = [];                                     // porch / garage / pool lights for the street-light map
  const pave = (list, [x0, z0, x1, z1], kind, y = G0 + 0.02, th = 0.04) => {
    const g = paint(new THREE.BoxGeometry(x1 - x0, th, z1 - z0), 0xffffff);
    g.setAttribute("aPv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(kind), 1));
    list.push(place(g, (x0 + x1) / 2, y - th / 2 + 0.001, (z0 + z1) / 2));
  };
  for (const L of lots) {
    const r = mulberry32((L.house.seed * 1e6) | 0 ^ 0x5EED);
    const H = L.house, Gr = L.garage, tl = T(H.x, H.z), fz = L.fz, sx = L.sx;
    const kind = L.roofKind, pal = ROOF_COL[kind], col = pal[(r() * pal.length) | 0];
    const gutter = kind === 2 ? col : (r() < 0.6 ? 0xf0eee8 : 0x6a5a48);
    const ro = { kind, hip: L.hip, pitch: kind === 0 ? 0.42 : kind === 1 ? 0.5 : 0.46, col, trim: L.trim, gutter, wall: H.color, over: 0.6 };
    const hRoof = buildRoof(tl.roof, H.x, H.z, H.w, H.d, H.h, ro);
    buildRoof(tl.roof, Gr.x, Gr.z, Gr.w, Gr.d, Gr.h, { ...ro, hip: true, pitch: ro.pitch * 0.85, over: 0.45 });
    const zf = H.z + fz * H.d / 2;                      // the house's front wall
    // foundation band round the house and garage
    for (const b of [H, Gr]) tl.trim.push(place(paint(new THREE.BoxGeometry(b.w + 0.08, 0.32, b.d + 0.08), 0x8c8a84), b.x, G0 + 0.16, b.z));
    // ---- roof furniture ----
    const yTop = (x, z) => hRoof(x, z);
    const back = -fz;
    for (let k = 0; k < 2 + (r() * 2 | 0); k++) {
      const vx = H.x + (r() - 0.5) * H.w * 0.6, vz = H.z + back * H.d * (0.15 + r() * 0.2), vy = yTop(vx, vz);
      if (r() < 0.5) tl.trim.push(place(paint(new THREE.BoxGeometry(0.5, 0.22, 0.5), 0x5a5a5c), vx, vy + 0.08, vz));            // turtle vent
      else { tl.trim.push(place(paint(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), 0x2a2a2a), vx, vy + 0.2, vz)); tl.trim.push(place(paint(new THREE.CylinderGeometry(0.11, 0.13, 0.08, 8), 0x3a3a3a), vx, vy + 0.02, vz)); }
    }
    if (L.chimney) {
      const cxp = H.x + (H.w >= H.d ? (r() < 0.5 ? -1 : 1) * H.w * 0.28 : 0), czp = H.z + back * H.d * 0.18, top = H.h + Math.min(H.w, H.d) / 2 * Math.tan(ro.pitch) + 1.0;
      const brick = r() < 0.5;
      tl.trim.push(place(paint(new THREE.BoxGeometry(0.9, top - H.h + 0.5, 0.7), brick ? 0x8a4a38 : H.color), cxp, H.h - 0.5 + (top - H.h + 0.5) / 2, czp));
      tl.trim.push(place(paint(new THREE.BoxGeometry(1.05, 0.12, 0.85), 0x8a8780), cxp, top + 0.06, czp));
      tl.trim.push(place(paint(new THREE.CylinderGeometry(0.1, 0.1, 0.35, 8), 0x55585a), cxp + 0.15, top + 0.28, czp));
    }
    if (L.solar && H.w >= H.d) {
      // a 2-row array on the south (+z) slope: panels lie in the roof plane, 8 cm proud
      const sideZ = 1, sh = H.d / 2 + ro.over, run = sh / Math.cos(ro.pitch);
      const cols = Math.max(2, Math.floor((H.w - 2) / 1.08)), solar = [];
      for (let rr = 0; rr < 2; rr++) for (let c = 0; c < cols; c++) {
        const px = H.x - (cols - 1) * 0.54 + c * 1.08, along = 1.1 + rr * 1.75;   // metres up from the eave
        const pz = H.z + sideZ * (sh - along * Math.cos(ro.pitch)), py = yTop(px, pz) + 0.09;
        if (along > run - 0.9) continue;
        solar.push(place(paint(new THREE.BoxGeometry(1.02, 0.04, 1.7), 0x1a2436), px, py, pz, ro.pitch, 0, 0));
        solar.push(place(paint(new THREE.BoxGeometry(1.06, 0.03, 1.74), 0xb8bcc0), px, py - 0.02, pz, ro.pitch, 0, 0));
      }
      tl.trim.push(...solar);
    }
    // ---- the front: porch, steps, portico, door, light ----
    const dx = L.doorX, pd = 1.6;
    const pz0 = zf, pz1 = zf + fz * pd;
    pave(tl.pave, [dx - 1.3, Math.min(pz0, pz1), dx + 1.3, Math.max(pz0, pz1)], 3, G0 + 0.3, 0.3);            // stoop
    pave(tl.pave, [dx - 1.0, Math.min(pz1, pz1 + fz * 0.35), dx + 1.0, Math.max(pz1, pz1 + fz * 0.35)], 3, G0 + 0.15, 0.15);   // step
    // portico: two columns and a little hip roof of the same roofing
    for (const s of [-1, 1]) tl.trim.push(place(paint(new THREE.CylinderGeometry(0.1, 0.12, 2.5, 10), L.trim), dx + s * 1.15, G0 + 0.3 + 1.25, pz1 - fz * 0.15));
    buildRoof(tl.roof, dx, zf + fz * 0.8, 2.4, 1.6, G0 + 2.95, { ...ro, hip: true, pitch: 0.4, over: 0.25, down: false });
    // the door: frame, panelled door, glass sidelights' worth of glazing up top, handle, number
    const dcol = [0x7a1e1e, 0x1e2e4a, 0x5a3a22, 0xf0eee8, 0x2a4a3a, 0xc89a2a][(r() * 6) | 0];
    const dz = zf + fz * 0.03;
    tl.trim.push(place(paint(new THREE.BoxGeometry(1.3, 2.45, 0.08), L.trim), dx, G0 + 0.3 + 1.2, dz));
    tl.trim.push(place(paint(new THREE.BoxGeometry(1.0, 2.2, 0.06), dcol), dx, G0 + 0.3 + 1.1, dz + fz * 0.03));
    for (const [px, py] of [[-0.22, 0.55], [0.22, 0.55], [-0.22, 1.3], [0.22, 1.3]]) tl.trim.push(place(paint(new THREE.BoxGeometry(0.32, 0.55, 0.02), dcol), dx + px, G0 + 0.3 + py, dz + fz * 0.065));   // raised panels
    tl.trim.push(place(paint(new THREE.BoxGeometry(0.7, 0.28, 0.02), 0x2a3a48), dx, G0 + 0.3 + 1.95, dz + fz * 0.066));            // fanlight
    tl.trim.push(place(paint(new THREE.SphereGeometry(0.035, 6, 4), 0xd8b040), dx + 0.38, G0 + 0.3 + 1.0, dz + fz * 0.09));
    tl.trim.push(place(paint(new THREE.BoxGeometry(0.34, 0.14, 0.02), 0x2a2a2a), dx + 1.0, G0 + 2.2, dz + fz * 0.03));            // house number
    // porch light: a lantern by the door, glowing after dark
    tl.glow.push(place(paint(new THREE.BoxGeometry(0.16, 0.26, 0.16), 0xffd9a0, 1), dx - 0.95, G0 + 2.15, dz + fz * 0.14));
    tl.trim.push(place(paint(new THREE.BoxGeometry(0.2, 0.05, 0.2), 0x1a1a1a), dx - 0.95, G0 + 2.3, dz + fz * 0.14));
    lights.push([dx - 0.95, G0 + 2.2, dz + fz * 0.6, 0.07, 7]);
    // garage: a light over the door, the door itself is drawn by the facade shader
    const gzf = Gr.z + fz * Gr.d / 2;
    tl.glow.push(place(paint(new THREE.BoxGeometry(0.22, 0.14, 0.12), 0xffe2b0, 1), Gr.x, G0 + 2.85, gzf + fz * 0.07));
    lights.push([Gr.x, G0 + 2.8, gzf + fz * 0.8, 0.06, 8]);
    // ---- paving: driveway (and its apron across the sidewalk), the path to the porch ----
    const [ax0, az0, ax1, az1] = L.drive;
    pave(tl.pave, L.drive, 0);
    const kerbZ = L.zE + fz * WALK;
    pave(tl.pave, [ax0 + 0.3, Math.min(L.zE, kerbZ), ax1 - 0.3, Math.max(L.zE, kerbZ)], 0, G0 + 0.012, 0.03);
    pave(tl.pave, L.path, 1);
    // ---- side yard: AC condenser on its pad, bins by the garage ----
    const acx = H.x - sx * (H.w / 2 + 0.75), acz = H.z + back * H.d * 0.2;
    pave(tl.pave, [acx - 0.55, acz - 0.55, acx + 0.55, acz + 0.55], 3, G0 + 0.08, 0.08);
    tl.trim.push(place(paint(new THREE.BoxGeometry(0.85, 0.75, 0.85), 0xb8b6ae), acx, G0 + 0.08 + 0.38, acz));
    tl.trim.push(place(paint(new THREE.CylinderGeometry(0.32, 0.32, 0.02, 14), 0x2a2a2a), acx, G0 + 0.84, acz));
    for (const [k, c] of [[0, 0x2a5a32], [1, 0x2a4a7a]]) {
      const bx = Gr.x + sx * (Gr.w / 2 + 0.5), bz = gzf - fz * (0.6 + k * 0.75);
      tl.trim.push(place(paint(new THREE.BoxGeometry(0.58, 1.0, 0.68), c), bx, G0 + 0.5, bz));
      tl.trim.push(place(paint(new THREE.BoxGeometry(0.62, 0.06, 0.74), c), bx, G0 + 1.03, bz));
    }
    // mailbox at the end of the drive
    const mx = (L.drive[0] - 0.5), mz = L.zE - fz * 0.4;
    tl.trim.push(place(paint(new THREE.BoxGeometry(0.1, 1.05, 0.1), 0x5a4632), mx, G0 + 0.52, mz));
    tl.trim.push(place(paint(new THREE.BoxGeometry(0.22, 0.24, 0.48), 0x2a2a2c), mx, G0 + 1.12, mz));
    // ---- fences: wooden privacy fence round the back yard, picket or nothing at the front ----
    const lx0 = L.qx - (BLOCK - WALK * 2) / 4, lx1 = L.qx + (BLOCK - WALK * 2) / 4;
    const backFace = H.z - fz * H.d / 2;
    const fenceRun = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0); if (len < 0.3) return;
      tl.fence.push(beam(V(x0, G0 + 0.9, z0), V(x1, G0 + 0.9, z1), 0.05, 1.8, 0xa08262));
      const n = Math.max(1, Math.round(len / 2.4));
      for (let k = 0; k <= n; k++) { const t = k / n; tl.fence.push(place(paint(new THREE.BoxGeometry(0.1, 1.95, 0.1), 0x8a6c50), x0 + (x1 - x0) * t, G0 + 0.97, z0 + (z1 - z0) * t)); }
    };
    fenceRun(lx0 + 0.1, L.zB, lx1 - 0.1, L.zB);                                         // along the back line
    fenceRun(lx0 + 0.1, L.zB, lx0 + 0.1, backFace + fz * 1.2);                          // down each side to the house
    fenceRun(lx1 - 0.1, L.zB, lx1 - 0.1, backFace + fz * 1.2);
    const hx0 = Math.min(H.x - H.w / 2, Gr.x - Gr.w / 2), hx1 = Math.max(H.x + H.w / 2, Gr.x + Gr.w / 2);
    fenceRun(lx0 + 0.1, backFace + fz * 1.2, hx0, backFace + fz * 1.2);                 // and in to the house corners (gates)
    fenceRun(hx1, backFace + fz * 1.2, lx1 - 0.1, backFace + fz * 1.2);
    if (L.front < 0.38) {
      // white pickets along the front, open at the drive and the path
      const fzz = L.zE - fz * 0.25, gaps = [[L.drive[0], L.drive[2]], [L.path[0] - 0.3, L.path[2] + 0.3]].sort((a, b) => a[0] - b[0]);
      let x = lx0 + 0.3;
      for (const [g0, g1] of [...gaps, [lx1 - 0.3, Infinity]]) {
        if (g0 - x > 0.4) {
          const g = new THREE.PlaneGeometry(g0 - x, 1.0); g.attributes.uv.array.forEach((v, i, a) => { if (i % 2 === 0) a[i] = v * (g0 - x) / 1.0; });
          tl.picket.push(place(g, (x + g0) / 2, G0 + 0.5, fzz));
        }
        x = Math.max(x, g1);
      }
    }
    // ---- the pool: deck, coping, water, ladder, loungers, its light ----
    if (L.pool) {
      const [px0, pz0p, px1, pz1p] = L.pool;
      pave(tl.pave, [L.deck[0], L.deck[1], L.deck[2], pz0p], 2); pave(tl.pave, [L.deck[0], pz1p, L.deck[2], L.deck[3]], 2);
      pave(tl.pave, [L.deck[0], pz0p, px0, pz1p], 2); pave(tl.pave, [px1, pz0p, L.deck[2], pz1p], 2);
      // coping: bullnose stones round the edge
      for (const [a0, b0, a1, b1] of [[px0 - 0.3, pz0p - 0.3, px1 + 0.3, pz0p], [px0 - 0.3, pz1p, px1 + 0.3, pz1p + 0.3], [px0 - 0.3, pz0p, px0, pz1p], [px1, pz0p, px1 + 0.3, pz1p]])
        tl.trim.push(place(paint(new THREE.BoxGeometry(a1 - a0, 0.07, b1 - b0), 0xe8e2d4), (a0 + a1) / 2, G0 + 0.055, (b0 + b1) / 2));
      const wg = new THREE.PlaneGeometry(px1 - px0, pz1p - pz0p); wg.rotateX(-Math.PI / 2);
      const uv = wg.attributes.uv; const ap = new Float32Array(uv.count * 2);
      for (let i = 0; i < uv.count; i++) { ap[i * 2] = uv.getX(i); ap[i * 2 + 1] = 1 - uv.getY(i); }
      wg.setAttribute("aPool", new THREE.BufferAttribute(ap, 2));
      tl.pool.push(paint(place(wg, (px0 + px1) / 2, G0 + 0.03, (pz0p + pz1p) / 2), 0xffffff));
      // ladder: two chrome rails curving over the coping
      for (const s of [-0.25, 0.25]) {
        const lx = px1 - 0.8 + s, curve = new THREE.QuadraticBezierCurve3(V(lx, G0 - 0.1, pz0p + 0.15), V(lx, G0 + 0.9, pz0p + 0.1), V(lx, G0 + 0.5, pz0p - 0.35));
        tl.trim.push(paint(new THREE.TubeGeometry(curve, 6, 0.025, 5), 0xd8dcdf));
      }
      // two loungers and an umbrella on the far side of the pool
      for (const k of [0, 1]) {
        const lx = px0 + 0.8 + k * 1.1, lz = (fz > 0 ? pz0p - 1.5 : pz1p + 1.5);
        tl.trim.push(place(paint(new THREE.BoxGeometry(0.65, 0.12, 1.9), 0xf2f0ea), lx, G0 + 0.32, lz));
        tl.trim.push(place(paint(new THREE.BoxGeometry(0.65, 0.65, 0.1), 0xf2f0ea), lx, G0 + 0.6, lz + (fz > 0 ? -1 : 1) * 0.9, (fz > 0 ? 1 : -1) * 0.5, 0, 0));
        for (const [ox, oz] of [[-0.28, -0.85], [0.28, -0.85], [-0.28, 0.85], [0.28, 0.85]]) tl.trim.push(place(paint(new THREE.BoxGeometry(0.04, 0.26, 0.04), 0xb8bcc0), lx + ox, G0 + 0.13, lz + oz));
      }
      const ux = px1 - 0.2, uz = fz > 0 ? pz0p - 1.6 : pz1p + 1.6;
      tl.trim.push(place(paint(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 6), 0xd8d8d8), ux, G0 + 1.15, uz));
      tl.trim.push(place(paint(new THREE.ConeGeometry(1.3, 0.45, 8, 1, true), [0xe8e0c8, 0x2a5a7a, 0xc84a32][(r() * 3) | 0]), ux, G0 + 2.2, uz));
      lights.push([(px0 + px1) / 2, G0 + 0.4, (pz0p + pz1p) / 2, 0.05, 7]);
    }
  }
  // merge each tile into one mesh per material and let the culler skip far ones
  const add = (geo, mat, cast, maxD) => {
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; scene.add(m);
    m.boundingSphere = geo.boundingSphere; addTile(m, maxD);
    return m;
  };
  for (const t of tiles.values()) {
    add(t.roof.roof.geometry(), mats.roof, true, 700);
    const trimAll = [...t.roof.trim, ...t.trim];
    if (trimAll.length) add(merge(trimAll.map(fixAttrs)), mats.trim, true, 420);
    if (t.pave.length) add(mergeWith(t.pave, ["aPv"]), mats.pave, false, 320);
    if (t.fence.length) add(merge(t.fence.map(fixAttrs)), mats.fence, true, 320);
    if (t.pool.length) add(mergeWith(t.pool, ["aPool"]), mats.pool, false, 320);
    if (t.picket.length) add(mergePlain(t.picket), mats.picket, true, 220);
    if (t.glow.length) add(merge(t.glow.map(fixAttrs)), mats.glow, false, 420);
  }
  return {
    lights,
    update(night) { mats.glow.userData.emit.value = 0.25 + night * 3.0; },
  };
}
// geometries built by hand (gable triangles) lack uv / aEmit; give them what merge() needs
function fixAttrs(g) {
  const n = g.attributes.position.count;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.color) g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  if (!g.attributes.aEmit) g.setAttribute("aEmit", new THREE.BufferAttribute(new Float32Array(n), 1));
  return g.index ? g.toNonIndexed() : g;
}
function mergeWith(list, extra) {
  const g = merge(list.map(fixAttrs));
  for (const nm of extra) {
    const arr = new Float32Array(g.attributes.position.count * list[0].attributes[nm].itemSize); let off = 0;
    for (const s of list) { arr.set(s.attributes[nm].array, off); off += s.attributes[nm].array.length; }
    g.setAttribute(nm, new THREE.BufferAttribute(arr, list[0].attributes[nm].itemSize));
  }
  return g;
}
function mergePlain(list) {
  const geos = list.map(g => g.index ? g.toNonIndexed() : g);
  const names = ["position", "normal", "uv"], out = new THREE.BufferGeometry();
  for (const nm of names) {
    let total = 0; for (const g of geos) total += g.attributes[nm].array.length;
    const arr = new Float32Array(total); let off = 0;
    for (const g of geos) { arr.set(g.attributes[nm].array, off); off += g.attributes[nm].array.length; }
    out.setAttribute(nm, new THREE.BufferAttribute(arr, geos[0].attributes[nm].itemSize));
  }
  return out;
}
