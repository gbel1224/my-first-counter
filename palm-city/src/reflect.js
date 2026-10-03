// Palm City — real reflections for the cars. A cube camera hovers over wherever you are and
// films the street around it (buildings, palms, traffic, sky) one face per frame, so a full
// refresh costs a sixth of a scene render at a time; each finished cube is prefiltered (PMREM)
// and becomes the environment the car paint, glass and chrome reflect. Without it they would
// only ever reflect the sky.
import * as THREE from "../vendor/three.module.js";

const mats = new Set();
let current = null;
// register a material to reflect the street (it gets the probe as soon as one is ready)
export function reflective(m) { mats.add(m); if (current) m.envMap = current; return m; }

export function makeProbe(renderer, scene, sky, { mobile = false } = {}) {
  const rt = new THREE.WebGLCubeRenderTarget(mobile ? 128 : 256, { type: THREE.HalfFloatType, generateMipmaps: false });
  const cam = new THREE.CubeCamera(0.5, 130, rt);   // the near street is what shows in a car door
  const pmrem = new THREE.PMREMGenerator(renderer);
  let out = null, face = 0, frame = 0;
  const every = mobile ? 4 : 2;
  function update(center, hide, indoor) {
    if (indoor || ++frame % every) return;
    if (face === 0) cam.position.set(center.x, (center.y || 0) + 1.4, center.z);
    if (cam.coordinateSystem !== renderer.coordinateSystem) { cam.coordinateSystem = renderer.coordinateSystem; cam.updateCoordinateSystem(); }
    cam.updateMatrixWorld();
    // what the probe mustn't see: the car it sits over, and the sky dome (which the cube camera
    // clips); the sky comes from the sky's own environment map as the background instead
    const vis = hide.map(o => o && o.visible);
    hide.forEach(o => { if (o) o.visible = false; });
    const prevRT = renderer.getRenderTarget(), prevBg = scene.background, sm = renderer.shadowMap, au = sm.autoUpdate;
    if (sky.dome) sky.dome.visible = false;
    scene.background = sky.envTex();
    sm.autoUpdate = false; sm.needsUpdate = false;                 // reuse this frame's shadow map
    renderer.setRenderTarget(rt, face);
    renderer.render(scene, cam.children[face]);
    renderer.setRenderTarget(prevRT);
    sm.autoUpdate = au;
    scene.background = prevBg;
    if (sky.dome) sky.dome.visible = true;
    hide.forEach((o, i) => { if (o) o.visible = vis[i]; });
    face = (face + 1) % 6;
    if (face === 0) {
      out = pmrem.fromCubemap(rt.texture, out);
      if (current !== out.texture) { current = out.texture; for (const m of mats) { m.envMap = current; m.needsUpdate = true; } }
    }
  }
  return { update, texture: () => current };
}
