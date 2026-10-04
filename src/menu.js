// Palm City — the pause menu (☰): full-screen map, progress & achievements, settings, photo mode.
export function createMenu(g) {
  // g: { hud, stats(), settings: {get, set}, player(), objective(), pois(), onPause(on), photo(on) }
  const ui = document.getElementById("ui");
  const btn = document.createElement("button"); btn.id = "menuBtn"; btn.className = "btn"; btn.textContent = "☰";
  document.getElementById("hud").appendChild(btn);
  const el = document.createElement("div"); el.id = "menu"; el.className = "pe";
  el.innerHTML = '<div class="mh"><div class="tabs"><button data-t="map">Map</button><button data-t="stats">Progress</button><button data-t="settings">Settings</button></div><button class="x">✕</button></div><div class="mb"></div>';
  ui.appendChild(el);
  const body = el.querySelector(".mb");
  let open = false, tab = "map", photo = false;
  const photoHint = document.createElement("div"); photoHint.id = "photoHint"; photoHint.className = "chip pe"; photoHint.innerHTML = "📷 Photo mode — drag to frame · tap here to exit";
  ui.appendChild(photoHint);
  function show(v) { open = v; el.classList.toggle("on", v); g.onPause(v); if (v) render(); }
  btn.addEventListener("click", e => { e.stopPropagation(); show(!open); });
  el.querySelector(".x").addEventListener("click", () => show(false));
  el.addEventListener("pointerdown", e => e.stopPropagation());
  el.querySelector(".tabs").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { tab = b.dataset.t; render(); } });
  addEventListener("keydown", e => {
    if (e.target && e.target.tagName === "INPUT") return;
    if (e.code === "KeyM") { if (!open) { tab = "map"; show(true); } else show(false); }
    else if (e.code === "Escape" && open) show(false);
    else if (e.code === "Escape" && photo) setPhoto(false);
  });
  photoHint.addEventListener("click", () => setPhoto(false));
  function setPhoto(v) { photo = v; document.body.classList.toggle("photo", v); photoHint.classList.toggle("on", v); g.photo(v); }
  function drawMap(cv) {
    const M = g.hud.mapInfo, ctx = cv.getContext("2d");
    const w = cv.width = cv.clientWidth * devicePixelRatio, h = cv.height = cv.clientHeight * devicePixelRatio;
    const sc = Math.min(w / M.canvas.width, h / M.canvas.height);
    const ox = (w - M.canvas.width * sc) / 2, oy = (h - M.canvas.height * sc) / 2;
    ctx.fillStyle = "#0e1016"; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(M.canvas, ox, oy, M.canvas.width * sc, M.canvas.height * sc);
    const P = (x, z) => [ox + M.X(x) * sc, oy + M.Z(z) * sc];
    const r0 = Math.max(4, 7 * devicePixelRatio * sc * 2.2);
    for (const d of g.pois()) {
      const [x, y] = P(d.x, d.z);
      ctx.fillStyle = d.c; ctx.beginPath(); ctx.arc(x, y, d.big ? d.big * sc * M.S : r0, 0, 6.3); ctx.fill();
      if (d.t) { ctx.fillStyle = "#fff"; ctx.font = "bold " + Math.round(r0 * 1.3) + "px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(d.t, x, y + 1); }
    }
    const o = g.objective();
    if (o && o.x !== undefined) { const [x, y] = P(o.x, o.z); ctx.strokeStyle = "#ffc861"; ctx.lineWidth = 3 * devicePixelRatio; ctx.beginPath(); ctx.arc(x, y, r0 * 1.8, 0, 6.3); ctx.stroke(); }
    const pl = g.player(); const [x, y] = P(pl.x, pl.z);
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI - pl.h);
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#1a4dff"; ctx.lineWidth = 2.5 * devicePixelRatio; const k = r0 * 1.6;
    ctx.beginPath(); ctx.moveTo(0, -k); ctx.lineTo(k * 0.7, k * 0.8); ctx.lineTo(0, k * 0.4); ctx.lineTo(-k * 0.7, k * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  function render() {
    for (const b of el.querySelectorAll(".tabs button")) b.classList.toggle("on", b.dataset.t === tab);
    if (tab === "map") {
      body.innerHTML = '<canvas class="bigmap"></canvas><div class="legend"><span><i style="background:#d9962a"></i>For sale</span><span><i style="background:#2fae6a"></i>Yours</span><span><i style="background:#ff5a3a"></i>Hostile</span><span><i style="background:#ffc861"></i>Objective</span></div>';
      requestAnimationFrame(() => drawMap(body.querySelector("canvas")));
    } else if (tab === "stats") {
      const S = g.stats();
      body.innerHTML = '<div class="sgrid">' + S.rows.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join("") + "</div><h4>Achievements · " + S.ach.filter(a => a.got).length + "/" + S.ach.length + "</h4>" +
        S.ach.map(a => `<div class="ach${a.got ? " got" : ""}"><b>${a.got ? "🏆" : "🔒"} ${a.name}</b><small>${a.desc}</small></div>`).join("");
    } else {
      const s = g.settings.get();
      const opt = (key, label, vals) => `<div class="set"><span>${label}</span><div>${vals.map(([v, t]) => `<button data-k="${key}" data-v="${v}" class="${String(s[key]) === String(v) ? "on" : ""}">${t}</button>`).join("")}</div></div>`;
      body.innerHTML = opt("quality", "Graphics", [["high", "High"], ["balanced", "Balanced"], ["perf", "Performance"]]) + opt("cycle", "Day / night cycle", [["false", "Off"], ["true", "On"]]) +
        opt("time", "Time of day", [["0.3", "Morning"], ["0.5", "Noon"], ["0.63", "Afternoon"], ["0.73", "Sunset"], ["0.9", "Night"]]) +
        opt("weather", "Weather", [["0", "Auto"], ["2", "Clear"], ["1", "Rain"], ["3", "Storm"]]) + opt("sound", "Sound", [["true", "On"], ["false", "Off"]]) +
        '<button class="photo">📷 Photo mode</button><button class="reset">Start a new game</button>';
      body.querySelectorAll("button[data-k]").forEach(b => b.addEventListener("click", () => { g.settings.set(b.dataset.k, b.dataset.v); render(); }));
      body.querySelector(".photo").addEventListener("click", () => { show(false); setPhoto(true); });
      body.querySelector(".reset").addEventListener("click", () => g.reset());
    }
  }
  return { show, isOpen: () => open, photo: () => photo, setPhoto };
}
