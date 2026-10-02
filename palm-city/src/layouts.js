// Palm City — floor plans. Every building you can walk into is a set of rooms joined by doorways
// and arches, each room with its own floor, lighting and furniture. Coordinates are building-local
// metres: x across, z from back (−) to the street (+), the front door on the street wall.
// Links join two rooms: a hinged door, an open arch, a serving hatch, a glass window, or fully open.
import * as F from "./furniture.js";
import * as DC from "./decor.js";
import * as P2 from "./props2.js";

const { C } = F;
const PI = Math.PI, HP = Math.PI / 2;

// ------------------------------------------------------------------------------------------------
// homes (furniture colours come from the player's decor choices)
// ------------------------------------------------------------------------------------------------
function livingSet(ctx, cx, cz, dir, d) {
  // sofa facing the TV along +x (dir 1) or −x (dir −1): sofa, coffee table, rug, TV unit on the far wall
  const { K } = ctx;
  if (d.rug) ctx.rug(cx + dir * 1.35, cz, 3.2, 2.4, d.rug, HP);
  if (d.sofa) ctx.P(cx, cz, dir * HP, () => F.sofa(K, 2.3, d.sofa, { accent: d.accent }));
  if (d.table !== null) ctx.P(cx + dir * 1.35, cz, HP, () => F.coffeeTable(K, 1.1, 0.6, d.table));
}
function tvWall(ctx, x, z, ry, d) {
  if (!d.tv) return;
  ctx.P(x, z, ry, () => { const s = F.tvUnit(ctx.K, 2.0, { wood: d.tv }); ctx.tv(x + Math.sin(ry) * s.z, s.y, z + Math.cos(ry) * s.z, ry, s.w - 0.06, s.h - 0.06, "sport"); });
}
function lampAt(ctx, x, z, d) { if (d.lamp) { ctx.P(x, z, 0, () => F.floorLamp(ctx.K, d.lamp)); ctx.light(x, 1.5, z, d.lamp, 4.5, 4.5); } }
function plantAt(ctx, x, z, d, s = 1) { if (d.plant) ctx.P(x, z, 0, () => F.plant(ctx.K, d.plant, { s })); }
function artAt(ctx, x, z, ry, d, w = 1.4, h = 0.95, y = 1.65) { if (d.art !== null) ctx.painting(x, y, z, ry, w, h, d.art); }
// the kitchen details every home gets: subway-tile splashback, microwave, toaster, a pot on the hob, a clock
function kitchenBits(ctx, x0, zRun, len, clockZ) {
  const { K } = ctx;
  ctx.paint("kitchen", 0xffffff, 0, "subway", { backsplash: true, side: "x0" });
  K.push(x0 + 0.34, zRun - len / 2 + 1.35, Math.PI / 2, 0.92); DC.microwave(K); K.pop();
  K.push(x0 + 0.3, zRun - len / 2 + 1.95, Math.PI / 2, 0.92); DC.toaster(K); K.pop();
  DC.stockPot(K, x0 + 0.32, 0.93, zRun + len / 2 - 0.84);
  ctx.steam(x0 + 0.32, 1.25, zRun + len / 2 - 0.84);
  K.push(x0 + 0.02, clockZ, Math.PI / 2, 2.3); F.wallClock(K); K.pop();
}
function bedroomBits(ctx, bx, bz0, side) {
  const { K } = ctx;
  DC.photoFrame(K, bx - 1.05, 0.56, bz0 + 0.22, 0.3); DC.photoFrame(K, bx + 1.05, 0.56, bz0 + 0.22, -0.3);
  for (const sd of [-1, 1]) ctx.light(bx + sd * 1.2, 0.95, bz0 + 0.35, 0xffd49a, 1.6, 3);
  ctx.fan(bx, bz0 + 2.3);
}
// a flat-screen hung on a wall: x, z on the wall face, the bezel and a live screen
function wallTV(ctx, x, y, z, ry, w, h, kind) {
  const nx = Math.sin(ry), nz = Math.cos(ry);
  ctx.K.push(x + nx * 0.03, z + nz * 0.03, ry, y - (h + 0.08) / 2); ctx.K.box("gloss", w + 0.08, h + 0.08, 0.06, 0, (h + 0.08) / 2, 0, 0x111111, { r: 0.01 }); ctx.K.pop();
  ctx.tv(x + nx * 0.03, y, z + nz * 0.03, ry, w, h, kind);
}
// an easel with a canvas in progress
function easelAt(ctx, x, z, ry, seed) {
  ctx.P(x, z, ry, () => { const c = P2.easel(ctx.K); ctx.painting(x + Math.sin(ry) * c.z, c.y, z + Math.cos(ry) * c.z, ry, c.w, c.h, seed); });
}
// a roller shutter on a wall (axis 'x' runs along x), slatted, with yellow guide posts
function rollerDoor(K, axis, at, c, w, h) {
  const bx = (len, hh, y, n, col, mat = "metal") => axis === "x" ? K.box(mat, len, hh, 0.08, c, y, at + n, col) : K.box(mat, 0.08, hh, len, at + n, y, c, col);
  const n = 0.04 * Math.sign(-at || 1);
  bx(w, h, h / 2, n, 0x9aa0a6);
  for (let y = 0.1; y < h; y += 0.14) bx(w, 0.03, y, n * 1.5, 0x7a8086);
  bx(w + 0.4, 0.3, h + 0.15, n * 1.5, 0x3a3a3e, "matte");
  for (const sd of [-1, 1]) axis === "x" ? K.box("matte", 0.15, h + 0.2, 0.14, c + sd * (w / 2 + 0.08), (h + 0.2) / 2, at + n * 1.7, 0xe8c020) : K.box("matte", 0.14, h + 0.2, 0.15, at + n * 1.7, (h + 0.2) / 2, c + sd * (w / 2 + 0.08), 0xe8c020);
}
function bathroom(ctx, r, o) {
  const { K } = ctx;
  ctx.paint(o.key, 0xeef4f6, 1.35, "tile", { color2: 0x6a8aa8 });
  ctx.P(o.tub[0], o.tub[1], o.tub[2], () => F.bathtub(K, 1.7));
  ctx.P(o.wc[0], o.wc[1], o.wc[2], () => F.toilet(K));
  ctx.P(o.sink[0], o.sink[1], o.sink[2], () => F.vanity(K, 0.9));
  if (o.towel) ctx.P(o.towel[0], o.towel[1], o.towel[2], () => F.towelRail(K));
  ctx.rug(o.mat[0], o.mat[1], 0.9, 0.55, 0x6a8aa8, o.mat[2] || 0);
  ctx.spot(o.sink[0], o.sink[1], 1.3, "WASH", "🚿 Freshen up", "wash");
}

// ------------------------------------------------------------------------------------------------
// the extra home rooms
// ------------------------------------------------------------------------------------------------
function gamingDen(ctx, s, d) {
  // a battle station under purple LEDs, a futon facing a console TV, a guitar, posters
  const { K } = ctx;
  ctx.paint(s.key, 0x262a36, 0, null, { accentWall: "back" });
  ctx.P(-3.6, s.z0 + 0.42, 0, () => P2.gamingDesk(K));
  ctx.P(-3.7, s.z0 + 1.38, PI + 0.15, () => P2.gamingChair(K));
  K.box("glow", 2.6, 0.02, 0.02, -3.6, 2.2, s.z0 + 0.02, 0xb44bff, { em: 2.5 });
  ctx.light(-3.6, 0.9, s.z0 + 0.25, 0xb44bff, 3, 3.2);
  ctx.light(-3.6, 1.3, s.z0 + 0.8, 0x6ab0ff, 1.4, 2.5);
  ctx.P(s.x0 + 0.45, -6.5, HP, () => F.sofa(K, 1.6, 0x3a3a4a, { pillows: true, accent: 0xb44bff }));
  ctx.P(s.x1 - 0.22, -6.5, -HP, () => { const t = F.tvUnit(K, 1.6, { wood: 0x1a1a1e }); ctx.tv(s.x1 - 0.22 - t.z, t.y, -6.5, -HP, t.w - 0.06, t.h - 0.06, "game"); });
  // the console and controllers on the TV unit
  K.box("gloss", 0.3, 0.06, 0.24, s.x1 - 0.3, 0.52, -5.95, 0xf4f4f0, { r: 0.02 }); K.box("glow", 0.2, 0.004, 0.004, s.x1 - 0.3, 0.55, -5.83, 0x3bd0ff, { em: 2 });
  for (const z of [-7.05, -6.95]) K.box("gloss", 0.14, 0.04, 0.09, s.x1 - 0.3, 0.52, z, 0x1a1a1e, { r: 0.02 });
  ctx.P(-5.4, -7.62, 0.3, () => P2.guitarStand(K, 0xc8501e));
  ctx.P(-0.55, s.z0 + 0.17, 0, () => F.bookshelf(K, 0.8, 1.9, { wood: 0x1a1a1e }));
  P2.poster(K, -5.0, 1.75, s.z0 + 0.012, 0, 0.6, 0.85, 0x1a1a3a, 0xff3b8b);
  P2.poster(K, s.x0 + 0.012, 1.85, -6.5, HP, 0.9, 0.6, 0x101820, 0x3bd0ff);
  ctx.rug(-3.2, -6.3, 2.2, 1.5, 0x3a2a5a);
  plantAt(ctx, s.x1 - 0.3, s.z1 - 0.3, d, 0.8);
  // energy drinks and a pizza box: the gamer's diet
  for (let i = 0; i < 3; i++) K.cyl("metal", 0.033, 0.033, 0.12, -2.85 + i * 0.09, 0.83, s.z0 + 0.65, [0x3ad83a, 0x1a1a1e, 0x3ad83a][i], { seg: 10 });
  K.box("matte", 0.42, 0.05, 0.42, -2.2, 0.07, -5.7, 0xd8c8a8, { ry: 0.3 }); K.box("matte", 0.2, 0.002, 0.12, -2.2, 0.097, -5.7, 0xc82a2a, { ry: 0.3 });
  ctx.spot(-3.7, -6.3, 1.3, "PLAY", "🎮 Play a few rounds", "game");
}
function walkInCloset(ctx, c) {
  // rails of clothes front and back, folded shelves, a shoe wall, an ottoman under a little chandelier
  const { K } = ctx;
  ctx.paint(c.key, 0xe8dcc8, 0, "damask");
  ctx.P(3.0, c.z0 + 0.3, 0, () => P2.clothesRail(K, 3.0));
  ctx.P(3.7, c.z1 - 0.3, PI, () => P2.clothesRail(K, 2.4));
  K.box("glow", 3.0, 0.015, 0.03, 3.0, 2.1, c.z0 + 0.05, 0xfff0d0, { em: 2 }); ctx.light(3.0, 2.0, c.z0 + 0.4, 0xfff0d0, 3, 3);
  ctx.P(c.x0 + 0.23, -6.9, HP, () => P2.foldedShelves(K, 1.4));
  for (const [z, col] of [[-7.35, 0xe8c0c8], [-6.95, 0x1a1a1e], [-6.5, 0xd8c8a8]]) { K.cyl("fabric", 0.16, 0.16, 0.2, c.x0 + 0.25, 2.11, z, col, { seg: 16 }); K.cyl("fabric", 0.165, 0.165, 0.04, c.x0 + 0.25, 2.2, z, col, { seg: 16 }); }
  ctx.P(c.x1 - 0.18, -7.2, -HP, () => P2.shoeRack(K, 1.1));
  ctx.P(c.x1 - 0.3, -5.3, -HP, () => DC.fullMirror(K));
  ctx.P(3.0, -6.25, 0, () => P2.ottoman(K, 0xc8a08a));
  ctx.rug(3.0, -6.25, 2.2, 1.3, 0xc8b8a0);
  ctx.pendant(3.0, -6.25, 0.7, 0xc8a24a);
  // a watch box and sunglasses on the ottoman
  K.box("wood", 0.3, 0.07, 0.18, 3.1, 0.47, -6.2, 0x3a2418, { r: 0.01 }); K.box("glass", 0.28, 0.01, 0.16, 3.1, 0.51, -6.2, 0xd8e8f0);
  for (let i = 0; i < 4; i++) K.torus("chrome", 0.025, 0.006, 3.0 + i * 0.065, 0.5, -6.2, [C.chrome, C.brass, C.black, C.chrome][i], { ts: 12 });
  ctx.spot(3.0, -5.6, 1.3, "CHANGE", "👔 Try on a new fit", "outfit");
}
function homeGym(ctx, g) {
  // twin treadmills at the window, a bench press, a dumbbell rack, a heavy bag, a mirror wall
  const { K } = ctx;
  ctx.paint(g.key, 0xd8d8d4, 0, "block");
  for (const x of [-3.7, -2.6]) ctx.P(x, g.z0 + 1.35, PI, () => P2.treadmill(K));
  ctx.P(-5.6, -7.6, 0, () => P2.weightBench(K));
  K.box("fabric", 0.3, 0.02, 0.45, -5.6, 0.5, -7.1, 0xe8e4dc, { r: 0.01 });                   // a towel on the bench
  ctx.P(g.x0 + 0.22, -6.3, HP, () => P2.dumbbellRack(K));
  for (const [i, z] of [-8.4, -8.9].entries()) { K.sph("metal", 0.1 + i * 0.02, g.x0 + 0.3, 0.12 + i * 0.02, z, 0x1a1a1e, { seg: 12 }); K.torus("metal", 0.06, 0.016, g.x0 + 0.3, 0.26 + i * 0.03, z, 0x1a1a1e, { rx: 0, ry: HP, arc: PI, ts: 10 }); }
  ctx.P(-0.65, -8.8, PI, () => P2.punchingBag(K));
  ctx.P(-0.8, -6.75, 0, () => P2.yogaMat(K, 0x3a8a8a));
  K.box("mirror", 3.2, 1.6, 0.02, -3.6, 1.3, g.z1 - 0.02, 0xe8eef2);
  for (const y of [0.48, 2.12]) K.box("metal", 3.28, 0.04, 0.04, -3.6, y, g.z1 - 0.03, 0x1a1a1e);
  for (const x of [-5.22, -1.98]) K.box("metal", 0.04, 1.68, 0.04, x, 1.3, g.z1 - 0.03, 0x1a1a1e);
  wallTV(ctx, g.x1, 1.95, -7.0, -HP, 1.0, 0.56, "sport");
  ctx.poster(g.x0 + 0.01, 1.75, -8.7, HP, 0.6, 0.8, "NO DAYS OFF", 0x1a1a1e, 0xe8c020);
  K.cyl("gloss", 0.035, 0.035, 0.2, -5.0, 0.15, -6.7, 0x2a8ad8, { seg: 10 });                // water bottle
  ctx.fan(-3.6, -7.5);
  ctx.spot(-4.5, -7.0, 1.6, "WORK OUT", "🏋 Hit the weights · +15 health", "workout");
}
function homeCinema(ctx, c) {
  // a projector screen, two rows of leather recliners (the back row on a riser), a popcorn cart, sconces
  const { K } = ctx;
  ctx.paint(c.key, 0x2a1418, 0, "damask"); ctx.paint(c.key, 0x1a0e10, 1.0, "panel", { layer: 1, color2: 0xc8a24a });
  ctx.P(3.75, c.z0 + 0.02, 0, () => P2.cinemaScreen(K, 3.4));
  ctx.tv(3.75, 1.795, c.z0 + 0.05, 0, 3.3, 1.45, "movie");
  ctx.light(3.75, 1.6, -7.6, 0xffa070, 2.5, 6, (t, L) => { L.I = 2.5 * (0.7 + 0.3 * Math.sin(t * 3.1) * Math.sin(t * 0.9)); });
  K.push(3.75, -6.2, PI, 0); P2.projector(K, 0, 0, ctx.H); K.pop();
  for (const x of [1.75, 2.75, 4.75, 5.75]) ctx.P(x, -7.7, PI, () => P2.recliner(K, 0x3a1a1a));
  K.box("fabric", 3.3, 0.2, 1.3, 5.85, 0.1, -6.3, 0x3a1a1e); K.block(4.2, -6.95, c.x1, -5.65);
  K.box("glow", 3.3, 0.02, 0.02, 5.85, 0.19, -6.96, 0xffb060, { em: 1.6 });
  for (const x of [4.85, 5.85, 6.85]) ctx.P(x, -6.35, PI, () => P2.recliner(K, 0x3a1a1a), 0.2);
  ctx.P(0.5, -6.1, HP, () => P2.popcornMachine(K)); ctx.light(0.6, 1.0, -6.1, 0xffd080, 1.2, 2.2);
  for (const [x, a] of [[0.6, 0.3], [6.9, -0.3]]) ctx.P(x, -9.0, a, () => F.speaker(K, 1.4));
  for (const z of [-8.4, -6.6]) for (const [x, n] of [[c.x0, 1], [c.x1, -1]]) { K.box("glow", 0.03, 0.18, 0.12, x + n * 0.02, 1.9, z, 0xffb070, { em: 2 }); K.box("gloss", 0.05, 0.05, 0.16, x + n * 0.03, 1.79, z, C.brass); ctx.light(x + n * 0.2, 1.9, z, 0xffa060, 2.2, 3); }
  ctx.poster(c.x0 + 0.01, 1.6, -7.5, HP, 0.6, 0.9, "NIGHT DRIVE", 0x1a1a3a, 0xff8a3a);
  ctx.poster(c.x1 - 0.01, 1.6, -7.8, -HP, 0.6, 0.9, "PALM WARS", 0x0a1a2a, 0xe8c020);
  // popcorn tubs and drinks in the cup holders
  for (const x of [1.75, 4.75]) { K.cyl("matte", 0.06, 0.045, 0.14, x + 0.43, 0.77, -7.95, 0xe8e4dc, { seg: 10 }); for (let i = 0; i < 6; i++) K.sph("matte", 0.02, x + 0.41 + (i % 3) * 0.02, 0.85, -7.95 + (i > 2 ? 0.02 : -0.02), 0xfff0b0, { seg: 5, hseg: 4 }); }
  ctx.spot(3.75, -6.9, 1.5, "WATCH", "🍿 Catch a movie", "movie");
}
function garage(ctx, g) {
  // a car parked nose-out, the up-and-over door, a workbench and pegboard, tool chest, bike, tyres
  const { K } = ctx;
  ctx.paint(g.key, 0xc8c4bc, 0, "block");
  ctx.car(11.9, 2.6, 0, "sedan", 0x7a1c20);
  K.box("gloss", 0.9, 0.003, 0.7, 11.9, 0.045, 3.0, 0x141416);                              // an oil stain
  ctx.P(11.9, g.z1 - 0.03, 0, () => P2.garageDoor(K, 3.4, ctx.H));
  ctx.P(g.x1 - 0.36, 0.9, -HP, () => P2.workbench(K, 2.4));
  ctx.P(g.x1 - 0.26, 3.0, -HP, () => P2.toolChest(K));
  ctx.P(9.45, 4.9, 0, () => P2.bicycle(K, 0x2a8a5a));
  ctx.P(10.4, g.z0 + 0.25, 0, () => F.shelfUnit(K, 1.8, { h: 2.0 }));
  for (let i = 0; i < 4; i++) K.torus("matte", 0.3, 0.11, 13.75, 0.11 + i * 0.21, -0.85, 0x141416, { ts: 22, rs: 10 });
  K.block(13.35, -1.25, 14.15, -0.45);
  F.barrel(K, 12.6, -0.95, 0xc82a2a);
  ctx.light(g.x1 - 0.6, 1.9, 0.9, 0xfff0dc, 2.2, 3);                                         // the lamp over the bench
  ctx.spot(13.6, 1.0, 1.3, "TINKER", "🔧 Tinker in the workshop", "tinker");
}
function kidsRoom(ctx, k) {
  // a bunk bed, toy chest, little desk with a rocket lamp, toys on the rug, glow-in-the-dark stars
  const { K } = ctx;
  ctx.paint(k.key, 0xa8cce8, 0); ctx.paint(k.key, 0xffffff, 1.0, "stripes", { color2: 0xe8c040, layer: 1 });
  ctx.P(k.x0 + 0.6, -9.7, 0, () => P2.bunkBed(K));
  P2.teddy(K, k.x0 + 0.55, 0.53, -10.25, 0.2);
  ctx.P(3.8, k.z0 + 0.3, 0, () => P2.toyChest(K));
  P2.teddy(K, 4.5, 0.04, k.z0 + 0.3, -0.4);
  ctx.P(k.x1 - 0.38, -9.4, -HP, () => F.desk(K, 1.2, { wood: 0xf4f4f0 }));
  ctx.P(k.x1 - 1.1, -9.4, HP, () => F.chair(K, { wood: 0xf4f4f0, seat: 0x3a8ae8 }));
  P2.rocketLamp(K, k.x1 - 0.25, -9.85); ctx.light(k.x1 - 0.4, 1.1, -9.85, 0xbfe0ff, 1.2, 2.5);
  ctx.P(k.x1 - 0.17, -7.6, -HP, () => F.bookshelf(K, 1.0, 1.3, { wood: 0xf4f4f0 }));
  ctx.rug(5.3, -8.7, 2.6, 1.8, 0x3a8ae8);
  // building blocks, a toy car and a ball on the rug
  const cols = [0xe83a3a, 0x3a8ae8, 0x3ae86a, 0xe8d03a];
  for (let i = 0; i < 7; i++) K.box("gloss", 0.09, 0.09, 0.09, 4.8 + (i % 3) * 0.1, 0.095 + Math.floor(i / 3) * 0.09, -8.4 + (i % 2) * 0.02, cols[i % 4], { ry: i * 0.3 });
  K.box("gloss", 0.22, 0.07, 0.11, 5.9, 0.1, -9.0, 0xe83a3a, { r: 0.02, ry: 0.5 }); K.box("glass", 0.1, 0.05, 0.1, 5.9, 0.15, -9.0, 0x2a3a4a, { ry: 0.5 });
  for (const [dx, dz] of [[0.07, 0.07], [-0.07, 0.07], [0.07, -0.07], [-0.07, -0.07]]) K.cyl("matte", 0.025, 0.025, 0.02, 5.9 + dx * Math.cos(0.5) + dz * Math.sin(0.5), 0.07, -9.0 - dx * Math.sin(0.5) + dz * Math.cos(0.5), 0x111111, { rz: HP, seg: 8 });
  K.sph("gloss", 0.12, 6.4, 0.17, -8.1, 0xe83a3a, { seg: 14 }); K.torus("gloss", 0.12, 0.012, 6.4, 0.17, -8.1, 0xf4f4f0, { rx: 0, ts: 20 });
  P2.poster(K, k.x0 + 0.012, 1.75, -7.6, HP, 0.5, 0.7, 0x1a2a5a, 0xe8c040);
  P2.poster(K, 7.4, 1.75, k.z0 + 0.012, 0, 0.6, 0.8, 0x2a8a5a, 0xe83a3a);
  for (let i = 0; i < 34; i++) K.sph("glow", 0.022, k.x0 + 0.3 + Math.random() * (k.w - 0.6), ctx.H - 0.02, k.z0 + 0.3 + Math.random() * (k.d - 0.6), 0xd8ffb0, { em: 1.4, seg: 6, hseg: 4 });
  ctx.fan(5.3, -8.7);
  ctx.spot(5.3, -8.4, 1.5, "PLAY", "🧸 Mess about with the toys", "toys");
}

// ------------------------------------------------------------------------------------------------
// the extra venue rooms
// ------------------------------------------------------------------------------------------------
function foodBackRooms(ctx) {
  const { K, R, brand } = ctx;
  const st = R.store, fo = R.office, fl = R.lockers;
  // storeroom: steel shelving full of stock, sacks of flour on a pallet, produce crates, the walk-in cooler
  ctx.paint("store", 0xd8d4cc, 0, "block");
  ctx.P(st.x0 + 0.23, -7.5, HP, () => F.shelfUnit(K, 2.0, { h: 2.1 }));
  for (const x of [-6.3, -4.5]) ctx.P(x, st.z0 + 0.23, 0, () => F.shelfUnit(K, 1.6, { h: 2.1 }));
  K.box("metal", 1.0, 2.1, 0.08, -2.5, 1.05, st.z0 + 0.04, 0xc8ccd0, { r: 0.01 });
  K.box("chrome", 0.06, 0.4, 0.1, -2.1, 1.1, st.z0 + 0.12, C.chrome, { r: 0.02 }); K.box("chrome", 0.12, 0.05, 0.06, -2.1, 1.3, st.z0 + 0.12, C.chrome);
  for (let i = 0; i < 7; i++) K.box("glass", 0.13, 2.0, 0.01, -2.92 + i * 0.14, 1.05, st.z0 + 0.1, 0xd8e4ea);                    // strip curtain
  K.box("gloss", 0.2, 0.1, 0.03, -1.8, 1.75, st.z0 + 0.02, 0x1a1a1e); K.box("glow", 0.16, 0.06, 0.01, -1.8, 1.75, st.z0 + 0.04, 0x40ff80, { em: 2 });
  ctx.poster(-2.5, 2.35, st.z0 + 0.01, 0, 0.9, 0.22, "WALK-IN COOLER", 0x1a6aa8);
  ctx.P(-4.4, -7.1, 0, () => F.pallet(K)); K.block(-4.95, -7.7, -3.85, -6.5);
  for (const [x, y, z, r] of [[-4.65, 0.15, -7.1, 0], [-4.15, 0.15, -7.1, 0], [-4.4, 0.37, -7.15, HP]]) P2.sack(K, x, y, z, r, 0xe8dcc0);
  for (const [x, y, f] of [[-6.4, 0, 0xd83a2a], [-6.4, 0.21, 0xd83a2a], [-5.85, 0, 0xc89a50], [-5.85, 0.21, 0x5aa83a]]) P2.produceCrate(K, x, y, -6.55, f);
  K.block(-6.7, -6.8, -5.55, -6.3);
  ctx.P(-3.2, -6.45, 0.4, () => P2.mopBucket(K));
  K.push(st.x1 - 0.01, -6.5, -HP, 0); DC.extinguisher(K); K.pop();
  ctx.npc(-5.4, -7.7, PI, "stand", { shirt: 0xf4f4f0, pants: 0x2a2a2e }, [[-5.4, -7.9, PI], [-4.5, -7.9, PI], [-7.0, -7.5, -HP], [-2.6, -7.9, PI]], "look");
  ctx.spot(-3.6, -7.4, 1.3, "STOCK", "🥫 Poke around the stores", "stock");
  // manager's office: desk, safe, CCTV, the rota on the board
  ctx.paint("office", 0xd8dce0, 1.0, "panel", { color2: 0x5a4a3a });
  ctx.P(1.6, fo.z0 + 0.38, 0, () => F.desk(K, 1.4));
  ctx.P(1.6, -7.85, PI, () => F.officeChair(K));
  ctx.npc(1.6, -7.85, PI, "type", { shirt: brand, pants: 0x2a2a2e });
  for (let i = 0; i < 4; i++) K.box("matte", 0.16, 0.03 + (i % 2) * 0.03, 0.07, 1.05 + (i % 2) * 0.18, 0.78 + (i % 2) * 0.015, fo.z0 + 0.25 + Math.floor(i / 2) * 0.09, 0x6a9a5a);
  ctx.P(3.05, fo.z0 + 0.32, 0, () => F.filingCabinet(K));
  ctx.P(-0.5, fo.z0 + 0.35, 0, () => F.safe(K));
  wallTV(ctx, 1.6, 1.8, fo.z1, PI, 1.0, 0.56, "cctv");
  K.push(0.4, fo.z0, 0, 0); DC.noticeBoard(K, 0.9); K.pop();
  ctx.poster(2.6, 1.95, fo.z0 + 0.01, 0, 0.45, 0.6, "STAR STAFF", brand);
  ctx.P(-0.5, -6.45, 0, () => F.plant(K, "snake"));
  ctx.P(3.1, -6.45, 0, () => DC.coatRack(K));
  // staff room: lockers, a bench, spare uniforms
  ctx.paint("lockers", 0xffffff, 1.4, "tile", { color2: brand });
  ctx.P(5.6, fl.z0 + 0.28, 0, () => F.lockers(K, 6, 0x5a6a7a));
  ctx.P(5.6, -7.6, 0, () => F.bench(K, 1.8));
  ctx.P(fl.x1 - 0.3, -7.4, HP, () => P2.clothesRail(K, 1.4));
  ctx.poster(4.6, 1.7, fl.z1 - 0.01, PI, 0.6, 0.8, "WASH YOUR HANDS", 0xf4f4f0, 0x1a6aa8);
  ctx.P(4.0, -6.45, 0, () => DC.trashBin(K));
  ctx.npc(5.0, -7.6, 0, "sit", { shirt: brand, pants: 0x2a2a2e });
}
function clubBackRooms(ctx) {
  const { K, R } = ctx;
  const gr = R.green, of = R.office, kg = R.kegs;
  // green room: bulb-lit mirrors, a velvet sofa, a rail of stage outfits, guitars, tour posters
  ctx.paint("green", 0x5a4a4a, 0, "brick");
  for (const x of [-6.0, -3.8]) { ctx.P(x, gr.z0 + 0.27, 0, () => P2.dressingTable(K, 1.6)); ctx.light(x, 1.5, gr.z0 + 0.6, 0xfff0c8, 3, 3); ctx.P(x, -9.0, PI, () => F.stool(K, { color: 0x1a1a1e })); }
  ctx.npc(-3.8, -9.0, PI, "perch", { shirt: 0xd82a6a, pants: 0x1a1a1e });
  ctx.P(-3.3, gr.z1 - 0.45, PI, () => F.sofa(K, 2.2, 0x6a1a3a, { legs: C.brass }));
  ctx.npc(-2.8, gr.z1 - 0.5, PI, "sit", { shirt: 0x1a1a1e, pants: 0x2a2a3a });
  ctx.P(-3.3, -7.75, 0, () => F.coffeeTable(K, 1.1, 0.55));
  K.cyl("chrome", 0.11, 0.09, 0.2, -3.6, 0.54, -7.75, C.chrome, { seg: 14 }); K.lathe("glass", [[0.001, 0], [0.04, 0], [0.04, 0.2], [0.012, 0.3]], -3.6, 0.48, -7.75, 0x2a5a2a);
  for (let i = 0; i < 8; i++) K.sph("gloss", 0.035, -3.0 + (i % 4) * 0.07, 0.48 + Math.floor(i / 4) * 0.05, -7.75 + (i % 2) * 0.06, [0x6a2a6a, 0x4a1a4a][i % 2], { seg: 8 });     // grapes
  for (let i = 0; i < 3; i++) F.crate(K, 0.55, -8.45, 0.55 * i, -9.45, 0.2 * i);
  K.block(-8.8, -9.8, -8.1, -9.1);
  ctx.P(-4.9, -9.55, 0.2, () => P2.guitarStand(K, 0xd8a020));
  P2.guitarCase(K, gr.x0 + 0.12, -7.9, HP);
  ctx.P(gr.x1 - 0.3, -9.0, HP, () => P2.clothesRail(K, 1.3));
  ctx.poster(-6.3, 2.0, gr.z1 - 0.01, PI, 0.7, 1.0, "NEON PALMS LIVE", 0x1a1a2a, 0xff3b8b);
  ctx.poster(-5.2, 2.0, gr.z1 - 0.01, PI, 0.7, 1.0, "DJ KOBRA", 0x2a1a10, 0xe8c020);
  ctx.spot(-4.6, -7.9, 1.5, "HANG OUT", "🎤 Hang out backstage", "green");
  // manager's office: the cash, the safe, the cameras
  ctx.paint("office", 0x4a2e22, 0, "panel");
  ctx.P(1.5, of.z0 + 0.4, 0, () => F.desk(K, 1.7, { wood: C.walnut }));
  ctx.P(1.5, -8.8, PI, () => F.officeChair(K, { color: 0x1a1a1e }));
  ctx.npc(1.5, -8.8, PI, "type", { shirt: 0x1a1a1e, pants: 0x1a1a1e });
  for (let i = 0; i < 9; i++) { const x = 0.95 + (i % 3) * 0.18, z = of.z0 + 0.3 + Math.floor(i / 3) * 0.09, h = 0.03 + ((i * 7) % 3) * 0.02; K.box("matte", 0.16, h, 0.07, x, 0.765 + h / 2, z, 0x6a9a5a); K.box("matte", 0.03, h + 0.002, 0.072, x, 0.765 + h / 2, z, 0xe8e0c8); }
  K.box("gloss", 0.28, 0.16, 0.25, 2.15, 0.845, of.z0 + 0.35, 0x2a2a2e, { r: 0.02 }); K.box("glow", 0.1, 0.03, 0.005, 2.15, 0.88, of.z0 + 0.476, 0x40ff80, { em: 2 });
  ctx.P(3.45, of.z0 + 0.35, 0, () => F.safe(K));
  wallTV(ctx, of.x1, 1.9, -8.3, -HP, 1.2, 0.68, "cctv");
  ctx.P(1.5, of.z1 - 0.45, PI, () => F.sofa(K, 2.0, 0x3a1a14, { legs: C.brass }));
  ctx.painting(of.x0, 1.8, -8.6, HP, 0.8, 0.8, 12);
  K.push(0.85, of.z0 + 0.25, 0, 0.765); F.tableLamp(K, 0, 0, 0, 0x1a4a2a); K.pop(); ctx.light(0.85, 1.2, of.z0 + 0.4, 0xffd49a, 2, 3);
  ctx.P(-0.45, -9.45, 0, () => F.plant(K, "palm", { pot: C.brass }));
  ctx.rug(1.5, -8.2, 2.6, 1.6, 0x5a1a1e);
  ctx.spot(1.5, -7.8, 1.3, "BOSS", "💰 Talk to the manager", "clubboss");
  // keg room: kegs stacked three high, beer lines up the wall, CO2, the ice machine, bottle crates
  ctx.paint("kegs", 0x8a8e92, 0, "block");
  for (let i = 0; i < 6; i++) P2.keg(K, 4.5 + i * 0.44, -9.65);
  for (let i = 0; i < 5; i++) P2.keg(K, 4.72 + i * 0.44, -9.2);
  for (let i = 0; i < 5; i++) P2.keg(K, 4.5 + i * 0.44, -9.65, 0.6);
  for (let i = 0; i < 5; i++) {
    const x = 4.6 + i * 0.1, c = [0xe8e4dc, 0xd82a2a, 0x2a5aa8, 0xe8e4dc, 0x2a9a4a][i];
    K.cyl("matte", 0.012, 0.012, ctx.H - 1.3, x, (1.3 + ctx.H) / 2 - 0.05, kg.z0 + 0.03, c, { seg: 6 });
    K.cyl("matte", 0.012, 0.012, 3.4, x, ctx.H - 0.1, kg.z0 + 1.7, c, { rx: HP, seg: 6 });
  }
  for (const x of [7.2, 7.45]) { K.cyl("gloss", 0.11, 0.11, 1.25, x, 0.63, -9.65, 0x5a6a5a, { seg: 16 }); K.sph("gloss", 0.11, x, 1.25, -9.65, 0x5a6a5a, { half: true, seg: 16 }); K.cyl("chrome", 0.035, 0.035, 0.06, x, 1.38, -9.65, C.chrome, { seg: 10 }); K.cyl("glass", 0.035, 0.035, 0.01, x, 1.4, -9.6, 0xf4f4f0, { rx: HP, seg: 12 }); }
  K.block(7.05, -9.8, 7.6, -9.5);
  ctx.P(kg.x1 - 0.35, -7.5, -HP, () => P2.iceMachine(K));
  for (const [x, y, r, c] of [[8.45, 0, 0, 0x2a6a3a], [8.45, 0.28, 0.1, 0x6a3a1a], [8.45, 0.56, -0.05, 0x2a6a3a], [7.98, 0, 0, 0x6a3a1a]]) P2.bottleCrate(K, x, y, -9.6, r, c);
  K.block(7.75, -9.9, 8.7, -9.4);
  ctx.P(kg.x0 + 0.23, -7.6, HP, () => F.shelfUnit(K, 1.6));
  ctx.P(6.6, -7.2, 0.6, () => F.handTruck(K));
  ctx.npc(6.0, -8.3, PI, "stand", { shirt: 0x1a1a1a, pants: 0x1a1a1a }, [[6.0, -8.5, PI], [7.8, -7.5, HP], [5.2, -7.0, 0]], "look");
  ctx.spot(6.0, -8.0, 1.3, "QUALITY CHECK", "🍺 'Quality check' a keg", "keg");
}
function galleryBackRooms(ctx) {
  const { K, R } = ctx;
  const sd = R.studio, vt = R.vault;
  // restoration studio: easels, a tilted restoration bench under a magnifier, a paint table, racks of canvases
  ctx.paint("studio", 0xf0ece4, 0, "brick");
  ctx.P(sd.x0 + 0.52, -8.0, HP, () => P2.artRack(K, 2.0));
  easelAt(ctx, -6.9, -9.2, 0.25, 40);
  easelAt(ctx, -0.3, -8.9, -0.3, 42);
  easelAt(ctx, 1.2, -7.2, -1.0, 43);
  K.box("wood", 2.0, 0.05, 1.1, -4.6, 0.78, -8.5, 0x8a6a4a, { r: 0.01 });
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) K.box("wood", 0.06, 0.76, 0.06, -4.6 + x * 0.94, 0.38, -8.5 + z * 0.5, 0x6a4a30);
  K.block(-5.6, -9.05, -3.6, -7.95);
  ctx.painting(-4.6, 1.0, -8.6, 0, 1.4, 0.9, 41, { lean: 1.2 });
  K.cyl("metal", 0.06, 0.07, 0.03, -3.75, 0.82, -9.0, 0x2a2a2e, { seg: 12 }); K.cyl("metal", 0.012, 0.012, 0.6, -3.85, 1.1, -8.95, 0x2a2a2e, { rz: 0.35, seg: 6 });
  K.cyl("metal", 0.012, 0.012, 0.45, -4.1, 1.42, -8.85, 0x2a2a2e, { rz: 1.2, seg: 6 });
  K.torus("metal", 0.13, 0.018, -4.35, 1.36, -8.7, 0x2a2a2e, { ts: 24 }); K.cyl("glass", 0.12, 0.12, 0.01, -4.35, 1.36, -8.7, 0xe8f0f4, { seg: 20 });
  K.torus("glow", 0.11, 0.006, -4.35, 1.34, -8.7, 0xf4f8ff, { ts: 24, em: 3 });
  ctx.light(-4.35, 1.3, -8.6, 0xf4f8ff, 2.5, 2.5);
  for (let i = 0; i < 4; i++) K.lathe("glass", [[0.001, 0], [0.03, 0], [0.03, 0.1], [0.012, 0.14], [0.012, 0.16]], -5.45 + i * 0.08, 0.805, -8.05, [0xd8a040, 0xc8d8e0, 0x8a3a2a, 0xc8d8e0][i], { seg: 8 });
  ctx.P(-2.2, -9.45, 0, () => P2.paintTable(K));
  ctx.P(sd.x1 - 0.28, -9.3, -HP, () => P2.scrubSink(K, 1.0));
  ctx.rug(-0.6, -8.0, 2.6, 2.0, 0xd8d0c0);
  for (let i = 0; i < 4; i++) ctx.painting(-6.0 + i * 0.6, 2.15, sd.z0, 0, 0.42, 0.3, 50 + i);
  for (let i = 0; i < 3; i++) ctx.painting(-7.6 + i * 0.07, 0.7, sd.z1 - 0.12 - i * 0.05, PI, 1.1 - i * 0.1, 1.0 - i * 0.1, 30 + i, { lean: 0.12 });
  K.block(-8.3, -6.6, -6.9, sd.z1);
  K.push(-3.5, -8.0, 0, 0); F.trackLights(K, 9.0, ctx.H - 0.05); K.pop();
  ctx.npc(-4.6, -7.75, PI, "stand", { shirt: 0xf4f4f0, pants: 0x3a3a44 });
  ctx.npc(-0.1, -8.2, PI + 0.3, "stand", { shirt: 0x6a2a3a, pants: 0x2a2a2e }, [[-0.1, -8.2, PI + 0.3], [0.6, -6.7, -2.4], [-2.2, -8.75, PI]], "look");
  ctx.spot(-4.6, -7.3, 1.5, "WATCH", "🎨 Watch the restorers work", "restore");
  // vault: the round door swung open, art racks, a gold piece under glass, deposit boxes, lasers
  ctx.paint("vault", 0x8a8e92, 0, "block");
  K.push(2.45, -7.3, HP, 0); P2.vaultDoor(K); K.pop(); K.block(vt.x0, -8.5, 2.85, vt.z1);
  for (const x of [2.54, 3.86]) K.box("metal", 0.12, 2.7, 0.1, x, 1.35, -5.88, 0x5a5e62);
  K.box("metal", 1.44, 0.14, 0.1, 3.2, 2.67, -5.88, 0x5a5e62);
  for (const x of [4.4, 6.6]) ctx.P(x, vt.z0 + 0.52, 0, () => P2.artRack(K, 2.0));
  for (let r = 0; r < 7; r++) for (let c = 0; c < 8; c++) {
    const y = 0.35 + r * 0.28, z = -9.6 + c * 0.4;
    K.box("chrome", 0.06, 0.25, 0.37, vt.x1 - 0.07, y, z, 0xb8bcc0);
    K.box("matte", 0.005, 0.035, 0.018, vt.x1 - 0.103, y, z + 0.12, 0x1a1a1a);
    K.box("gloss", 0.004, 0.04, 0.08, vt.x1 - 0.102, y + 0.07, z - 0.05, C.brass);
  }
  K.box("metal", 0.06, 2.1, 3.3, vt.x1 - 0.02, 1.25, -8.2, 0x5a5e62); K.block(vt.x1 - 0.12, -9.85, vt.x1, -6.55);
  ctx.P(5.4, -7.3, 0, () => F.plinth(K, 1.0, 0x1a1a1c)); K.push(5.4, -7.3, 0, 0); F.sculpture(K, 0, 1.0, 0xd8a830); K.pop();
  K.box("glass", 0.62, 0.72, 0.62, 5.4, 1.37, -7.3, 0xe8f0f4); ctx.light(5.4, 2.6, -7.3, 0xfff0d0, 4, 3);
  ctx.P(7.4, -7.3, 0, () => F.metalTable(K, 1.0, 0.6));
  for (let l = 0; l < 3; l++) for (let i = 0; i < 4 - l; i++) for (let j = 0; j < 2; j++) K.box("chrome", 0.22, 0.06, 0.1, 7.4 - (3 - l) * 0.12 + i * 0.24, 0.79 + l * 0.06, -7.36 + j * 0.12, 0xd8a830);
  for (const [y, a] of [[0.45, 0.25], [0.9, -0.2]]) { K.box("glow", 5.6, 0.008, 0.008, 5.8, y, -6.75, 0xff2020, { em: 4, ry: a * 0.15 }); for (const x of [3.0, 8.6]) K.box("gloss", 0.06, 0.06, 0.06, x, y, -6.75, 0x1a1a1a); }
  K.box("gloss", 0.12, 0.1, 0.26, vt.x1 - 0.25, ctx.H - 0.3, vt.z1 - 0.3, 0xf4f4f0, { rx: 0.5, ry: 0.7 }); K.sph("glow", 0.012, vt.x1 - 0.3, ctx.H - 0.38, vt.z1 - 0.42, 0xff2020, { em: 3, seg: 6 });
  ctx.npc(4.0, -6.8, 0.6, "stand", { shirt: 0x1a1a2a, pants: 0x1a1a2a });
  ctx.spot(5.4, -6.6, 1.4, "CASE IT", "🔒 Look over the vault", "vault");
}

function hospitalBackRooms(ctx) {
  const { K, R } = ctx;
  const sc = R.scrub, sg = R.surgery, ct = R.control, mr = R.mri;
  const scrubs = { shirt: 0x5aa89a, pants: 0x5aa89a };
  // scrub room: the long steel sink, gowns on hooks, glove boxes, supplies, IN SURGERY over the door
  ctx.paint("scrub", 0xd8ece8, 0, "tile");
  ctx.P(-1.5, sc.z0 + 0.28, 0, () => P2.scrubSink(K, 1.8));
  for (const [i, c] of [0x2a6ad8, 0x8a4ad8, 0xf4f4f4].entries()) { K.box("matte", 0.25, 0.13, 0.08, -2.1 + i * 0.3, 1.85, sc.z0 + 0.05, c); K.box("matte", 0.1, 0.03, 0.002, -2.1 + i * 0.3, 1.88, sc.z0 + 0.091, 0x1a1a1a); }
  ctx.P(sc.x1 - 0.23, -8.7, -HP, () => F.shelfUnit(K, 1.4, { color: 0xd8dcdf }));
  K.box("chrome", 0.04, 0.03, 1.0, sc.x0 + 0.03, 1.85, -7.2, C.chrome);
  for (const z of [-7.55, -7.2, -6.85]) { K.box("fabric", 0.07, 1.0, 0.36, sc.x0 + 0.09, 1.32, z, 0x6ab8a8, { r: 0.02 }); K.sph("fabric", 0.09, sc.x0 + 0.1, 1.88, z, 0x6ab8a8, { half: true, seg: 10 }); }
  ctx.poster(sc.x0 + 0.01, 2.45, -8.5, HP, 0.8, 0.2, "IN SURGERY", 0xc81e1e);
  ctx.light(sc.x0 + 0.3, 2.4, -8.5, 0xff3030, 1.0, 2);
  ctx.P(-0.45, -7.0, 0, () => DC.trashBin(K));
  ctx.npc(-1.9, -9.6, PI, "wipe", scrubs);
  // operating theatre: the table under a twin-head surgical light, the anaesthesia cart, a draped patient
  ctx.paint("surgery", 0xc8e4dc, 0, "tile");
  ctx.P(-6.0, -8.4, 0, () => P2.operatingTable(K));
  K.box("fabric", 0.5, 0.17, 1.45, -6.0, 1.03, -8.15, 0x6ab8a8, { r: 0.08 });
  K.sph("fabric", 0.1, -6.0, 1.05, -9.05, 0xd8b090, { seg: 12 }); K.sph("fabric", 0.105, -6.0, 1.08, -9.08, 0x6ab8a8, { half: true, seg: 12 });
  P2.surgicalLamp(K, -6.0, -8.4, ctx.H);
  ctx.light(-6.0, 2.0, -8.4, 0xf4f8ff, 9, 3.5);
  ctx.P(-6.0, -9.95, 0, () => P2.anesthesiaMachine(K));
  ctx.P(-4.6, -8.0, 0, () => P2.instrumentTrolley(K));
  ctx.P(-7.4, -9.6, 0.5, () => F.vitalsMonitor(K));
  ctx.P(-7.0, -7.7, 0, () => F.ivStand(K));
  ctx.P(sg.x0 + 0.26, -8.4, HP, () => F.medCabinet(K, 1.4));
  K.push(-4.4, sg.z0, 0, 0); P2.lightbox(K, 1.4); K.pop();
  K.push(-6.0, sg.z1 - 0.03, PI, 2.4); F.wallClock(K); K.pop();
  ctx.npc(-5.25, -8.55, -HP, "stand", scrubs); ctx.npc(-6.75, -8.1, HP, "stand", scrubs); ctx.npc(-6.0, -9.45, 0, "stand", { shirt: 0x2a5aa8, pants: 0x2a5aa8 });
  ctx.spot(-4.8, -7.1, 1.3, "OBSERVE", "🩺 Watch the surgeons work", "surgery");
  // imaging control: the console looking through the window, x-rays on the lightbox, lead aprons
  ctx.P(1.5, ct.z0 + 0.38, 0, () => F.desk(K, 1.6, { wood: 0xe8eef2 }));
  ctx.P(1.5, -9.3, PI, () => F.officeChair(K, { color: 0x2e6a8a }));
  ctx.npc(1.5, -9.3, PI, "type", { shirt: 0x6ab0c8, pants: 0x6ab0c8 });
  K.push(ct.x0, -8.3, HP, 0); P2.lightbox(K, 1.4); K.pop();
  K.push(2.2, ct.z1, PI, 0); P2.leadAprons(K); K.pop();
  // MRI suite
  ctx.paint("mri", 0xe4eef0, 1.0, "tile", { color2: 0x2e6a8a });
  ctx.P(6.2, -9.7, 0, () => P2.mriScanner(K));
  ctx.light(6.2, 1.0, -8.95, 0x60c8ff, 1.5, 2.5);
  ctx.poster(4.0, 1.7, mr.z0 + 0.01, 0, 0.8, 0.5, "STRONG MAGNET", 0xe8c020, 0x1a1a1a);
  ctx.P(mr.x1 - 0.26, -8.2, -HP, () => F.medCabinet(K, 1.2));
  ctx.npc(4.6, -7.6, HP, "stand", { shirt: 0x6ab0c8, pants: 0x6ab0c8 }, [[4.6, -7.6, HP], [4.2, -9.2, -HP], [7.9, -7.0, HP]], "look");
  ctx.spot(4.5, -7.8, 1.3, "SCAN", "🧲 Step into the MRI suite", "scan");
}
function policeBackRooms(ctx) {
  const { K, R } = ctx;
  const ar = R.armory, ev = R.evidence, cop = { shirt: 0x1e2a44, pants: 0x1e2a44 };
  // armory: rifles racked on two walls, vests, riot shields, ammo cans, a pistol stripped on the bench
  ctx.paint("armory", 0x7a7e72, 0, "block");
  ctx.P(5.7, ar.z0 + 0.06, 0, () => P2.gunRack(K, 2.6));
  ctx.P(ar.x0 + 0.06, -8.0, HP, () => P2.gunRack(K, 1.8));
  ctx.P(7.9, -9.55, 0, () => P2.vestRack(K));
  K.push(ar.x1 - 0.05, -8.3, -HP, 0); P2.riotShields(K); K.pop(); K.block(ar.x1 - 0.3, -8.8, ar.x1, -7.8);
  ctx.P(6.2, -8.0, 0, () => F.metalTable(K));
  K.box("metal", 0.19, 0.03, 0.035, 6.0, 0.775, -8.0, 0x1a1a1c); K.box("metal", 0.035, 0.1, 0.03, 5.93, 0.775, -7.9, 0x1a1a1c, { rx: HP, rz: 0.3 });
  K.box("metal", 0.03, 0.1, 0.02, 6.25, 0.775, -7.85, 0x2a2a2e, { rx: HP });
  for (let i = 0; i < 6; i++) K.cyl("gloss", 0.006, 0.006, 0.025, 6.35 + i * 0.02, 0.775, -8.1, C.brass, { rx: HP, seg: 6 });
  K.cyl("metal", 0.006, 0.006, 0.4, 6.5, 0.768, -7.8, 0x5a5e62, { rz: HP, seg: 5 }); K.box("fabric", 0.06, 0.002, 0.06, 6.75, 0.762, -7.8, 0xe8e4dc);
  P2.ammoCrates(K, 4.75, -6.9);
  ctx.npc(6.2, -8.75, 0, "stand", cop);
  ctx.spot(6.8, -7.2, 1.3, "GEAR UP", "🔫 Ask for a loadout", "armory");
  // evidence: tagged boxes behind a wire cage, a log desk, bagged items waiting to be booked
  ctx.paint("evidence", 0x9a9ea2, 0, "block");
  for (const x of [0.2, 2.75]) ctx.P(x, ev.z0 + 0.28, 0, () => P2.evidenceShelf(K, 2.0));
  K.push(-0.09, -8.4, 0, 0); P2.wireCage(K, 1.68, ctx.H); K.pop(); K.block(ev.x0, -8.45, 0.75, -8.35);
  K.push(3.09, -8.4, 0, 0); P2.wireCage(K, 1.68, ctx.H); K.pop(); K.block(2.25, -8.45, ev.x1, -8.35);
  K.push(2.25, -8.76, HP, 0); P2.wireCage(K, 0.72, 2.2); K.pop();
  ctx.poster(-0.1, 2.3, -8.33, 0, 0.9, 0.25, "AUTHORIZED ONLY", 0xe8c020, 0x1a1a1a);
  ctx.P(ev.x1 - 0.38, -7.4, -HP, () => F.desk(K, 1.2, { wood: 0x6a6e74 }));
  ctx.P(ev.x1 - 1.1, -7.4, HP, () => F.officeChair(K));
  ctx.npc(ev.x1 - 1.1, -7.4, HP, "type", cop);
  ctx.P(0.0, -7.3, 0, () => F.metalTable(K));
  for (const [x, z, it] of [[-0.35, -7.4, 0], [0.0, -7.2, 1], [0.35, -7.4, 2], [0.1, -7.55, 3]]) {
    K.box("glass", 0.24, 0.04, 0.32, x, 0.785, z, 0xe8f0f4); K.box("matte", 0.24, 0.006, 0.05, x, 0.808, z - 0.13, 0xd82a2a);
    if (it === 0) { K.box("chrome", 0.03, 0.005, 0.16, x, 0.77, z + 0.02, C.chrome); K.box("matte", 0.035, 0.015, 0.08, x, 0.772, z - 0.08, 0x1a1a1a); }
    if (it === 1) { K.box("metal", 0.16, 0.025, 0.03, x, 0.775, z, 0x1a1a1c); K.box("metal", 0.03, 0.025, 0.08, x - 0.06, 0.775, z + 0.04, 0x1a1a1c); }
    if (it === 2) for (let k = 0; k < 3; k++) K.box("matte", 0.15, 0.012, 0.07, x, 0.772 + k * 0.012, z + (k - 1) * 0.02, 0x6a9a5a);
    if (it === 3) K.box("gloss", 0.07, 0.01, 0.14, x, 0.772, z, 0x1a1a1e);
  }
  ctx.spot(1.5, -7.6, 1.3, "LOOK", "🗃 Look over the evidence log", "evidence");
}
function officeBackRooms(ctx) {
  const { K, R, brand } = ctx;
  const cf = R.conference, sv = R.server;
  // conference room: the long table with a speakerphone, eight chairs, a results deck on the screen
  ctx.paint("conference", 0x2a2e34, 0, "panel", { accentWall: "back" });
  ctx.P(-3.6, -7.0, 0, () => P2.conferenceTable(K, 3.6));
  for (const x of [-4.9, -4.0, -3.1, -2.2]) { ctx.P(x, -7.85, 0, () => F.officeChair(K)); ctx.P(x, -6.15, PI, () => F.officeChair(K)); }
  ctx.P(-5.85, -7.0, HP, () => F.officeChair(K, { color: 0x3a2a1e }));
  ctx.P(-3.6, cf.z0 + 0.24, 0, () => F.dresser(K, 1.8));
  K.lathe("glass", [[0.001, 0], [0.07, 0], [0.08, 0.15], [0.04, 0.25], [0.045, 0.28]], -4.1, 0.86, cf.z0 + 0.24, 0xdde8ee);
  K.push(-3.1, cf.z0 + 0.24, 0, 0.86); F.coffeeMachine(K); K.pop();
  wallTV(ctx, cf.x1, 1.6, -7.0, -HP, 2.0, 1.12, "chart");
  ctx.P(cf.x0 + 0.05, -7.0, HP, () => F.whiteboard(K, 1.6));
  ctx.pendant(-4.5, -7.0, 0.85, 0x2a2a2e); ctx.pendant(-2.7, -7.0, 0.85, 0x2a2a2e);
  ctx.P(cf.x0 + 0.35, cf.z1 - 0.35, 0, () => F.plant(K, "fern"));
  ctx.P(-0.45, -8.55, 0, () => F.plant(K, "snake"));
  ctx.npc(-4.9, -7.85, 0, "sit"); ctx.npc(-3.1, -6.15, PI, "sit", { shirt: 0xe8e0d0 }); ctx.npc(-2.2, -7.85, 0, "sit", { shirt: 0x2a3a5a }); ctx.npc(-5.85, -7.0, HP, "sit", { shirt: 0x2a2a3a, pants: 0x2a2a3a });
  ctx.npc(-0.75, -6.3, -HP + 0.5, "stand", { shirt: brand });
  ctx.spot(-3.6, -5.6, 1.3, "SIT IN", "💼 Sit in on the meeting", "meeting");
  // server room: two rows of racks either side of a cold aisle, cable trays, CRAC units, an IT desk
  ctx.paint("server", 0xc8ccd0, 0, "block");
  for (let i = 0; i < 6; i++) { ctx.P(0.65 + i * 0.6, sv.z0 + 0.52, 0, () => P2.serverRack(K)); ctx.P(0.65 + i * 0.6, sv.z1 - 0.53, PI, () => P2.serverRack(K)); }
  P2.cableTray(K, 0.35, 3.95, -8.4, ctx.H); P2.cableTray(K, 0.35, 3.95, -5.6, ctx.H);
  ctx.light(2.15, 1.0, -7.0, 0x40ff80, 1.2, 3); ctx.light(2.15, 1.7, -7.0, 0x4080ff, 1.0, 3);
  for (const z of [-8.2, -6.9]) ctx.P(sv.x1 - 0.32, z, -HP, () => P2.acUnit(K));
  wallTV(ctx, 5.0, 1.75, sv.z0, 0, 1.0, 0.56, "cctv");
  ctx.P(5.0, sv.z0 + 0.38, 0, () => F.desk(K, 1.2));
  ctx.P(5.0, -7.85, PI, () => F.officeChair(K));
  ctx.npc(5.0, -7.85, PI, "type", { shirt: 0x2a2a2e, pants: 0x3a4a5a });
  K.cyl("gloss", 0.18, 0.18, 1.2, 6.55, 0.62, -5.5, 0xc81e1e, { seg: 16 }); K.sph("gloss", 0.18, 6.55, 1.22, -5.5, 0xc81e1e, { half: true, seg: 16 }); K.cyl("chrome", 0.04, 0.04, 0.1, 6.55, 1.44, -5.5, C.chrome, { seg: 8 });
  K.block(6.35, -5.7, 6.75, -5.3);
  ctx.spot(4.5, -6.6, 1.3, "SERVERS", "🖥 Check on the servers", "servers");
}
function depotBay(ctx) {
  const { K, R } = ctx;
  const by = R.bay;
  // loading bay: a box truck backed in, its cargo half unloaded, wrapped pallets, a dock leveller, beacons
  ctx.paint("bay", 0xb8b4ac, 0, "block"); ctx.paint("bay", 0xe8c020, 0.35, "matte", { layer: 1, color2: 0x1a1a1a });
  ctx.P(-5.0, -10.3, -HP, () => P2.boxTruck(K));
  for (const [x0, x1, z] of [[-9.6, -1.5, -11.9], [-9.6, -1.5, -8.7]]) K.box("matte", x1 - x0, 0.005, 0.12, (x0 + x1) / 2, 0.045, z, 0xe8c020);
  rollerDoor(K, "z", by.x0, -10.3, 3.6, 3.9);
  rollerDoor(K, "x", by.z0, 3.0, 3.0, 3.4);
  ctx.P(3.0, by.z0 + 0.95, 0, () => P2.dockLeveler(K, 2.6));
  for (const [x, z, r] of [[-0.6, -11.9, 0], [0.6, -11.9, 0.05], [-0.6, -10.5, 0.1], [5.0, -9.0, 0]]) P2.wrappedPallet(K, x, z, r);
  ctx.P(-1.3, -9.0, 0.6, () => P2.palletJack(K));
  for (let i = 0; i < 2; i++) { const x = 5.0 - i * 1.3, z = -11.9; if (i) { ctx.P(x, z, 0, () => F.pallet(K)); F.cardboard(K, 0.5, 0.45, 0.55, x - 0.26, 0.15, z - 0.28); F.cardboard(K, 0.5, 0.45, 0.55, x + 0.26, 0.15, z + 0.2); K.block(x - 0.55, z - 0.62, x + 0.55, z + 0.62); } }
  for (const x of [by.x0 + 0.15, by.x1 - 0.15]) { K.sph("glow", 0.09, x, 4.2, -12.4, 0xffa020, { em: 3, seg: 10 }); K.box("matte", 0.12, 0.08, 0.12, x, 4.1, -12.4, 0x2a2a2e); }
  ctx.light(by.x0 + 0.5, 4.0, -12.0, 0xffa020, 4, 6, (t, L) => { L.I = 5 * Math.max(0, Math.sin(t * 6)); });
  K.push(by.x1 - 0.01, -9.0, -HP, 0); DC.extinguisher(K); K.pop();
  ctx.npc(-0.6, -9.2, -HP, "stand", { shirt: 0xe8e020, pants: 0x2a3a52 }, [[-0.6, -9.2, -HP], [2.0, -10.6, PI], [-1.6, -9.6, -HP]], "look");
  ctx.npc(-8.2, -8.4, PI, "phone", { shirt: 0x2a5aa8, pants: 0x1a1a1e });
  ctx.spot(0.0, -9.4, 1.5, "LOAD UP", "📦 Help load the truck", "load");
}

export const PLANS = {
  apartment: {
    W: 12, D: 9, H: 2.9, door: 4.5, home: true,
    rooms: {
      kitchen: { r: [-6, 0, -1, 4.5], floor: "tile", light: [0xfff0dc, 18], ceil: "round", name: "Kitchen" },
      living: { r: [-1, 0, 6, 4.5], floor: "@decor", light: [0xffe2b8, 22], ceil: "round", name: "Living room" },
      bedroom: { r: [-6, -4.5, 1.5, 0], floor: "@decor", light: [0xffd8a8, 18], ceil: "round", name: "Bedroom" },
      bath: { r: [1.5, -4.5, 6, 0], floor: "tile", light: [0xf4f8ff, 16], ceil: "round", name: "Bathroom" },
      study: { r: [-6, -8, 0, -4.5], floor: "carpet", light: [0xfff0dc, 13], ceil: "round", name: "Gaming den" },
      closet: { r: [0, -8, 6, -4.5], floor: "wood", light: [0xfff4e4, 14], ceil: "spot", name: "Walk-in closet" },
    },
    links: [
      { a: "kitchen", b: "living", kind: "open" },
      { a: "living", b: "bedroom", kind: "door", at: 0.25, into: "bedroom" },
      { a: "living", b: "bath", kind: "door", at: 2.6, into: "bath" },
      { a: "bedroom", b: "study", kind: "door", at: -5.3, into: "study" },
      { a: "bedroom", b: "closet", kind: "door", at: 0.75, into: "closet" },
    ],
    windows: [{ room: "study", side: "back", at: -1.6, w: 1.2 }, { room: "living", side: "front", at: 1.2, w: 1.8 }, { room: "kitchen", side: "front", at: -3.5, w: 1.4 }],
    furnish(ctx, d) {
      const { K, R } = ctx;
      const k = R.kitchen, l = R.living, b = R.bedroom;
      kitchenBits(ctx, k.x0, 1.8, 3.0, 0.9);
      ctx.P(k.x0 + 0.32, 1.8, HP, () => F.kitchenRun(K, 3.0, { fronts: 0x3a4a5a }));
      DC.fruitBowl(K, -3.0, 0.76, 2.3);
      ctx.P(k.x0 + 0.4, 3.85, HP, () => F.fridge(K));
      ctx.P(-3.0, 2.3, 0, () => F.roundTable(K, 0.45));
      ctx.P(-3.0, 1.55, 0, () => F.chair(K)); ctx.P(-3.0, 3.05, PI, () => F.chair(K));
      ctx.spot(k.x0 + 0.9, 3.85, 1.2, "SNACK", "🥪 Raid the fridge · heals a little", "snack");
      livingSet(ctx, 2.2, 2.3, 1, d);
      tvWall(ctx, l.x1 - 0.22, 2.3, -HP, d);
      lampAt(ctx, 1.4, 0.55, d); plantAt(ctx, l.x1 - 0.35, 0.5, d); artAt(ctx, 4.6, l.z0, 0, d);
      ctx.P(-0.3, l.z1 - 0.17, PI, () => F.bookshelf(K, 0.9, 1.9));
      ctx.fan(3.2, 2.3);
      ctx.spot(3.3, 3.2, 1.6, "DECORATE", "🎨 Decorate your home", "decorate");
      if (d.bed) ctx.P(-3.0, b.z0 + 1.05, 0, () => F.bed(K, 1.6, 2.05, d.bed));
      ctx.P(-4.15, b.z0 + 0.25, 0, () => F.nightstand(K)); ctx.P(-1.85, b.z0 + 0.25, 0, () => F.nightstand(K));
      ctx.P(b.x0 + 0.3, -1.5, HP, () => F.wardrobe(K, 1.6));
      ctx.P(b.x1 - 0.24, -2.2, -HP, () => F.dresser(K, 1.2));
      if (d.rug) ctx.rug(-3.0, -1.2, 2.0, 1.2, d.rug, 0);
      plantAt(ctx, b.x1 - 0.3, b.z1 - 0.3, d, 0.8);
      bedroomBits(ctx, -3.0, b.z0);
      K.push(-0.85, b.z0, 0, 0); DC.radiator(K, 1.0); K.pop();
      if (d.bed) ctx.spot(-3.0, -2.3, 1.7, "SLEEP", "🛏 Sleep till morning · heals you and saves", "sleep");
      bathroom(ctx, R.bath, { key: "bath", tub: [4.85, R.bath.z0 + 0.4, 0], wc: [R.bath.x1 - 0.36, -1.3, -HP], sink: [R.bath.x0 + 0.25, -2.9, HP], towel: [R.bath.x1 - 0.02, -2.6, -HP], mat: [3.6, -2.2] });
      gamingDen(ctx, R.study, d);
      walkInCloset(ctx, R.closet);
    },
  },
  condo: {
    W: 15, D: 11, H: 3.0, door: 5.3, home: true,
    rooms: {
      kitchen: { r: [-7.5, 0, -2, 5.5], floor: "tile", light: [0xfff0dc, 20], ceil: "spot", name: "Kitchen" },
      living: { r: [-2, 0, 7.5, 5.5], floor: "@decor", light: [0xffe2b8, 26], ceil: "round", name: "Living room" },
      bedroom: { r: [-7.5, -5.5, -1, 0], floor: "@decor", light: [0xffd8a8, 20], ceil: "round", name: "Bedroom" },
      bath: { r: [-1, -5.5, 2.5, 0], floor: "tile", light: [0xf4f8ff, 16], ceil: "round", name: "Bathroom" },
      office: { r: [2.5, -5.5, 7.5, 0], floor: "wood", light: [0xfff0dc, 18], ceil: "round", name: "Study" },
      gym: { r: [-7.5, -9.5, 0, -5.5], floor: "vinyl", light: [0xf4f8ff, 22], ceil: "panel", name: "Home gym" },
      cinema: { r: [0, -9.5, 7.5, -5.5], floor: "carpetRed", light: [0xffc890, 9], ceil: "spot", name: "Home cinema" },
    },
    links: [
      { a: "kitchen", b: "living", kind: "open" },
      { a: "kitchen", b: "bedroom", kind: "door", at: -2.9, into: "bedroom" },
      { a: "living", b: "bath", kind: "door", at: 0.8, into: "bath" },
      { a: "living", b: "office", kind: "door", at: 3.5, into: "office" },
      { a: "bedroom", b: "gym", kind: "door", at: -6.6, into: "gym" },
      { a: "office", b: "cinema", kind: "door", at: 3.4, into: "cinema" },
    ],
    windows: [{ room: "gym", side: "back", at: -3.2, w: 2.2 }, { room: "gym", side: "left", at: -7.5, w: 1.4 }, { room: "living", side: "front", at: 1.8, w: 2.2 }, { room: "kitchen", side: "front", at: -5.2, w: 1.4 }],
    furnish(ctx, d) {
      const { K, R } = ctx;
      const k = R.kitchen, l = R.living, b = R.bedroom, o = R.office;
      kitchenBits(ctx, k.x0, 2.3, 3.4, 4.1);
      ctx.P(k.x0 + 0.32, 2.3, HP, () => F.kitchenRun(K, 3.4, { fronts: 0x2a3a4a, top: C.marble }));
      ctx.P(k.x0 + 0.4, 4.75, HP, () => F.fridge(K));
      ctx.P(-4.2, 2.4, -HP, () => F.kitchenIsland(K, 2.0));
      for (const z of [1.8, 2.4, 3.0]) ctx.P(-3.3, z, -HP, () => F.stool(K, { color: C.charcoal, h: 0.66 }));
      ctx.spot(k.x0 + 0.9, 4.75, 1.2, "SNACK", "🥪 Raid the fridge · heals a little", "snack");
      ctx.P(0.3, 4.3, 0, () => F.diningTable(K, 1.4, 0.8));
      for (const x of [-0.1, 0.7]) { ctx.P(x, 3.6, 0, () => F.chair(K, { seat: 0x8a7a6a })); ctx.P(x, 5.0, PI, () => F.chair(K, { seat: 0x8a7a6a })); DC.placeSetting(K, x, 0.76, 4.02, 0); DC.placeSetting(K, x, 0.76, 4.58, PI); }
      ctx.pendant(0.3, 4.3, 0.95, 0xc8a24a);
      livingSet(ctx, 4.2, 2.8, 1, d);
      tvWall(ctx, l.x1 - 0.22, 2.8, -HP, d);
      ctx.P(3.0, 4.7, 2.3, () => F.armchair(K, d.sofa || 0x6a6e76));
      ctx.P(5.7, l.z0 + 0.26, 0, () => DC.fireplace(K, 1.8));
      ctx.fire(5.7, 0.22, l.z0 + 0.4);
      lampAt(ctx, 2.4, 1.0, d); plantAt(ctx, l.x1 - 0.4, 5.0, d); artAt(ctx, 5.7, l.z0, 0, d, 1.4, 0.8, 2.12);
      ctx.fan(4.6, 2.8);
      ctx.P(2.15, l.z0 + 0.17, 0, () => F.bookshelf(K, 1.2, 2.0));
      ctx.spot(5.0, 3.9, 1.6, "DECORATE", "🎨 Decorate your home", "decorate");
      if (d.bed) ctx.P(-4.2, b.z0 + 1.1, 0, () => F.bed(K, 1.8, 2.1, d.bed));
      ctx.P(-5.45, b.z0 + 0.25, 0, () => F.nightstand(K)); ctx.P(-2.95, b.z0 + 0.25, 0, () => F.nightstand(K));
      ctx.P(b.x0 + 0.3, -2.2, HP, () => F.wardrobe(K, 1.8));
      ctx.P(b.x1 - 0.24, -3.6, -HP, () => F.dresser(K, 1.2));
      if (d.rug) ctx.rug(-4.2, -1.9, 2.2, 1.3, d.rug, 0);
      plantAt(ctx, b.x0 + 0.35, b.z1 - 0.35, d, 0.8);
      bedroomBits(ctx, -4.2, b.z0);
      ctx.P(-2.1, -0.4, PI, () => DC.fullMirror(K));
      if (d.bed) ctx.spot(-4.2, -2.8, 1.7, "SLEEP", "🛏 Sleep till morning · heals you and saves", "sleep");
      bathroom(ctx, R.bath, { key: "bath", tub: [0.75, R.bath.z0 + 0.4, 0], wc: [R.bath.x0 + 0.36, -2.5, HP], sink: [R.bath.x1 - 0.25, -2.9, -HP], towel: [R.bath.x0 + 0.02, -4.0, HP], mat: [0.75, -3.9] });
      ctx.P(5.0, o.z0 + 0.38, 0, () => F.desk(K, 1.5));
      ctx.P(5.0, -4.3, PI, () => F.officeChair(K));
      ctx.P(o.x1 - 0.17, -3.0, -HP, () => F.bookshelf(K, 1.2, 2.0));
      ctx.P(o.x1 - 0.3, o.z0 + 0.32, 0, () => F.filingCabinet(K));
      plantAt(ctx, o.x1 - 0.35, o.z1 - 0.35, d, 0.9);
      ctx.rug(5.0, -2.7, 2.0, 1.4, 0x5a4a3a, 0);
      K.push(4.4, o.z0 + 0.38, 0, 0.765); F.tableLamp(K, 0, 0, 0, 0x2a2a2e); K.pop();
      ctx.P(o.x0 + 0.3, -1.0, HP, () => DC.coatRack(K));
      homeGym(ctx, R.gym);
      homeCinema(ctx, R.cinema);
    },
  },
  house: {
    W: 18, D: 13, H: 3.1, door: 6.8, home: true,
    rooms: {
      kitchen: { r: [-9, 0.5, -1, 6.5], floor: "tile", light: [0xfff0dc, 26], ceil: "spot", name: "Kitchen & dining" },
      living: { r: [-1, 0.5, 9, 6.5], floor: "@decor", light: [0xffe2b8, 30], ceil: "round", name: "Living room" },
      master: { r: [-9, -6.5, -2, 0.5], floor: "@decor", light: [0xffd8a8, 24], ceil: "round", name: "Master bedroom" },
      laundry: { r: [-2, -2.5, 1.5, 0.5], floor: "tile", light: [0xf4f8ff, 12], ceil: "round", name: "Laundry" },
      bath: { r: [-2, -6.5, 1.5, -2.5], floor: "tile", light: [0xf4f8ff, 16], ceil: "round", name: "Bathroom" },
      office: { r: [1.5, -6.5, 9, 0.5], floor: "wood", light: [0xfff0dc, 24], ceil: "round", name: "Study" },
      garage: { r: [9, -1.5, 15, 6.5], floor: "concrete", light: [0xf4f8ff, 22], ceil: "fluoro", name: "Garage" },
      kids: { r: [1.5, -11, 9, -6.5], floor: "wood", light: [0xfff0dc, 16], ceil: "round", name: "Kids' room" },
    },
    links: [
      { a: "kitchen", b: "living", kind: "open" },
      { a: "kitchen", b: "master", kind: "door", at: -2.8, into: "master" },
      { a: "living", b: "laundry", kind: "door", at: 0.25, into: "laundry" },
      { a: "laundry", b: "bath", kind: "door", at: -0.25, into: "bath" },
      { a: "living", b: "office", kind: "door", at: 3.0, into: "office" },
      { a: "living", b: "garage", kind: "door", at: 1.7, into: "garage" },
      { a: "office", b: "kids", kind: "door", at: 2.5, into: "kids" },
    ],
    windows: [{ room: "master", side: "back", at: -5.5, w: 2.0 }, { room: "kids", side: "back", at: 5.5, w: 1.8 }, { room: "living", side: "front", at: 2.6, w: 2.4 }, { room: "kitchen", side: "front", at: -5.2, w: 1.8 }, { room: "garage", side: "right", at: 4.6, w: 1.2 }],
    furnish(ctx, d) {
      const { K, R } = ctx;
      const k = R.kitchen, l = R.living, m = R.master, o = R.office, la = R.laundry;
      kitchenBits(ctx, k.x0, 3.4, 4.0, 0.9);
      ctx.P(k.x0 + 0.32, 3.4, HP, () => F.kitchenRun(K, 4.0, { fronts: 0xe8e4dc, top: 0x2a2a2e }));
      ctx.P(-2.4, k.z1 - 0.18, PI, () => DC.wineRack(K, 0.8));
      ctx.P(k.x0 + 0.4, 6.0, HP, () => F.fridge(K));
      ctx.P(-6.0, 2.6, -HP, () => F.kitchenIsland(K, 2.0));
      for (const z of [2.0, 2.6, 3.2]) ctx.P(-5.1, z, -HP, () => F.stool(K, { color: 0x8a5a3a, h: 0.66 }));
      ctx.spot(k.x0 + 0.9, 6.0, 1.2, "SNACK", "🥪 Raid the fridge · heals a little", "snack");
      ctx.P(-3.2, 4.6, 0, () => F.diningTable(K, 1.8, 0.9, { wood: C.walnut }));
      for (const x of [-3.7, -2.7]) { ctx.P(x, 3.9, 0, () => F.chair(K, { wood: C.walnut, seat: 0xd8cfb8 })); ctx.P(x, 5.3, PI, () => F.chair(K, { wood: C.walnut, seat: 0xd8cfb8 })); }
      ctx.P(-4.45, 4.6, HP, () => F.chair(K, { wood: C.walnut, seat: 0xd8cfb8 })); ctx.P(-1.95, 4.6, -HP, () => F.chair(K, { wood: C.walnut, seat: 0xd8cfb8 }));
      ctx.pendant(-3.7, 4.6, 0.9, 0x2a2a2e); ctx.pendant(-2.7, 4.6, 0.9, 0x2a2a2e);
      for (const x of [-3.7, -2.7]) { DC.placeSetting(K, x, 0.76, 4.22, 0); DC.placeSetting(K, x, 0.76, 4.98, PI); }
      DC.fruitBowl(K, -3.2, 0.76, 4.6);
      livingSet(ctx, 4.6, 4.2, 1, d);
      tvWall(ctx, l.x1 - 0.22, 4.2, -HP, d);
      ctx.P(4.0, 2.0, 0.8, () => F.armchair(K, d.sofa || 0x6a6e76));
      ctx.P(7.2, l.z0 + 0.26, 0, () => DC.fireplace(K, 1.8)); ctx.fire(7.2, 0.22, l.z0 + 0.4);
      ctx.aquarium(4.6, l.z1 - 0.27, PI, 1.4, 0.7, 0.5);
      lampAt(ctx, 1.2, 5.95, d); plantAt(ctx, l.x1 - 0.45, 6.0, d, 1.2); plantAt(ctx, -0.5, 6.0, d, 0.9); artAt(ctx, 7.2, l.z0, 0, d, 1.4, 0.8, 2.15);
      ctx.fan(5.5, 3.6);
      ctx.P(1.6, l.z0 + 0.17, 0, () => F.bookshelf(K, 1.2, 2.1)); ctx.P(5.0, l.z0 + 0.17, 0, () => F.bookshelf(K, 1.6, 2.1));
      ctx.spot(5.5, 3.0, 1.8, "DECORATE", "🎨 Decorate your home", "decorate");
      if (d.bed) ctx.P(-5.5, m.z0 + 1.1, 0, () => F.bed(K, 1.9, 2.1, d.bed));
      ctx.P(-6.8, m.z0 + 0.25, 0, () => F.nightstand(K)); ctx.P(-4.2, m.z0 + 0.25, 0, () => F.nightstand(K));
      ctx.P(m.x0 + 0.3, -2.0, HP, () => F.wardrobe(K, 2.0));
      ctx.P(m.x1 - 0.24, -4.5, -HP, () => F.dresser(K, 1.3));
      ctx.P(-2.8, -1.5, -2.4, () => F.armchair(K, 0x8a6a5a));
      if (d.rug) ctx.rug(-5.5, -3.0, 2.4, 1.5, d.rug, 0);
      plantAt(ctx, m.x0 + 0.4, m.z1 - 0.4, d);
      bedroomBits(ctx, -5.5, m.z0);
      K.push(-5.5, m.z0, 0, 0); DC.radiator(K, 1.6); K.pop();
      if (d.bed) ctx.spot(-5.5, -3.0, 1.8, "SLEEP", "🛏 Sleep till morning · heals you and saves", "sleep");
      ctx.P(la.x0 + 0.32, -1.6, HP, () => F.washer(K)); ctx.P(la.x0 + 0.32, -0.9, HP, () => F.washer(K, { dryer: true }));
      ctx.P(la.x1 - 0.25, -1.3, -HP, () => F.shelfUnit(K, 1.2, { h: 1.8 }));
      bathroom(ctx, R.bath, { key: "bath", tub: [-0.2, R.bath.z0 + 0.4, 0], wc: [R.bath.x1 - 0.36, -4.3, -HP], sink: [R.bath.x0 + 0.25, -4.4, HP], towel: [R.bath.x1 - 0.02, -3.3, -HP], mat: [-0.2, -5.1] });
      ctx.P(5.0, o.z0 + 0.38, 0, () => F.desk(K, 1.6));
      ctx.P(5.0, -5.3, PI, () => F.officeChair(K, { color: 0x3a2a1e }));
      ctx.P(o.x0 + 0.17, -3.8, HP, () => F.bookshelf(K, 1.4, 2.1));
      ctx.P(o.x1 - 0.45, -3.2, -HP, () => F.sofa(K, 2.0, 0x4a5a6a, { pillows: true, accent: 0xc8a24a }));
      ctx.P(o.x1 - 0.3, o.z0 + 0.32, 0, () => F.filingCabinet(K));
      ctx.P(7.3, -1.0, 0, () => F.safe(K));
      ctx.rug(5.0, -2.9, 3.6, 2.4, 0x6a2a2a, 0);
      ctx.P(5.0, -2.9, HP, () => DC.poolTable(K));
      ctx.pendant(4.4, -2.9, 1.1, 0x1a4a2a); ctx.pendant(5.6, -2.9, 1.1, 0x1a4a2a);
      plantAt(ctx, o.x0 + 0.4, o.z1 - 0.4, d);
      K.push(4.3, o.z0 + 0.38, 0, 0.765); F.tableLamp(K, 0, 0, 0, 0x1a4a2a); K.pop();
      ctx.spot(5.0, -1.3, 1.3, "SHOOT POOL", "🎱 Rack 'em up", "pool");
      garage(ctx, R.garage);
      kidsRoom(ctx, R.kids);
    },
  },

  // ----------------------------------------------------------------------------------------------
  // venues
  // ----------------------------------------------------------------------------------------------
  food: {
    W: 16, D: 12, H: 3.2, door: 5.5, wall: 0xf0e6d4,
    rooms: {
      dining: { r: [-8, -2, 8, 6], floor: "checker", light: [0xffe8c8, 20], ceil: "none", name: "Dining room" },
      kitchen: { r: [-8, -6, 3, -2], floor: "quarry", light: [0xf4f8ff, 26], ceil: "fluoro", name: "Kitchen" },
      restroom: { r: [3, -6, 8, -2], floor: "tile", light: [0xf4f8ff, 14], ceil: "round", name: "Restrooms" },
      store: { r: [-8, -9, -1, -6], floor: "quarry", light: [0xf4f8ff, 14], ceil: "fluoro", name: "Storeroom" },
      office: { r: [-1, -9, 3.5, -6], floor: "carpet", light: [0xfff0dc, 14], ceil: "panel", name: "Manager's office" },
      lockers: { r: [3.5, -9, 8, -6], floor: "tile", light: [0xf4f8ff, 14], ceil: "fluoro", name: "Staff room" },
    },
    links: [
      { a: "dining", b: "kitchen", kind: "door", at: -6.8, into: "kitchen", sign: ["STAFF ONLY", null] },
      { a: "dining", b: "kitchen", kind: "hatch", at: -2.0, w: 3.0 },
      { a: "dining", b: "restroom", kind: "door", at: 6.5, into: "restroom", sign: ["RESTROOMS", null] },
      { a: "kitchen", b: "store", kind: "door", at: -2.4, into: "store", sign: ["STOREROOM", null] },
      { a: "store", b: "office", kind: "door", at: -7.5, into: "office", sign: ["OFFICE", null] },
      { a: "office", b: "lockers", kind: "door", at: -7.5, into: "lockers", sign: ["STAFF", null] },
    ],
    furnish(ctx) {
      const { K, R, brand, label } = ctx;
      const dn = R.dining, kt = R.kitchen, rr = R.restroom, pizza = label.includes("PIZZA");
      ctx.paint("dining", 0xffffff, 0, "brick", { accentWall: "back" });
      ctx.paint("dining", 0xffffff, 1.1, "subway", { color2: brand, layer: 1 });
      ctx.paint("kitchen", 0xffffff, 2.0, "tile");
      ctx.paint("restroom", 0xdce6ea, 0, "tile");
      // counter with the staff lane behind it, soda machine and menus
      ctx.P(-2.0, -0.7, 0, () => F.serviceCounter(K, 5.0, brand));
      K.block(-4.5, dn.z0, 0.5, -1.0);
      ctx.P(0.55, dn.z0 + 0.35, 0, () => F.prepTable(K, 1.0));
      ctx.P(0.55, dn.z0 + 0.3, 0, () => F.sodaFountain(K));
      ctx.npc(-3.0, -1.5, 0, "stand", { shirt: brand, pants: 0x2a2a2e }, [[-3.2, -1.5, 0], [-0.9, -1.45, 0.4], [-3.8, -1.5, 0]], "wipe");
      ctx.menu(-2.0, 2.62, dn.z0 + 0.01, 0, 3.0, 0.95);
      ctx.poster(-5.3, 1.9, dn.z0 + 0.01, 0, 1.3, 0.9, pizza ? "HOT & FRESH" : "SMASH BURGERS", brand);
      ctx.poster(2.2, 1.9, dn.z0 + 0.01, 0, 1.3, 0.9, pizza ? "SLICE $3" : "COMBO $12", brand);
      ctx.spot(-2.0, 0.3, 1.5, "EAT", "🍽 Order a meal · $15 · patches you up", "eat");
      // booths down the left, bistro tables on the right, pendants over the booths
      for (const [x, z] of [[-6.3, 1.4], [-3.3, 1.4], [-6.3, 4.4], [-3.3, 4.4]]) {
        ctx.P(x, z - 0.95, 0, () => F.booth(K, 1.4, F.C.red));
        ctx.P(x, z + 0.95, PI, () => F.booth(K, 1.4, F.C.red));
        ctx.P(x, z, 0, () => F.diningTable(K, 1.3, 0.75, { wood: 0xd8d0c4 }));
        ctx.pendant(x, z, 1.0, brand);
        ctx.K.lathe("gloss", [[0.001, 0], [0.1, 0.005], [0.12, 0.03]], x - 0.3, 0.76, z, F.C.white);
        ctx.K.cyl("gloss", 0.03, 0.03, 0.14, x + 0.4, 0.83, z - 0.1, 0xc82a2a, { seg: 8 });
        ctx.K.cyl("gloss", 0.03, 0.03, 0.14, x + 0.45, 0.83, z + 0.02, 0xe8c020, { seg: 8 });
      }
      ctx.npc(-6.3, 0.52, 0, "sit"); ctx.npc(-3.3, 5.3, PI, "sit"); ctx.npc(-3.3, 3.5, 0, "sit");
      for (const [x, z] of [[-6.3, 1.4], [-3.3, 1.4], [-6.3, 4.4], [-3.3, 4.4]]) { DC.placeSetting(K, x - 0.3, 0.76, z - 0.2, 0); DC.placeSetting(K, x + 0.3, 0.76, z + 0.2, PI); }
      ctx.tv(dn.x1, 2.25, 0.6, -HP, 1.5, 0.84, "sport");
      K.push(dn.x1 - 0.06, 0.6, -HP, 1.8); K.box("gloss", 1.6, 0.94, 0.06, 0, 0.45, 0, 0x111111, { r: 0.01 }); K.pop();
      ctx.P(dn.x1 - 0.32, 2.3, -HP, () => DC.jukebox(K));
      ctx.P(dn.x1 - 0.25, 4.3, -HP, () => DC.trashBin(K));
      for (const [x, z] of [[1.0, 2.2], [3.0, 2.2], [1.0, 4.4], [3.0, 4.4]]) {
        ctx.P(x, z, 0, () => F.roundTable(K, 0.36, { top: 0xe8e4dc }));
        ctx.P(x - 0.6, z, HP, () => F.chair(K, { wood: F.C.black, seat: brand })); ctx.P(x + 0.6, z, -HP, () => F.chair(K, { wood: F.C.black, seat: brand }));
      }
      ctx.npc(2.4, 2.2, HP, "sit");
      ctx.P(7.4, 5.4, 0, () => F.plant(K, "palm")); ctx.P(-7.45, 5.45, 0, () => F.plant(K, "snake"));
      ctx.P(dn.x1 - 0.05, 3.2, -HP, () => F.wallClock(K), 2.2);
      ctx.neon(dn.x0 + 0.01, 2.0, 3.0, HP, pizza ? "PIZZA" : "BURGERS", brand);
      // the kitchen: oven or griddle & fryers, prep table, sink run, walk-in fridge, dry store
      if (pizza) { ctx.P(-4.8, kt.z0 + 0.72, 0, () => F.pizzaOven(K)); ctx.fire(-4.8, 0.98, kt.z0 + 1.35); }
      else { ctx.P(-5.3, kt.z0 + 0.36, 0, () => F.griddle(K, 1.2)); ctx.P(-3.9, kt.z0 + 0.36, 0, () => F.fryer(K, 0.9)); ctx.steam(-5.3, 1.05, kt.z0 + 0.4); ctx.steam(-3.9, 1.1, kt.z0 + 0.4); }
      DC.stockPot(K, 0.9, 0.93, kt.z0 + 0.36); ctx.steam(0.9, 1.25, kt.z0 + 0.36);
      K.push(kt.x1 - 0.01, -3.0, -HP, 0); DC.extinguisher(K); K.pop();
      K.push(-1.0, kt.z1 - 0.01, PI, 0); DC.noticeBoard(K, 1.0); K.pop();
      ctx.P(0.2, kt.z0 + 0.34, 0, () => F.kitchenRun(K, 3.0, { fronts: 0xb8bcc2, top: 0xc8ccd0 }));
      ctx.P(2.4, kt.z0 + 0.4, 0, () => F.fridge(K));
      ctx.P(-2.5, -3.9, 0, () => F.prepTable(K, 1.6));
      ctx.P(kt.x0 + 0.23, -3.9, HP, () => F.shelfUnit(K, 1.6));
      ctx.npc(-4.6, -3.95, PI, "stand", { shirt: 0xf4f4f0, pants: 0x2a2a2e }, [[-4.6, -3.95, PI], [-2.5, -3.2, PI], [0.2, -4.6, PI]], "cook");
      // restrooms: three stalls, a row of sinks
      const stall = 0xb8c4cc, sz = rr.z0 + 1.55;
      for (const x of [4.45, 5.95]) { K.box("gloss", 0.03, 1.7, 1.5, x, 1.0, rr.z0 + 0.75, stall, { r: 0.01 }); K.box("chrome", 0.04, 0.15, 0.04, x, 0.08, sz - 0.1, 0xd0d4d8); K.block(x - 0.03, rr.z0, x + 0.03, sz); }
      for (const [x0, x1, hinge] of [[rr.x0, 4.45, 3.2], [4.45, 5.95, 4.55], [5.95, 7.45, 6.05]]) {
        K.box("gloss", 0.12, 1.8, 0.04, x0 + 0.06 + (x0 === rr.x0 ? 0 : 0.0), 1.05, sz, stall);         // pilaster
        K.box("gloss", 0.62, 1.55, 0.03, hinge + 0.31 * Math.cos(-0.9), 1.0, sz + 0.31 * Math.sin(0.9), stall, { ry: -0.9, r: 0.01 });   // door, swung open
        K.box("chrome", 0.02, 0.1, 0.03, hinge + 0.5 * Math.cos(-0.9), 1.0, sz + 0.5 * Math.sin(0.9), 0xd0d4d8, { ry: -0.9 });
      }
      K.box("chrome", 4.4, 0.04, 0.04, (rr.x0 + 7.45) / 2, 1.92, sz, 0xd0d4d8);
      K.box("gloss", 0.03, 1.7, 1.5, 7.45, 1.0, rr.z0 + 0.75, stall, { r: 0.01 }); K.block(7.42, rr.z0, 7.48, sz);
      for (const x of [3.8, 5.2, 6.7]) { ctx.P(x, rr.z0 + 0.36, 0, () => F.toilet(K)); }
      ctx.P(rr.x1 - 0.25, -3.3, -HP, () => F.vanity(K, 1.3));
      K.box("gloss", 0.28, 0.32, 0.15, rr.x0 + 0.08, 1.2, -2.9, F.C.white, { r: 0.02 });
      ctx.spot(rr.x1 - 0.8, -3.3, 1.2, "WASH", "🧼 Wash your hands", "wash");
      foodBackRooms(ctx);
    },
  },

  club: {
    W: 18, D: 13, H: 4.2, door: 6.5, wall: 0x1a1420, ambient: 0.35,
    rooms: {
      foyer: { r: [4, 2, 9, 6.5], floor: "marble", light: [0xffd0a0, 14], ceil: "spot", name: "Foyer" },
      hall: { r: [-5, -6.5, 4, 6.5], floor: "concreteDark", light: [0xc050ff, 12], ceil: "none", name: "Dance floor" },
      bar: { r: [4, -6.5, 9, 2], floor: "darkwood", light: [0xffa060, 12], ceil: "spot", name: "Bar" },
      vip: { r: [-9, -1, -5, 6.5], floor: "carpetRed", light: [0xffa0a0, 18], ceil: "spot", name: "VIP lounge" },
      back: { r: [-9, -6.5, -5, -1], floor: "concrete", light: [0xf4f0e8, 14], ceil: "fluoro", name: "Backstage" },
      green: { r: [-9, -10, -1, -6.5], floor: "darkwood", light: [0xffe0c0, 12], ceil: "round", name: "Green room" },
      office: { r: [-1, -10, 4, -6.5], floor: "darkwood", light: [0xffd8a8, 10], ceil: "round", name: "Manager's office" },
      kegs: { r: [4, -10, 9, -6.5], floor: "concrete", light: [0xe8f0ff, 12], ceil: "fluoro", name: "Keg room" },
    },
    links: [
      { a: "foyer", b: "hall", kind: "arch", at: 4.2, w: 1.8 },
      { a: "hall", b: "bar", kind: "arch", at: -2.3, w: 3.5 },
      { a: "hall", b: "vip", kind: "arch", at: 2.8, w: 2.2, sign: [null, null], vipSign: true },
      { a: "hall", b: "back", kind: "door", at: -4.2, into: "back", sign: ["STAFF ONLY", null] },
      { a: "back", b: "green", kind: "door", at: -7.6, into: "green", sign: ["GREEN ROOM", null] },
      { a: "green", b: "office", kind: "door", at: -7.3, into: "office", sign: ["PRIVATE", null] },
      { a: "bar", b: "kegs", kind: "door", at: 5.2, into: "kegs", sign: ["STAFF ONLY", null] },
    ],
    furnish(ctx) {
      const { K, R } = ctx;
      const h = R.hall, f = R.foyer, b = R.bar, v = R.vip, bk = R.back;
      ctx.paint("hall", 0x6a5656, 0, "brick"); ctx.paint("bar", 0x8a6a5a, 0, "brick");
      ctx.paint("vip", 0x6a2438, 0, "damask"); ctx.paint("foyer", 0xffffff, 0, "panel"); ctx.paint("back", 0x9a9ea2, 0, "block");
      ctx.dance(-0.5, 0.5, 7, 0.95);
      ctx.P(-0.5, -5.3, 0, () => F.djBooth(K));
      K.block(-1.9, h.z0, 0.9, -5.75);
      ctx.npc(-0.5, -6.05, 0, "dj");
      ctx.P(-3.4, -5.9, 0.3, () => F.speaker(K, 1.8)); ctx.P(2.4, -5.9, -0.3, () => F.speaker(K, 1.8));
      ctx.P(-4.4, 4.5, 0.6, () => F.speaker(K, 1.1));
      K.push(-0.5, -3.3, 0, 0); F.trussLights(K, 7, ctx.H - 0.1, [0xff3b8b, 0x3bd0ff, 0xb44bff, 0xffd23b, 0x3bd0ff]); K.pop();
      K.push(-0.5, 4.5, PI, 0); F.trussLights(K, 7, ctx.H - 0.1, [0xb44bff, 0xff3b8b, 0x3bd0ff, 0xff3b8b, 0xffd23b]); K.pop();
      F.mirrorBall(K, -0.5, ctx.H - 0.5, 0.5);
      ctx.specks(-0.5, ctx.H - 0.6, 0.5, "hall");
      const cans = [];
      for (const [tz, flip, cols] of [[-3.3, 1, [0xff3b8b, 0x3bd0ff, 0xb44bff, 0xffd23b, 0x3bd0ff]], [4.5, -1, [0xb44bff, 0xff3b8b, 0x3bd0ff, 0xff3b8b, 0xffd23b]]])
        cols.forEach((c, i) => cans.push([-0.5 + flip * (-3.5 + (i + 0.5) * 7 / 5), ctx.H - 0.6, tz + 0.1 * flip, c]));
      ctx.beams(cans);
      // roving coloured washes and a floor uplight that changes with the beat
      for (let i = 0; i < 3; i++) ctx.light(-0.5, 3.4, 0.5, 0xff3b8b, 9, 9, (t, L) => { L.x = -0.5 + Math.sin(t * 0.6 + i * 2.1) * 3.2; L.z = 0.5 + Math.cos(t * 0.8 + i * 2.1) * 3.6; L.col.setHSL((t * 0.04 + i / 3) % 1, 1, 0.55); });
      ctx.light(-0.5, 0.5, 0.5, 0xffffff, 5, 6, (t, L) => { L.col.setHex([0xff3b8b, 0x3bd0ff, 0xb44bff, 0xffd23b][Math.floor(t * 2.2) % 4]); });
      ctx.light(-0.5, 1.4, -4.6, 0x3bd0ff, 3, 4);
      for (let i = 0; i < 9; i++) ctx.npc(-2.4 + (i % 3) * 1.6 + (Math.floor(i / 3) % 2) * 0.5, -1.4 + Math.floor(i / 3) * 1.9, i * 1.3, "dance");
      for (const [x, z] of [[-4.3, -1.6], [3.3, 0.6], [3.3, 5.6]]) { ctx.P(x, z, 0, () => F.roundTable(K, 0.32, { h: 1.05, top: 0x1a1a1c, leg: F.C.chrome })); ctx.K.lathe("glass", [[0.001, 0], [0.035, 0], [0.04, 0.12]], x + 0.1, 1.07, z, 0xff8ab0); }
      ctx.spot(-0.5, 0.5, 2.2, "DANCE", "🕺 Hit the dance floor", "dance");
      ctx.neon(h.x0 + 0.01, 2.6, -2.2, HP, "NEON PALMS", 0xff3b8b);
      // foyer: cloakroom desk and a bouncer
      ctx.P(8.0, 4.1, -HP, () => F.receptionDesk(K, 1.8, { front: 0x2a1a1a, top: 0x0e0e10 }));
      K.block(8.4, 3.1, f.x1, 5.1);
      ctx.npc(8.65, 4.1, -HP, "stand", { shirt: 0x1a1a1a, pants: 0x1a1a1a });
      ctx.npc(4.8, 3.4, -HP * 0.6, "stand", { shirt: 0x111111, pants: 0x111111 });
      F.stanchion(K, 4.6, 5.5); F.stanchion(K, 5.8, 5.5); F.rope(K, 4.6, 5.5, 5.8, 5.5);
      ctx.P(f.x0 + 0.4, f.z1 - 0.4, 0, () => F.plant(K, "palm", { pot: F.C.black }));
      ctx.neon(f.x0 + 2.5, 2.5, f.z0 + 0.01, 0, "WELCOME", 0x3bd0ff);
      // bar: counter, stools, back bar, bartender
      ctx.P(6.2, -2.4, -HP, () => F.barCounter(K, 5.0));
      ctx.P(b.x1 - 0.23, -2.4, -HP, () => F.backBar(K, 5.0));
      K.block(6.5, -4.95, b.x1, 0.15);
      ctx.npc(7.6, -2.4, -HP, "stand", { shirt: 0x1a1a1a, pants: 0x1a1a1a }, [[7.6, -3.8, -HP], [7.6, -2.4, -HP], [7.6, -0.6, -HP]], "wipe");
      for (const z of [-4.2, -3.2, -2.2, -1.2, -0.2]) ctx.P(5.35, z, HP, () => F.stool(K, { color: 0x6a1a3a }));
      ctx.npc(5.35, -3.2, HP, "perch"); ctx.npc(5.35, -1.2, HP, "perch");
      ctx.spot(5.1, -2.7, 1.4, "DRINK", "🍹 Order a drink · $25", "drink");
      // VIP: plush sofas, champagne, a velvet rope
      ctx.P(v.x0 + 0.46, 1.4, HP, () => F.sofa(K, 2.4, 0x5a1030, { legs: F.C.brass, accent: 0xc8a24a }));
      ctx.P(v.x0 + 0.46, 4.7, HP, () => F.sofa(K, 2.4, 0x5a1030, { legs: F.C.brass, accent: 0xc8a24a }));
      for (const z of [1.4, 4.7]) { ctx.P(v.x0 + 1.6, z, HP, () => F.coffeeTable(K, 1.0, 0.55, { glass: true })); K.cyl("chrome", 0.12, 0.1, 0.22, v.x0 + 1.6, 0.54, z + 0.2, F.C.chrome, { seg: 12 }); K.lathe("glass", [[0.001, 0], [0.04, 0], [0.04, 0.2], [0.012, 0.3]], v.x0 + 1.6, 0.5, z + 0.2, 0x2a5a2a); }
      ctx.npc(v.x0 + 0.5, 4.2, HP, "sit"); ctx.npc(v.x0 + 0.5, 1.9, HP, "sit");
      ctx.P(-7.0, v.z0 + 0.26, 0, () => DC.fireplace(K, 1.6)); ctx.fire(-7.0, 0.22, v.z0 + 0.4);
      F.stanchion(K, -5.3, 1.45); F.stanchion(K, -5.3, 4.15); F.rope(K, -5.3, 4.15, -5.3, 5.5);
      ctx.P(v.x0 + 0.4, v.z1 - 0.4, 0, () => F.plant(K, "palm", { pot: F.C.brass }));
      ctx.spot(v.x0 + 2.2, 3.0, 1.4, "CHILL", "🥂 Kick back in the VIP lounge", "vip");
      // backstage
      ctx.P(bk.x0 + 0.28, -4.0, HP, () => F.lockers(K, 5, 0x3a3a44));
      ctx.P(bk.x1 - 0.95, bk.z0 + 0.26, 0, () => F.dresser(K, 1.2));
      ctx.P(-6.8, -1.5, PI, () => F.sofa(K, 1.8, 0x3a3a44, { pillows: false }));
      clubBackRooms(ctx);
    },
  },

  gallery: {
    W: 18, D: 12, H: 4.0, door: 5.5, wall: 0xf4f2ee,
    rooms: {
      lobby: { r: [2, 0.5, 9, 6], floor: "marble", light: [0xfff4e4, 15], ceil: "spot", name: "Lobby" },
      hallA: { r: [-9, 0.5, 2, 6], floor: "wood", light: [0xfff4e4, 17], ceil: "none", name: "East gallery" },
      hallB: { r: [-9, -6, 2, 0.5], floor: "wood", light: [0xfff4e4, 18], ceil: "none", name: "West gallery" },
      office: { r: [2, -6, 9, 0.5], floor: "carpet", light: [0xfff0dc, 16], ceil: "fluoro", name: "Curator's office" },
      studio: { r: [-9, -10, 2, -6], floor: "concrete", light: [0xf4f8ff, 20], ceil: "panel", name: "Restoration studio" },
      vault: { r: [2, -10, 9, -6], floor: "concreteDark", light: [0xe8f0ff, 10], ceil: "spot", name: "Vault" },
    },
    links: [
      { a: "lobby", b: "hallA", kind: "arch", at: 3.2, w: 2.2, sign: ["EXHIBITION", null] },
      { a: "hallA", b: "hallB", kind: "arch", at: -3.5, w: 2.4 },
      { a: "lobby", b: "office", kind: "door", at: 7.8, into: "office", sign: ["STAFF ONLY", null] },
      { a: "hallB", b: "studio", kind: "door", at: -5.25, into: "studio", sign: ["STUDIO", null] },
      { a: "office", b: "vault", kind: "arch", at: 3.2, w: 1.2, sign: ["VAULT", null] },
    ],
    furnish(ctx) {
      const { K, R } = ctx;
      const lb = R.lobby, a = R.hallA, b = R.hallB, o = R.office;
      let seed = 3;
      const art = (x, z, ry, w, h) => ctx.painting(x, 1.75, z, ry, w, h, seed++);
      // lobby
      ctx.P(5.0, 1.6, 0, () => F.receptionDesk(K, 2.2, { front: 0xf4f2ee, top: 0x1a1a1c }));
      K.block(3.9, lb.z0, 6.1, 1.2);
      ctx.npc(5.0, 0.9, 0, "stand", { shirt: 0x1a1a1a, pants: 0x1a1a1a });
      ctx.banner(5.0, 2.7, lb.z0 + 0.01, 0, 2.4, 0.8, "PALM GALLERY", 0x1a1a1a, 0xf0e6d0);
      ctx.P(lb.x1 - 0.17, 3.8, -HP, () => F.bookshelf(K, 1.6, 1.9, { wood: 0x1a1a1c }));
      ctx.P(8.4, 5.4, 0, () => F.plant(K, "fern", { s: 1.2, pot: 0xe8e4dc })); ctx.P(2.6, 5.4, 0, () => F.plant(K, "snake", { pot: 0x1a1a1c }));
      ctx.P(7.2, 4.6, 0, () => F.bench(K, 1.6, { wood: 0x3a2e24 }));
      ctx.spot(5.0, 2.5, 1.4, "BROWSE", "🖼 Ask about the collection", "browse");
      // east gallery
      for (const x of [-7.0, -3.5, 0.0]) art(x, a.z1, PI, 1.7, 1.15);
      art(-7.2, a.z0, 0, 1.3, 0.9); art(0.2, a.z0, 0, 1.3, 0.9);
      art(a.x0, 3.2, HP, 1.6, 1.1);
      for (const [x, k] of [[-5.5, 0], [-1.5, 2]]) { ctx.P(x, 3.2, 0, () => F.plinth(K, 1.0)); K.push(x, 3.2, 0, 0); F.sculpture(K, k, 1.0, k ? 0xe8e4dc : 0xc8a24a); K.pop(); }
      ctx.P(-3.5, 3.4, 0, () => F.bench(K, 1.6, { wood: 0x3a2e24 }));
      K.push(-3.5, 3.3, 0, 0); F.trackLights(K, 9.5, ctx.H - 0.05); K.pop();
      ctx.npc(-6.9, 4.8, PI, "stand", null, [[-7.0, 4.9, PI], [-3.5, 4.9, PI], [-0.1, 4.9, PI], [-7.2, 1.6, 0]], "look");
      ctx.npc(-0.4, 4.9, PI + 0.3, "stand", { shirt: 0x6a2a3a }, [[0.0, 4.9, PI], [0.2, 1.6, 0], [-3.5, 4.8, PI]], "look");
      ctx.spot(-3.5, 4.3, 1.6, "ADMIRE", "🖼 Take in the art", "browse");
      // west gallery: big canvases, a roped-off centrepiece
      for (const x of [-7.0, -3.5, 0.0]) art(x, b.z0, 0, 2.0, 1.4);
      art(b.x0, -2.8, HP, 1.8, 1.2); art(b.x1, -2.8, -HP, 1.8, 1.2);
      art(-7.2, b.z1, PI, 1.2, 0.85); art(0.2, b.z1, PI, 1.2, 0.85);
      ctx.P(-3.5, -3.0, 0, () => F.plinth(K, 0.6, 0x2a2a2e)); K.push(-3.5, -3.0, 0, 0); F.sculpture(K, 3, 0.6, 0xc87a3a); K.pop();
      for (const [x, z] of [[-4.5, -4], [-2.5, -4], [-2.5, -2], [-4.5, -2]]) F.stanchion(K, x, z);
      F.rope(K, -4.5, -4, -2.5, -4); F.rope(K, -2.5, -4, -2.5, -2); F.rope(K, -2.5, -2, -4.5, -2); F.rope(K, -4.5, -2, -4.5, -4);
      K.block(-4.6, -4.1, -2.4, -1.9);
      ctx.P(-6.6, -3.0, HP, () => F.bench(K, 1.6, { wood: 0x3a2e24 })); ctx.P(-0.4, -3.0, HP, () => F.bench(K, 1.6, { wood: 0x3a2e24 }));
      K.push(-3.5, -1.2, 0, 0); F.trackLights(K, 9.5, ctx.H - 0.05); K.pop(); K.push(-3.5, -4.8, 0, 0); F.trackLights(K, 9.5, ctx.H - 0.05); K.pop();
      ctx.npc(-6.6, -3.0, HP, "sit"); ctx.npc(0.4, -4.4, PI, "stand", { shirt: 0xe8e0d0 }, [[0.0, -4.8, PI], [-3.5, -4.8, PI], [-7.0, -4.8, PI], [-8.2, -2.8, -HP], [0.9, -2.8, HP]], "look");
      // office: a desk, shipping crates, canvases leaning against the wall
      ctx.P(5.0, o.z0 + 0.38, 0, () => F.desk(K, 1.6));
      ctx.P(5.0, -4.9, PI, () => F.officeChair(K));
      F.crate(K, 1.0, 8.2, 0, -5.2, 0.1); F.crate(K, 0.8, 8.2, 1.0, -5.2, -0.2); F.crate(K, 1.0, 8.1, 0, -3.9, 0);
      K.block(7.5, -5.9, 8.93, -3.3);
      for (let i = 0; i < 4; i++) ctx.painting(o.x0 + 0.12 + i * 0.05, 0.75, -2.0 - i * 0.12, HP, 1.2 - i * 0.1, 1.2 - i * 0.12, 20 + i, { lean: 0.12 });
      K.block(o.x0, -2.6, o.x0 + 0.45, -1.4);
      ctx.P(6.6, o.z0 + 0.32, 0, () => F.filingCabinet(K, { color: 0x1a1a1c }));
      ctx.P(o.x1 - 0.3, -1.0, 0, () => F.waterCooler(K));
      galleryBackRooms(ctx);
    },
  },

  hospital: {
    W: 18, D: 13, H: 3.1, door: 6.0, wall: 0xe4eef0,
    rooms: {
      lobby: { r: [0, 1, 9, 6.5], floor: "vinyl", light: [0xf4f8ff, 15], ceil: "panel", name: "Reception" },
      ward: { r: [-9, -6.5, 0, 6.5], floor: "vinyl", light: [0xf0f6ff, 15], ceil: "panel", name: "Ward A" },
      exam: { r: [0, -6.5, 4.5, 1], floor: "vinyl", light: [0xf4f8ff, 12], ceil: "panel", name: "Exam room" },
      staff: { r: [4.5, -6.5, 9, 1], floor: "tile", light: [0xfff4e4, 16], ceil: "fluoro", name: "Staff room" },
      scrub: { r: [-3, -10.5, 0, -6.5], floor: "vinyl", light: [0xf4f8ff, 12], ceil: "panel", name: "Scrub room" },
      surgery: { r: [-9, -10.5, -3, -6.5], floor: "vinyl", light: [0xf0f8ff, 16], ceil: "panel", name: "Operating theatre" },
      control: { r: [0, -10.5, 3, -6.5], floor: "vinyl", light: [0xf4f8ff, 10], ceil: "panel", name: "Imaging control" },
      mri: { r: [3, -10.5, 9, -6.5], floor: "vinyl", light: [0xf0f6ff, 14], ceil: "panel", name: "MRI suite" },
    },
    links: [
      { a: "lobby", b: "ward", kind: "arch", at: 4.2, w: 1.8, sign: ["WARD A", null] },
      { a: "lobby", b: "exam", kind: "door", at: 2.2, into: "exam", sign: ["EXAM 1", null] },
      { a: "lobby", b: "staff", kind: "door", at: 7.8, into: "staff", sign: ["STAFF ONLY", null] },
      { a: "ward", b: "scrub", kind: "door", at: -1.3, into: "scrub", sign: ["THEATRE", null] },
      { a: "scrub", b: "surgery", kind: "door", at: -8.5, w: 1.2, into: "surgery" },
      { a: "exam", b: "control", kind: "door", at: 0.9, into: "control", sign: ["IMAGING", null] },
      { a: "control", b: "mri", kind: "door", at: -7.3, into: "mri" },
      { a: "control", b: "mri", kind: "window", at: -9.3, w: 1.4 },
    ],
    furnish(ctx) {
      const { K, R } = ctx;
      const lb = R.lobby, w = R.ward, ex = R.exam, sf = R.staff;
      ctx.paint("lobby", 0xc8dce4, 1.0, "tile", { color2: 0x2e6a8a }); ctx.paint("ward", 0xc8dce4, 1.0, "tile", { color2: 0x2e6a8a }); ctx.paint("exam", 0xc8dce4, 1.0, "tile", { color2: 0x2e6a8a }); ctx.paint("staff", 0xffffff, 0, "subway", { backsplash: true, side: "z0" });
      ctx.aquarium(0.34, 2.2, HP, 1.4, 0.7, 0.5);
      ctx.tv(lb.x1, 2.2, 2.6, -HP, 1.2, 0.68, "news");
      K.push(lb.x1 - 0.06, 2.6, -HP, 1.86); K.box("gloss", 1.3, 0.76, 0.06, 0, 0.34, 0, 0x111111, { r: 0.01 }); K.pop();
      ctx.P(5.5, 2.2, 0, () => F.receptionDesk(K, 2.8, { front: 0xe8eef2, top: 0x4a8aa8 }));
      K.block(4.1, lb.z0, 6.9, 1.8);
      ctx.npc(5.5, 1.5, 0, "stand", { shirt: 0x6ab0c8, pants: 0x6ab0c8 });
      ctx.cross(5.5, 2.45, lb.z0 + 0.01, 0);
      ctx.P(2.5, lb.z1 - 0.3, PI, () => F.waitingSeats(K, 4, 0x2e6a8a));
      ctx.P(lb.x1 - 0.3, 4.6, -HP, () => F.waitingSeats(K, 4, 0x2e6a8a));
      ctx.npc(2.2, 6.1, PI, "sit"); ctx.npc(lb.x1 - 0.35, 4.3, -HP, "sit", { shirt: 0xd8a020 });
      ctx.P(lb.x1 - 0.3, 2.9, 0, () => F.waterCooler(K));
      ctx.P(0.5, 6.0, 0, () => F.plant(K, "fern"));
      K.push(3.2, lb.z0 + 0.03, 0, 2.3); F.wallClock(K); K.pop();
      ctx.spot(5.5, 3.3, 1.5, "HEAL", "🩺 Get patched up · $120", "heal");
      // ward: four beds with curtains, drips and monitors
      for (const [i, z] of [-4.8, -1.6, 1.6, 4.8].entries()) {
        ctx.P(w.x0 + 1.07, z, HP, () => F.hospitalBed(K, { blanket: [0x8ab4c8, 0xa8c8a8, 0x8ab4c8, 0xc8b4a8][i] }));
        ctx.P(w.x0 + 0.35, z + 0.85, 0, () => F.ivStand(K));
        ctx.P(w.x0 + 0.35, z - 0.85, 0, () => F.vitalsMonitor(K));
        if (i < 3) ctx.P(w.x0 + 1.15, z + 1.6, 0, () => F.curtain(K, 2.3));
        if (i === 1 || i === 3) ctx.npc(w.x0 + 1.1, z, HP, "lie", { shirt: 0x8ab4c8 });
      }
      ctx.P(-3.0, w.z0 + 0.26, 0, () => F.medCabinet(K, 1.4));
      ctx.P(-1.3, -2.0, -HP, () => F.desk(K, 1.3, { wood: 0xe8eef2 }));
      ctx.P(-2.0, -2.0, HP, () => F.officeChair(K, { color: 0x2e6a8a }));
      ctx.npc(-4.3, 1.6, -HP, "stand", { shirt: 0x6ab0c8, pants: 0x6ab0c8 }, [[-6.2, 3.2, -HP], [-6.2, 0.0, -HP], [-6.2, -3.2, -HP], [-2.6, -2.0, HP], [-4.3, 1.6, -HP]], "stand");
      ctx.spot(-4.5, 0, 1.6, "VISIT", "💐 Check on the patients", "visit");
      // exam room
      ctx.P(1.1, -4.0, 0, () => F.examTable(K));
      ctx.P(ex.x1 - 0.38, -4.0, -HP, () => F.desk(K, 1.3, { wood: 0xe8eef2 }));
      ctx.P(3.4, -4.0, HP, () => F.officeChair(K, { color: 0x2e6a8a }));
      ctx.P(2.6, ex.z0 + 0.26, 0, () => F.medCabinet(K, 1.2));
      ctx.P(0.45, -2.6, 0, () => F.vitalsMonitor(K));
      ctx.npc(2.1, -3.2, -HP, "stand", { shirt: 0xf4f4f4, pants: 0x2a3a52 });
      // staff room
      ctx.P(6.2, sf.z0 + 0.34, 0, () => F.kitchenRun(K, 2.4, { fronts: 0xdfe6ea, uppers: true }));
      ctx.P(8.4, sf.z0 + 0.4, 0, () => F.fridge(K, { color: 0xf0f0f0 }));
      ctx.P(sf.x1 - 0.28, -3.3, -HP, () => F.lockers(K, 5, 0x6a8aa8));
      ctx.P(6.6, -3.3, HP, () => F.bench(K, 1.6));
      ctx.P(5.8, -1.3, 0, () => F.roundTable(K, 0.45)); ctx.P(5.1, -1.3, HP, () => F.chair(K)); ctx.P(6.5, -1.3, -HP, () => F.chair(K));
      K.push(5.3, sf.z0 + 0.34, 0, 0.93); F.coffeeMachine(K); K.pop();
      ctx.npc(5.1, -1.3, HP, "sit", { shirt: 0x6ab0c8, pants: 0x6ab0c8 });
      K.push(sf.x0, -2.8, HP, 0); DC.noticeBoard(K, 1.2); K.pop();
      K.push(lb.x0 + 0.01, 5.8, HP, 0); DC.extinguisher(K); K.pop();
      hospitalBackRooms(ctx);
    },
  },

  police: {
    W: 18, D: 13, H: 3.1, door: 6.0, wall: 0xd4d8dc,
    rooms: {
      lobby: { r: [3, 1.5, 9, 6.5], floor: "tile", light: [0xf4f8ff, 16], ceil: "panel", name: "Front desk" },
      bullpen: { r: [-9, 1.5, 3, 6.5], floor: "carpet", light: [0xf4f8ff, 26], ceil: "fluoro", name: "Squad room" },
      cells: { r: [-9, -6.5, -1, 1.5], floor: "concrete", light: [0xe8f0f4, 18], ceil: "fluoro", name: "Holding cells" },
      interview: { r: [-1, -6.5, 4, 1.5], floor: "concrete", light: [0xfff0d8, 10], ceil: "none", name: "Interview room" },
      lockers: { r: [4, -6.5, 9, 1.5], floor: "tile", light: [0xf4f8ff, 18], ceil: "fluoro", name: "Locker room" },
      armory: { r: [4, -10, 9, -6.5], floor: "concrete", light: [0xf4f8ff, 14], ceil: "fluoro", name: "Armory" },
      evidence: { r: [-1, -10, 4, -6.5], floor: "concrete", light: [0xf4f8ff, 12], ceil: "fluoro", name: "Evidence room" },
    },
    links: [
      { a: "lobby", b: "bullpen", kind: "arch", at: 4.0, w: 1.8 },
      { a: "bullpen", b: "cells", kind: "door", at: -5.0, into: "cells", sign: ["HOLDING", null] },
      { a: "bullpen", b: "interview", kind: "door", at: 0.8, into: "interview", sign: ["INTERVIEW 1", null] },
      { a: "lobby", b: "lockers", kind: "door", at: 7.5, into: "lockers", sign: ["STAFF ONLY", null] },
      { a: "lockers", b: "armory", kind: "door", at: 8.35, into: "armory", sign: ["ARMORY", null] },
      { a: "interview", b: "evidence", kind: "door", at: 1.5, into: "evidence", sign: ["EVIDENCE", null] },
    ],
    furnish(ctx) {
      const { K, R } = ctx;
      const lb = R.lobby, bp = R.bullpen, c = R.cells, iv = R.interview, lk = R.lockers;
      ctx.paint("lobby", 0xffffff, 1.1, "panel"); ctx.paint("cells", 0x9a9ea2, 0, "block"); ctx.paint("interview", 0x7a7e82, 0, "block"); ctx.paint("lockers", 0xffffff, 1.4, "tile");
      ctx.tv(lb.x0 + 0.08, 2.3, 5.75, HP, 1.1, 0.62, "news");
      K.push(lb.x0 + 0.13, 5.75, HP, 1.94); K.box("gloss", 1.2, 0.7, 0.06, 0, 0.36, 0, 0x111111, { r: 0.01 }); K.pop();
      ctx.P(5.3, 2.6, 0, () => F.receptionDesk(K, 2.6, { front: 0x2a3446, top: 0x8a8e94 }));
      K.block(4.0, lb.z0, 6.6, 2.2);
      ctx.npc(5.3, 1.95, 0, "stand", { shirt: 0x1e2a44, pants: 0x1e2a44 });
      ctx.seal(5.3, 2.35, lb.z0 + 0.01, 0);
      ctx.P(3.5, 2.0, 0, () => F.flag(K, 0x2a3a8a)); ctx.P(lb.x1 - 0.35, 2.0, 0, () => F.flag(K, 0x2a6a3a));
      ctx.P(lb.x1 - 0.24, 4.6, -HP, () => F.bench(K, 1.6));
      ctx.poster(lb.x1 - 0.01, 1.7, 3.6, -HP, 0.6, 0.8, "WANTED", 0xe8dcc0, 0x1a1a1a);
      ctx.poster(lb.x1 - 0.01, 1.7, 5.6, -HP, 0.6, 0.8, "MISSING", 0xe8dcc0, 0x1a1a1a);
      ctx.spot(5.3, 3.6, 1.5, "TALK", "👮 Speak to the desk sergeant", "cop");
      // squad room: four desks, cabinets, a whiteboard, the coffee corner
      for (const [x, z] of [[-7.2, 3.2], [-3.8, 3.2], [-1.2, 3.2], [-7.2, 5.3], [-3.8, 5.3], [-1.2, 5.3]]) {
        ctx.P(x, z, 0, () => F.desk(K, 1.4, { wood: 0x6a6e74 }));
        ctx.P(x, z + 0.7, PI, () => F.officeChair(K));
      }
      ctx.npc(-3.8, 3.9, PI, "type", { shirt: 0x1e2a44, pants: 0x1e2a44 }); ctx.npc(-7.2, 6.0, PI, "type", { shirt: 0xe8e6e0, pants: 0x2a2a2e }); ctx.npc(-1.2, 6.0, PI, "type", { shirt: 0x1e2a44, pants: 0x1e2a44 });
      ctx.npc(0.5, 4.6, 0, "stand", { shirt: 0x1e2a44, pants: 0x1e2a44 }, [[0.2, 4.4, PI], [2.3, 5.6, 0], [-5.2, 4.4, -HP], [-7.6, 4.3, -HP]], "phone");
      K.push(-4.0, bp.z0, 0, 0); DC.noticeBoard(K, 1.6); K.pop();
      K.push(bp.x1 - 0.01, 2.4, -HP, 0); DC.extinguisher(K); K.pop();
      ctx.P(bp.x0 + 0.05, 4.2, HP, () => F.whiteboard(K, 2.0));
      for (const x of [-8.4, -7.9]) ctx.P(x, bp.z0 + 0.32, 0, () => F.filingCabinet(K));
      ctx.P(2.4, bp.z0 + 0.35, 0, () => F.waterCooler(K));
      ctx.P(2.3, bp.z1 - 0.3, PI, () => F.prepTable(K, 1.0)); K.push(2.3, bp.z1 - 0.3, PI, 0.93); F.coffeeMachine(K); K.pop();
      ctx.P(-5.5, bp.z1 - 0.3, 0, () => F.plant(K, "snake"));
      // cells: a corridor and two barred cells with bunks
      ctx.P(-5.0, -1.0, 0, () => F.cellFront(K, 7.86, { door: -1.9 }));
      K.box("matte", 0.18, ctx.H, 5.4, -5.0, ctx.H / 2, -3.75, 0x9a9ea2);
      K.block(-5.09, c.z0, -4.91, -1.0);
      for (const cx of [-7.0, -3.0]) {
        ctx.P(cx - 1.4, -3.9, 0, () => F.bunk(K));
        ctx.P(cx + 1.2, c.z0 + 0.35, 0, () => F.steelToilet(K));
      }
      ctx.npc(-8.4, -3.6, HP, "sitlow", { shirt: 0xe87a20, pants: 0xe87a20 });
      ctx.P(-2.4, 0.9, PI, () => F.bench(K, 1.8, { wood: 0x5a5e62 }));
      // interview room: steel table, two chairs, a hanging lamp, the one-way mirror
      ctx.P(1.5, -2.5, 0, () => F.metalTable(K));
      ctx.P(1.5, -3.25, 0, () => F.metalChair(K)); ctx.P(1.5, -1.75, PI, () => F.metalChair(K));
      ctx.pendant(1.5, -2.5, 1.2, 0x2a2a2e);
      ctx.mirror(iv.x1 - 0.01, 1.5, -2.5, -HP, 2.4, 1.1);
      ctx.npc(1.5, -3.25, 0, "sit", { shirt: 0xe87a20, pants: 0xe87a20 });
      ctx.npc(0.4, -1.4, -2.3, "stand", { shirt: 0xe8e6e0, pants: 0x3a3a3e });
      // locker room
      ctx.P(6.3, lk.z0 + 0.28, 0, () => F.lockers(K, 7, 0x2a3a5a));
      ctx.P(6.5, -4.5, 0, () => F.bench(K, 2.2));
      ctx.P(lk.x0 + 0.28, -2.0, HP, () => F.lockers(K, 4, 0x2a3a5a));
      ctx.P(lk.x1 - 0.25, -2.0, -HP, () => F.shelfUnit(K, 1.4));
      policeBackRooms(ctx);
    },
  },

  office: {
    W: 14, D: 10, H: 3.0, door: 4.5, wall: 0xe8e4dc,
    rooms: {
      reception: { r: [2, 0.5, 7, 5], floor: "marble", light: [0xfff4e4, 18], ceil: "spot", name: "Reception" },
      open: { r: [-7, 0.5, 2, 5], floor: "carpet", light: [0xf4f8ff, 22], ceil: "panel", name: "Office floor" },
      boss: { r: [-7, -5, 0, 0.5], floor: "wood", light: [0xffe8c8, 18], ceil: "round", name: "Manager's office" },
      breakroom: { r: [0, -5, 7, 0.5], floor: "tile", light: [0xfff0dc, 18], ceil: "panel", name: "Break room" },
      conference: { r: [-7, -9, 0, -5], floor: "carpet", light: [0xfff4e4, 18], ceil: "panel", name: "Conference room" },
      server: { r: [0, -9, 7, -5], floor: "tile", light: [0xd8e8ff, 12], ceil: "fluoro", name: "Server room" },
    },
    links: [
      { a: "reception", b: "open", kind: "arch", at: 2.8, w: 1.8 },
      { a: "open", b: "boss", kind: "door", at: -3.5, into: "boss", sign: ["MANAGER", null] },
      { a: "reception", b: "breakroom", kind: "door", at: 5.5, into: "breakroom", sign: ["STAFF", null] },
      { a: "boss", b: "conference", kind: "door", at: -1.5, into: "conference", sign: ["MEETING", null] },
      { a: "breakroom", b: "server", kind: "door", at: 5.3, into: "server", sign: ["IT", null] },
    ],
    windows: [{ room: "conference", side: "back", at: -3.6, w: 3.0 }],
    furnish(ctx) {
      const { K, R, brand, label } = ctx;
      const rc = R.reception, op = R.open, bs = R.boss, br = R.breakroom;
      ctx.paint("reception", brand, 0, null, { accentWall: "back" }); ctx.paint("boss", 0xffffff, 0, "panel"); ctx.paint("breakroom", 0xffffff, 0, "subway", { backsplash: true, side: "z0" });
      ctx.P(3.8, 1.5, 0, () => F.receptionDesk(K, 2.0));
      K.block(2.8, rc.z0, 4.8, 1.1);
      ctx.npc(3.8, 0.85, 0, "stand");
      ctx.banner(3.8, 2.35, rc.z0 + 0.02, 0, 2.2, 0.6, label, brand, ctx.fg);
      ctx.P(rc.x1 - 0.42, 3.4, -HP, () => F.armchair(K, 0x4a4e56)); ctx.P(rc.x1 - 0.42, 4.4, -HP, () => F.armchair(K, 0x4a4e56));
      ctx.P(6.6, 1.9, 0, () => F.plant(K, "snake"));
      ctx.spot(3.8, 2.4, 1.4, "ASK", "💼 Talk to the front desk", "office");
      for (const [x, z] of [[-6.0, 1.5], [-1.6, 1.5], [-6.0, 3.8], [-1.6, 3.8]]) { ctx.P(x, z, 0, () => F.desk(K, 1.4)); ctx.P(x, z + 0.7, PI, () => F.officeChair(K)); }
      ctx.npc(-1.6, 2.2, PI, "type"); ctx.npc(-6.0, 4.5, PI, "type");
      ctx.npc(-3.8, 3.4, 0, "stand", { shirt: 0xe8e0d0 }, [[-3.8, 4.1, 0], [0.8, 4.2, 0], [0.5, 2.8, HP], [-3.8, 2.6, 0]], "phone");
      ctx.P(-3.8, op.z1 - 0.3, 0, () => F.waterCooler(K));
      ctx.P(-3.8, op.z1 - 0.01, PI, () => F.whiteboard(K, 1.8));
      ctx.P(1.4, op.z1 - 0.35, PI, () => F.printer(K));
      ctx.P(op.x0 + 0.3, 2.7, HP, () => F.filingCabinet(K)); ctx.P(1.6, 0.95, 0, () => F.plant(K, "fern", { s: 0.8 }));
      // manager's office
      ctx.P(-3.5, -3.4, PI, () => F.desk(K, 1.9, { wood: F.C.walnut }));
      ctx.P(-3.5, -4.2, 0, () => F.officeChair(K, { color: 0x3a2a1e }));
      ctx.npc(-3.5, -4.2, 0, "sit", { shirt: 0x2a2a3a, pants: 0x2a2a3a });
      for (const x of [-4.1, -2.9]) ctx.P(x, -2.4, PI, () => F.chair(K, { wood: F.C.walnut, seat: 0x6a2a2a }));
      ctx.P(-5.8, bs.z0 + 0.17, 0, () => F.bookshelf(K, 1.4, 2.0));
      ctx.P(bs.x0 + 0.46, -1.3, HP, () => F.sofa(K, 2.0, 0x3a3a44, { accent: brand }));
      ctx.P(-5.4, -1.3, HP, () => F.coffeeTable(K, 0.9, 0.5));
      ctx.P(-0.5, -4.4, 0, () => F.plant(K, "palm"));
      ctx.P(-0.5, -3.0, -HP, () => F.safe(K));
      ctx.painting(bs.x0, 1.85, -1.3, HP, 1.3, 0.75, 7);
      ctx.aquarium(bs.x1 - 0.27, -1.5, -HP, 1.4, 0.7, 0.5);
      K.push(-2.9, -3.4, 0, 0.765); F.tableLamp(K, 0, 0, 0, 0x1a4a2a); K.pop();
      ctx.rug(-3.5, -3.0, 3.0, 2.0, 0x6a2a2a, 0);
      // break room
      ctx.P(2.2, br.z0 + 0.34, 0, () => F.kitchenRun(K, 2.8, { fronts: 0xe8e4dc }));
      ctx.P(4.2, br.z0 + 0.4, 0, () => F.fridge(K, { color: 0xf0f0f0 }));
      K.push(1.1, br.z0 + 0.34, 0, 0.93); F.coffeeMachine(K); K.pop();
      ctx.P(3.6, -1.8, 0, () => F.roundTable(K, 0.5));
      for (const a of [0, 2.1, 4.2]) ctx.P(3.6 + Math.sin(a) * 0.75, -1.8 + Math.cos(a) * 0.75, a + PI, () => F.chair(K));
      ctx.P(br.x1 - 0.45, br.z0 + 0.42, 0, () => F.vendingMachine(K, brand));
      ctx.npc(3.6 + Math.sin(2.1) * 0.75, -1.8 + Math.cos(2.1) * 0.75, 2.1 + PI, "sit");
      officeBackRooms(ctx);
    },
  },

  depot: {
    W: 22, D: 15, H: 5.0, door: 3.0, wall: 0x9a948a,
    rooms: {
      floor: { r: [-11, -7.5, 6, 7.5], floor: "concrete", light: [0xfff2dc, 40], ceil: "fluoro", name: "Warehouse floor" },
      office: { r: [6, 1.5, 11, 7.5], floor: "carpet", light: [0xfff0dc, 18], ceil: "panel", name: "Dispatch office" },
      staff: { r: [6, -7.5, 11, 1.5], floor: "tile", light: [0xfff4e4, 18], ceil: "fluoro", name: "Staff room" },
      bay: { r: [-11, -13, 6, -7.5], floor: "concrete", light: [0xfff2dc, 28], ceil: "fluoro", name: "Loading bay" },
    },
    links: [
      { a: "floor", b: "office", kind: "door", at: 4.5, into: "office", sign: ["DISPATCH", null] },
      { a: "floor", b: "office", kind: "window", at: 2.6, w: 2.0 },
      { a: "floor", b: "staff", kind: "door", at: -3.0, into: "staff", sign: ["STAFF", null] },
      { a: "floor", b: "bay", kind: "arch", at: 3.2, w: 2.2, sign: ["LOADING BAY", null] },
    ],
    furnish(ctx) {
      const { K, R } = ctx;
      const fl = R.floor, of = R.office, sf = R.staff;
      ctx.paint("floor", 0xb8b4ac, 0, "block"); ctx.paint("floor", 0x3a5a8a, 1.2, "matte", { layer: 1 }); ctx.paint("staff", 0xffffff, 1.3, "tile");
      ctx.P(-3.5, fl.z0 + 0.6, 0, () => F.palletRack(K, 10.8, 3));
      ctx.P(-3.5, -3.2, 0, () => F.palletRack(K, 10.8, 3));
      ctx.P(-3.5, 0.6, 0, () => F.palletRack(K, 10.8, 3));
      // painted aisle lines and a forklift lane
      for (const z of [-5.0, -1.3, 2.4]) K.box("matte", 12, 0.005, 0.1, -3.5, 0.045, z, 0xe8c020);
      K.box("matte", 0.1, 0.005, 14.5, 2.9, 0.045, 0, 0xe8c020);
      ctx.forklift(3.1, -5.8, 1.6);
      for (let i = 0; i < 4; i++) { const x = -9.4 + (i % 2) * 1.3, z = 4.0 + Math.floor(i / 2) * 1.4; ctx.P(x, z, 0, () => F.pallet(K)); F.cardboard(K, 0.5, 0.45, 0.55, x - 0.26, 0.15, z - 0.28); F.cardboard(K, 0.5, 0.45, 0.55, x + 0.26, 0.15, z + 0.2); F.cardboard(K, 0.5, 0.4, 0.55, x, 0.6, z, 0.3); K.block(x - 0.55, z - 0.62, x + 0.55, z + 0.62); }
      F.crate(K, 1.0, -5.0, 0, 5.8, 0.2); F.crate(K, 1.0, -3.8, 0, 5.8, -0.1); F.crate(K, 0.9, -4.4, 1.0, 5.8, 0.15); K.block(-5.6, 5.2, -3.2, 6.4);
      for (const [x, z, c] of [[4.6, -6.6, 0x2a5aa8], [5.3, -6.6, 0xc82a2a], [4.6, -5.9, 0x2a5aa8], [5.3, -5.9, 0x3a7a3a]]) F.barrel(K, x, z, c);
      ctx.P(4.6, -4.4, 0.4, () => F.handTruck(K));
      // roller doors on the loading wall
      for (const z of [-4.0, 2.5]) {
        K.box("metal", 0.08, 3.4, 3.0, fl.x0 + 0.04, 1.7, z, 0x9aa0a6);
        for (let y = 0.1; y < 3.4; y += 0.14) K.box("metal", 0.1, 0.03, 3.0, fl.x0 + 0.06, y, z, 0x7a8086);
        K.box("matte", 0.12, 0.3, 3.4, fl.x0 + 0.06, 3.55, z, 0x3a3a3e);
        for (const s of [-1, 1]) K.box("matte", 0.14, 3.6, 0.15, fl.x0 + 0.07, 1.8, z + s * 1.6, 0xe8c020);
      }
      ctx.npc(1.2, 5.0, HP, "stand", { shirt: 0xe8e020, pants: 0x2a3a52 }, [[1.2, 5.2, HP], [2.5, 2.2], [2.5, -1.3], [-6.0, -1.3, 0], [2.5, -1.3], [2.5, -5.0], [-6.0, -5.0, PI], [2.5, -5.0], [2.5, 2.2]], "look");
      ctx.npc(-8.0, -1.3, 0.5, "stand", { shirt: 0xe87a20, pants: 0x2a3a52 }, [[-8.0, -1.3, 0], [-9.8, -1.3], [-9.8, 2.4, 0], [-9.8, -1.3]], "phone");
      K.push(fl.x1 - 0.01, -1.0, -HP, 0); DC.extinguisher(K); K.pop();
      K.push(of.x0 + 0.02, 6.0, HP, 0); DC.noticeBoard(K, 1.0); K.pop();
      // dispatch office behind glass
      ctx.P(8.5, of.z1 - 0.38, PI, () => F.desk(K, 1.6));
      ctx.P(8.5, of.z1 - 1.1, 0, () => F.officeChair(K));
      ctx.npc(8.5, of.z1 - 1.1, 0, "sit", { shirt: 0xe8e020, pants: 0x2a3a52 });
      for (const z of [2.0, 2.5]) ctx.P(of.x1 - 0.32, z, -HP, () => F.filingCabinet(K));
      ctx.P(of.x1 - 0.02, 4.8, -HP, () => F.whiteboard(K, 1.8));
      ctx.P(of.x0 + 0.35, 6.9, 0, () => F.waterCooler(K));
      ctx.spot(8.5, 5.4, 1.4, "ASK", "📦 Ask dispatch for work", "office");
      // staff room
      ctx.P(8.6, sf.z0 + 0.34, 0, () => F.kitchenRun(K, 2.4, { fronts: 0x5a6a7a }));
      ctx.P(sf.x1 - 0.28, -3.8, -HP, () => F.lockers(K, 5, 0x5a6a7a));
      ctx.P(8.0, -1.2, 0, () => F.diningTable(K, 1.4, 0.8, { wood: 0xd8d0c4 }));
      for (const x of [7.6, 8.4]) { ctx.P(x, -1.85, 0, () => F.chair(K)); ctx.P(x, -0.55, PI, () => F.chair(K)); }
      ctx.P(sf.x0 + 0.45, sf.z0 + 0.42, 0, () => F.vendingMachine(K, 0x2a5aa8));
      ctx.npc(7.6, -1.85, 0, "sit", { shirt: 0xe87a20, pants: 0x2a3a52 });
      depotBay(ctx);
    },
  },
};
