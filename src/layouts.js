// Palm City — floor plans. Every building you can walk into is a set of rooms joined by doorways
// and arches, each room with its own floor, lighting and furniture. Coordinates are building-local
// metres: x across, z from back (−) to the street (+), the front door on the street wall.
// Links join two rooms: a hinged door, an open arch, a serving hatch, a glass window, or fully open.
import * as F from "./furniture.js";

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
  ctx.P(x, z, ry, () => { const s = F.tvUnit(ctx.K, 2.0, { wood: d.tv }); ctx.screen(x, s.y, z, ry, s.w - 0.06, s.h - 0.06, s.z + 0.03); });
}
function lampAt(ctx, x, z, d) { if (d.lamp) ctx.P(x, z, 0, () => F.floorLamp(ctx.K, d.lamp)); }
function plantAt(ctx, x, z, d, s = 1) { if (d.plant) ctx.P(x, z, 0, () => F.plant(ctx.K, d.plant, { s })); }
function artAt(ctx, x, z, ry, d, w = 1.4, h = 0.95) { if (d.art !== null) ctx.painting(x, 1.65, z, ry, w, h, d.art); }
function bathroom(ctx, r, o) {
  const { K } = ctx;
  ctx.paint(o.key, 0xe8eef0, 1.25, "gloss");
  ctx.P(o.tub[0], o.tub[1], o.tub[2], () => F.bathtub(K, 1.7));
  ctx.P(o.wc[0], o.wc[1], o.wc[2], () => F.toilet(K));
  ctx.P(o.sink[0], o.sink[1], o.sink[2], () => F.vanity(K, 0.9));
  if (o.towel) ctx.P(o.towel[0], o.towel[1], o.towel[2], () => F.towelRail(K));
  ctx.rug(o.mat[0], o.mat[1], 0.9, 0.55, 0x6a8aa8, o.mat[2] || 0);
  ctx.spot(o.sink[0], o.sink[1], 1.3, "WASH", "🚿 Freshen up", "wash");
}

export const PLANS = {
  apartment: {
    W: 12, D: 9, H: 2.9, door: 4.5, home: true,
    rooms: {
      kitchen: { r: [-6, 0, -1, 4.5], floor: "tile", light: [0xfff0dc, 18], ceil: "round", name: "Kitchen" },
      living: { r: [-1, 0, 6, 4.5], floor: "@decor", light: [0xffe2b8, 22], ceil: "round", name: "Living room" },
      bedroom: { r: [-6, -4.5, 1.5, 0], floor: "@decor", light: [0xffd8a8, 18], ceil: "round", name: "Bedroom" },
      bath: { r: [1.5, -4.5, 6, 0], floor: "tile", light: [0xf4f8ff, 16], ceil: "round", name: "Bathroom" },
    },
    links: [
      { a: "kitchen", b: "living", kind: "open" },
      { a: "living", b: "bedroom", kind: "door", at: 0.25, into: "bedroom" },
      { a: "living", b: "bath", kind: "door", at: 2.6, into: "bath" },
    ],
    windows: [{ room: "bedroom", side: "back", at: 0, w: 1.8 }, { room: "living", side: "front", at: 1.2, w: 1.8 }, { room: "kitchen", side: "front", at: -3.5, w: 1.4 }],
    furnish(ctx, d) {
      const { K, R } = ctx;
      const k = R.kitchen, l = R.living, b = R.bedroom;
      ctx.paint("kitchen", 0xf2f0ea, 0, null, { backsplash: true });
      ctx.P(k.x0 + 0.32, 1.8, HP, () => F.kitchenRun(K, 3.0, { fronts: 0x3a4a5a }));
      ctx.P(k.x0 + 0.4, 3.85, HP, () => F.fridge(K));
      ctx.P(-3.0, 2.3, 0, () => F.roundTable(K, 0.45));
      ctx.P(-3.0, 1.55, 0, () => F.chair(K)); ctx.P(-3.0, 3.05, PI, () => F.chair(K));
      ctx.spot(k.x0 + 0.9, 3.85, 1.2, "SNACK", "🥪 Raid the fridge · heals a little", "snack");
      livingSet(ctx, 2.2, 2.3, 1, d);
      tvWall(ctx, l.x1 - 0.22, 2.3, -HP, d);
      lampAt(ctx, 1.4, 0.55, d); plantAt(ctx, l.x1 - 0.35, 0.5, d); artAt(ctx, 4.6, l.z0, 0, d);
      ctx.P(-0.3, l.z1 - 0.17, PI, () => F.bookshelf(K, 0.9, 1.9));
      ctx.spot(3.3, 3.2, 1.6, "DECORATE", "🎨 Decorate your home", "decorate");
      if (d.bed) ctx.P(-3.0, b.z0 + 1.05, 0, () => F.bed(K, 1.6, 2.05, d.bed));
      ctx.P(-4.15, b.z0 + 0.25, 0, () => F.nightstand(K)); ctx.P(-1.85, b.z0 + 0.25, 0, () => F.nightstand(K));
      ctx.P(b.x0 + 0.3, -1.5, HP, () => F.wardrobe(K, 1.6));
      ctx.P(b.x1 - 0.24, -3.0, -HP, () => F.dresser(K, 1.2));
      if (d.rug) ctx.rug(-3.0, -1.2, 2.0, 1.2, d.rug, 0);
      plantAt(ctx, b.x1 - 0.3, b.z1 - 0.3, d, 0.8);
      if (d.bed) ctx.spot(-3.0, -2.3, 1.7, "SLEEP", "🛏 Sleep till morning · heals you and saves", "sleep");
      bathroom(ctx, R.bath, { key: "bath", tub: [4.85, R.bath.z0 + 0.4, 0], wc: [R.bath.x1 - 0.36, -1.3, -HP], sink: [R.bath.x0 + 0.25, -2.9, HP], towel: [R.bath.x1 - 0.02, -2.6, -HP], mat: [3.6, -2.2] });
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
    },
    links: [
      { a: "kitchen", b: "living", kind: "open" },
      { a: "kitchen", b: "bedroom", kind: "door", at: -2.9, into: "bedroom" },
      { a: "living", b: "bath", kind: "door", at: 0.8, into: "bath" },
      { a: "living", b: "office", kind: "door", at: 3.5, into: "office" },
    ],
    windows: [{ room: "bedroom", side: "back", at: -4.2, w: 1.8 }, { room: "office", side: "back", at: 5.4, w: 1.6 }, { room: "living", side: "front", at: 1.8, w: 2.2 }, { room: "kitchen", side: "front", at: -5.2, w: 1.4 }],
    furnish(ctx, d) {
      const { K, R } = ctx;
      const k = R.kitchen, l = R.living, b = R.bedroom, o = R.office;
      ctx.paint("kitchen", 0xf2f0ea, 0, null, { backsplash: true });
      ctx.P(k.x0 + 0.32, 2.3, HP, () => F.kitchenRun(K, 3.4, { fronts: 0x2a3a4a, top: C.marble }));
      ctx.P(k.x0 + 0.4, 4.75, HP, () => F.fridge(K));
      ctx.P(-4.2, 2.4, -HP, () => F.kitchenIsland(K, 2.0));
      for (const z of [1.8, 2.4, 3.0]) ctx.P(-3.3, z, -HP, () => F.stool(K, { color: C.charcoal, h: 0.66 }));
      ctx.spot(k.x0 + 0.9, 4.75, 1.2, "SNACK", "🥪 Raid the fridge · heals a little", "snack");
      ctx.P(0.3, 4.3, 0, () => F.diningTable(K, 1.4, 0.8));
      for (const x of [-0.1, 0.7]) { ctx.P(x, 3.6, 0, () => F.chair(K, { seat: 0x8a7a6a })); ctx.P(x, 5.0, PI, () => F.chair(K, { seat: 0x8a7a6a })); }
      livingSet(ctx, 4.2, 2.8, 1, d);
      tvWall(ctx, l.x1 - 0.22, 2.8, -HP, d);
      ctx.P(5.5, 0.9, -0.6, () => F.armchair(K, d.sofa || 0x6a6e76));
      lampAt(ctx, 2.4, 1.0, d); plantAt(ctx, l.x1 - 0.4, 5.0, d); artAt(ctx, 5.8, l.z0, 0, d, 1.6, 1.0);
      ctx.P(2.15, l.z0 + 0.17, 0, () => F.bookshelf(K, 1.2, 2.0));
      ctx.spot(5.0, 3.9, 1.6, "DECORATE", "🎨 Decorate your home", "decorate");
      if (d.bed) ctx.P(-4.2, b.z0 + 1.1, 0, () => F.bed(K, 1.8, 2.1, d.bed));
      ctx.P(-5.45, b.z0 + 0.25, 0, () => F.nightstand(K)); ctx.P(-2.95, b.z0 + 0.25, 0, () => F.nightstand(K));
      ctx.P(b.x0 + 0.3, -2.2, HP, () => F.wardrobe(K, 1.8));
      ctx.P(b.x1 - 0.24, -3.6, -HP, () => F.dresser(K, 1.2));
      if (d.rug) ctx.rug(-4.2, -1.9, 2.2, 1.3, d.rug, 0);
      plantAt(ctx, b.x0 + 0.35, b.z1 - 0.35, d, 0.8);
      if (d.bed) ctx.spot(-4.2, -2.8, 1.7, "SLEEP", "🛏 Sleep till morning · heals you and saves", "sleep");
      bathroom(ctx, R.bath, { key: "bath", tub: [0.75, R.bath.z0 + 0.4, 0], wc: [R.bath.x0 + 0.36, -2.5, HP], sink: [R.bath.x1 - 0.25, -2.9, -HP], towel: [R.bath.x0 + 0.02, -4.0, HP], mat: [0.75, -3.9] });
      ctx.P(5.0, o.z0 + 0.38, 0, () => F.desk(K, 1.5));
      ctx.P(5.0, -4.3, PI, () => F.officeChair(K));
      ctx.P(o.x1 - 0.17, -3.0, -HP, () => F.bookshelf(K, 1.2, 2.0));
      ctx.P(o.x0 + 0.3, o.z0 + 0.32, 0, () => F.filingCabinet(K));
      plantAt(ctx, o.x1 - 0.35, o.z1 - 0.35, d, 0.9);
      ctx.rug(5.0, -2.7, 2.0, 1.4, 0x5a4a3a, 0);
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
    },
    links: [
      { a: "kitchen", b: "living", kind: "open" },
      { a: "kitchen", b: "master", kind: "door", at: -2.8, into: "master" },
      { a: "living", b: "laundry", kind: "door", at: 0.25, into: "laundry" },
      { a: "laundry", b: "bath", kind: "door", at: -0.25, into: "bath" },
      { a: "living", b: "office", kind: "door", at: 3.0, into: "office" },
    ],
    windows: [{ room: "master", side: "back", at: -5.5, w: 2.0 }, { room: "office", side: "back", at: 5.2, w: 2.0 }, { room: "living", side: "front", at: 2.6, w: 2.4 }, { room: "kitchen", side: "front", at: -5.2, w: 1.8 }, { room: "living", side: "right", at: 1.7, w: 1.6 }],
    furnish(ctx, d) {
      const { K, R } = ctx;
      const k = R.kitchen, l = R.living, m = R.master, o = R.office, la = R.laundry;
      ctx.paint("kitchen", 0xf2f0ea, 0, null, { backsplash: true });
      ctx.P(k.x0 + 0.32, 3.4, HP, () => F.kitchenRun(K, 4.0, { fronts: 0xe8e4dc, top: 0x2a2a2e }));
      ctx.P(k.x0 + 0.4, 6.0, HP, () => F.fridge(K));
      ctx.P(-6.0, 2.6, -HP, () => F.kitchenIsland(K, 2.0));
      for (const z of [2.0, 2.6, 3.2]) ctx.P(-5.1, z, -HP, () => F.stool(K, { color: 0x8a5a3a, h: 0.66 }));
      ctx.spot(k.x0 + 0.9, 6.0, 1.2, "SNACK", "🥪 Raid the fridge · heals a little", "snack");
      ctx.P(-3.2, 4.6, 0, () => F.diningTable(K, 1.8, 0.9, { wood: C.walnut }));
      for (const x of [-3.7, -2.7]) { ctx.P(x, 3.9, 0, () => F.chair(K, { wood: C.walnut, seat: 0xd8cfb8 })); ctx.P(x, 5.3, PI, () => F.chair(K, { wood: C.walnut, seat: 0xd8cfb8 })); }
      ctx.P(-4.45, 4.6, HP, () => F.chair(K, { wood: C.walnut, seat: 0xd8cfb8 })); ctx.P(-1.95, 4.6, -HP, () => F.chair(K, { wood: C.walnut, seat: 0xd8cfb8 }));
      ctx.pendant(-3.2, 4.6, 0.9);
      livingSet(ctx, 4.6, 4.2, 1, d);
      tvWall(ctx, l.x1 - 0.22, 4.2, -HP, d);
      ctx.P(6.2, 1.9, -0.5, () => F.armchair(K, d.sofa || 0x6a6e76));
      lampAt(ctx, 3.9, 5.9, d); plantAt(ctx, l.x1 - 0.45, 6.0, d, 1.2); plantAt(ctx, -0.5, 6.0, d, 0.9); artAt(ctx, 7.4, l.z0, 0, d, 1.6, 1.1);
      ctx.P(1.6, l.z0 + 0.17, 0, () => F.bookshelf(K, 1.2, 2.1)); ctx.P(5.0, l.z0 + 0.17, 0, () => F.bookshelf(K, 1.6, 2.1));
      ctx.spot(5.5, 3.0, 1.8, "DECORATE", "🎨 Decorate your home", "decorate");
      if (d.bed) ctx.P(-5.5, m.z0 + 1.1, 0, () => F.bed(K, 1.9, 2.1, d.bed));
      ctx.P(-6.8, m.z0 + 0.25, 0, () => F.nightstand(K)); ctx.P(-4.2, m.z0 + 0.25, 0, () => F.nightstand(K));
      ctx.P(m.x0 + 0.3, -2.0, HP, () => F.wardrobe(K, 2.0));
      ctx.P(m.x1 - 0.24, -4.5, -HP, () => F.dresser(K, 1.3));
      ctx.P(-2.8, -1.5, -2.4, () => F.armchair(K, 0x8a6a5a));
      if (d.rug) ctx.rug(-5.5, -3.0, 2.4, 1.5, d.rug, 0);
      plantAt(ctx, m.x0 + 0.4, m.z1 - 0.4, d);
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
      ctx.rug(5.0, -3.2, 2.4, 1.6, 0x6a2a2a, 0);
      plantAt(ctx, o.x0 + 0.4, o.z1 - 0.4, d);
    },
  },

  // ----------------------------------------------------------------------------------------------
  // venues
  // ----------------------------------------------------------------------------------------------
  food: {
    W: 16, D: 12, H: 3.2, door: 5.5, wall: 0xf0e6d4,
    rooms: {
      dining: { r: [-8, -2, 8, 6], floor: "checker", light: [0xffe8c8, 30], ceil: "none", name: "Dining room" },
      kitchen: { r: [-8, -6, 3, -2], floor: "quarry", light: [0xf4f8ff, 26], ceil: "fluoro", name: "Kitchen" },
      restroom: { r: [3, -6, 8, -2], floor: "tile", light: [0xf4f8ff, 14], ceil: "round", name: "Restrooms" },
    },
    links: [
      { a: "dining", b: "kitchen", kind: "door", at: -6.8, into: "kitchen", sign: ["STAFF ONLY", null] },
      { a: "dining", b: "kitchen", kind: "hatch", at: -2.0, w: 3.0 },
      { a: "dining", b: "restroom", kind: "door", at: 6.5, into: "restroom", sign: ["RESTROOMS", null] },
    ],
    furnish(ctx) {
      const { K, R, brand, label } = ctx;
      const dn = R.dining, kt = R.kitchen, rr = R.restroom, pizza = label.includes("PIZZA");
      ctx.paint("dining", 0xffffff, 1.1, "gloss", { color2: brand });
      ctx.paint("kitchen", 0xf4f4f0, 1.6, "gloss");
      ctx.paint("restroom", 0xdce6ea, 1.4, "gloss");
      // counter with the staff lane behind it, soda machine and menus
      ctx.P(-2.0, -0.7, 0, () => F.serviceCounter(K, 5.0, brand));
      K.block(-4.5, dn.z0, 0.5, -1.0);
      ctx.P(0.55, dn.z0 + 0.35, 0, () => F.prepTable(K, 1.0));
      ctx.P(0.55, dn.z0 + 0.3, 0, () => F.sodaFountain(K));
      ctx.npc(-3.0, -1.5, 0, "stand", { shirt: brand, pants: 0x2a2a2e });
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
      ctx.npc(-6.3, 0.52, 0, "sit"); ctx.npc(-3.3, 5.3, PI, "sit");
      for (const [x, z] of [[1.0, 2.2], [3.0, 2.2], [1.0, 4.4], [3.0, 4.4]]) {
        ctx.P(x, z, 0, () => F.roundTable(K, 0.36, { top: 0xe8e4dc }));
        ctx.P(x - 0.6, z, HP, () => F.chair(K, { wood: F.C.black, seat: brand })); ctx.P(x + 0.6, z, -HP, () => F.chair(K, { wood: F.C.black, seat: brand }));
      }
      ctx.npc(2.4, 2.2, HP, "sit");
      ctx.P(7.4, 5.4, 0, () => F.plant(K, "palm")); ctx.P(-7.45, 5.45, 0, () => F.plant(K, "snake"));
      ctx.P(dn.x1 - 0.05, 3.2, -HP, () => F.wallClock(K), 2.2);
      ctx.neon(dn.x0 + 0.01, 2.0, 3.0, HP, pizza ? "PIZZA" : "BURGERS", brand);
      // the kitchen: oven or griddle & fryers, prep table, sink run, walk-in fridge, dry store
      if (pizza) ctx.P(-4.8, kt.z0 + 0.72, 0, () => F.pizzaOven(K));
      else { ctx.P(-5.3, kt.z0 + 0.36, 0, () => F.griddle(K, 1.2)); ctx.P(-3.9, kt.z0 + 0.36, 0, () => F.fryer(K, 0.9)); }
      ctx.P(0.2, kt.z0 + 0.34, 0, () => F.kitchenRun(K, 3.0, { fronts: 0xb8bcc2, top: 0xc8ccd0 }));
      ctx.P(2.4, kt.z0 + 0.4, 0, () => F.fridge(K));
      ctx.P(-2.5, -3.9, 0, () => F.prepTable(K, 1.6));
      ctx.P(kt.x0 + 0.23, -3.9, HP, () => F.shelfUnit(K, 1.6));
      ctx.npc(-4.6, -3.95, PI, "stand", { shirt: 0xf4f4f0, pants: 0x2a2a2e });
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
    },
  },

  club: {
    W: 18, D: 13, H: 4.2, door: 6.5, wall: 0x1a1420, ambient: 0.35,
    rooms: {
      foyer: { r: [4, 2, 9, 6.5], floor: "marble", light: [0xffd0a0, 14], ceil: "spot", name: "Foyer" },
      hall: { r: [-5, -6.5, 4, 6.5], floor: "concreteDark", light: [0xc050ff, 12], ceil: "none", name: "Dance floor" },
      bar: { r: [4, -6.5, 9, 2], floor: "darkwood", light: [0xffa060, 12], ceil: "spot", name: "Bar" },
      vip: { r: [-9, -1, -5, 6.5], floor: "carpetRed", light: [0xff6080, 10], ceil: "spot", name: "VIP lounge" },
      back: { r: [-9, -6.5, -5, -1], floor: "concrete", light: [0xf4f0e8, 14], ceil: "fluoro", name: "Backstage" },
    },
    links: [
      { a: "foyer", b: "hall", kind: "arch", at: 4.2, w: 1.8 },
      { a: "hall", b: "bar", kind: "arch", at: -2.3, w: 3.5 },
      { a: "hall", b: "vip", kind: "arch", at: 2.8, w: 2.2, sign: [null, null], vipSign: true },
      { a: "hall", b: "back", kind: "door", at: -4.2, into: "back", sign: ["STAFF ONLY", null] },
    ],
    furnish(ctx) {
      const { K, R } = ctx;
      const h = R.hall, f = R.foyer, b = R.bar, v = R.vip, bk = R.back;
      ctx.paint("vip", 0x3a1020, 0); ctx.paint("foyer", 0x241a14, 0); ctx.paint("back", 0x6a6a70, 0);
      ctx.dance(-0.5, 0.5, 7, 0.95);
      ctx.P(-0.5, -5.3, 0, () => F.djBooth(K));
      K.block(-1.9, h.z0, 0.9, -5.75);
      ctx.npc(-0.5, -6.05, 0, "dj");
      ctx.P(-3.4, -5.9, 0.3, () => F.speaker(K, 1.8)); ctx.P(2.4, -5.9, -0.3, () => F.speaker(K, 1.8));
      ctx.P(-4.4, 4.5, 0.6, () => F.speaker(K, 1.1));
      K.push(-0.5, -3.3, 0, 0); F.trussLights(K, 7, ctx.H - 0.1, [0xff3b8b, 0x3bd0ff, 0xb44bff, 0xffd23b, 0x3bd0ff]); K.pop();
      K.push(-0.5, 4.5, PI, 0); F.trussLights(K, 7, ctx.H - 0.1, [0xb44bff, 0xff3b8b, 0x3bd0ff, 0xff3b8b, 0xffd23b]); K.pop();
      F.mirrorBall(K, -0.5, ctx.H - 0.5, 0.5);
      for (let i = 0; i < 6; i++) ctx.npc(-2.2 + (i % 3) * 1.7, -0.9 + Math.floor(i / 3) * 2.6, i * 1.3, "dance");
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
      ctx.npc(7.6, -2.4, -HP, "stand", { shirt: 0x1a1a1a, pants: 0x1a1a1a });
      for (const z of [-4.2, -3.2, -2.2, -1.2, -0.2]) ctx.P(5.35, z, HP, () => F.stool(K, { color: 0x6a1a3a }));
      ctx.npc(5.35, -3.2, HP, "perch"); ctx.npc(5.35, -1.2, HP, "perch");
      ctx.spot(5.1, -2.7, 1.4, "DRINK", "🍹 Order a drink · $25", "drink");
      // VIP: plush sofas, champagne, a velvet rope
      ctx.P(v.x0 + 0.46, 1.4, HP, () => F.sofa(K, 2.4, 0x5a1030, { legs: F.C.brass, accent: 0xc8a24a }));
      ctx.P(v.x0 + 0.46, 4.7, HP, () => F.sofa(K, 2.4, 0x5a1030, { legs: F.C.brass, accent: 0xc8a24a }));
      for (const z of [1.4, 4.7]) { ctx.P(v.x0 + 1.6, z, HP, () => F.coffeeTable(K, 1.0, 0.55, { glass: true })); K.cyl("chrome", 0.12, 0.1, 0.22, v.x0 + 1.6, 0.54, z + 0.2, F.C.chrome, { seg: 12 }); K.lathe("glass", [[0.001, 0], [0.04, 0], [0.04, 0.2], [0.012, 0.3]], v.x0 + 1.6, 0.5, z + 0.2, 0x2a5a2a); }
      ctx.npc(v.x0 + 0.5, 4.2, HP, "sit"); ctx.npc(v.x0 + 0.5, 1.9, HP, "sit");
      F.stanchion(K, -5.3, 1.45); F.stanchion(K, -5.3, 4.15); F.rope(K, -5.3, 4.15, -5.3, 5.5);
      ctx.P(v.x0 + 0.4, v.z1 - 0.4, 0, () => F.plant(K, "palm", { pot: F.C.brass }));
      ctx.spot(v.x0 + 2.2, 3.0, 1.4, "CHILL", "🥂 Kick back in the VIP lounge", "vip");
      // backstage
      ctx.P(bk.x0 + 0.28, -4.0, HP, () => F.lockers(K, 5, 0x3a3a44));
      ctx.P(bk.x1 - 0.95, bk.z0 + 0.26, 0, () => F.dresser(K, 1.2));
      ctx.P(-6.8, -1.5, PI, () => F.sofa(K, 1.8, 0x3a3a44, { pillows: false }));
      for (let i = 0; i < 3; i++) F.crate(K, 0.55, -7.6, 0.55 * i, -5.8, 0.2 * i);
      K.block(-7.9, -6.1, -7.3, -5.5);
    },
  },

  gallery: {
    W: 18, D: 12, H: 4.0, door: 5.5, wall: 0xf4f2ee,
    rooms: {
      lobby: { r: [2, 0.5, 9, 6], floor: "marble", light: [0xfff4e4, 20], ceil: "spot", name: "Lobby" },
      hallA: { r: [-9, 0.5, 2, 6], floor: "wood", light: [0xfff4e4, 22], ceil: "none", name: "East gallery" },
      hallB: { r: [-9, -6, 2, 0.5], floor: "wood", light: [0xfff4e4, 24], ceil: "none", name: "West gallery" },
      office: { r: [2, -6, 9, 0.5], floor: "carpet", light: [0xfff0dc, 16], ceil: "fluoro", name: "Curator's office" },
    },
    links: [
      { a: "lobby", b: "hallA", kind: "arch", at: 3.2, w: 2.2, sign: ["EXHIBITION", null] },
      { a: "hallA", b: "hallB", kind: "arch", at: -3.5, w: 2.4 },
      { a: "lobby", b: "office", kind: "door", at: 7.8, into: "office", sign: ["STAFF ONLY", null] },
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
      ctx.npc(-6.9, 4.8, PI, "stand"); ctx.npc(-0.4, 4.9, PI + 0.3, "stand");
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
      ctx.npc(-6.6, -3.0, HP, "sit"); ctx.npc(0.4, -4.4, PI, "stand");
      // office: a desk, shipping crates, canvases leaning against the wall
      ctx.P(5.0, o.z0 + 0.38, 0, () => F.desk(K, 1.6));
      ctx.P(5.0, -4.9, PI, () => F.officeChair(K));
      F.crate(K, 1.0, 8.2, 0, -5.2, 0.1); F.crate(K, 0.8, 8.2, 1.0, -5.2, -0.2); F.crate(K, 1.0, 8.1, 0, -3.9, 0);
      K.block(7.5, -5.9, 8.93, -3.3);
      for (let i = 0; i < 4; i++) ctx.painting(o.x0 + 0.12 + i * 0.05, 0.75, -2.0 - i * 0.12, HP, 1.2 - i * 0.1, 1.2 - i * 0.12, 20 + i, { lean: 0.12 });
      K.block(o.x0, -2.6, o.x0 + 0.45, -1.4);
      ctx.P(o.x0 + 0.3, o.z0 + 0.32, 0, () => F.filingCabinet(K, { color: 0x1a1a1c }));
      ctx.P(o.x1 - 0.3, -1.0, 0, () => F.waterCooler(K));
    },
  },

  hospital: {
    W: 18, D: 13, H: 3.1, door: 6.0, wall: 0xe4eef0,
    rooms: {
      lobby: { r: [0, 1, 9, 6.5], floor: "vinyl", light: [0xf4f8ff, 26], ceil: "panel", name: "Reception" },
      ward: { r: [-9, -6.5, 0, 6.5], floor: "vinyl", light: [0xf0f6ff, 26], ceil: "panel", name: "Ward A" },
      exam: { r: [0, -6.5, 4.5, 1], floor: "vinyl", light: [0xf4f8ff, 18], ceil: "panel", name: "Exam room" },
      staff: { r: [4.5, -6.5, 9, 1], floor: "tile", light: [0xfff4e4, 16], ceil: "fluoro", name: "Staff room" },
    },
    links: [
      { a: "lobby", b: "ward", kind: "arch", at: 4.2, w: 1.8, sign: ["WARD A", null] },
      { a: "lobby", b: "exam", kind: "door", at: 2.2, into: "exam", sign: ["EXAM 1", null] },
      { a: "lobby", b: "staff", kind: "door", at: 7.8, into: "staff", sign: ["STAFF ONLY", null] },
    ],
    furnish(ctx) {
      const { K, R } = ctx;
      const lb = R.lobby, w = R.ward, ex = R.exam, sf = R.staff;
      ctx.paint("lobby", 0xc8dce4, 1.0, "gloss"); ctx.paint("ward", 0xc8dce4, 1.0, "gloss"); ctx.paint("exam", 0xc8dce4, 1.0, "gloss");
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
      ctx.npc(-4.3, 1.6, -HP, "stand", { shirt: 0x6ab0c8, pants: 0x6ab0c8 });
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
    },
  },

  police: {
    W: 18, D: 13, H: 3.1, door: 6.0, wall: 0xd4d8dc,
    rooms: {
      lobby: { r: [3, 1.5, 9, 6.5], floor: "tile", light: [0xf4f8ff, 22], ceil: "panel", name: "Front desk" },
      bullpen: { r: [-9, 1.5, 3, 6.5], floor: "carpet", light: [0xf4f8ff, 26], ceil: "fluoro", name: "Squad room" },
      cells: { r: [-9, -6.5, -1, 1.5], floor: "concrete", light: [0xe8f0f4, 18], ceil: "fluoro", name: "Holding cells" },
      interview: { r: [-1, -6.5, 4, 1.5], floor: "concrete", light: [0xfff0d8, 10], ceil: "none", name: "Interview room" },
      lockers: { r: [4, -6.5, 9, 1.5], floor: "tile", light: [0xf4f8ff, 18], ceil: "fluoro", name: "Locker room" },
    },
    links: [
      { a: "lobby", b: "bullpen", kind: "arch", at: 4.0, w: 1.8 },
      { a: "bullpen", b: "cells", kind: "door", at: -5.0, into: "cells", sign: ["HOLDING", null] },
      { a: "bullpen", b: "interview", kind: "door", at: 0.8, into: "interview", sign: ["INTERVIEW 1", null] },
      { a: "lobby", b: "lockers", kind: "door", at: 7.5, into: "lockers", sign: ["STAFF ONLY", null] },
    ],
    furnish(ctx) {
      const { K, R } = ctx;
      const lb = R.lobby, bp = R.bullpen, c = R.cells, iv = R.interview, lk = R.lockers;
      ctx.paint("lobby", 0x2a3a5a, 1.0, "matte"); ctx.paint("cells", 0x9a9ea2, 0); ctx.paint("interview", 0x8a8e92, 0);
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
      ctx.npc(-3.8, 3.9, PI, "sit", { shirt: 0x1e2a44, pants: 0x1e2a44 }); ctx.npc(-7.2, 6.0, PI, "sit", { shirt: 0xe8e6e0, pants: 0x2a2a2e });
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
      ctx.P(6.5, lk.z0 + 0.28, 0, () => F.lockers(K, 7, 0x2a3a5a));
      ctx.P(6.5, -4.5, 0, () => F.bench(K, 2.2));
      ctx.P(lk.x0 + 0.28, -2.0, HP, () => F.lockers(K, 4, 0x2a3a5a));
      ctx.P(lk.x1 - 0.25, -2.0, -HP, () => F.shelfUnit(K, 1.4));
    },
  },

  office: {
    W: 14, D: 10, H: 3.0, door: 4.5, wall: 0xe8e4dc,
    rooms: {
      reception: { r: [2, 0.5, 7, 5], floor: "marble", light: [0xfff4e4, 18], ceil: "spot", name: "Reception" },
      open: { r: [-7, 0.5, 2, 5], floor: "carpet", light: [0xf4f8ff, 22], ceil: "panel", name: "Office floor" },
      boss: { r: [-7, -5, 0, 0.5], floor: "wood", light: [0xffe8c8, 18], ceil: "round", name: "Manager's office" },
      breakroom: { r: [0, -5, 7, 0.5], floor: "tile", light: [0xfff0dc, 18], ceil: "panel", name: "Break room" },
    },
    links: [
      { a: "reception", b: "open", kind: "arch", at: 2.8, w: 1.8 },
      { a: "open", b: "boss", kind: "door", at: -3.5, into: "boss", sign: ["MANAGER", null] },
      { a: "reception", b: "breakroom", kind: "door", at: 5.5, into: "breakroom", sign: ["STAFF", null] },
    ],
    furnish(ctx) {
      const { K, R, brand, label } = ctx;
      const rc = R.reception, op = R.open, bs = R.boss, br = R.breakroom;
      ctx.paint("reception", brand, 0, null, { accentWall: "back" });
      ctx.P(3.8, 1.5, 0, () => F.receptionDesk(K, 2.0));
      K.block(2.8, rc.z0, 4.8, 1.1);
      ctx.npc(3.8, 0.85, 0, "stand");
      ctx.banner(3.8, 2.35, rc.z0 + 0.02, 0, 2.2, 0.6, label, brand, ctx.fg);
      ctx.P(rc.x1 - 0.42, 3.4, -HP, () => F.armchair(K, 0x4a4e56)); ctx.P(rc.x1 - 0.42, 4.4, -HP, () => F.armchair(K, 0x4a4e56));
      ctx.P(6.6, 1.9, 0, () => F.plant(K, "snake"));
      ctx.spot(3.8, 2.4, 1.4, "ASK", "💼 Talk to the front desk", "office");
      for (const [x, z] of [[-6.0, 1.5], [-1.6, 1.5], [-6.0, 3.8], [-1.6, 3.8]]) { ctx.P(x, z, 0, () => F.desk(K, 1.4)); ctx.P(x, z + 0.7, PI, () => F.officeChair(K)); }
      ctx.npc(-1.6, 2.2, PI, "sit"); ctx.npc(-6.0, 4.5, PI, "sit");
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
      ctx.painting(bs.x1, 1.7, -1.4, -HP, 1.2, 0.8, 7);
      ctx.rug(-3.5, -3.0, 3.0, 2.0, 0x6a2a2a, 0);
      // break room
      ctx.P(2.2, br.z0 + 0.34, 0, () => F.kitchenRun(K, 2.8, { fronts: 0xe8e4dc }));
      ctx.P(4.2, br.z0 + 0.4, 0, () => F.fridge(K, { color: 0xf0f0f0 }));
      K.push(1.1, br.z0 + 0.34, 0, 0.93); F.coffeeMachine(K); K.pop();
      ctx.P(3.6, -1.8, 0, () => F.roundTable(K, 0.5));
      for (const a of [0, 2.1, 4.2]) ctx.P(3.6 + Math.sin(a) * 0.75, -1.8 + Math.cos(a) * 0.75, a + PI, () => F.chair(K));
      ctx.P(br.x1 - 0.45, br.z0 + 0.42, 0, () => F.vendingMachine(K, brand));
      ctx.npc(3.6 + Math.sin(2.1) * 0.75, -1.8 + Math.cos(2.1) * 0.75, 2.1 + PI, "sit");
    },
  },

  depot: {
    W: 22, D: 15, H: 5.0, door: 3.0, wall: 0x9a948a,
    rooms: {
      floor: { r: [-11, -7.5, 6, 7.5], floor: "concrete", light: [0xfff2dc, 40], ceil: "fluoro", name: "Warehouse floor" },
      office: { r: [6, 1.5, 11, 7.5], floor: "carpet", light: [0xfff0dc, 18], ceil: "panel", name: "Dispatch office" },
      staff: { r: [6, -7.5, 11, 1.5], floor: "tile", light: [0xfff4e4, 18], ceil: "fluoro", name: "Staff room" },
    },
    links: [
      { a: "floor", b: "office", kind: "door", at: 4.5, into: "office", sign: ["DISPATCH", null] },
      { a: "floor", b: "office", kind: "window", at: 2.6, w: 2.0 },
      { a: "floor", b: "staff", kind: "door", at: -3.0, into: "staff", sign: ["STAFF", null] },
    ],
    furnish(ctx) {
      const { K, R } = ctx;
      const fl = R.floor, of = R.office, sf = R.staff;
      ctx.paint("floor", 0x6a6e72, 1.2, "matte");
      ctx.P(-3.5, fl.z0 + 0.6, 0, () => F.palletRack(K, 10.8, 3));
      ctx.P(-3.5, -3.2, 0, () => F.palletRack(K, 10.8, 3));
      ctx.P(-3.5, 0.6, 0, () => F.palletRack(K, 10.8, 3));
      // painted aisle lines and a forklift lane
      for (const z of [-5.0, -1.3, 2.4]) K.box("matte", 12, 0.005, 0.1, -3.5, 0.045, z, 0xe8c020);
      K.box("matte", 0.1, 0.005, 14.5, 2.9, 0.045, 0, 0xe8c020);
      ctx.P(0.2, 4.2, HP, () => F.forklift(K));
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
      ctx.npc(1.2, 3.0, HP, "stand", { shirt: 0xe8e020, pants: 0x2a3a52 }); ctx.npc(-8.0, -1.3, 0.5, "stand", { shirt: 0xe87a20, pants: 0x2a3a52 });
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
    },
  },
};
