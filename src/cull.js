// Palm City — what's worth drawing this frame. The camera's ground position and facing are noted
// once a frame; things behind the camera (beyond a margin) and city tiles past their draw distance
// are skipped, so the GPU only works on what you can actually see.
const VIEW = { x: 0, z: 0, fx: 0, fz: 1, all: true };
const tiles = [];
export function setView(camera) {
  const e = camera.matrixWorld.elements;
  VIEW.x = camera.position.x; VIEW.z = camera.position.z;
  const fx = -e[8], fz = -e[10], l = Math.hypot(fx, fz);
  VIEW.all = l < 0.2;                       // looking nearly straight down: everything around counts
  if (!VIEW.all) { VIEW.fx = fx / l; VIEW.fz = fz / l; }
  for (const t of tiles) {
    const dx = t.cx - VIEW.x, dz = t.cz - VIEW.z;
    t.mesh.visible = Math.sqrt(dx * dx + dz * dz) - t.r < t.max;
  }
}
// in front of the camera (or close enough that it might cast into view)
export function inView(x, z, margin = 15) {
  if (VIEW.all) return true;
  const dx = x - VIEW.x, dz = z - VIEW.z;
  return dx * VIEW.fx + dz * VIEW.fz > -margin;
}
// a static tile that only draws within `max` metres of the camera
export function addTile(mesh, max) {
  const s = mesh.boundingSphere;
  tiles.push({ mesh, cx: s.center.x, cz: s.center.z, r: s.radius, max });
}
