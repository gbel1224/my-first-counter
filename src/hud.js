// Palm City — HUD: cash, objective card, a round minimap that turns with the camera, the
// speedometer, context prompt, toasts, and the touch buttons.
import { N, ROAD, CELL, HALF, SHORE, blockMin, BLOCK, STYLE } from "./world.js";

const el = (tag, id, cls, parent, html) => {
  const e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html;
  (parent || document.getElementById("ui")).appendChild(e); return e;
};

export function createHUD(plan) {
  const hud = el("div", "hud", "hidden");
  const cash = el("div", "cash", "chip", hud, '<div class="coin">$</div><div class="amt">0</div>');
  const amt = cash.querySelector(".amt");
  const obj = el("div", "obj", "chip", hud, '<div class="t"></div><div class="d"></div>');
  const mapwrap = el("div", "mapwrap", "chip", hud, '<canvas id="minimap" width="264" height="264"></canvas><div class="n">N</div>');
  const mm = mapwrap.querySelector("canvas"), mctx = mm.getContext("2d");
  const north = mapwrap.querySelector(".n");
  const speed = el("div", "speed", "", hud, '<div class="v">0</div><div class="u">KM/H</div>');
  const speedV = speed.querySelector(".v");
  const prompt = el("div", "prompt", "chip", hud);
  const toastEl = el("div", "toast", "chip", hud);
  const joy = el("div", "joy", "", hud, "<i></i>");
  const bA = el("button", "bA", "btn", hud, "GO");
  const bB = el("button", "bB", "btn", hud, "JUMP");
  const bC = el("button", "bC", "btn", hud, "RUN");
  const bD = el("button", "bD", "btn hide", hud, "📯");

  // ---- the city map, drawn once into an offscreen canvas (1 px = 2 m) ----
  const S = 0.5, W = Math.ceil((HALF * 2 + 200) * S), H = Math.ceil((HALF * 2 + 260) * S);
  const map = document.createElement("canvas"); map.width = W; map.height = H;
  const c = map.getContext("2d");
  const X = x => (x + HALF + 100) * S, Z = z => (z + HALF + 100) * S;
  c.fillStyle = "#cfd6c4"; c.fillRect(0, 0, W, H);                        // land
  c.fillStyle = "#e9dcbc"; c.fillRect(0, Z(HALF), W, Z(SHORE) - Z(HALF)); // sand
  c.fillStyle = "#7cc4dd"; c.fillRect(0, Z(SHORE - 14), W, H);             // sea
  c.fillStyle = "#ffffff";                                                 // roads
  for (let i = 0; i <= N; i++) {
    const p = -HALF + i * CELL;
    c.fillRect(X(p), Z(-HALF), ROAD * S, HALF * 2 * S);
    c.fillRect(X(-HALF), Z(p), HALF * 2 * S, ROAD * S);
  }
  for (const b of plan.blocks) {
    c.fillStyle = b.kind === "park" || b.kind === "suburb" ? "#9cc97e" : b.kind === "plaza" ? "#e8cf9a" : "#c9c4ba";
    c.fillRect(X(b.x0) + 0.5, Z(b.z0) + 0.5, BLOCK * S - 1, BLOCK * S - 1);
  }
  for (const b of plan.buildings) {
    c.fillStyle = b.style === STYLE.GLASS ? "#8e9db3" : b.style === STYLE.HOUSE ? "#dcc3ae" : "#b0a89c";
    c.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), b.w * S, b.d * S);
  }

  let toastT = 0;
  const H_ = {
    ui: { joy, knob: joy.querySelector("i"), bA, bB, bC, bD },
    show(on) { hud.classList.toggle("hidden", !on); },
    cash(v) { amt.textContent = "$" + Math.floor(v).toLocaleString(); },
    objective(t, d) { obj.style.display = t ? "" : "none"; obj.querySelector(".t").textContent = t || ""; obj.querySelector(".d").textContent = d || ""; },
    prompt(html) { if (html) prompt.innerHTML = html; prompt.classList.toggle("on", !!html); },
    toast(msg, secs = 2.6) { toastEl.textContent = msg; toastEl.classList.add("on"); toastT = secs; },
    speed(kmh, on) { speed.classList.toggle("on", on); if (on) speedV.textContent = Math.round(kmh); },
    buttons(driving, nearCar) {
      bA.textContent = driving ? "EXIT" : nearCar ? "DRIVE" : "GO";
      bA.classList.toggle("hide", !driving && !nearCar);
      bB.textContent = driving ? "DRIFT" : "JUMP";
      bC.textContent = driving ? "BOOST" : "RUN";
      bD.classList.toggle("hide", !driving);
    },
    update(dt) { if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.classList.remove("on"); } },
    minimap(px, pz, heading, camYaw, dots, marker) {
      const w = mm.width, h = mm.height, ctx = mctx, zoom = 1.25;
      ctx.save();
      ctx.clearRect(0, 0, w, h);
      ctx.translate(w / 2, h / 2);
      ctx.rotate(camYaw + Math.PI);                  // camera-up = map-up
      ctx.scale(zoom, zoom);
      ctx.drawImage(map, -X(px), -Z(pz));
      for (const d of dots) { ctx.fillStyle = d.c; ctx.beginPath(); ctx.arc((d.x - px) * S, (d.z - pz) * S, d.r || 2.4, 0, 6.3); ctx.fill(); }
      if (marker) {
        ctx.fillStyle = "#ffc861"; ctx.strokeStyle = "#7a4a10"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc((marker.x - px) * S, (marker.z - pz) * S, 5, 0, 6.3); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
      // player arrow (points where the player/car faces, relative to the camera)
      ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(-(heading - camYaw));
      ctx.fillStyle = "#fff"; ctx.strokeStyle = "#1a4dff"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(9, 10); ctx.lineTo(0, 5); ctx.lineTo(-9, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      // N marker orbits the rim
      const a = camYaw + Math.PI;                    // world north (0,-1) after the map rotation
      north.style.left = (50 + Math.sin(a) * 42) + "%"; north.style.top = (50 - Math.cos(a) * 42) + "%";
    },
  };
  return H_;
}
