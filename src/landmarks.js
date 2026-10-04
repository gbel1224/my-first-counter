// Palm City — the skyline's landmarks and the crowns of its towers. Palm Tower: a 230 m round glass
// tower just north of the plaza, its curtain wall built in the shader (floor plates, mullions, ribs,
// glass that mirrors the sky, offices lit at night), a finned crown that glows after dark and a spire
// with a beacon. The Coral Building: an art-deco stepped tower in pale stone, piers running up every
// face and a stepped crown banded with light. Plus the crowns the other towers wear (spires, glass
// pyramids, helipads, fin screens) — see buildCrowns.
import * as THREE from "../vendor/three.module.js";
import { paint, place, merge, vcMaterial } from "./geo.js";

function curtainWall(U, glsl, r) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0.7 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uNight = U.uNight;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWp;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWp = (modelMatrix * vec4(position, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uNight; varying vec3 vWp;\n" + glsl)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float cwR = 0.08, cwM = 0.7; vec3 cwE = vec3(0.0);
        {
          vec3 c0 = vec3(${r.cx.toFixed(2)}, 0.0, ${r.cz.toFixed(2)});
          float u = atan(vWp.z - c0.z, vWp.x - c0.x) * ${r.r.toFixed(2)}, v = vWp.y;
          vec2 c = vec2(u / 1.6, v / 3.9), id = floor(c), f = fract(c);
          float mull = 1.0 - band(c.x, 0.04, 0.96) * band(c.y, 0.06, 0.94);
          float spand = 1.0 - band(c.y, 0.0, 0.74);
          float rib = smoothstep(0.9, 0.95, abs(fract(u / 6.4) - 0.5) * 2.0);              // an expressed rib every fourth bay
          float tint = h12(id + 3.0);
          vec3 glassC = vec3(0.1, 0.18, 0.22) * (0.85 + tint * 0.3);
          vec3 col = mix(glassC, vec3(0.13, 0.14, 0.15), max(mull, spand * 0.9));
          col = mix(col, vec3(0.62, 0.66, 0.68), rib * 0.8);
          float glass = (1.0 - mull) * (1.0 - spand) * (1.0 - rib);
          cwR = mix(0.45, 0.06 + tint * 0.06, glass); cwM = mix(0.4, 0.6, glass);
          // offices lit after dark, a band every ten floors left dark (plant floors)
          float lit = step(0.6, h12(id * vec2(1.3, 2.1))) * step(0.5, fract(floor(c.y) / 10.0) * 10.0);
          vec3 warm = mix(vec3(1.0, 0.82, 0.55), vec3(0.75, 0.88, 1.0), step(0.6, h12(id + 9.0)));
          cwE = warm * lit * glass * uNight * 0.9;
          diffuseColor.rgb = col;
        }`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = cwR;")
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = cwM;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += cwE;");
  };
  m.customProgramCacheKey = () => "curtainwall";
  return m;
}

export function buildLandmarks(scene, plan, U, glsl) {
  const glow = vcMaterial({ roughness: 0.4, metalness: 0.4, emitMul: 0 });
  const stone = vcMaterial({ roughness: 0.8 });
  const P = [], S = [];
  for (const L of plan.landmarks || []) {
    if (L.kind === "palm") {
      const shaftH = L.h - 16, top = L.y + shaftH;
      const g = new THREE.CylinderGeometry(L.r, L.r, shaftH, 72, 1, true); g.translate(L.x, L.y + shaftH / 2, L.z);
      const shaft = new THREE.Mesh(g, curtainWall(U, glsl, { cx: L.x, cz: L.z, r: L.r }));
      shaft.castShadow = shaft.receiveShadow = true; scene.add(shaft);
      // the crown: the wall tapers in behind a ring of fins that are lit from below at night
      const crown = new THREE.CylinderGeometry(L.r * 0.72, L.r, 16, 72, 1, true); crown.translate(L.x, top + 8, L.z);
      const cm = new THREE.Mesh(crown, shaft.material); scene.add(cm);
      for (let k = 0; k < 36; k++) {
        const a = k / 36 * Math.PI * 2, rr = L.r + 0.6;
        P.push(place(paint(new THREE.BoxGeometry(0.35, 20, 1.4), 0x9aa4aa), L.x + Math.cos(a) * rr, top + 9, L.z + Math.sin(a) * rr, 0, -a, 0));
      }
      P.push(place(paint(new THREE.TorusGeometry(L.r + 0.7, 0.25, 6, 72), 0x7fe8ff, 1), L.x, top + 0.4, L.z, Math.PI / 2, 0, 0));       // uplight ring
      P.push(place(paint(new THREE.TorusGeometry(L.r * 0.74, 0.18, 6, 72), 0x7fe8ff, 1), L.x, top + 16.2, L.z, Math.PI / 2, 0, 0));
      P.push(place(paint(new THREE.CylinderGeometry(L.r * 0.72, L.r * 0.72, 0.6, 48), 0x5a6064), L.x, top + 16.3, L.z));
      // the spire and its beacon
      P.push(place(paint(new THREE.CylinderGeometry(0.15, 0.9, 46, 10), 0xd8dde0), L.x, top + 16.6 + 23, L.z));
      P.push(place(paint(new THREE.SphereGeometry(0.6, 10, 8), 0xff2a20, 1), L.x, top + 16.6 + 46.5, L.z));
      // the lobby canopy over the podium
      P.push(place(paint(new THREE.CylinderGeometry(L.r + 3, L.r + 3, 0.6, 48), 0xd8d8d4), L.x, L.y + 0.3, L.z));
    } else if (L.kind === "deco") {
      // piers up every face of every tier (the vertical lines that make art deco), then the crown
      for (const b of plan.buildings) {
        if (Math.abs(b.x - L.x) > 1 || Math.abs(b.z - L.z) > 1 || b.y < 1) continue;
        for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const len = nx ? b.d : b.w, n = Math.floor(len / 3.4);
          for (let k = 0; k <= n; k++) {
            const t = -len / 2 + k * (len / n);
            const x = b.x + (nx ? nx * (b.w / 2 + 0.2) : t), z = b.z + (nz ? nz * (b.d / 2 + 0.2) : t);
            S.push(place(paint(new THREE.BoxGeometry(nx ? 0.4 : 0.6, b.h + 1.2, nx ? 0.6 : 0.4), 0xeee4cc), x, b.y + b.h / 2 + 0.6, z));
          }
          // a gilded band and a cornice at the top of each tier
          S.push(place(paint(new THREE.BoxGeometry(nx ? 0.5 : b.w + 1.0, 0.9, nx ? b.d + 1.0 : 0.5), 0xd8ccb0), b.x + nx * (b.w / 2 + 0.25), b.y + b.h - 0.45, b.z + nz * (b.d / 2 + 0.25)));
          P.push(place(paint(new THREE.BoxGeometry(nx ? 0.1 : b.w + 1.1, 0.25, nx ? b.d + 1.1 : 0.1), 0xffc870, 1), b.x + nx * (b.w / 2 + 0.52), b.y + b.h - 1.1, b.z + nz * (b.d / 2 + 0.52)));
        }
      }
      // stepped crown: five shrinking blocks with lit edges, then a spire
      let y = L.y, w = L.w;
      for (let k = 0; k < 5; k++) {
        const h = 4.5 - k * 0.5;
        S.push(place(paint(new THREE.BoxGeometry(w, h, w), 0xeee2c8), L.x, y + h / 2, L.z));
        for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) P.push(place(paint(new THREE.BoxGeometry(nx ? 0.12 : w + 0.2, 0.3, nx ? w + 0.2 : 0.12), 0xffd890, 1), L.x + nx * (w / 2 + 0.06), y + h - 0.2, L.z + nz * (w / 2 + 0.06)));
        y += h; w *= 0.74;
      }
      P.push(place(paint(new THREE.CylinderGeometry(0.1, 0.7, 28, 8), 0xe8dcc0), L.x, y + 14, L.z));
      P.push(place(paint(new THREE.SphereGeometry(0.5, 10, 8), 0xff2a20, 1), L.x, y + 28.4, L.z));
    }
  }
  const add = (list, mat) => { if (!list.length) return; const m = new THREE.Mesh(merge(list), mat); m.castShadow = true; m.receiveShadow = true; scene.add(m); };
  add(P, glow); add(S, stone);
  return { update(night) { glow.userData.emit.value = 0.15 + night * 2.6; } };
}

// the crowns on the ordinary towers: tower.crown is spire / pyramid / helipad / fins / flat
export function buildCrowns(scene, plan) {
  const P = [], Gl = [], L = [];
  for (const b of plan.buildings) {
    if (!b.crown || b.crown === "flat") continue;
    const top = b.y + b.h, m = Math.min(b.w, b.d);
    if (b.crown === "spire") {
      P.push(place(paint(new THREE.BoxGeometry(m * 0.4, 3, m * 0.4), 0x7a8086), b.x, top + 1.5, b.z));
      P.push(place(paint(new THREE.CylinderGeometry(0.12, 0.7, Math.max(18, b.h * 0.22), 8), 0xd0d4d8), b.x, top + 3 + Math.max(18, b.h * 0.22) / 2, b.z));
      L.push(place(paint(new THREE.SphereGeometry(0.45, 8, 6), 0xff3020, 1), b.x, top + 3 + Math.max(18, b.h * 0.22) + 0.3, b.z));
    } else if (b.crown === "pyramid") {
      // a glass pyramid cap, its own height a third of the tower's width
      const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1); g.rotateY(Math.PI / 4);
      const h = m * 0.38;
      Gl.push(place(paint(g, 0x8ab0c0), b.x, top + h / 2, b.z, 0, 0, 0, b.w, h, b.d));
      L.push(place(paint(new THREE.SphereGeometry(0.4, 8, 6), 0xff3020, 1), b.x, top + h + 0.3, b.z));
    } else if (b.crown === "helipad") {
      const R = m * 0.36;
      P.push(place(paint(new THREE.CylinderGeometry(R, R, 0.6, 32), 0x3a3c3e), b.x, top + 0.3, b.z));
      const ring = new THREE.RingGeometry(R * 0.7, R * 0.78, 40); ring.rotateX(-Math.PI / 2);
      P.push(place(paint(ring, 0xf2c230), b.x, top + 0.62, b.z));
      for (const [w, d, x] of [[0.7, R * 0.9, -R * 0.25], [0.7, R * 0.9, R * 0.25], [R * 0.5, 0.7, 0]]) P.push(place(paint(new THREE.BoxGeometry(w, 0.02, d), 0xf2f2f2), b.x + x, top + 0.62, b.z));
      for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; L.push(place(paint(new THREE.SphereGeometry(0.14, 6, 4), 0x40ff70, 1), b.x + Math.cos(a) * R, top + 0.7, b.z + Math.sin(a) * R)); }
      for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) P.push(place(paint(new THREE.BoxGeometry(0.15, 1.6, 0.15), 0x6a6e72), b.x + sx * R * 0.72, top + 0.3 - 0.8, b.z + sz * R * 0.72));   // the deck's legs
    } else if (b.crown === "fins") {
      // a screen of tall fins round the roof, hiding the plant
      for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const len = nx ? b.d : b.w, n = Math.max(2, Math.floor(len / 2.4));
        for (let k = 0; k <= n; k++) {
          const t = -len / 2 + k * (len / n);
          P.push(place(paint(new THREE.BoxGeometry(nx ? 1.2 : 0.3, 7, nx ? 0.3 : 1.2), 0x8a9298), b.x + (nx ? nx * (b.w / 2 - 0.3) : t), top + 3.5, b.z + (nz ? nz * (b.d / 2 - 0.3) : t)));
        }
      }
    }
  }
  const glow = vcMaterial({ roughness: 0.5, emitMul: 3 });
  const out = [];
  if (P.length) { const m = new THREE.Mesh(merge(P), vcMaterial({ roughness: 0.55, metalness: 0.4 })); m.castShadow = true; scene.add(m); out.push(m); }
  if (Gl.length) { const m = new THREE.Mesh(merge(Gl), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, metalness: 0.9 })); m.castShadow = true; scene.add(m); out.push(m); }
  if (L.length) { const m = new THREE.Mesh(merge(L), glow); scene.add(m); out.push(m); }
  return out;
}
