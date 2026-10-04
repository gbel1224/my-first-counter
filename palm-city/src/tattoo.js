// Palm City — tattoos. Eight designs drawn into one atlas, inked onto the player's real skin: the
// skin shader finds which limb a point belongs to (forearms, upper arms, neck, hands) from the
// skeleton's rest pose, wraps the design round that limb, and darkens the skin where the ink is.
import * as THREE from "../vendor/three.module.js";

export const DESIGNS = ["Tribal Band", "Rose", "Anchor", "Palm City Script", "Stars", "Skull", "MOM Heart", "Koi Waves"];
export const SPOTS = [
  ["lfore", "Left forearm"], ["rfore", "Right forearm"], ["lupper", "Left upper arm"], ["rupper", "Right upper arm"], ["neck", "Neck"], ["lhand", "Left hand"], ["rhand", "Right hand"],
];
const SEG = { lfore: ["LeftForeArm", "LeftHand"], rfore: ["RightForeArm", "RightHand"], lupper: ["LeftArm", "LeftForeArm"], rupper: ["RightArm", "RightForeArm"], neck: ["Neck", "Head"], lhand: ["LeftHand", null], rhand: ["RightHand", null] };

// ---- the flash sheet: 4 x 2 designs, each in a 256 px cell ----
let ATLAS = null;
function atlas() {
  if (ATLAS) return ATLAS;
  const c = document.createElement("canvas"); c.width = 1024; c.height = 512;
  const x = c.getContext("2d");
  const INK = "rgba(18,22,34,1)";
  const cell = (i, fn) => { x.save(); x.translate((i % 4) * 256, Math.floor(i / 4) * 256); x.beginPath(); x.rect(0, 0, 256, 256); x.clip(); fn(); x.restore(); };
  x.lineCap = "round"; x.lineJoin = "round";
  // 0 tribal band: black flame-points wrapping the limb
  cell(0, () => { x.fillStyle = INK; x.fillRect(0, 108, 256, 40); for (let k = 0; k < 8; k++) { const cx = k * 32 + 16; x.beginPath(); x.moveTo(cx - 14, 110); x.quadraticCurveTo(cx - 4, 70, cx + 8, 40 + (k % 2) * 18); x.quadraticCurveTo(cx + 2, 80, cx + 14, 110); x.fill(); x.beginPath(); x.moveTo(cx - 14, 146); x.quadraticCurveTo(cx - 4, 186, cx + 8, 216 - (k % 2) * 18); x.quadraticCurveTo(cx + 2, 176, cx + 14, 146); x.fill(); } });
  // 1 rose: red petals, dark outline, green leaves
  cell(1, () => {
    x.strokeStyle = INK; x.lineWidth = 5;
    x.fillStyle = "rgba(40,110,50,1)"; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(128 + s * 52, 168, 34, 14, s * 0.5, 0, 7); x.fill(); x.stroke(); }
    x.beginPath(); x.moveTo(128, 150); x.lineTo(128, 236); x.stroke();
    x.fillStyle = "rgba(170,20,30,1)"; for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; x.beginPath(); x.ellipse(128 + Math.cos(a) * 26, 112 + Math.sin(a) * 22, 30, 22, a, 0, 7); x.fill(); x.stroke(); }
    x.fillStyle = "rgba(120,10,20,1)"; x.beginPath(); x.arc(128, 112, 22, 0, 7); x.fill(); x.stroke(); x.beginPath(); x.arc(128, 112, 10, 0.5, 5); x.stroke();
  });
  // 2 anchor with a rope
  cell(2, () => { x.strokeStyle = INK; x.lineWidth = 14; x.beginPath(); x.arc(128, 46, 18, 0, 7); x.moveTo(128, 64); x.lineTo(128, 206); x.moveTo(84, 92); x.lineTo(172, 92); x.stroke(); x.beginPath(); x.arc(128, 150, 64, 0.3, Math.PI - 0.3); x.stroke(); x.lineWidth = 5; x.strokeStyle = "rgba(150,90,40,1)"; x.beginPath(); x.moveTo(60, 60); x.bezierCurveTo(140, 130, 60, 170, 190, 220); x.stroke(); });
  // 3 script lettering
  cell(3, () => { x.fillStyle = INK; x.font = "italic 900 54px Georgia, serif"; x.textAlign = "center"; x.fillText("Palm", 128, 112); x.fillText("City", 128, 170); x.lineWidth = 4; x.strokeStyle = INK; x.beginPath(); x.moveTo(40, 190); x.quadraticCurveTo(128, 214, 216, 190); x.stroke(); });
  // 4 stars: a scatter of nautical stars
  cell(4, () => { const star = (cx, cy, R, fill) => { x.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? R * 0.42 : R; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); x.fillStyle = fill; x.fill(); x.lineWidth = 3; x.strokeStyle = INK; x.stroke(); };
    star(128, 128, 56, INK); star(60, 60, 26, "rgba(30,60,140,1)"); star(196, 70, 22, INK); star(70, 196, 22, "rgba(30,60,140,1)"); star(200, 190, 30, INK); });
  // 5 skull
  cell(5, () => { x.fillStyle = "rgba(230,226,214,1)"; x.strokeStyle = INK; x.lineWidth = 7; x.beginPath(); x.ellipse(128, 104, 66, 70, 0, 0, 7); x.fill(); x.stroke(); x.fillRect(96, 150, 64, 46); x.strokeRect(96, 150, 64, 46);
    x.fillStyle = INK; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(128 + s * 26, 108, 18, 22, 0, 0, 7); x.fill(); } x.beginPath(); x.moveTo(128, 128); x.lineTo(118, 148); x.lineTo(138, 148); x.fill(); for (let k = 0; k < 3; k++) { x.fillRect(108 + k * 16, 154, 3, 40); } });
  // 6 heart with a MOM banner
  cell(6, () => { x.fillStyle = "rgba(190,24,36,1)"; x.strokeStyle = INK; x.lineWidth = 7; x.beginPath(); x.moveTo(128, 214); x.bezierCurveTo(20, 140, 50, 40, 128, 84); x.bezierCurveTo(206, 40, 236, 140, 128, 214); x.fill(); x.stroke();
    x.fillStyle = "rgba(236,226,196,1)"; x.fillRect(46, 112, 164, 48); x.strokeRect(46, 112, 164, 48); x.fillStyle = INK; x.font = "900 40px Georgia, serif"; x.textAlign = "center"; x.fillText("MOM", 128, 150); });
  // 7 koi in waves
  cell(7, () => { x.strokeStyle = "rgba(30,70,150,1)"; x.lineWidth = 8; for (let k = 0; k < 4; k++) { x.beginPath(); for (let i = 0; i <= 256; i += 8) x.lineTo(i, 40 + k * 56 + Math.sin(i * 0.05 + k) * 12); x.stroke(); }
    x.fillStyle = "rgba(220,90,20,1)"; x.strokeStyle = INK; x.lineWidth = 5; x.beginPath(); x.ellipse(128, 128, 70, 30, -0.5, 0, 7); x.fill(); x.stroke(); x.beginPath(); x.moveTo(176, 96); x.lineTo(220, 70); x.lineTo(210, 120); x.closePath(); x.fill(); x.stroke(); x.fillStyle = INK; x.beginPath(); x.arc(86, 150, 6, 0, 7); x.fill(); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (ATLAS = t);
}

// where each region runs in the mesh's own (bind) space, from the skeleton's rest pose
function regions(mesh) {
  const sk = mesh.skeleton; if (!sk) return null;
  const idx = n => sk.bones.findIndex(b => b.name.replace(/^mixamorig:?/, "") === n);
  const at = i => new THREE.Vector3().applyMatrix4(new THREE.Matrix4().copy(mesh.bindMatrixInverse).multiply(new THREE.Matrix4().copy(sk.boneInverses[i]).invert()));
  const out = {};
  for (const [k, [a, b]] of Object.entries(SEG)) {
    const ia = idx(a); if (ia < 0) continue;
    const A = at(ia);
    let B;
    if (b) { const ib = idx(b); if (ib < 0) continue; B = at(ib); }
    else {                                                    // the hand: along on from the forearm, a hand's length
      const fa = idx(a.replace("Hand", "ForeArm")); if (fa < 0) continue;
      const F = at(fa); B = A.clone().add(A.clone().sub(F).normalize().multiplyScalar(A.distanceTo(F) * 0.38));
    }
    out[k] = [A, B];
  }
  return out;
}

const MAXR = 7;
export function inkPlayer(human, tats, hairDye = null) {
  if (!human) return;
  const tex = atlas();
  human.root.traverse(o => {
    if (!o.isSkinnedMesh || !o.material) return;
    const n = (o.material.name || "").toLowerCase();
    if (!(/(skin|body|head)$/.test(n)) || /eye|teeth/.test(n)) return;
    const mat = o.material;
    let U = mat.userData.tat;
    if (!U) {
      const R = regions(o); if (!R) return;
      // limb thickness, in mesh units: a fraction of the segment length
      U = mat.userData.tat = { uA: { value: [] }, uB: { value: [] }, uD: { value: [] }, uTex: { value: tex }, R, uHair: { value: new THREE.Vector4(0, 0, 0, 0) }, uScalp: { value: new THREE.Vector4(9, 9, 0, 0) } };
      if (R.neck) { const H = R.neck[1]; U.uScalp.value.set(H.y, H.z, 0, 0); }
      for (let i = 0; i < MAXR; i++) { U.uA.value.push(new THREE.Vector3()); U.uB.value.push(new THREE.Vector3()); U.uD.value.push(new THREE.Vector4(-1, 0, 0, 0)); }
      const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey;
      mat.onBeforeCompile = (sh, r) => {
        if (prev) prev.call(mat, sh, r);
        sh.uniforms.uTatA = U.uA; sh.uniforms.uTatB = U.uB; sh.uniforms.uTatD = U.uD; sh.uniforms.uTatTex = U.uTex; sh.uniforms.uHairDye = U.uHair; sh.uniforms.uScalp = U.uScalp;
        sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vTatP;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvTatP = position;");
        sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
          varying vec3 vTatP; uniform vec3 uTatA[${MAXR}], uTatB[${MAXR}]; uniform vec4 uTatD[${MAXR}]; uniform sampler2D uTatTex; uniform vec4 uHairDye, uScalp;`)
          .replace("#include <map_fragment>", `#include <map_fragment>
          { float bestR = 1e9; vec4 ink = vec4(0.0);
            for (int i = 0; i < ${MAXR}; i++) {
              if (uTatD[i].x < 0.0) continue;
              vec3 A = uTatA[i], ax = uTatB[i] - A; float L = length(ax); vec3 dir = ax / L;
              vec3 d = vTatP - A; float t = dot(d, dir) / L; vec3 rad = d - dir * (t * L); float rr = length(rad);
              float thick = uTatD[i].y;
              if (t < 0.12 || t > 0.9 || rr > thick || rr > bestR) continue;
              // round the limb: angle from its front (the model's +z), the seam on the inside of the arm
              vec3 ref = uTatD[i].z > 0.5 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);   // hands: the back of the hand, not the thumb side
              vec3 n1 = normalize(cross(dir, ref) + vec3(1e-4)), n2 = cross(dir, n1);
              float u = atan(dot(rad, n1), -dot(rad, n2)) / 6.2832 + 0.5;   // 0.5 = the front
              float v = (t - 0.12) / 0.78;
              if (uTatD[i].z > 0.5) u = 0.2 + fract(u * 2.0) * 0.6;   // a hand: inked on both faces, so the back always shows
              if (u < 0.2 || u > 0.8) continue;
              vec2 cell = vec2(mod(uTatD[i].x, 4.0), floor(uTatD[i].x / 4.0));
              vec4 s = texture2D(uTatTex, (cell + vec2((u - 0.2) / 0.6, 1.0 - v)) / vec2(4.0, 2.0));
              bestR = rr; ink = s;
            }
            // healed ink sits under the skin: a touch blue-green, soft, never pure black
            vec3 inked = ink.rgb * 0.82 + vec3(0.0, 0.01, 0.025);
            diffuseColor.rgb = mix(diffuseColor.rgb, inked * (diffuseColor.rgb * 0.6 + 0.4), ink.a * 0.88);
            // hair painted into the head's texture (no separate hair mesh): dye the dark strands on the scalp
            if (uHairDye.w > 0.5 && (vTatP.y > uScalp.x + 0.11 || (vTatP.y > uScalp.x - 0.01 && vTatP.z < uScalp.y - 0.03))) {
              float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
              float hairy = 1.0 - smoothstep(0.035, 0.09, lum);
              diffuseColor.rgb = mix(diffuseColor.rgb, uHairDye.rgb * clamp(lum * 15.0, 0.38, 1.5), hairy * 0.95);
            } }`);
      };
      mat.customProgramCacheKey = () => (key ? key.call(mat) : "") + "|tat";
      mat.needsUpdate = true;
    }
    // hair dye for a texture-painted cut (only the models without a hair mesh of their own)
    let hairMesh = false; human.root.traverse(q => { if (q.isMesh && /hair|ponytail/.test((q.material.name || "").toLowerCase())) hairMesh = true; });
    if (hairDye !== null && hairDye !== undefined && !hairMesh) { const c = new THREE.Color(hairDye); U.uHair.value.set(c.r, c.g, c.b, 1); } else U.uHair.value.w = 0;
    // which designs where
    let i = 0;
    for (const [k] of SPOTS) {
      if (i >= MAXR) break;
      const seg = U.R[k]; if (!seg) continue;
      const des = tats[k];
      U.uA.value[i].copy(seg[0]); U.uB.value[i].copy(seg[1]);
      const len = seg[0].distanceTo(seg[1]);
      U.uD.value[i].set(des === undefined || des === null ? -1 : des, len * (k === "neck" ? 0.95 : k.endsWith("hand") ? 0.55 : 0.42), k.endsWith("hand") ? 1 : 0, 0);
      i++;
    }
  });
}
