// Palm City — the city, drawn. Every building, block and road is ONE instanced/merged mesh with
// its detail generated in the fragment shader: windows, mullions, brick courses, storefronts,
// paving joints, lane lines and crosswalks are all computed per pixel from world position. That
// means detail is resolution-independent — as crisp on a 4K monitor as on a phone — with zero
// texture memory, and the whole skyline is a handful of draw calls.
import * as THREE from "../vendor/three.module.js";
import { N, ROAD, BLOCK, WALK, CURB, CELL, HALF, STYLE, blockC, mulberry32, PLAZA } from "./world.js";
import { paint, place, merge, vcMaterial, tileInstances } from "./geo.js";
import { buildPalms } from "./palms.js";
import { addTile } from "./cull.js";

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
  // bump the (view-space) normal by a height field h (metres), using screen-space derivatives
  vec3 bumpN(vec3 n, float h, vec3 vpos) {
    vec3 sx = dFdx(-vpos), sy = dFdy(-vpos), r1 = cross(sy, n), r2 = cross(n, sx);
    float det = dot(sx, r1); vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
    return normalize(abs(det) * n - grad);
  }
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
        ${GLSL_COMMON}
        // what's behind a window: a room, ray-traced as a box (interior mapping). cf: where in the
        // cell this pixel is (0..1), sz: the cell in metres, d: the view ray in the wall's frame
        // (x along the wall, y up, z into the building). Returns the light leaving the room.
        vec3 room(vec2 cf, vec2 sz, vec3 d, vec2 cid, float seed, float lit, float office, float night) {
          float D = office > 0.5 ? 7.0 : sz.x * 0.9 + 1.6;
          vec3 p = vec3(cf.x * sz.x, cf.y * sz.y, 0.0);
          vec3 ad = vec3(abs(d.x) < 1e-4 ? 1e-4 : d.x, abs(d.y) < 1e-4 ? 1e-4 : d.y, max(d.z, 1e-3));
          float tx = ((ad.x > 0.0 ? sz.x : 0.0) - p.x) / ad.x, ty = ((ad.y > 0.0 ? sz.y : 0.0) - p.y) / ad.y, tz = D / ad.z;
          float t = min(min(tx, ty), tz);
          vec3 h = p + ad * t, hn = h / vec3(sz, D);
          float r1 = h12(cid + seed * 3.7), r2 = h12(cid * 1.9 + 4.1), r3 = h12(cid * 2.7 + 8.3);
          vec3 wallC = office > 0.5 ? vec3(0.72, 0.73, 0.72) : mix(mix(vec3(0.82, 0.76, 0.66), vec3(0.66, 0.7, 0.74), step(0.5, r1)), vec3(0.8, 0.66, 0.6), step(0.82, r1));
          vec3 c; float ceilF = 0.0;
          if (t == tz) {
            c = wallC;
            if (office > 0.5) {
              // open-plan office: desks and monitors along the back, a partition line
              float desk = step(hn.y, 0.24) * step(0.04, fract(hn.x * 2.0));
              c = mix(c, vec3(0.3, 0.3, 0.31), desk);
              c = mix(c, vec3(0.05, 0.06, 0.08), step(abs(hn.y - 0.31), 0.05) * step(abs(fract(hn.x * 3.0 + r2) - 0.5), 0.15));
            } else {
              // a sofa or bed, a picture, a doorway
              float furn = step(hn.y, 0.22 + 0.12 * r2) * step(abs(hn.x - 0.3 - r3 * 0.4), 0.2 + 0.15 * r2);
              c = mix(c, mix(vec3(0.3, 0.22, 0.16), vec3(0.32, 0.34, 0.4), r3), furn);
              float pic = step(abs(hn.x - 0.25 - r2 * 0.5), 0.1) * step(abs(hn.y - 0.6), 0.09) * step(0.35, r3);
              c = mix(c, vec3(0.2 + r1 * 0.5, 0.3, 0.25 + r2 * 0.4), pic);
              float door = step(abs(hn.x - 0.8 + r1 * 0.6), 0.1) * step(hn.y, 0.7) * step(r3, 0.4);
              c = mix(c, c * 0.45, door);
            }
          } else if (t == ty) {
            if (ad.y > 0.0) { c = vec3(0.86, 0.86, 0.84); ceilF = 1.0;
              if (office > 0.5) c = mix(c, vec3(1.15), band(h.x / 1.2, 0.2, 0.8) * band(h.z / 1.8, 0.3, 0.7));   // light panels
            } else {
              c = office > 0.5 ? vec3(0.32, 0.33, 0.36) : mix(vec3(0.46, 0.32, 0.2), vec3(0.6, 0.58, 0.54), step(0.6, r2));   // carpet / wood / tile
              if (office < 0.5) c *= 0.9 + 0.1 * band(h.x / 0.15, 0.0, 0.5);
              c = mix(c, vec3(0.28, 0.2, 0.15), step(length(vec2(hn.x - 0.5 + (r1 - 0.5) * 0.4, hn.z - 0.5)), 0.18) * step(0.5, r2));   // a rug or table
            }
          } else c = wallC * 0.82;
          // daylight from the window, fading into the room; at night the room's own lamps
          float back = hn.z;
          vec3 day = c * (0.24 - 0.17 * back) * (1.0 - night);
          vec3 warm = mix(vec3(1.0, 0.72, 0.42), vec3(0.85, 0.92, 1.0), step(0.75, r2) + office * 0.8);
          float lampPos = length(vec2(hn.x - 0.5, hn.z - 0.45));
          vec3 lamp = c * warm * (0.55 + 0.6 * (1.0 - smoothstep(0.0, 0.8, lampPos))) + warm * ceilF * (1.0 - smoothstep(0.0, 0.18, lampPos)) * (office > 0.5 ? 0.0 : 3.0);
          // a TV's blue flicker in some dark flats
          vec3 tv = vec3(0.2, 0.3, 0.6) * step(0.85, r3) * (1.0 - lit) * night * (0.4 + 0.3 * h12(vec2(floor(r1 * 40.0), 1.0)));
          return day + lamp * lit * night * 1.4 + tv * c;
        }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float fRough = 0.9, fMetal = 0.0; vec3 fEmit = vec3(0.0);
        float gH = 0.0, gGl = 0.0, gF = 0.0, gRough = 0.05, gHt = 0.0; vec3 gTint = vec3(1.0), gRw = vec3(0.0, 1.0, 0.0);
        {
          int style = int(vStyle.x + 0.5);
          float seed = vStyle.y;
          float baseY = vStyle.w;
          vec3 wall = vBase;
          vec3 an = abs(vON);
          float v = vWP.y - baseY;                         // height up this building
          float top = vBoxS.y - v;                         // distance below the roof line
          vec3 concrete = vec3(0.46, 0.44, 0.41);
          vec2 cellF = vec2(0.5), cellSz = vec2(3.0); float office = 0.0;
          if (an.y > 0.5) {
            // ---- roof: tar and gravel, stained, patched, with a concrete parapet cap ----
            float edge = min(vBoxS.x * 0.5 - abs(vWP.x - vBoxC.x), vBoxS.z * 0.5 - abs(vWP.z - vBoxC.z));
            float n = vnoise(vWP.xz * 2.3) * 0.35 + vnoise(vWP.xz * 0.31) * 0.65;
            vec3 roof = vec3(0.27, 0.26, 0.25) * (0.75 + n * 0.45);
            roof = mix(roof, vec3(0.16, 0.15, 0.14), smoothstep(0.62, 0.75, vnoise(vWP.xz * 0.12 + seed * 9.0)) * 0.7);   // tar patches
            roof = mix(roof, vec3(0.42, 0.41, 0.38), band(vWP.x / 6.0 + seed, 0.0, 0.03) * 0.6);                         // membrane seams
            roof = mix(concrete * 1.2, roof, smoothstep(0.3, 0.55, edge));
            diffuseColor.rgb = roof; fRough = 0.95;
          } else {
            float u = an.x > 0.5 ? vWP.z : vWP.x;
            float halfW = an.x > 0.5 ? vBoxS.z * 0.5 : vBoxS.x * 0.5;
            float cu = an.x > 0.5 ? vBoxC.z : vBoxC.x;
            float edgeD = halfW - abs(u - cu);
            u -= cu - halfW;
            // big soft discolouration + fine stucco grain: paint that has been in the sun for 20 years
            float blot = vnoise(vec2(u * 0.06 + seed * 13.0, v * 0.045));
            vec3 col = wall * (0.84 + blot * 0.24) * (0.96 + vnoise(vec2(u, v) * 7.0) * 0.07);
            float glass = 0.0; float blind = 0.0;
            vec2 cellId = vec2(0.0);
            float winTop = 0.0, winX = 0.0, below = 0.0;
            float curt = 0.0; vec3 curC = vec3(0.0);
            if (style == 0) {
              // curtain wall: tinted glass panels, dark metal mullions, opaque spandrels
              vec2 c = vec2(u / 2.4, v / 3.9);
              cellId = floor(c);
              float mull = 1.0 - band(c.x, 0.035, 0.965) * band(c.y, 0.05, 0.95);
              float spandrel = 1.0 - band(c.y, 0.0, 0.76);
              float tint = h12(cellId + seed * 17.0);
              cellF = fract(c); cellSz = vec2(2.4, 3.9); office = 1.0;
              gH += 0.03 * mull - 0.02 * spandrel;
              col = mix(wall * (0.7 + tint * 0.2), vec3(0.2, 0.21, 0.22), mull);
              col = mix(col, wall * 0.45, spandrel * (1.0 - mull));
              glass = (1.0 - mull) * (1.0 - spandrel);
              fRough = mix(0.5, 0.04 + tint * 0.12, glass);   // every pane reflects slightly differently
            } else {
              float fh = style == 3 ? 3.0 : (style == 4 ? 3.6 : 3.3);
              float bay = style == 3 ? 4.2 : (style == 2 ? 2.8 : (style == 4 ? 1.7 : 3.2));
              float vo = style == 3 ? v - 0.6 : v;
              vec2 c = vec2(u / bay, vo / fh);
              cellId = floor(c);
              float wx0 = style == 4 ? 0.04 : (style == 3 ? 0.3 : 0.25), wx1 = 1.0 - wx0;
              float wy0 = style == 4 ? 0.36 : 0.27, wy1 = style == 4 ? 0.86 : 0.8;
              float valid = step(0.0, vo) * step(0.6, top);
              float win = band(c.x, wx0, wx1) * band(c.y, wy0, wy1) * valid;
              vec2 f = fract(c);
              cellF = vec2((f.x - wx0) / (wx1 - wx0), (f.y - wy0) / (wy1 - wy0)); cellSz = vec2(bay * (wx1 - wx0), fh * (wy1 - wy0)) + vec2(0.8, 0.6);
              cellF = (cellF * (cellSz - vec2(0.8, 0.6)) + vec2(0.4, 0.3)) / cellSz;
              office = style == 4 ? 1.0 : 0.0;
              if (style == 2) {
                // brick: running bond, recessed mortar, per-brick tone, soot
                vec2 bb = vec2(vWP.y / 0.28, u / 0.62);
                bb.y += mod(floor(bb.x), 2.0) * 0.5;
                float mortar = 1.0 - band(bb.x, 0.08, 1.0) * band(bb.y, 0.04, 1.0);
                float tone = h12(floor(bb) + seed) * 0.2 - 0.1;
                col = mix(wall * (0.9 + tone + blot * 0.15), vec3(0.5, 0.47, 0.43), mortar * 0.75);
                gH -= mortar * 0.012 - tone * 0.004;
                col = mix(col, vec3(0.62, 0.58, 0.52), band(c.x, wx0 - 0.05, wx1 + 0.05) * line1(f.y, wy0 - 0.07, wy0) * valid);  // stone sills
                col = mix(col, vec3(0.55, 0.51, 0.46), band(c.x, wx0 - 0.03, wx1 + 0.03) * line1(f.y, wy1, wy1 + 0.07) * valid);  // lintels
              } else {
                // frame + protruding sill; shutters on houses
                float fr = band(c.x, wx0 - 0.035, wx1 + 0.035) * band(c.y, wy0 - 0.03, wy1 + 0.03) * valid - win;
                vec3 frameC = style == 3 ? vec3(0.9, 0.88, 0.84) : mix(vec3(0.72, 0.72, 0.7), vec3(0.25, 0.25, 0.26), step(0.5, h12(vec2(seed, 3.0))));
                col = mix(col, frameC, fr);
                gH += fr * 0.03;
                float sill = band(c.x, wx0 - 0.07, wx1 + 0.07) * line1(f.y, wy0 - 0.08, wy0 - 0.03) * valid;
                col = mix(col, wall * 1.08 + 0.05, sill);
                gH += sill * 0.06;
                col *= 1.0 - 0.35 * band(c.x, wx0 - 0.07, wx1 + 0.07) * line1(f.y, wy0 - 0.13, wy0 - 0.08) * valid;   // shadow under the sill
                if (style == 3) {
                  float sh = (band(c.x, wx0 - 0.2, wx0 - 0.04) + band(c.x, wx1 + 0.04, wx1 + 0.2)) * band(c.y, wy0, wy1) * valid;
                  col = mix(col, mix(vec3(0.24, 0.36, 0.3), vec3(0.3, 0.3, 0.36), step(0.5, h12(vec2(seed, 7.0)))) * (0.85 + band(f.y * 14.0, 0.0, 0.5) * 0.2), sh);
                }
                if (style == 4) col = mix(col, concrete * (0.95 + blot * 0.1), 0.55);   // raw concrete slab office
              }
              glass = win;
              // the window in metres, and the view into it
              float W = (wx1 - wx0) * bay, Hh = (wy1 - wy0) * fh;
              float lx = (f.x - wx0) * bay, ly = (f.y - wy0) * fh;
              vec3 vdw = normalize(vWP - cameraPosition);
              vec3 Tw0 = an.x > 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
              float dx0 = dot(vdw, Tw0), dz0 = max(dot(vdw, -normalize(vON)), 0.08);
              // the reveal: the opening is 16 cm deep, so from an angle you see its inside faces
              float RD = 0.16;
              float jamb = dx0 > 0.0 ? step(W - RD * dx0 / dz0, lx) : step(lx, RD * -dx0 / dz0);
              float head = vdw.y > 0.0 ? step(Hh - RD * vdw.y / dz0, ly) : 0.0;
              float sillIn = vdw.y < 0.0 ? step(ly, RD * -vdw.y / dz0) : 0.0;
              float rev = win * max(max(jamb, head), sillIn);
              vec3 revC = (style == 2 ? vec3(0.62, 0.58, 0.52) : wall * 1.02) * (head > 0.5 ? 0.55 : sillIn > 0.5 ? 0.95 : 0.78);
              // glazing bars: a centre mullion in the wider windows, a transom near the top
              vec3 mf = style == 2 ? vec3(0.84, 0.82, 0.78) : (style == 3 ? vec3(0.92, 0.9, 0.86) : vec3(0.3, 0.31, 0.33));
              float bars = (W > 1.2 ? 1.0 - step(0.035, abs(lx - W * 0.5)) : 0.0) + (style != 4 ? 1.0 - step(0.03, abs(ly - Hh * 0.72)) : 0.0);
              bars += 1.0 - step(0.045, min(min(lx, W - lx), min(ly, Hh - ly)));          // the frame round the glass
              bars = clamp(bars, 0.0, 1.0) * win * (1.0 - rev);
              col = mix(col, revC, rev);
              col = mix(col, mf, bars);
              gH += bars * 0.025;
              glass = win * (1.0 - rev) * (1.0 - bars);
              winTop = line1(f.y, wy1 - 0.12, wy1) * win;          // recess shadow cast by the head of the opening
              winX = line1(f.x, wx0, wx0 + 0.07) * win;            // and by the side jamb
              // blinds / curtains: every window drawn to its own height
              float bl = h12(cellId * vec2(2.3, 1.7) + seed * 5.0);
              float bh = wy1 - (wy1 - wy0) * bl * 0.9;
              blind = win * step(bh, f.y) * step(0.25, bl);
              // flats: some windows have curtains drawn to the sides instead, in their own colours
              float hc = h12(cellId * vec2(4.1, 2.9) + seed * 3.0);
              if (style != 4 && hc > 0.5) {
                float cw = W * (0.12 + 0.3 * h12(cellId + 17.0));
                curt = win * max(step(lx, cw), step(W - cw, lx));
                blind = max(blind * 0.0, curt);
                curC = mix(mix(vec3(0.7, 0.25, 0.2), vec3(0.85, 0.78, 0.6), step(0.4, hc)), vec3(0.3, 0.4, 0.55), step(0.75, hc)) * (0.75 + 0.25 * sin(lx * 28.0));
              }
              blind *= 1.0 - bars;
              // grime streaks washing down from each sill
              below = band(c.x, wx0 + 0.04, wx1 - 0.04) * valid * smoothstep(wy0 + 0.02, wy0 - 0.9, f.y + (f.y > wy0 ? 0.0 : 0.0)) * step(f.y, wy0);
              // ground floor: shopfronts with shutters, signage band
              if (style != 3 && v < 4.4 && baseY < 0.5) {
                float sb = floor(u / 5.5);
                float k = h12(vec2(sb, seed * 7.0));
                float fu = fract(u / 5.5);
                float open = band(u / 5.5, 0.07, 0.93) * line1(v, 0.3, 3.1);
                col = mix(concrete * 0.9, col, step(3.1, v));
                if (k < 0.3) {
                  // roll-down shutter: corrugated steel, a spray-painted tag
                  vec3 steel = vec3(0.5, 0.51, 0.5) * (0.85 + band(v * 7.0, 0.0, 0.5) * 0.18);
                  float tag = step(0.6, vnoise(vec2(u * 1.3, v * 2.0) + seed * 3.0)) * line1(v, 0.6, 2.2);
                  steel = mix(steel, mix(vec3(0.7, 0.15, 0.25), vec3(0.15, 0.3, 0.7), step(0.5, h12(vec2(sb, 1.0)))), tag * 0.8);
                  col = mix(col, steel, open); fRough = 0.55; fMetal = 0.4 * open;
                  gH += open * 0.012 * band(v * 7.0, 0.0, 0.5);
                } else {
                  glass = open;
                  cellF = vec2(fu, clamp((v - 0.3) / 2.8, 0.0, 1.0)); cellSz = vec2(5.5, 3.2); office = 0.0;
                  col = mix(col, vec3(0.12, 0.12, 0.13), band(u / 5.5, 0.05, 0.95) * line1(v, 0.2, 3.2) - open);   // dark aluminium frames
                }
                // signage band above the shop
                float sign = band(u / 5.5, 0.12, 0.88) * line1(v, 3.3, 4.1);
                vec3 sc = mix(vec3(0.75, 0.12, 0.1), vec3(0.08, 0.22, 0.45), step(0.5, h12(vec2(sb, 2.0))));
                sc = mix(sc, vec3(0.92, 0.9, 0.84), step(0.7, h12(vec2(sb, 4.0))));
                col = mix(col, sc, sign * step(0.25, k));
                fEmit += sc * sign * step(0.25, k) * uNight * 1.6;
                cellId = vec2(sb, -1.0);
                below = 0.0; blind = 0.0;
              }
            }
            // ---- glass: no paint of its own; what you see is the room behind it and the world it
            // reflects (both added in the lighting, below) ----
            float lit = step(style == 0 ? 0.7 : 0.64, h12(cellId * vec2(1.7, 3.1) + seed * 41.0));
            if (cellId.y < -0.5) lit = 1.0;                                // shops keep their lights on
            vec3 vd = normalize(vWP - cameraPosition);
            vec3 Tw = an.x > 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
            vec3 Nw = normalize(vON);
            vec3 dl = vec3(dot(vd, Tw), vd.y, dot(vd, -Nw));
            gGl = glass * (1.0 - blind);
            if (gGl > 0.001) {
              vec3 inside = room(clamp(cellF, 0.0, 1.0), cellSz, dl, cellId + vec2(seed * 7.0, 0.0), seed, lit, office, uNight);
              float ndv = clamp(dot(Nw, -vd), 0.0, 1.0);
              gF = (style == 0 ? 0.16 : 0.05) + (1.0 - (style == 0 ? 0.16 : 0.05)) * pow(1.0 - ndv, 5.0);
              // tinted glass on the towers: the building's own colour, brightened to a tint
              gTint = style == 0 ? mix(vec3(1.0), wall / max(max(wall.r, wall.g), max(wall.b, 0.05)), 0.55) : vec3(0.92, 0.95, 0.96);
              fEmit += inside * gGl * (1.0 - gF) * (style == 0 ? gTint * 0.8 : vec3(1.0));
              gRw = reflect(vd, Nw);
              gRough = style == 0 ? 0.02 + h12(cellId + 3.0) * 0.05 : 0.04 + h12(cellId + 3.0) * 0.06;
              gHt = vWP.y;
            }
            col = mix(col, vec3(0.0), gGl);
            if (style != 0) fRough = mix(style == 2 ? 0.95 : 0.9, 0.12 + h12(cellId + 3.0) * 0.1, glass);
            fMetal = mix(fMetal, 0.0, glass);
            col *= 1.0 - 0.55 * (winTop + winX) * glass * blind;
            // blinds sit just behind the glass: pale, matte, lit by day, glowing when the room's lit
            vec3 blindC = mix(vec3(0.72, 0.68, 0.6), vec3(0.8, 0.8, 0.78), h12(cellId + 11.0));
            col = mix(col, mix(blindC * (0.85 + band(vWP.y * 9.0, 0.0, 0.5) * 0.1), curC, curt), blind * 0.85);
            fRough = mix(fRough, 0.8, blind); fMetal = mix(fMetal, 0.0, blind);
            vec3 warm = mix(vec3(1.0, 0.7, 0.36), vec3(0.72, 0.84, 1.0), step(0.8, h12(cellId + seed)));
            fEmit += warm * blind * glass * lit * uNight * 1.1;
            // ---- weathering ----
            float streak = vnoise(vec2(u * 4.5, v * 0.35)) * vnoise(vec2(u * 11.0, v * 0.2));
            col *= 1.0 - below * (0.25 + streak * 0.5) * (1.0 - glass);                       // sill run-off
            col *= 1.0 - smoothstep(9.0, 0.0, top) * streak * 0.35;                          // rain streaks from the parapet
            float damp = smoothstep(1.4 + vnoise(vec2(u * 0.8, 0.0)) * 0.9, 0.0, v + (baseY > 0.5 ? 9.0 : 0.0));
            col = mix(col, col * vec3(0.62, 0.64, 0.58), damp * 0.8);                        // rising damp / splash-back
            float peel = 0.4 * smoothstep(0.78, 0.9, vnoise(vec2(u, v) * 0.55 + seed * 21.0)) * smoothstep(0.4, 0.7, vnoise(vec2(u, v) * 3.1)) * (1.0 - glass) * step(float(style), 1.5) * step(0.5, float(style));
            col = mix(col, concrete * (0.9 + streak * 0.2), peel * 0.85);                    // paint gone, render showing
            // corners and parapet: AO into the corners, a concrete coping on top
            col *= 0.8 + 0.2 * smoothstep(0.0, 0.8, edgeD);
            col = mix(col, concrete * 1.15, line1(top, 0.0, 0.4));
            col *= 1.0 - 0.3 * line1(top, 0.4, 0.55);
            diffuseColor.rgb = col;
          }
        }`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(fRough, gRough, gGl);")
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = fMetal;")
      // relief: recessed windows, sills, frames, mortar; faded out with distance (no shimmer)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        normal = bumpN(normal, gH * clamp(1.0 - length(vViewPosition) / 140.0, 0.0, 1.0), vViewPosition);`)
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += fEmit;")
      // glass reflects the sky and, below the skyline, the city across the street
      .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>
        if (gGl > 0.001) {
          vec3 env = vec3(0.0);
          #ifdef USE_ENVMAP
            env = getIBLRadiance(geometryViewDir, geometryNormal, gRough);
            vec3 envH = getIBLRadiance(geometryViewDir, normalize(geometryNormal + vec3(0.0, -0.6, 0.0)), 0.6);
          #else
            vec3 envH = vec3(0.3);
          #endif
          float az = atan(gRw.z, gRw.x);
          float colI = floor(az * 7.0 + vStyle.y * 5.0);
          float hgt = 0.04 + 0.42 * h12(vec2(colI, 3.0)) * h12(vec2(colI, 9.0) + 1.0);
          hgt *= 1.0 - clamp(gHt / 260.0, 0.0, 0.85);                    // high floors see over the rooftops
          float edgeW = fwidth(gRw.y) + 0.004;
          float bld = 1.0 - smoothstep(hgt - edgeW, hgt + edgeW, gRw.y);
          vec2 wg = vec2(az * 70.0, gRw.y * 90.0);
          float wins = band(wg.x, 0.2, 0.8) * band(wg.y, 0.25, 0.75);
          vec3 city = envH * mix(0.32, 0.55, h12(vec2(colI, 5.0))) * (1.0 - wins * 0.35);
          city += vec3(1.0, 0.75, 0.45) * wins * step(0.6, h12(floor(wg) + colI)) * uNight * 0.9;
          vec3 refl = mix(env, city, bld);
          reflectedLight.indirectSpecular = mix(reflectedLight.indirectSpecular, refl * gF * gTint, gGl);
          reflectedLight.indirectDiffuse *= 1.0 - gGl;
          reflectedLight.directDiffuse *= 1.0 - gGl;
        }`);
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
  tileInstances(scene, mesh, 240);

  // ---- roof clutter: AC units, water tanks, antenna masts, pitched roofs on houses ----
  const r = mulberry32(0xC0FFEE);
  const parts = [];
  const houses = [];
  const byTile = new Map();
  for (const b of B) {
    if (b.style === STYLE.HOUSE) { houses.push(b); continue; }
    const p0 = parts.length;
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
    // a stair / lift housing with its door, vent stacks and pipes, a satellite dish on the flats
    {
      const hx = b.x + (r() - 0.5) * Math.max(0, b.w - 8), hz = b.z + (r() - 0.5) * Math.max(0, b.d - 8);
      if (b.w > 9 && b.d > 9) {
        parts.push(place(paint(new THREE.BoxGeometry(3.2, 3.0, 3.6), 0x9a958c), hx, top + 1.5, hz));
        parts.push(place(paint(new THREE.BoxGeometry(3.5, 0.2, 3.9), 0x77736c), hx, top + 3.1, hz));
        parts.push(place(paint(new THREE.BoxGeometry(1.0, 2.1, 0.06), 0x4a4c50), hx, top + 1.05, hz + 1.82));
      }
      for (let k = 0; k < 2; k++) {
        const vx = b.x + (r() - 0.5) * (b.w - 3), vz = b.z + (r() - 0.5) * (b.d - 3);
        parts.push(place(paint(new THREE.CylinderGeometry(0.16, 0.16, 1.2, 6, 1, true), 0x8c8f92), vx, top + 0.6, vz));
        parts.push(place(paint(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 6), 0x6c6f72), vx, top + 1.25, vz));
      }
      if (b.style !== STYLE.GLASS && r() < 0.6) {
        const sx = b.x + (r() - 0.5) * (b.w - 3), sz = b.z + (r() - 0.5) * (b.d - 3);
        parts.push(place(paint(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 5), 0x555555), sx, top + 0.5, sz));
        parts.push(place(paint(new THREE.SphereGeometry(0.45, 7, 3, 0, Math.PI * 2, 0, 1.1), 0xd8d8d4), sx, top + 1.0, sz, 1.0, r() * 6, 0));
      }
    }
    // stone cornice round the roof line and a string course over the shops (not on the glass towers)
    if (b.style !== STYLE.GLASS) {
      const cc = b.style === STYLE.BRICK ? 0xb8ad9c : b.style === STYLE.CONCRETE ? 0x9a978f : 0xece6da;
      const ring = (y, h, out, hex) => {
        parts.push(place(paint(new THREE.BoxGeometry(b.w + out * 2, h, out), hex), b.x, y, b.z + b.d / 2 + out / 2));
        parts.push(place(paint(new THREE.BoxGeometry(b.w + out * 2, h, out), hex), b.x, y, b.z - b.d / 2 - out / 2));
        parts.push(place(paint(new THREE.BoxGeometry(out, h, b.d), hex), b.x + b.w / 2 + out / 2, y, b.z));
        parts.push(place(paint(new THREE.BoxGeometry(out, h, b.d), hex), b.x - b.w / 2 - out / 2, y, b.z));
      };
      ring(top - 0.25, 0.42, 0.32, cc);                 // cornice
      ring(top - 0.58, 0.16, 0.16, cc);                 // bed moulding under it
      if (b.y < 0.5 && b.h > 8) ring(4.25, 0.24, 0.14, cc);   // string course above the shopfronts
    } else {
      // the towers' crown: a band of metal fins round the roof
      const t = 0.22, H = 1.6, C = 0x6a6e72;
      parts.push(place(paint(new THREE.BoxGeometry(b.w + t * 2, H, t), C), b.x, top + H / 2 - 0.2, b.z + b.d / 2 + t / 2));
      parts.push(place(paint(new THREE.BoxGeometry(b.w + t * 2, H, t), C), b.x, top + H / 2 - 0.2, b.z - b.d / 2 - t / 2));
      parts.push(place(paint(new THREE.BoxGeometry(t, H, b.d), C), b.x + b.w / 2 + t / 2, top + H / 2 - 0.2, b.z));
      parts.push(place(paint(new THREE.BoxGeometry(t, H, b.d), C), b.x - b.w / 2 - t / 2, top + H / 2 - 0.2, b.z));
    }
    if (b.style === STYLE.GLASS && b.h > 90 && r() < 0.6) {
      parts.push(place(paint(new THREE.CylinderGeometry(0.18, 0.3, 14, 6), 0xd0d0d0), b.x, top + 7, b.z));
      parts.push(place(paint(new THREE.SphereGeometry(0.45, 8, 6), 0xff3030, 6), b.x, top + 14.2, b.z));   // aircraft warning light
    }
    const key = Math.floor(b.x / 240) + "," + Math.floor(b.z / 240);
    if (!byTile.has(key)) byTile.set(key, []);
    byTile.get(key).push(...parts.splice(p0));
  }
  // merged per 240 m tile, so the renderer can skip the ones off screen or far away
  const clutterMat = vcMaterial({ roughness: 0.7 });
  for (const list of byTile.values()) {
    const mm = new THREE.Mesh(merge(list), clutterMat);
    mm.castShadow = true; mm.receiveShadow = true; scene.add(mm);
    mm.geometry.computeBoundingSphere(); mm.boundingSphere = mm.geometry.boundingSphere;
    addTile(mm, 520);
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
            col = vec3(0.118, 0.114, 0.11) * (0.78 + n1 * 0.26 + n2 * 0.16 + n3 * 0.1);
            // square-cut repair patches (fresher, darker tarmac) and older faded ones
            vec2 pc = floor(p / vec2(7.0, 4.0));
            float patchK = h12(pc + 13.0);
            col *= patchK > 0.88 ? 0.72 : (patchK < 0.06 ? 1.25 : 1.0);
            // cracks: meandering hairlines where a noise field crosses 0.5, sealed with black tar
            float cn = vnoise(p * 0.7) * 0.55 + vnoise(p * 2.9) * 0.3 + vnoise(p * 9.0) * 0.15;
            float crack = 1.0 - smoothstep(0.0, fwidth(cn) * 0.9 + 0.0015, abs(cn - 0.5));
            crack *= smoothstep(0.55, 0.75, vnoise(p * 0.07 + 7.0));
            col *= 1.0 - crack * 0.22;
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
              col *= 1.0 - 0.08 * (line1(lanePos, 1.1, 2.5) + line1(lanePos, 4.2, 5.6));
              if (nearX < 0.5) {
                float y = line1(abs(c), 0.12, 0.32);
                mk = max(mk, y); mc = mix(mc, paintY, y);
                float dash = line1(abs(c), 3.25, 3.45) * band(a / 7.0, 0.0, 0.5);
                mk = max(mk, dash);
                mk = max(mk, line1(abs(c), 6.2, 6.35));                       // parking-strip line
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
            mk *= 0.45 + 0.4 * vnoise(p * 2.3) + 0.15 * vnoise(p * 9.0);   // worn, sun-faded paint
            // oil drips down the middle of each lane, darker near junctions where cars wait
            if (ns != ew) {
              float mid = line1(abs(c), 1.1, 2.5) + line1(abs(c), 4.2, 5.6);
              float oil = smoothstep(0.62, 0.8, vnoise(p * vec2(0.9, 0.9) + 31.0)) * mid;
              oil *= 0.5 + 0.8 * (step(along, ROAD + 12.0) + step(CELL - 12.0, along));
              col *= 1.0 - clamp(oil, 0.0, 1.0) * 0.45;
            }
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
            float big = vnoise(vWP.xz * 0.13), fine = vnoise(vWP.xz * 3.0);
            col = vec3(0.36, 0.345, 0.32) * (0.86 + fine * 0.12 + h12(floor(t)) * 0.1 + big * 0.12);
            col *= 1.0 - joint * 0.3;
            // stains, gum, hairline cracks across some slabs
            col *= 1.0 - smoothstep(0.6, 0.85, vnoise(vWP.xz * 0.5 + 5.0)) * 0.28;
            // gum: small round dark spots
            vec2 gq = vWP.xz * 4.0; vec2 gi = floor(gq);
            float gum = step(0.985, h12(gi)) * (1.0 - smoothstep(0.08, 0.16, length(fract(gq) - 0.5)));
            col *= 1.0 - gum * 0.5;
            // a few slabs cracked corner to corner (straight, the way concrete actually breaks)
            vec2 ft = fract(t) - 0.5;
            float diag = abs(ft.x * 0.8 - ft.y + (h12(floor(t) + 9.0) - 0.5) * 0.3);
            col *= 1.0 - (1.0 - smoothstep(0.0, fwidth(diag) * 1.2 + 0.004, diag)) * step(0.88, h12(floor(t) + 4.0)) * 0.35;
            // granite kerbstone; now and then painted yellow for no-parking
            float kerb = line1(edge, 0.0, 0.32);
            vec3 kc = mix(vec3(0.52, 0.5, 0.47), vec3(0.72, 0.6, 0.22), step(0.8, h12(floor(vWP.xz / 12.0))));
            col = mix(col, kc * (0.85 + fine * 0.2), kerb);
            bRough = 0.92;
          } else {
            int k = int(vKind + 0.5);
            if (k == 1 || k == 3) {
              // grass: two-tone mottled lawn, mower stripes in the suburbs
              // sun-burnt Florida lawn: green where it's watered, straw where it isn't, bare dirt patches
              float n = vnoise(vWP.xz * 0.6) * 0.6 + vnoise(vWP.xz * 3.0) * 0.4;
              float dry = smoothstep(0.4, 0.75, vnoise(vWP.xz * 0.09 + 17.0));
              col = mix(vec3(0.16, 0.27, 0.08), vec3(0.27, 0.36, 0.12), n);
              col = mix(col, vec3(0.42, 0.38, 0.2) * (0.85 + n * 0.3), dry * 0.75);
              col = mix(col, vec3(0.3, 0.24, 0.17), smoothstep(0.78, 0.9, vnoise(vWP.xz * 0.3 + 3.0)) * 0.8);
              col *= 0.85 + vnoise(vWP.xz * 11.0) * 0.25;                                  // blades
              if (k == 3) col *= 0.95 + 0.05 * band(vWP.x / 3.0, 0.0, 0.5);
              bRough = 0.95;
            } else if (k == 2) {
              // plaza: radial stone rings around the fountain
              float r = length(q);
              float ring = band(r / 2.2, 0.0, 0.06);
              float ang = atan(q.y, q.x) * 12.0 / 3.14159;
              col = mix(vec3(0.45, 0.4, 0.34), vec3(0.4, 0.34, 0.28), band(r / 4.4, 0.0, 0.5));
              col *= (0.88 + vnoise(vWP.xz * 1.7) * 0.16) * (1.0 - smoothstep(0.62, 0.85, vnoise(vWP.xz * 0.35)) * 0.2);
              col *= 1.0 - 0.22 * (ring + band(ang, 0.0, 0.03) * step(4.0, r));
              bRough = 0.8;
            } else {
              vec2 t = vWP.xz / 0.9;
              float joint = 1.0 - band(t.x, 0.04, 1.0) * band(t.y + floor(t.x) * 0.5, 0.04, 1.0);
              col = vec3(0.37, 0.355, 0.33) * (0.86 + vnoise(vWP.xz * 1.3) * 0.16) * (1.0 - joint * 0.25);
              col *= 1.0 - smoothstep(0.55, 0.85, vnoise(vWP.xz * 0.2 + 9.0)) * 0.3;
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
// one pinnate frond: a rib arching out and down, with leaflets hanging off both sides
function frondGeo(L, droop, c0, c1, segN = 12, dead = false) {
  const pos = [], col = [];
  const C0 = new THREE.Color(c0), C1 = new THREE.Color(c1), tmp = new THREE.Color();
  const pt = t => [t * L, Math.sin(t * Math.PI * 0.5) * 0.9 * (1 - droop) - t * t * L * droop * 0.7];
  for (let i = 0; i < segN; i++) {
    const t0 = i / segN, t1 = (i + 1) / segN;
    const [x0, y0] = pt(t0), [x1, y1] = pt(t1);
    const lw = (0.3 + Math.sin(Math.min(1, t0 * 1.3) * Math.PI) * 0.8) * (dead ? 0.6 : 1.15);   // leaflet length
    for (const sd of [-1, 1]) {
      // a leaflet: thin triangle from the rib, swept forward and hanging down
      const bx = (x0 + x1) / 2, by = (y0 + y1) / 2;
      const tipX = bx + lw * 0.35, tipY = by - lw * (dead ? 0.9 : 0.55), tipZ = sd * lw;
      const v = [[x0, y0, 0], [x1, y1, 0], [tipX, tipY, tipZ]];
      if (sd < 0) { const t = v[0]; v[0] = v[1]; v[1] = t; }
      for (let k = 0; k < 3; k++) {
        pos.push(...v[k]);
        tmp.copy(C0).lerp(C1, k === 2 ? 0.6 + t0 * 0.4 : t0 * 0.5);
        col.push(tmp.r, tmp.g, tmp.b);
      }
    }
    // the rib itself (a thin ribbon)
    const rv = [[x0, y0 + 0.03, -0.03], [x1, y1 + 0.03, -0.02], [x1, y1 + 0.03, 0.02], [x0, y0 + 0.03, -0.03], [x1, y1 + 0.03, 0.02], [x0, y0 + 0.03, 0.03]];
    for (const q of rv) { pos.push(...q); tmp.copy(C0).lerp(new THREE.Color(0x8a8458), 0.5); col.push(tmp.r, tmp.g, tmp.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("aEmit", new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3), 1));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  g.computeVertexNormals();
  return g;
}
function palmGeometry(kind) {
  const r = mulberry32(kind === "royal" ? 11 : 23);
  const parts = [];
  const royal = kind === "royal";
  const H = royal ? 12.5 : 7.5, segs = royal ? 14 : 9, lean = royal ? 0.35 : 1.1;
  let px = 0;
  for (let s = 0; s < segs; s++) {
    const t0 = s / segs, t1 = (s + 1) / segs;
    // royal palms swell near the base and again just under the crown; sabals are rough and even
    const rad = t => royal ? 0.26 - t * 0.07 + Math.exp(-t * 9) * 0.1 : 0.22 - t * 0.02;
    const nx = Math.sin(t1 * 1.2) * lean;
    const g = new THREE.CylinderGeometry(rad(t1), rad(t0), H / segs + 0.02, 7, 1);
    const shade = (s % 2 ? 0x8d8577 : 0x7f776a);
    parts.push(place(paint(g, royal ? shade : (s % 2 ? 0x6e5a44 : 0x5e4c3a)), (px + nx) / 2, (t0 + t1) / 2 * H, 0, 0, 0, -(nx - px) / (H / segs)));
    // leaf-scar rings
    parts.push(place(paint(new THREE.TorusGeometry(rad(t1) + 0.005, 0.018, 3, 7), royal ? 0x5d574d : 0x4a3a2c), nx, t1 * H, 0, Math.PI / 2, 0, 0));
    px = nx;
  }
  const topX = px, topY = H;
  if (royal) {
    // the smooth green crown shaft under the fronds
    parts.push(place(paint(new THREE.CylinderGeometry(0.2, 0.24, 1.8, 10), 0x5e6e3a), topX, topY + 0.9, 0));
  } else {
    // sabal "boots": stubs of old leaf bases around the trunk
    for (let k = 0; k < 18; k++) {
      const y = H * (0.35 + r() * 0.6), a = r() * 6.28;
      parts.push(place(paint(new THREE.ConeGeometry(0.09, 0.45, 4), 0x6a5238), Math.sin(y / H * 1.2) * lean + Math.cos(a) * 0.2, y, Math.sin(a) * 0.2, 0.6 * Math.cos(a), 0, 0.6 * Math.sin(a)));
    }
  }
  const crownY = topY + (royal ? 1.7 : 0.1);
  const F = royal ? 20 : 22;
  for (let k = 0; k < F; k++) {
    const a = k / F * Math.PI * 2 + r() * 0.3;
    const up = r();
    const dead = k % (royal ? 7 : 5) === 0;
    const L = (royal ? 3.8 : 2.8) + r() * 0.9;
    const droop = dead ? 0.95 : 0.25 + up * 0.45;
    const g = frondGeo(L, droop, dead ? 0x6b5a3c : 0x44562a, dead ? 0x9a8054 : 0x8c9646, royal ? 12 : 10, dead);
    place(g, topX, crownY + (dead ? -0.3 : 0), 0, 0, a, dead ? -0.9 : (up - 0.3) * 0.5);
    parts.push(g);
  }
  return merge(parts);
}
// low tropical shrub: a cluster of dark glossy leaf balls
function shrubGeometry() {
  const parts = [];
  const r = mulberry32(99);
  const greens = [0x2e4a1c, 0x3a5522, 0x2a4220, 0x445c26];
  for (let k = 0; k < 6; k++) {
    const g = new THREE.IcosahedronGeometry(0.55 + r() * 0.35, 1);
    const pp = g.attributes.position;
    for (let i = 0; i < pp.count; i++) { const f = 0.8 + r() * 0.35; pp.setXYZ(i, pp.getX(i) * f, pp.getY(i) * f * 0.85, pp.getZ(i) * f); }
    g.computeVertexNormals();
    parts.push(place(paint(g, greens[k % 4]), (r() - 0.5) * 1.4, 0.45 + r() * 0.35, (r() - 0.5) * 1.4));
  }
  return merge(parts);
}
function treeGeometry() {
  const parts = [];
  parts.push(place(paint(new THREE.CylinderGeometry(0.22, 0.32, 3.2, 8), 0x6a4a32), 0, 1.6, 0));
  const blobs = [[0, 4.3, 0, 2.1], [1.2, 3.8, 0.4, 1.5], [-1.1, 3.9, -0.3, 1.6], [0.2, 3.7, -1.2, 1.4], [-0.3, 5.3, 0.3, 1.3]];
  const greens = [0x2c4a1c, 0x36551f, 0x28421a, 0x3f5c24, 0x31501e];
  blobs.forEach(([x, y, z, r], i) => parts.push(place(paint(new THREE.IcosahedronGeometry(r, 2), greens[i]), x, y, z)));
  return merge(parts);
}
// street lamp: flared cast base, tapered pole with a collar, a swan-neck arm sweeping out over the
// road to a cobra-head luminaire with a glowing lens bowl and a photocell; city banners on the pole.
// The head sits 1.8 m out at 6.2 m (the street-light map is baked from that point).
function lampGeometry() {
  const M = 0x3a3f45, D = 0x2c3034, p = [];
  p.push(place(paint(new THREE.CylinderGeometry(0.2, 0.3, 0.55, 8, 1, true), D), 0, 0.275, 0));                // cast base
  p.push(place(paint(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 8), 0x55595c), 0, 0.04, 0));         // footing plate
  p.push(place(paint(new THREE.BoxGeometry(0.14, 0.22, 0.03), 0x4a4f54), 0, 0.3, 0.205));              // access hatch
  p.push(place(paint(new THREE.CylinderGeometry(0.075, 0.125, 5.9, 8, 1, true), M), 0, 3.5, 0));               // tapered shaft
  p.push(place(paint(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 8, 1, true), D), 0, 2.6, 0));                // collar
  p.push(place(paint(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 6), D), 0, 6.42, 0));                  // cap
  // swan-neck arm
  const arm = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 6.1, 0), new THREE.Vector3(0, 6.75, -0.15), new THREE.Vector3(0, 6.48, -1.55));
  p.push(paint(new THREE.TubeGeometry(arm, 7, 0.055, 5), M));
  // cobra head: a streamlined shell, the lens bowl underneath, a photocell on top
  p.push(place(paint(new THREE.SphereGeometry(1, 8, 5), 0x8a8f94), 0, 6.42, -1.85, 0.06, 0, 0, 0.19, 0.1, 0.48));
  p.push(place(paint(new THREE.SphereGeometry(1, 8, 3, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0xfff0cc, 1), 0, 6.36, -1.88, 0.06, 0, 0, 0.15, 0.07, 0.38));   // lens: emissive
  p.push(place(paint(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 6), 0x222222), 0, 6.55, -1.7));
  // banners: two brackets and a pair of pennants, Palm City teal with a sunset stripe
  for (const y of [4.1, 5.5]) p.push(place(paint(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 4, 1, true), D), 0.31, y, 0, 0, 0, Math.PI / 2));
  p.push(place(paint(new THREE.BoxGeometry(0.5, 1.3, 0.015), 0x16807a), 0.36, 4.82, 0));
  p.push(place(paint(new THREE.BoxGeometry(0.5, 0.16, 0.02), 0xf08a32), 0.36, 4.5, 0));
  p.push(place(paint(new THREE.BoxGeometry(0.5, 0.06, 0.02), 0xf4e3c0), 0.36, 4.98, 0));
  return merge(p);
}
// the same lamp from a distance: a few boxes
function lampGeometryFar() {
  const p = [];
  p.push(place(paint(new THREE.CylinderGeometry(0.09, 0.15, 6.5, 6), 0x3a3f45), 0, 3.25, 0));
  p.push(place(paint(new THREE.BoxGeometry(0.1, 0.1, 1.7), 0x3a3f45), 0, 6.45, -0.85));
  p.push(place(paint(new THREE.BoxGeometry(0.48, 0.16, 0.95), 0x8a8f94), 0, 6.4, -1.85));
  p.push(place(paint(new THREE.BoxGeometry(0.4, 0.05, 0.8), 0xfff0cc, 1), 0, 6.3, -1.88));
  p.push(place(paint(new THREE.BoxGeometry(0.5, 1.3, 0.02), 0x16807a), 0.36, 4.82, 0));
  return merge(p);
}
function benchGeometry() {
  const parts = [];
  for (let k = 0; k < 3; k++) parts.push(place(paint(new THREE.BoxGeometry(1.9, 0.07, 0.14), 0x9a6a3e), 0, 0.46, -0.18 + k * 0.17));
  for (let k = 0; k < 2; k++) parts.push(place(paint(new THREE.BoxGeometry(1.9, 0.14, 0.05), 0x9a6a3e), 0, 0.72 + k * 0.18, 0.26, -0.2, 0, 0));
  for (const x of [-0.8, 0.8]) parts.push(place(paint(new THREE.BoxGeometry(0.08, 0.46, 0.5), 0x33363a), x, 0.23, 0));
  return merge(parts);
}
function instanced(scene, geo, mat, list, yOf, cast = true, maxD = 400, minD = -Infinity) {
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
  tileInstances(scene, mesh, 140, maxD, minD);   // static: split into tiles the renderer can skip, drawn out to ~500 m
  return mesh;
}

function buildProps(scene, city, U, gy) {
  const r = mulberry32(0x7A1A);
  // palms everywhere: coconut palms on the beach, royal and fan palms down the streets, big
  // canary date palms in the parks and gardens (the old leafy trees are palms now too)
  const items = [];
  const wave = (x, z) => Math.sin(x * 0.011) + Math.cos(z * 0.013);        // whole stretches of street share a species
  city.palms.forEach(([x, z, s]) => {
    const sp = z > HALF ? "coconut" : r() < 0.15 ? "coconut" : wave(x, z) > 0.2 ? "washingtonia" : "royal";
    items.push([x, z, r() * Math.PI * 2, s * (0.85 + r() * 0.3), sp, r() < 0.5 ? 0 : 1]);
  });
  city.trees.forEach(([x, z, s]) => items.push([x, z, r() * Math.PI * 2, s * (0.9 + r() * 0.25), r() < 0.65 ? "canary" : "royal", r() < 0.5 ? 0 : 1]));
  const NEAR = 95;
  buildPalms(U, items, (geo, mat, list, far) => {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    list.forEach(([x, z, a, k], i) => { m.compose(p.set(x, gy(x, z), z), q.setFromEuler(e.set(0, a, 0)), sc.setScalar(k)); mesh.setMatrixAt(i, m); });
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    scene.add(mesh);
    // near tiles get the detailed palms, everything further the light ones (out to 420 m)
    tileInstances(scene, mesh, 120, far ? 420 : NEAR, far ? NEAR : -Infinity);
  });
  if (city.shrubs && city.shrubs.length) instanced(scene, shrubGeometry(), vcMaterial({ roughness: 0.7 }), city.shrubs.map(([x, z, s]) => [x, z, r() * 6.28, s]), gy);
  const lampMat = vcMaterial({ roughness: 0.5, metalness: 0.3, emitMul: 0 });
  const lampList = city.lamps.map(([x, z, a]) => [x, z, a, 1]);
  instanced(scene, lampGeometry(), lampMat, lampList, gy, true, 95);              // detailed up close
  instanced(scene, lampGeometryFar(), lampMat, lampList, gy, false, 420, 95);     // simple further out
  // after dark each lamp has a soft halo round its lens (the bloom does the rest)
  const gc = document.createElement("canvas"); gc.width = gc.height = 64;
  const gx = gc.getContext("2d"), gr = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,240,215,1)"); gr.addColorStop(0.15, "rgba(255,225,180,0.5)"); gr.addColorStop(0.45, "rgba(255,200,140,0.1)"); gr.addColorStop(1, "rgba(255,200,140,0)");
  gx.fillStyle = gr; gx.fillRect(0, 0, 64, 64);
  const hg = new THREE.BufferGeometry();
  hg.setAttribute("position", new THREE.Float32BufferAttribute(city.lamps.flatMap(([x, z, a]) => [x - Math.sin(a) * 1.9, gy(x, z) + 6.28, z - Math.cos(a) * 1.9]), 3));
  const halo = new THREE.Points(hg, new THREE.PointsMaterial({ size: 2.6, map: new THREE.CanvasTexture(gc), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  halo.frustumCulled = false; halo.visible = false; scene.add(halo);
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
  return { lampMat, halo, spray };
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
    props.halo.visible = night > 0.05; props.halo.material.opacity = Math.min(1, night * 1.5) * 0.9;
    props.spray.scale.y = 1 + Math.sin(time * 5) * 0.06;
  }
  return { update, U, buildings };
}
