// Palm City 2 — the city, drawn. Every building, block and road is ONE instanced/merged mesh with
// its detail generated in the fragment shader: windows, mullions, brick courses, storefronts,
// paving joints, lane lines and crosswalks are all computed per pixel from world position. That
// means detail is resolution-independent — as crisp on a 4K monitor as on a phone — with zero
// texture memory, and the whole skyline is a handful of draw calls.
import * as THREE from "../vendor/three.module.js";
import { N, ROAD, BLOCK, WALK, CURB, CELL, HALF, STYLE, blockC, mulberry32, PLAZA } from "./world.js";
import { paint, place, merge, vcMaterial } from "./geo.js";

// shared GLSL: hashing, value noise, and an anti-aliased "is this pixel inside a repeating cell
// rectangle" test that fades to its average coverage when the cells shrink below a few pixels
// (that fade is what stops distant windows from shimmering into moiré)
const GLSL_COMMON = `
  float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h12(i), h12(i+vec2(1,0)), f.x), mix(h12(i+vec2(0,1)), h12(i+vec2(1,1)), f.x), f.y); }
  // coverage of the band [a,b] inside each unit cell of coordinate x (x already in cell units)
  float band(float x, float a, float b){
    float w = max(fwidth(x), 1e-4);
    float f = fract(x);
    float c = smoothstep(a - w, a + w, f) - smoothstep(b - w, b + w, f);
    return mix(c, b - a, smoothstep(0.25, 0.6, w));
  }
  float line1(float x, float a, float b){ float w = max(fwidth(x), 1e-4); return smoothstep(a - w, a + w, x) - smoothstep(b - w, b + w, x); }
`;

// ============================================================================================
// buildings
// ============================================================================================
function facadeMaterial(U) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.0 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uNight = U.uNight;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>
        attribute vec4 aStyle; attribute vec3 aColor;
        varying vec3 vWP; varying vec3 vON; varying vec4 vStyle; varying vec3 vBase; varying vec3 vBoxC; varying vec3 vBoxS;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vec4 wp4 = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWP = wp4.xyz; vON = normal; vStyle = aStyle; vBase = aColor;
        vBoxC = (modelMatrix * instanceMatrix * vec4(0.0, 0.5, 0.0, 1.0)).xyz;
        vBoxS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
        uniform float uNight;
        varying vec3 vWP; varying vec3 vON; varying vec4 vStyle; varying vec3 vBase; varying vec3 vBoxC; varying vec3 vBoxS;
        ${GLSL_COMMON}`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float fRough = 0.85, fMetal = 0.0; vec3 fEmit = vec3(0.0);
        {
          int style = int(vStyle.x + 0.5);
          float seed = vStyle.y;
          float baseY = vStyle.w;
          vec3 wall = vBase;
          vec3 an = abs(vON);
          float v = vWP.y - baseY;                         // height up this building
          float top = vBoxS.y - v;                         // distance below the roof line
          if (an.y > 0.5) {
            // ---- roof: tar/gravel with a lighter parapet ring ----
            float edge = min(vBoxS.x * 0.5 - abs(vWP.x - vBoxC.x), vBoxS.z * 0.5 - abs(vWP.z - vBoxC.z));
            float n = vnoise(vWP.xz * 1.7) * 0.5 + vnoise(vWP.xz * 0.23) * 0.5;
            vec3 roof = mix(vec3(0.34, 0.33, 0.32), wall * 0.55, 0.35) * (0.85 + n * 0.3);
            roof = mix(wall * 0.95, roof, smoothstep(0.35, 0.6, edge));
            diffuseColor.rgb = roof; fRough = 0.92;
          } else {
            // along-face coordinate (world metres) and how far we are from the face's vertical edges
            float u = an.x > 0.5 ? vWP.z : vWP.x;
            float halfW = an.x > 0.5 ? vBoxS.z * 0.5 : vBoxS.x * 0.5;
            float cu = an.x > 0.5 ? vBoxC.z : vBoxC.x;
            float edgeD = halfW - abs(u - cu);
            u -= cu - halfW;                                // 0 at the left edge of this face
            vec3 col = wall; float glass = 0.0; float frame = 0.0;
            vec2 cellId = vec2(0.0);
            if (style == 0) {
              // GLASS curtain wall: tall panes, thin bright mullions, spandrel bands every floor
              vec2 c = vec2(u / 2.6, v / 3.8);
              cellId = floor(c);
              float mull = 1.0 - band(c.x, 0.04, 0.96) * band(c.y, 0.07, 0.93);
              float spandrel = 1.0 - band(c.y, 0.0, 0.8);
              float tint = h12(cellId + seed * 17.0) * 0.18;
              col = mix(wall * (0.8 + tint), mix(wall, vec3(0.85), 0.5), mull);
              col = mix(col, wall * 0.3, spandrel * (1.0 - mull) * 0.6);
              glass = (1.0 - mull) * (1.0 - spandrel * 0.6);
              frame = mull;
            } else if (style == 3) {
              // HOUSE: a few windows with white frames and shutters, plain stucco between
              vec2 c = vec2(u / 4.2, (v - 0.6) / 3.0);
              cellId = floor(c);
              float win = band(c.x, 0.32, 0.68) * band(c.y, 0.3, 0.78) * step(0.6, v) * step(v, vBoxS.y - 0.5);
              float fr = band(c.x, 0.28, 0.72) * band(c.y, 0.26, 0.82) * step(0.6, v) * step(v, vBoxS.y - 0.5) - win;
              col = mix(wall, vec3(0.97), fr);
              glass = win;
              frame = fr;
            } else {
              // PASTEL / BRICK / CONCRETE: punched or ribbon windows on regular floors
              float fh = style == 4 ? 3.6 : 3.3;
              float bay = style == 2 ? 2.8 : (style == 4 ? 1.6 : 3.1);
              vec2 c = vec2(u / bay, v / fh);
              cellId = floor(c);
              float wx0 = style == 4 ? 0.02 : 0.24, wx1 = style == 4 ? 0.98 : 0.76;
              float wy0 = style == 4 ? 0.34 : 0.28, wy1 = style == 4 ? 0.86 : 0.8;
              float win = band(c.x, wx0, wx1) * band(c.y, wy0, wy1);
              float fr = band(c.x, wx0 - 0.05, wx1 + 0.05) * band(c.y, wy0 - 0.05, wy1 + 0.03) - win;
              if (style == 2) {
                // brick courses: running bond, mortar lines, per-brick tone jitter
                vec2 b = vec2(vWP.y / 0.28, u / 0.62);
                b.y += mod(floor(b.x), 2.0) * 0.5;
                float mortar = 1.0 - band(b.x, 0.08, 1.0) * band(b.y, 0.04, 1.0);
                float tone = h12(floor(b) + seed) * 0.16 - 0.08;
                col = mix(wall * (1.0 + tone), vec3(0.62, 0.58, 0.54), mortar * 0.8);
                fr *= 0.0;
                // sills
                col = mix(col, vec3(0.78, 0.74, 0.68), band(c.x, wx0 - 0.04, wx1 + 0.04) * band(c.y, wy0 - 0.06, wy0));
              } else if (style == 1) {
                // stucco: soft mottling + a cornice line every floor
                col = wall * (0.94 + vnoise(vec2(u, v) * 0.9) * 0.1);
                col = mix(col, wall * 1.08 + 0.04, band(c.y, 0.0, 0.05));
                // balconies' shadow under every other window on pastel blocks
                col *= 1.0 - 0.18 * band(c.y, 0.2, 0.28) * band(c.x, 0.18, 0.82) * step(0.5, h12(vec2(cellId.y, seed)));
              } else {
                col = wall * (0.95 + vnoise(vec2(u * 0.5, v * 3.0)) * 0.08);
              }
              col = mix(col, vec3(0.93, 0.92, 0.9), fr * 0.85);
              glass = win; frame = fr;
              // ground floor storefronts: big glass, a coloured awning band above
              if (style != 2 && v < 4.4 && baseY < 0.5) {
                float sf = band(u / 5.5, 0.08, 0.92) * line1(v, 0.35, 3.2);
                vec3 aw = vec3(h12(vec2(floor(u / 5.5), seed)), h12(vec2(seed, floor(u / 5.5))), 0.5);
                aw = mix(vec3(0.85, 0.3, 0.3), vec3(0.2, 0.55, 0.6), aw.x); aw = mix(aw, vec3(0.95, 0.75, 0.3), step(0.66, aw.y * 1.4 - 0.3));
                col = mix(wall * 0.92, vec3(0.9), line1(v, 3.2, 3.35));
                col = mix(col, aw, line1(v, 3.35, 4.2) * band(u / 5.5, 0.04, 0.96));
                glass = sf; frame = 0.0;
                cellId = vec2(floor(u / 5.5), -1.0);
              }
            }
            // glass: dark, glossy, reflective by day; some windows lit warm at night
            vec3 glassCol = style == 0 ? col : mix(vec3(0.16, 0.2, 0.25), wall * 0.3, 0.2);
            col = mix(col, glassCol, glass);
            fRough = mix(style == 2 ? 0.95 : 0.82, style == 0 ? 0.1 : 0.14, glass);
            fMetal = mix(0.0, style == 0 ? 0.7 : 0.55, glass);
            float lit = step(0.52, h12(cellId * vec2(1.7, 3.1) + seed * 41.0));
            vec3 warm = mix(vec3(1.0, 0.72, 0.38), vec3(0.75, 0.85, 1.0), step(0.8, h12(cellId + seed)));
            fEmit = warm * glass * lit * uNight * 2.2;
            // storefronts glow a little even at dusk
            if (cellId.y < -0.5) fEmit = warm * glass * (0.25 + uNight * 2.0);
            // fake AO: darker at the foot of the wall and into the vertical corners, parapet cap on top
            col *= 0.72 + 0.28 * smoothstep(0.0, 2.2, v + (baseY > 0.5 ? 3.0 : 0.0));
            col *= 0.86 + 0.14 * smoothstep(0.0, 0.7, edgeD);
            col = mix(col, wall * 1.1 + 0.05, line1(top, 0.0, 0.55));
            diffuseColor.rgb = col;
          }
        }`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = fRough;")
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = fMetal;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += fEmit;");
  };
  return m;
}

function buildBuildings(scene, city, U) {
  const B = city.buildings;
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(geo, facadeMaterial(U), B.length);
  const style = new Float32Array(B.length * 4), col = new Float32Array(B.length * 3);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  B.forEach((b, i) => {
    m.makeScale(b.w, b.h, b.d).setPosition(b.x, b.y + 0.001, b.z);
    mesh.setMatrixAt(i, m);
    style.set([b.style, b.seed, b.roof, b.y], i * 4);
    c.set(b.color); c.convertSRGBToLinear();
    col.set([c.r, c.g, c.b], i * 3);
  });
  geo.setAttribute("aStyle", new THREE.InstancedBufferAttribute(style, 4));
  geo.setAttribute("aColor", new THREE.InstancedBufferAttribute(col, 3));
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);

  // ---- roof clutter: AC units, water tanks, antenna masts, pitched roofs on houses ----
  const r = mulberry32(0xC0FFEE);
  const parts = [];
  const houses = [];
  for (const b of B) {
    if (b.style === STYLE.HOUSE) { houses.push(b); continue; }
    const top = b.y + b.h;
    const n = Math.min(5, Math.floor(b.w * b.d / 180) + 1);
    for (let k = 0; k < n; k++) {
      const x = b.x + (r() - 0.5) * (b.w - 5), z = b.z + (r() - 0.5) * (b.d - 5);
      if (r() < 0.6) parts.push(place(paint(new THREE.BoxGeometry(2.2, 1.3, 1.6), 0xb9bcbf), x, top + 0.65, z));
      else if (b.style !== STYLE.GLASS) {
        parts.push(place(paint(new THREE.CylinderGeometry(1.3, 1.3, 2.4, 12), 0x8a6a52), x, top + 2.6, z));
        parts.push(place(paint(new THREE.ConeGeometry(1.45, 0.9, 12), 0x5a4a40), x, top + 4.25, z));
        for (const [ox, oz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) parts.push(place(paint(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 5), 0x444444), x + ox, top + 0.7, z + oz));
      }
    }
    if (b.style === STYLE.GLASS && b.h > 90 && r() < 0.6) {
      parts.push(place(paint(new THREE.CylinderGeometry(0.18, 0.3, 14, 6), 0xd0d0d0), b.x, top + 7, b.z));
      parts.push(place(paint(new THREE.SphereGeometry(0.45, 8, 6), 0xff3030, 6), b.x, top + 14.2, b.z));   // aircraft warning light
    }
  }
  if (parts.length) {
    const mm = new THREE.Mesh(merge(parts), vcMaterial({ roughness: 0.7 }));
    mm.castShadow = true; mm.receiveShadow = true; scene.add(mm);
  }
  // pitched roofs: a prism per house, terracotta or slate
  if (houses.length) {
    const pr = [];
    for (const b of houses) {
      const g = new THREE.CylinderGeometry(1, 1, 1, 3, 1);   // triangular prism
      g.rotateZ(Math.PI / 2); g.rotateX(Math.PI / 6 * 0);
      // scale so the triangle spans the house depth and sticks out a bit
      const alongX = b.w >= b.d;
      const span = (alongX ? b.d : b.w) + 1.2, len = (alongX ? b.w : b.d) + 1.2;
      const geo2 = paint(g, r() < 0.6 ? 0xb4553a : 0x5d6470);
      // the prism's triangle has circumradius 1 → width sqrt(3), height 1.5
      place(geo2, b.x, b.y + b.h + 0.75 * (span / 1.732) * 0.6 - 0.02, b.z, 0, alongX ? 0 : Math.PI / 2, 0, len, (span / 1.732) * 0.6, span / 1.732);
      pr.push(geo2);
    }
    const rm = new THREE.Mesh(merge(pr), vcMaterial({ roughness: 0.75 }));
    rm.castShadow = true; rm.receiveShadow = true; scene.add(rm);
  }
  return mesh;
}

// ============================================================================================
// ground: roads, markings, sand, outskirts — one big plane, all shader
// ============================================================================================
function groundMaterial(U) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uWet = U.uWet;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWP;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWP = (modelMatrix * vec4(position, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
        uniform float uWet; varying vec3 vWP;
        ${GLSL_COMMON}
        const float HALF = ${HALF.toFixed(3)}, CELL = ${CELL.toFixed(3)}, ROAD = ${ROAD.toFixed(3)};`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float gRough = 0.9;
        {
          vec2 p = vWP.xz;
          vec3 col;
          float n1 = vnoise(p * 3.1), n2 = vnoise(p * 0.35), n3 = vnoise(p * 0.07);
          if (p.y > HALF + 2.0) {
            // beach: warm sand, dune ripples, darker wet sand toward the waterline
            float rip = sin(p.x * 0.9 + vnoise(p * 0.3) * 6.0) * 0.5 + 0.5;
            col = mix(vec3(0.86, 0.74, 0.55), vec3(0.93, 0.83, 0.64), n2) * (0.94 + rip * 0.05 + n1 * 0.05);
            float wet = smoothstep(${(HALF + 36).toFixed(1)}, ${(HALF + 46).toFixed(1)}, p.y);
            col = mix(col, vec3(0.55, 0.45, 0.33), wet);
            gRough = mix(0.95, 0.35, wet);
          } else if (abs(p.x) > HALF + 2.0 || p.y < -HALF - 2.0) {
            // outskirts: dry scrub and grass
            col = mix(vec3(0.42, 0.5, 0.26), vec3(0.62, 0.58, 0.36), n3) * (0.85 + n1 * 0.2);
          } else {
            // asphalt: fine aggregate, patching, darker wheel tracks in each lane
            col = vec3(0.145, 0.138, 0.135) * (0.82 + n1 * 0.22 + n2 * 0.12);
            col *= 0.9 + 0.1 * step(0.55, vnoise(floor(p * 0.25) + 3.0));   // repair patches
            vec2 l = mod(p + HALF, CELL);
            bool ns = l.x < ROAD, ew = l.y < ROAD;
            float c = ns ? l.x - ROAD * 0.5 : l.y - ROAD * 0.5;   // across-road coordinate (-8..8)
            float a = ns ? p.y : p.x;                               // along-road coordinate
            float along = ns ? l.y : l.x;                           // position within the block run
            vec3 paintW = vec3(0.86, 0.86, 0.82), paintY = vec3(0.95, 0.72, 0.18);
            float mk = 0.0; vec3 mc = paintW;
            if (ns != ew) {
              float nearX = step(along, ROAD + 4.6) + step(CELL - 4.6, along);   // crosswalk zones
              // tyre tracks
              float lanePos = abs(c);
              col *= 1.0 - 0.07 * (line1(lanePos, 1.3, 2.7) + line1(lanePos, 5.3, 6.7));
              if (nearX < 0.5) {
                float y = line1(abs(c), 0.12, 0.32);
                mk = max(mk, y); mc = mix(mc, paintY, y);
                float dash = line1(abs(c), 3.9, 4.1) * band(a / 7.0, 0.0, 0.5);
                mk = max(mk, dash);
                mk = max(mk, line1(abs(c), 7.25, 7.45));
              } else {
                // zebra crossing + stop line
                float inZ = line1(along, ROAD + 1.0, ROAD + 4.0) + line1(along, CELL - 4.0, CELL - 1.0);
                mk = max(mk, inZ * band(c / 1.1, 0.0, 0.55) * line1(abs(c), 0.0, 7.4));
                float stop = (line1(along, ROAD + 4.3, ROAD + 4.6) * step(0.0, -c)) + (line1(along, CELL - 4.6, CELL - 4.3) * step(0.0, c));
                if (ns) stop = (line1(along, ROAD + 4.3, ROAD + 4.6) * step(0.0, c)) + (line1(along, CELL - 4.6, CELL - 4.3) * step(0.0, -c));
                mk = max(mk, stop * line1(abs(c), 0.3, 7.4));
              }
            } else if (ns && ew) {
              // intersection box: slightly worn, a manhole cover
              col *= 0.97;
              vec2 q = l - ROAD * 0.5;
              float mh = line1(length(q - vec2(2.5, -2.5)), 0.0, 0.55);
              col = mix(col, vec3(0.2, 0.19, 0.18) * (0.8 + 0.4 * band(q.x * 3.0, 0.0, 0.5)), mh);
            }
            mk *= 0.75 + 0.25 * vnoise(p * 2.3);   // worn paint
            col = mix(col, mc, mk);
            gRough = mix(0.88, 0.55, mk);
            // wet roads: darker and glossy
            col *= 1.0 - uWet * 0.35; gRough = mix(gRough, 0.12, uWet);
          }
          diffuseColor.rgb = col;
        }`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = gRough;");
  };
  return m;
}

// ============================================================================================
// blocks: raised sidewalk slabs + what fills each block (paving / grass / plaza stone)
// ============================================================================================
function blockMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aKind; varying float vKind; varying vec3 vWP; varying vec3 vON; varying vec3 vBC;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWP = (modelMatrix * instanceMatrix * vec4(position,1.0)).xyz; vKind = aKind; vON = normal; vBC = (modelMatrix * instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
        varying float vKind; varying vec3 vWP; varying vec3 vON; varying vec3 vBC;
        ${GLSL_COMMON}
        const float BLOCK = ${BLOCK.toFixed(3)}, WALK = ${WALK.toFixed(3)};`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float bRough = 0.85;
        {
          vec2 q = vWP.xz - vBC.xz;
          float edge = BLOCK * 0.5 - max(abs(q.x), abs(q.y));   // distance in from the kerb
          vec3 col;
          if (abs(vON.y) < 0.5) {
            col = vec3(0.72, 0.7, 0.66);                          // kerb face
          } else if (edge < WALK) {
            // sidewalk: 1.5 m slabs, hairline joints, a lighter kerbstone at the edge
            vec2 t = vWP.xz / 1.5;
            float joint = 1.0 - band(t.x, 0.03, 1.0) * band(t.y, 0.03, 1.0);
            col = vec3(0.6, 0.56, 0.5) * (0.93 + vnoise(vWP.xz * 2.0) * 0.1 + h12(floor(t)) * 0.06);
            col *= 1.0 - joint * 0.18;
            col = mix(col, vec3(0.72, 0.69, 0.64), line1(edge, 0.0, 0.35));
          } else {
            int k = int(vKind + 0.5);
            if (k == 1 || k == 3) {
              // grass: two-tone mottled lawn, mower stripes in the suburbs
              float n = vnoise(vWP.xz * 0.6) * 0.6 + vnoise(vWP.xz * 3.0) * 0.4;
              col = mix(vec3(0.24, 0.42, 0.14), vec3(0.36, 0.52, 0.2), n);
              if (k == 3) col *= 0.93 + 0.07 * band(vWP.x / 3.0, 0.0, 0.5);
              bRough = 0.95;
            } else if (k == 2) {
              // plaza: radial stone rings around the fountain
              float r = length(q);
              float ring = band(r / 2.2, 0.0, 0.06);
              float ang = atan(q.y, q.x) * 12.0 / 3.14159;
              col = mix(vec3(0.74, 0.66, 0.56), vec3(0.64, 0.52, 0.42), band(r / 4.4, 0.0, 0.5));
              col *= 1.0 - 0.15 * (ring + band(ang, 0.0, 0.04) * step(4.0, r));
              bRough = 0.7;
            } else {
              vec2 t = vWP.xz / 0.9;
              float joint = 1.0 - band(t.x, 0.04, 1.0) * band(t.y + floor(t.x) * 0.5, 0.04, 1.0);
              col = vec3(0.66, 0.63, 0.58) * (0.94 + vnoise(vWP.xz * 1.3) * 0.12) * (1.0 - joint * 0.2);
            }
          }
          diffuseColor.rgb = col;
        }`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = bRough;");
  };
  return m;
}
function buildBlocks(scene, city) {
  const geo = new THREE.BoxGeometry(BLOCK, CURB, BLOCK); geo.translate(0, CURB / 2, 0);
  const mesh = new THREE.InstancedMesh(geo, blockMaterial(), city.blocks.length);
  const kind = new Float32Array(city.blocks.length);
  const KIND = { plaza: 2, park: 1, suburb: 3 };
  const m = new THREE.Matrix4();
  city.blocks.forEach((b, i) => { m.makeTranslation(blockC(b.i), 0, blockC(b.j)); mesh.setMatrixAt(i, m); kind[i] = KIND[b.kind] || 0; });
  geo.setAttribute("aKind", new THREE.InstancedBufferAttribute(kind, 1));
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
}

// ============================================================================================
// palms, trees, lamps, benches, fountain — merged / instanced, palms sway in the wind
// ============================================================================================
function swayMaterial(U, opts) {
  const m = vcMaterial(opts);
  const base = m.onBeforeCompile;
  m.onBeforeCompile = sh => {
    base(sh);
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        {
          // bend grows with height; each instance gets its own phase from its position
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float ph = ip.x * 0.13 + ip.z * 0.17;
          float hgt = max(position.y, 0.0);
          float bend = hgt * hgt * 0.0016;
          transformed.x += sin(uTime * 1.1 + ph) * bend + sin(uTime * 2.7 + ph * 1.7) * bend * 0.25;
          transformed.z += cos(uTime * 0.9 + ph) * bend * 0.6;
        }`);
  };
  return m;
}
function palmGeometry() {
  const parts = [];
  // gently curved trunk: stacked tapered segments with darker ring joints
  const segs = 9, H = 8.5;
  let px = 0, pz = 0;
  for (let s = 0; s < segs; s++) {
    const t0 = s / segs, t1 = (s + 1) / segs;
    const r0 = 0.3 - t0 * 0.12, r1 = 0.3 - t1 * 0.12;
    const g = new THREE.CylinderGeometry(r1, r0, H / segs, 9, 1);
    const nx = Math.sin(t1 * 1.4) * 0.9;
    parts.push(place(paint(g, s % 2 ? 0x8a6a4a : 0x7a5c40), (px + nx) / 2, (t0 + t1) / 2 * H, pz, 0, 0, -(nx - px) / (H / segs) * 0.9));
    parts.push(place(paint(new THREE.TorusGeometry(r1 + 0.02, 0.04, 4, 9), 0x5e4630), nx, t1 * H, pz, Math.PI / 2, 0, 0));
    px = nx;
  }
  const topX = px, topY = H;
  // coconuts
  for (let k = 0; k < 3; k++) { const a = k * 2.1; parts.push(place(paint(new THREE.SphereGeometry(0.2, 8, 6), 0x5a4020), topX + Math.cos(a) * 0.3, topY - 0.25, Math.sin(a) * 0.3)); }
  // fronds: long arched blades built from a strip, drooping at the tips, with a vein colour gradient
  const F = 9;
  for (let k = 0; k < F; k++) {
    const a = k / F * Math.PI * 2 + (k % 2) * 0.2;
    const L = 4.2 + (k % 3) * 0.5, segN = 8;
    const pos = [], col = [];
    const c0 = new THREE.Color(0x2f6b2a), c1 = new THREE.Color(0x7fb04a);
    for (let i = 0; i < segN; i++) {
      const t0 = i / segN, t1 = (i + 1) / segN;
      const pt = t => { const r = t * L; return [r, Math.sin(t * Math.PI * 0.55) * 1.3 - t * t * 2.6]; };
      const w0 = Math.sin(t0 * Math.PI) * 0.62 + 0.05, w1 = Math.sin(t1 * Math.PI) * 0.62 + 0.05;
      const [r0, y0] = pt(t0), [r1, y1] = pt(t1);
      // two quads (left/right of the rib), slightly V-shaped
      for (const sd of [-1, 1]) {
        const v = [[r0, y0, 0], [r1, y1, 0], [r1, y1 - 0.12, sd * w1], [r0, y0, 0], [r1, y1 - 0.12, sd * w1], [r0, y0 - 0.12, sd * w0]];
        if (sd < 0) { const t = v[1]; v[1] = v[2]; v[2] = t; const u = v[4]; v[4] = v[5]; v[5] = u; }
        for (const q of v) { pos.push(...q); const cc = c0.clone().lerp(c1, Math.abs(q[2]) / 0.7 * 0.6 + t0 * 0.3); col.push(cc.r, cc.g, cc.b); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute("aEmit", new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3), 1));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
    g.computeVertexNormals();
    place(g, topX, topY, 0, 0, a, 0.15 * ((k % 3) - 1));
    parts.push(g);
  }
  return merge(parts);
}
function treeGeometry() {
  const parts = [];
  parts.push(place(paint(new THREE.CylinderGeometry(0.22, 0.32, 3.2, 8), 0x6a4a32), 0, 1.6, 0));
  const blobs = [[0, 4.3, 0, 2.1], [1.2, 3.8, 0.4, 1.5], [-1.1, 3.9, -0.3, 1.6], [0.2, 3.7, -1.2, 1.4], [-0.3, 5.3, 0.3, 1.3]];
  const greens = [0x3d6e2a, 0x4a7d30, 0x35622a, 0x578a36, 0x46782e];
  blobs.forEach(([x, y, z, r], i) => parts.push(place(paint(new THREE.IcosahedronGeometry(r, 2), greens[i]), x, y, z)));
  return merge(parts);
}
function lampGeometry() {
  const parts = [];
  parts.push(place(paint(new THREE.CylinderGeometry(0.09, 0.13, 6.5, 8), 0x3a3f45), 0, 3.25, 0));
  parts.push(place(paint(new THREE.CylinderGeometry(0.2, 0.25, 0.4, 8), 0x3a3f45), 0, 0.2, 0));
  parts.push(place(paint(new THREE.BoxGeometry(0.1, 0.1, 2.0), 0x3a3f45), 0, 6.4, -0.9));
  parts.push(place(paint(new THREE.BoxGeometry(0.5, 0.18, 0.9), 0x2f3338), 0, 6.35, -1.8));
  parts.push(place(paint(new THREE.BoxGeometry(0.4, 0.05, 0.75), 0xfff0cc, 1), 0, 6.24, -1.8));   // lens: emissive
  return merge(parts);
}
function benchGeometry() {
  const parts = [];
  for (let k = 0; k < 3; k++) parts.push(place(paint(new THREE.BoxGeometry(1.9, 0.07, 0.14), 0x9a6a3e), 0, 0.46, -0.18 + k * 0.17));
  for (let k = 0; k < 2; k++) parts.push(place(paint(new THREE.BoxGeometry(1.9, 0.14, 0.05), 0x9a6a3e), 0, 0.72 + k * 0.18, 0.26, -0.2, 0, 0));
  for (const x of [-0.8, 0.8]) parts.push(place(paint(new THREE.BoxGeometry(0.08, 0.46, 0.5), 0x33363a), x, 0.23, 0));
  return merge(parts);
}
function instanced(scene, geo, mat, list, yOf, cast = true) {
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  list.forEach((it, i) => {
    const [x, z, a, sc] = it;
    m.compose(p.set(x, yOf(x, z), z), q.setFromEuler(e.set(0, a || 0, 0)), s.setScalar(sc || 1));
    mesh.setMatrixAt(i, m);
  });
  mesh.castShadow = cast; mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

function buildProps(scene, city, U, gy) {
  const r = mulberry32(0x7A1A);
  const palms = city.palms.map(([x, z, s]) => [x, z, r() * Math.PI * 2, s]);
  instanced(scene, palmGeometry(), swayMaterial(U, { roughness: 0.7, side: THREE.DoubleSide }), palms, gy);
  const trees = city.trees.map(([x, z, s]) => [x, z, r() * Math.PI * 2, s]);
  instanced(scene, treeGeometry(), swayMaterial(U, { roughness: 0.85 }), trees, gy);
  const lampMat = vcMaterial({ roughness: 0.5, metalness: 0.3, emitMul: 0 });
  instanced(scene, lampGeometry(), lampMat, city.lamps.map(([x, z, a]) => [x, z, a, 1]), gy);
  instanced(scene, benchGeometry(), vcMaterial({ roughness: 0.7 }), city.benches.map(([x, z, a]) => [x, z, a, 1]), gy);

  // plaza fountain: tiered basin, a column, water discs that shimmer
  const px = blockC(PLAZA.i), pz = blockC(PLAZA.j);
  const f = [];
  f.push(place(paint(new THREE.CylinderGeometry(6.2, 6.4, 0.7, 40), 0xe8e0d0), px, 0.35 + CURB, pz));
  f.push(place(paint(new THREE.CylinderGeometry(1.1, 1.3, 2.6, 20), 0xe8e0d0), px, 1.3 + CURB, pz));
  f.push(place(paint(new THREE.CylinderGeometry(2.6, 2.2, 0.35, 28), 0xe8e0d0), px, 2.6 + CURB, pz));
  f.push(place(paint(new THREE.CylinderGeometry(0.5, 0.6, 1.4, 14), 0xe8e0d0), px, 3.4 + CURB, pz));
  const fm = new THREE.Mesh(merge(f), vcMaterial({ roughness: 0.5 }));
  fm.castShadow = true; fm.receiveShadow = true; scene.add(fm);
  const water = new THREE.MeshStandardMaterial({ color: 0x3fa7c8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85 });
  const w1 = new THREE.Mesh(new THREE.CircleGeometry(5.9, 40), water); w1.rotation.x = -Math.PI / 2; w1.position.set(px, 0.62 + CURB, pz); scene.add(w1);
  const w2 = new THREE.Mesh(new THREE.CircleGeometry(2.4, 28), water); w2.rotation.x = -Math.PI / 2; w2.position.set(px, 2.79 + CURB, pz); scene.add(w2);
  // water spray: additive glowing column
  const spray = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3.2, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xcff4ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  spray.position.set(px, 5.4 + CURB, pz); spray.rotation.x = Math.PI; scene.add(spray);

  // beach umbrellas + towels
  const um = [];
  for (let k = 0; k < 40; k++) {
    const x = -HALF + 20 + r() * (HALF * 2 - 40), z = HALF + 22 + r() * 12;
    const cols = [0xff5a5f, 0x2ec4b6, 0xffcb47, 0x3a86ff, 0xff8fab];
    um.push(place(paint(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), 0xeeeeee), x, 1.3, z));
    um.push(place(paint(new THREE.ConeGeometry(1.6, 0.6, 10), cols[k % 5]), x, 2.55, z));
    um.push(place(paint(new THREE.BoxGeometry(0.9, 0.02, 1.9), cols[(k + 2) % 5]), x + 1.4, 0.02, z + 0.4, 0, r() * 0.6, 0));
  }
  const umm = new THREE.Mesh(merge(um), vcMaterial({ roughness: 0.8, side: THREE.DoubleSide }));
  umm.castShadow = true; umm.receiveShadow = true; scene.add(umm);
  return { lampMat, spray };
}

export function createCity(scene, city, gy) {
  const U = { uNight: { value: 0 }, uTime: { value: 0 }, uWet: { value: 0 } };
  // flat land from the northern outskirts down to where the beach starts to slope
  const z0 = -HALF - 700, z1 = HALF + 30;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 1400, z1 - z0, 1, 1), groundMaterial(U));
  ground.rotation.x = -Math.PI / 2; ground.position.z = (z0 + z1) / 2; ground.receiveShadow = true;
  scene.add(ground);
  // the beach slopes gently under the sea
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 1400, 200, 1, 50), ground.material);
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0, z1 + 100);
  const sp = sand.geometry.attributes.position;
  for (let i = 0; i < sp.count; i++) { const z = z1 + 100 - sp.getY(i); sp.setZ(i, gy(0, z)); }
  sand.geometry.computeVertexNormals(); sand.receiveShadow = true;
  scene.add(sand);
  buildBlocks(scene, city);
  const buildings = buildBuildings(scene, city, U);
  const props = buildProps(scene, city, U, gy);
  function update(time, night) {
    U.uTime.value = time; U.uNight.value = night;
    props.lampMat.userData.emit.value = night * 3.0;
    props.spray.scale.y = 1 + Math.sin(time * 5) * 0.06;
  }
  return { update, U, buildings };
}
