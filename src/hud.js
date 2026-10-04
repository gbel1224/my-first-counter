// Palm City — HUD: cash, objective card, a round minimap that turns with the camera, the
// speedometer, context prompt, toasts, and the touch buttons.
import { N, ROAD, CELL, HALF, SHORE, blockMin, BLOCK, STYLE } from "./world.js";

const el = (tag, id, cls, parent, html) => {
  const e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html;
  (parent || document.getElementById("ui")).appendChild(e); return e;
};

export function createHUD(plan) {
  const hud = el("div", "hud", "hidden");
  const cash = el("div", "cash", "chip", hud, '<div class="coin">$</div><div><div class="amt">0</div><div class="sub"><span class="lv">LV 1</span><i class="xp"><b></b></i><span class="inc"></span></div></div>');
  const amt = cash.querySelector(".amt"), lvEl = cash.querySelector(".lv"), xpEl = cash.querySelector(".xp b"), incEl = cash.querySelector(".inc");
  const obj = el("div", "obj", "chip", hud, '<div class="t"></div><div class="d"></div><div class="dist"></div>');
  const objDist = obj.querySelector(".dist");
  // story dialogue: speaker, typed-out line, tap anywhere on the card to continue
  const dlg = el("div", "dlg", "chip pe", document.getElementById("ui"), '<div class="who"></div><div class="txt"></div><div class="hint">tap to continue ▸</div>');
  const banner = el("div", "banner", "", document.getElementById("ui"), '<div class="k"></div><div class="big"></div><div class="small"></div>');
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
  const bF = el("button", "bF", "btn", hud, "👊");
  const bW = el("button", "bW", "btn", hud, "⇄");
  const bR = el("button", "bR", "btn hide", hud, "📻");
  // health, wanted stars, weapon
  const vit = el("div", "vit", "", hud, '<div class="hp"><i></i></div><div class="stars"></div><div class="wpn"></div>');
  const hpBar = vit.querySelector(".hp i"), starsEl = vit.querySelector(".stars"), wpnEl = vit.querySelector(".wpn");
  const hurtEl = el("div", "hurt", "", document.getElementById("ui"));
  const comboEl = el("div", "combo", "", hud, '<b></b><small>MAYHEM</small><i><u></u></i>');
  const bossEl = el("div", "bossbar", "", hud, '<div class="bn"></div><div class="bb"><i></i></div>');
  // modal panel (shops)
  const panel = el("div", "panel", "chip pe", document.getElementById("ui"), '<div class="ph"><b></b><button class="x">✕</button></div><div class="pb"></div>');
  panel.querySelector(".x").addEventListener("click", () => panel.classList.remove("on"));

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
    c.fillStyle = b.style === STYLE.GLASS ? "#8e9db3" : b.style === STYLE.HOUSE || b.style === STYLE.GARAGE ? "#dcc3ae" : "#b0a89c";
    c.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), b.w * S, b.d * S);
  }

  let toastT = 0, bannerT = 0;
  let dlgLines = null, dlgI = 0, dlgCb = null, dlgShown = 0, dlgFull = "";
  const WHO = { marco: ["Marco", "#ffc861"], rosa: ["Rosa", "#ff8fc8"], vince: ["Vince Sterling", "#ff6a5a"], narrator: ["Palm City", "#9fd8ff"], you: ["You", "#b8f0a0"] };
  function renderDlg() {
    const [who, text] = dlgLines[dlgI];
    const w = WHO[who] || [who, "#fff"];
    dlg.querySelector(".who").textContent = w[0]; dlg.querySelector(".who").style.color = w[1];
    dlgFull = text; dlgShown = 0; dlg.querySelector(".txt").textContent = "";
  }
  function advance() {
    if (!dlgLines) return;
    if (dlgShown < dlgFull.length) { dlgShown = dlgFull.length; dlg.querySelector(".txt").textContent = dlgFull; return; }   // first tap finishes the line
    dlgI++;
    if (dlgI >= dlgLines.length) { dlgLines = null; dlg.classList.remove("on"); document.body.classList.remove("talking"); const cb = dlgCb; dlgCb = null; if (cb) cb(); }
    else renderDlg();
  }
  dlg.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); advance(); });
  addEventListener("keydown", e => { if (dlgLines && ["Enter", "Space", "KeyE", "KeyF"].includes(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); advance(); } }, true);
  const H_ = {
    mapInfo: { canvas: map, X, Z, S },
    dialogue(lines, cb) { dlgLines = lines; dlgI = 0; dlgCb = cb; renderDlg(); dlg.classList.add("on"); document.body.classList.add("talking"); },
    talking: () => !!dlgLines,
    advance,
    banner(big, small, kicker = "", secs = 3.6, cls = "") {
      banner.className = "on " + cls;
      banner.querySelector(".k").textContent = kicker; banner.querySelector(".big").textContent = big; banner.querySelector(".small").textContent = small || "";
      bannerT = secs;
    },
    level(lv, xp, need, inc) {
      lvEl.textContent = "LV " + lv; xpEl.style.width = Math.min(100, xp / need * 100) + "%";
      incEl.textContent = inc > 0 ? "+$" + inc.toLocaleString() + "/min" : "";
    },
    objDistance(d) { objDist.textContent = d == null ? "" : (d < 1000 ? Math.round(d) + " m" : (d / 1000).toFixed(1) + " km"); },
    ui: { joy, knob: joy.querySelector("i"), bA, bB, bC, bD, bF, bW, bR },
    vitals(hp, stars, searching, wpn, ammo, onFoot) {
      hpBar.style.width = hp + "%"; hpBar.style.background = hp < 30 ? "#ff5d5d" : "linear-gradient(90deg,#5ff0b0,#9ef08a)";
      starsEl.innerHTML = stars > 0 ? (searching ? '<span class="srch">' + "☆".repeat(stars) + " 🔍</span>" : "★".repeat(stars)) : "";
      wpnEl.textContent = wpn ? wpn + (ammo !== null ? " · " + ammo : "") : "";
      bF.textContent = !onFoot ? "" : (wpn && wpn !== "Fists" ? "🔫" : "👊");
      bF.classList.toggle("hide", !onFoot); bW.classList.toggle("hide", !onFoot);
    },
    hurt(a) { hurtEl.style.opacity = Math.min(0.85, a); },
    combo(x, pts) { comboEl.classList.add("on"); comboEl.querySelector("b").textContent = "x" + x; comboEl.querySelector("small").textContent = "MAYHEM · " + pts; },
    comboTick(t) { if (t <= 0) comboEl.classList.remove("on"); else comboEl.querySelector("u").style.width = (t / 5 * 100) + "%"; },
    boss(on, name, frac) { bossEl.classList.toggle("on", !!on); if (on) { bossEl.querySelector(".bn").textContent = name; bossEl.querySelector("i").style.width = (frac * 100) + "%"; } },
    panel(titleText, rows) {
      panel.querySelector(".ph b").textContent = titleText;
      const pb = panel.querySelector(".pb"); pb.innerHTML = "";
      for (const r of rows) {
        const row = document.createElement("div"); row.className = "prow";
        row.innerHTML = '<div><div class="pl"></div><div class="ps"></div></div><button></button>';
        row.querySelector(".pl").textContent = r.label; row.querySelector(".ps").textContent = r.sub || "";
        const b = row.querySelector("button"); b.textContent = r.btn; b.disabled = !!r.disabled;
        b.addEventListener("click", () => r.onClick());
        pb.appendChild(row);
      }
      panel.classList.add("on");
    },
    closePanel() { panel.classList.remove("on"); },
    panelOpen: () => panel.classList.contains("on"),
    show(on) { hud.classList.toggle("hidden", !on); },
    cash(v) { amt.textContent = "$" + Math.floor(v).toLocaleString(); },
    objective(t, d) { obj.style.display = t ? "" : "none"; obj.querySelector(".t").textContent = t || ""; obj.querySelector(".d").textContent = d || ""; },
    prompt(html) { if (html) prompt.innerHTML = html; prompt.classList.toggle("on", !!html); },
    toast(msg, secs = 2.6) { toastEl.textContent = msg; toastEl.classList.add("on"); toastT = secs; },
    speed(kmh, on, fuel) { speed.classList.toggle("on", on); if (on) { speedV.textContent = Math.round(kmh); speed.querySelector(".u").textContent = "KM/H" + (fuel != null ? "  ·  ⛽ " + Math.round(fuel) + "%" : ""); } },
    buttons(driving, nearCar, actLabel, kind) {
      bA.textContent = driving ? (actLabel || "EXIT") : actLabel || (nearCar ? "DRIVE" : "GO");
      bA.classList.toggle("hide", !driving && !nearCar && !actLabel);
      const air = kind === "heli" || kind === "plane";
      bB.textContent = driving ? (air ? "▼" : kind === "boat" || kind === "jetski" ? "BRAKE" : "DRIFT") : "JUMP";
      bC.textContent = driving ? (air ? "▲" : "BOOST") : "RUN";
      bD.classList.toggle("hide", !driving);
      bR.classList.toggle("hide", !driving || kind === "jetski" || kind === "bike");
    },
    update(dt) {
      if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.classList.remove("on"); }
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.remove("on"); }
      if (dlgLines && dlgShown < dlgFull.length) { dlgShown = Math.min(dlgFull.length, dlgShown + dt * 55); dlg.querySelector(".txt").textContent = dlgFull.slice(0, Math.floor(dlgShown)); }
    },
    minimap(px, pz, heading, camYaw, dots, marker) {
      const w = mm.width, h = mm.height, ctx = mctx, zoom = 1.25;
      ctx.save();
      ctx.clearRect(0, 0, w, h);
      ctx.translate(w / 2, h / 2);
      ctx.rotate(camYaw + Math.PI);                  // camera-up = map-up
      ctx.scale(zoom, zoom);
      ctx.drawImage(map, -X(px), -Z(pz));
      for (const d of dots) {
        ctx.fillStyle = d.c; ctx.beginPath(); ctx.arc((d.x - px) * S, (d.z - pz) * S, d.r || 2.4, 0, 6.3); ctx.fill();
        if (d.t) { ctx.save(); ctx.translate((d.x - px) * S, (d.z - pz) * S); ctx.rotate(-(camYaw + Math.PI)); ctx.scale(1 / zoom, 1 / zoom); ctx.fillStyle = "#fff"; ctx.font = "bold 11px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(d.t, 0, 0.5); ctx.restore(); }
      }
      if (marker) {
        // clamp the objective to the rim when it's off the map, so you always know which way to go
        let mx = (marker.x - px) * S, mz = (marker.z - pz) * S;
        const lim = (w / 2 - 12) / zoom, d = Math.hypot(mx, mz);
        if (d > lim) { mx *= lim / d; mz *= lim / d; }
        ctx.fillStyle = marker.c || "#ffc861"; ctx.strokeStyle = "#3a2206"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(mx, mz, 6 / zoom * 1.2, 0, 6.3); ctx.fill(); ctx.stroke();
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

// in-game Yes/No (native confirm() is blocked in some embedded browsers and looks out of place)
export function askConfirm(msg, yes, onYes) {
  let box = document.getElementById("confirm");
  if (!box) {
    box = document.createElement("div"); box.id = "confirm";
    box.innerHTML = '<div class="cb"><div class="cm"></div><div class="cr"><button class="no">Cancel</button><button class="yes"></button></div></div>';
    document.body.appendChild(box);
    box.addEventListener("click", e => { if (e.target === box) box.classList.remove("on"); });
    box.querySelector(".no").addEventListener("click", () => box.classList.remove("on"));
  }
  box.querySelector(".cm").textContent = msg;
  const y = box.querySelector(".yes"); y.textContent = yes;
  y.onclick = () => { box.classList.remove("on"); onYes(); };
  box.classList.add("on");
}
