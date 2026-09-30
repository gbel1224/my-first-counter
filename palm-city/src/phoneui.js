// Palm City — the phone. An iPhone-style handset: dynamic island, status bar with the in-world
// clock, squircle app icons with unread badges, and a home bar you tap to go back.
// Apps: Messages (Marco + Vic threads), Palmgram, Bank, Stocks, Jobs, Heists, Contacts.
import * as PH from "./phone.js";

const money = n => "$" + Math.floor(n).toLocaleString();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function spark(h, w, ht, fill) {
  if (!h || !h.length) return "";
  if (h.length === 1) h = [h[0], h[0]];
  let lo = Math.min(...h), hi = Math.max(...h); const pad = (hi - lo) * 0.12 || hi * 0.01; lo -= pad; hi += pad;
  const up = h[h.length - 1] >= h[0], col = up ? "#34c759" : "#ff453a";
  const pts = h.map((v, i) => (i / (h.length - 1) * w).toFixed(1) + "," + ((1 - (v - lo) / (hi - lo)) * ht).toFixed(1)).join(" ");
  return `<svg viewBox="0 0 ${w} ${ht}" preserveAspectRatio="none" style="display:block;width:100%;height:${ht}px">` +
    (fill ? `<polygon points="0,${ht} ${pts} ${w},${ht}" fill="${col}" fill-opacity=".15"/>` : "") +
    `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="${fill ? 2 : 1.5}" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}

export function createPhone(g) {
  // g: { st, clock(), objective(), focus(), jobs, heists, startHeist(approach), hire(), mechanic(), toast, sound, save, onOpen(open) }
  const ui = document.getElementById("ui");
  const btn = document.createElement("button"); btn.id = "phoneBtn"; btn.className = "btn"; btn.innerHTML = "📱<b></b>";
  document.getElementById("hud").appendChild(btn);
  const wrap = document.createElement("div"); wrap.id = "phone"; wrap.className = "pe";
  wrap.innerHTML = '<div class="bezel"><div class="island"></div><div class="status"><span class="clk"></span><span class="icons">▂▄▆ 5G 🔋</span></div><div class="screen"></div><div class="homebar"></div></div><div class="nerr"></div>';
  ui.appendChild(wrap);
  const screen = wrap.querySelector(".screen"), clk = wrap.querySelector(".clk"), errEl = wrap.querySelector(".nerr");
  const notif = document.createElement("div"); notif.id = "notif"; notif.className = "chip pe"; ui.appendChild(notif);
  let open = false, app = "home", sel = null, errT = 0, notifT = 0;
  const threads = { marco: [], vic: [] };
  let typedAmt = "", typedPost = "";

  const S = g.st;
  S.bank = S.bank || 0; PH.ensurePrices(S); if (!S.ledger) S.ledger = [];

  function err(msg) { errEl.textContent = msg; errEl.classList.add("on"); errT = 3.4; g.sound("door", 0.3); }
  function show(v) { open = v; wrap.classList.toggle("on", v); if (v) render(); g.onOpen && g.onOpen(v); }
  btn.addEventListener("click", e => { e.stopPropagation(); show(!open); });
  wrap.querySelector(".homebar").addEventListener("click", () => { if (app === "home") show(false); else { app = "home"; sel = null; render(); } });
  wrap.addEventListener("pointerdown", e => e.stopPropagation());
  addEventListener("keydown", e => {
    if (e.target && (e.target.tagName === "INPUT")) { if (e.code === "Escape") e.target.blur(); return; }
    if (e.code === "KeyP") { show(!open); e.preventDefault(); }
    else if (e.code === "Escape" && open) { if (app === "home") show(false); else { app = "home"; render(); } }
  });

  const icon = (id, emo, name, bg, badge) => `<button class="app" data-go="${id}"><i style="background:${bg}">${emo}${badge ? `<b>${badge > 9 ? "9+" : badge}</b>` : ""}</i><span>${name}</span></button>`;
  function render() {
    let h = "";
    if (app === "home") {
      const port = PH.portfolioValue(S);
      h = `<div class="grid">${icon("msgs", "💬", "Messages", "linear-gradient(160deg,#5de36b,#22b83e)", threads.unread || 0)}${icon("gram", "🌴", "Palmgram", "linear-gradient(160deg,#f76b8a,#c13584)", PH.unread())}
        ${icon("bank", "🏦", "Bank", "linear-gradient(160deg,#3ec46d,#1c8a46)")}${icon("stocks", "📈", "Stocks", "linear-gradient(160deg,#2b2b33,#0e0e13)")}
        ${icon("jobs", "💼", "Jobs", "linear-gradient(160deg,#5b6ef0,#3b45b8)")}${icon("heist", "🏦", "Heists", "linear-gradient(160deg,#ff5bd0,#8a1f7a)")}
        ${icon("contacts", "📇", "Contacts", "linear-gradient(160deg,#f0a93f,#c2721a)")}</div>
        <div class="widget"><div class="wt">WALLET</div><div class="wr"><span>Cash</span><b>${money(S.money)}</b></div><div class="wr"><span>Bank</span><b class="g">${money(S.bank)}</b></div>${port > 0 ? `<div class="wr"><span>Stocks</span><b class="b">${money(port)}</b></div>` : ""}${S.term ? `<div class="wr s"><span>Term deposit</span><span>${money(S.term.amt)} · ${Math.ceil(S.term.left)}s</span></div>` : ""}</div>`;
    } else if (app === "msgs") {
      threads.unread = 0;
      const obj = g.objective();
      h = `<div class="ttl">Messages</div>
        <button class="row" data-act="askMarco"><b>Marco</b><small>${threads.marco.length ? esc(threads.marco[threads.marco.length - 1].t.replace(/<[^>]+>/g, "")) : "Ask what you should be doing"}</small></button>
        ${threads.vic.length ? `<div class="sec">VIC "THE SHARK" MORENO</div>` + threads.vic.slice(-6).map(m => `<div class="bub them">${esc(m)}</div>`).join("") : ""}
        ${threads.marco.length ? `<div class="sec">MARCO</div>` + threads.marco.slice(-8).map(m => `<div class="bub ${m.me ? "me" : "them"}">${m.t}</div>`).join("") : ""}`;
    } else if (app === "gram") {
      PH.markRead();
      h = `<div class="ttl">Palmgram</div><div class="compose"><input class="post" maxlength="140" placeholder="Post something…" value="${esc(typedPost)}"><button data-act="post">Post</button></div>` +
        (PH.feed().length ? PH.feed().map(p => `<div class="gpost${p.mine ? " mine" : ""}"><div class="gh"><b>${esc(p.name)}</b> <span>${esc(p.handle)} · ${PH.ageLabel(p.age)}</span></div><div>${esc(p.text)}</div><button class="like${p.liked ? " on" : ""}" data-like="${p.id}">${p.liked ? "♥" : "♡"} ${p.likes.toLocaleString()}</button></div>`).join("")
          : `<div class="empty">Quiet in Palm City right now. Give them something to talk about.</div>`);
    } else if (app === "bank") {
      h = `<div class="ttl">Bank</div><div class="card green"><small>BALANCE</small><div class="big">${money(S.bank)}</div><small>Cash on hand ${money(S.money)} · ${(PH.SAVINGS_RATE * 100).toFixed(1)}%/min interest</small><small class="note">Fines only ever take the cash in your pocket. Money in here is safe.</small></div>
        <div class="sec">DEPOSIT</div><div class="pills">${[100, 1000, 10000].map(a => `<button data-dep="${a}">+${a >= 1000 ? a / 1000 + "k" : a}</button>`).join("")}<button data-dep="all">All</button></div>
        <div class="sec">WITHDRAW</div><div class="pills">${[100, 1000, 10000].map(a => `<button data-wd="${a}">−${a >= 1000 ? a / 1000 + "k" : a}</button>`).join("")}<button data-wd="all">All</button></div>
        <div class="sec">OR TYPE AN AMOUNT</div><div class="compose"><input class="amt" inputmode="numeric" placeholder="e.g. 2500" value="${esc(typedAmt)}"><button data-act="depT">Deposit</button><button data-act="wdT">Withdraw</button></div>
        <div class="sec">TERM DEPOSIT · +${PH.TERM_RATE * 100}% after ${PH.TERM_SECS}s</div>` +
        (S.term ? `<div class="row"><b>${money(S.term.amt)} locked</b><small>Matures in ${Math.ceil(S.term.left)}s → +${money(S.term.amt * PH.TERM_RATE)}</small></div><button class="wide" data-act="breakTerm">Break early (forfeit interest)</button>`
          : `<div class="pills">${[1000, 5000, 25000].map(a => `<button data-term="${a}">Lock ${a / 1000}k</button>`).join("")}</div>`) +
        `<div class="sec">STATEMENT</div>` + (S.ledger.length ? S.ledger.slice(0, 12).map(L => `<div class="led"><span>${esc(L.k)}</span><span><b class="${L.a >= 0 ? "g" : "r"}">${L.a >= 0 ? "+" : "−"}${money(Math.abs(L.a))}</b><small>bal ${money(L.b)}</small></span></div>`).join("") : `<div class="empty">No movements yet.</div>`);
    } else if (app === "stocks") {
      if (!sel) {
        h = `<div class="ttl">Stocks</div><div class="card"><small>PORTFOLIO</small><div class="big b">${money(PH.portfolioValue(S))}</div><small>Cash ${money(S.money)}</small></div>` +
          PH.TICKERS.map(t => { const hs = PH.priceHistory(t.id), p = S.sprice[t.id], ch = hs.length > 1 ? (hs[hs.length - 1] - hs[0]) / hs[0] : 0, held = S.shares[t.id] || 0;
            return `<button class="tick" data-tick="${t.id}"><span><b>${t.id}</b><small>${held ? held + " sh · " : ""}${esc(t.name)}</small></span><span class="sp">${spark(hs, 64, 24)}</span><span class="pr"><b>$${p.toFixed(2)}</b><small class="${ch >= 0 ? "g" : "r"}">${ch >= 0 ? "▲" : "▼"} ${Math.abs(ch * 100).toFixed(1)}%</small></span></button>`; }).join("");
      } else {
        const t = PH.TICKERS.find(x => x.id === sel), p = S.sprice[t.id], held = S.shares[t.id] || 0, hs = PH.priceHistory(t.id);
        const basis = PH.costBasis(S, t.id), pl = held * p - basis, ch = hs.length > 1 ? (hs[hs.length - 1] - hs[0]) / hs[0] : 0;
        h = `<div class="ttl"><button class="back" data-act="unsel">‹</button> ${t.id}</div><div class="card"><small>${esc(t.name)}</small><div class="big">$${p.toFixed(2)} <small class="${ch >= 0 ? "g" : "r"}">${ch >= 0 ? "▲" : "▼"} ${Math.abs(ch * 100).toFixed(1)}%</small></div>${spark(hs, 260, 70, true)}<small>You hold <b>${held}</b> · worth ${money(held * p)}</small>${held ? `<small>P/L <b class="${pl >= 0 ? "g" : "r"}">${pl >= 0 ? "+" : "−"}${money(Math.abs(pl))}</b> (paid ${money(basis)})</small>` : ""}</div>
          <div class="sec">BUY</div><div class="pills">${[1, 10, 50].map(n => `<button data-buy="${n}">Buy ${n}</button>`).join("")}<button data-buy="max">Max</button></div>
          <div class="sec">SELL</div><div class="pills">${[1, 10, 50].map(n => `<button data-sell="${n}">Sell ${n}</button>`).join("")}<button data-sell="all">All</button></div>
          <div class="sec">OR TYPE A SHARE COUNT</div><div class="compose"><input class="amt" inputmode="numeric" placeholder="e.g. 25" value="${esc(typedAmt)}"><button data-act="buyT">Buy</button><button data-act="sellT">Sell</button></div>`;
      }
    } else if (app === "jobs") {
      h = `<div class="ttl">Jobs</div>` + g.jobs.JOBS.map(J => `<button class="row" data-job="${J.id}"><b>${J.label}</b><small>${J.desc}</small></button>`).join("") +
        (g.jobs.active() ? `<button class="wide" data-act="cancelJob">Cancel current job</button>` : "");
    } else if (app === "heist") {
      const busy = g.heists.active();
      h = `<div class="ttl">Heists</div><div class="card"><small>Case a named landmark, stage a getaway car, crack the vault while the alarm screams, then LOSE the cops on the way to the drop — a clean getaway pays +45%.</small><small class="note">${S.mi < 12 ? "Unlocks after the story." : busy ? "You're on a job." : "Pick your approach:"}</small></div>
        <button class="row" data-heist="loud" ${S.mi < 12 || busy ? "disabled" : ""}><b>🔫 Loud</b><small>Bigger take · 4 stars the moment the alarm trips · fast vault</small></button>
        <button class="row" data-heist="quiet" ${S.mi < 12 || busy ? "disabled" : ""}><b>🤫 Quiet</b><small>Smaller take · only 2 stars · slower vault</small></button>`;
    } else if (app === "contacts") {
      h = `<div class="ttl">Contacts</div>
        <button class="row" data-act="askMarco"><b>📞 Marco</b><small>Ask what you should be doing</small></button>
        <button class="row" data-act="hire"><b>🤝 Hire Muscle</b><small>$1,500 — an armed ally who has your back</small></button>
        <button class="row" data-act="mech"><b>🔧 Mechanic</b><small>$500 — has a car dropped off next to you</small></button>`;
    }
    screen.innerHTML = h;
    screen.scrollTop = app === "msgs" ? screen.scrollHeight : screen.scrollTop;
    const inp = screen.querySelector("input.amt"); if (inp) inp.addEventListener("input", () => { typedAmt = inp.value.replace(/[^0-9]/g, ""); if (inp.value !== typedAmt) inp.value = typedAmt; });
    const pin = screen.querySelector("input.post"); if (pin) pin.addEventListener("input", () => { typedPost = pin.value; });
  }
  const parseTyped = what => { const n = parseInt(typedAmt, 10); if (!typedAmt) { err("Type an amount first."); return null; } if (!(n > 0)) { err("That isn't an amount you can " + what + "."); return null; } return n; };
  function dep(n) { if (S.money < n || n < 1) { err("Can't deposit " + money(n) + " — you've only got " + money(S.money) + " on you."); return; } PH.deposit(S, n); g.toast("🏦 Deposited " + money(n)); g.sound("blip", 0.5); g.save(); }
  function wd(n) { if (S.bank < n || n < 1) { err("Can't withdraw " + money(n) + " — your balance is " + money(S.bank) + "."); return; } PH.withdraw(S, n); g.toast("🏦 Withdrew " + money(n)); g.sound("blip", 0.5); g.save(); }
  function buy(n) { const t = sel, p = S.sprice[t]; if (!(n > 0) || !PH.buyShares(S, t, n)) { err("Can't buy " + n + " " + t + " — that's " + money(Math.ceil(p * n)) + " and you've got " + money(S.money) + "."); return; } g.toast("📈 Bought " + n + " " + t); g.sound("blip", 0.5); g.save(); }
  function sell(n) { const t = sel, held = S.shares[t] || 0; if (!(n > 0) || held < n) { err("You only hold " + held + " " + t + " — can't sell " + n + "."); return; } const got = PH.sellShares(S, t, n); g.toast("📉 Sold " + n + " " + t + " +" + money(got)); g.sound("cash", 0.5); g.save(); }
  function askMarco() {
    const o = g.objective(), F = g.focus();
    let where = "";
    if (o && o.x !== undefined) {
      const dx = o.x - F.x, dz = o.z - F.z, d = Math.hypot(dx, dz);
      const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
      where = d < 25 ? "You're right on top of it." : "About " + Math.round(d / 10) * 10 + "m " + dirs[((Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) % 8) + 8) % 8] + " — follow the yellow marker.";
    }
    threads.marco.push({ me: true, t: "What should I be doing?" });
    threads.marco.push({ me: false, t: (o && o.title ? "<b>" + esc(o.title) + "</b><br>" : "") + esc(o && o.text ? o.text : "Keep building, cuz. City's yours.") });
    if (where) threads.marco.push({ me: false, t: "📍 " + where });
    app = "msgs"; g.sound("blip", 0.6); render();
  }
  screen.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.go) { app = d.go; sel = null; typedAmt = ""; render(); return; }
    if (d.dep) { dep(d.dep === "all" ? Math.floor(S.money) : +d.dep); render(); return; }
    if (d.wd) { wd(d.wd === "all" ? Math.floor(S.bank) : +d.wd); render(); return; }
    if (d.term) { const a = +d.term; if (S.bank < a) err("Can't lock " + money(a) + " — your balance is " + money(S.bank) + ". Deposit more first."); else { PH.openTerm(S, a); g.toast("🏦 Locked " + money(a)); g.save(); } render(); return; }
    if (d.tick) { sel = d.tick; typedAmt = ""; render(); return; }
    if (d.buy) { buy(d.buy === "max" ? Math.floor(S.money / S.sprice[sel]) : +d.buy); render(); return; }
    if (d.sell) { sell(d.sell === "all" ? (S.shares[sel] || 0) : +d.sell); render(); return; }
    if (d.like) { PH.toggleLike(+d.like); render(); return; }
    if (d.job) { if (g.jobs.start(d.job)) show(false); return; }
    if (d.heist) { if (g.startHeist(d.heist)) show(false); return; }
    const a = d.act;
    if (a === "askMarco") askMarco();
    else if (a === "post") { const t = typedPost.trim(); if (!t) err("Write something first."); else { PH.pushUserPost(t); typedPost = ""; g.sound("blip", 0.5); } render(); }
    else if (a === "depT") { const n = parseTyped("deposit"); if (n) { dep(n); typedAmt = ""; } render(); }
    else if (a === "wdT") { const n = parseTyped("withdraw"); if (n) { wd(n); typedAmt = ""; } render(); }
    else if (a === "buyT") { const n = parseTyped("buy"); if (n) { buy(n); typedAmt = ""; } render(); }
    else if (a === "sellT") { const n = parseTyped("sell"); if (n) { sell(n); typedAmt = ""; } render(); }
    else if (a === "breakTerm") { const amt = PH.breakTerm(S); if (amt) g.toast("🏦 Term broken — " + money(amt) + " back, no interest"); g.save(); render(); }
    else if (a === "unsel") { sel = null; render(); }
    else if (a === "cancelJob") { g.jobs.cancel(); render(); }
    else if (a === "hire") { const m = g.hire(); if (m) err(m); else { g.toast("🤝 Your muscle is on the way"); show(false); } }
    else if (a === "mech") { const m = g.mechanic(); if (m) err(m); else { g.toast("🔧 Car dropped off next to you"); show(false); } }
  });

  let rerender = 0;
  function update(dt, snap) {
    PH.updateFeed(dt, snap);
    const tick = PH.bankTick(dt, S);
    if (tick && tick.matured) g.toast("🏦 Term deposit matured · +" + money(tick.gain));
    PH.stocksTick(dt, S);
    const n = PH.takeNotify();
    if (n && !open) { notif.innerHTML = "<b>🌴 " + esc(n.name) + "</b><br>" + esc(n.text); notif.classList.add("on"); notifT = 4.5; }
    if (notifT > 0) { notifT -= dt; if (notifT <= 0) notif.classList.remove("on"); }
    if (errT > 0) { errT -= dt; if (errT <= 0) errEl.classList.remove("on"); }
    const badge = PH.unread() + (threads.unread || 0);
    btn.querySelector("b").textContent = badge ? (badge > 9 ? "9+" : badge) : "";
    btn.querySelector("b").style.display = badge ? "" : "none";
    clk.textContent = g.clock();
    // live screens refresh a few times a second (prices tick, timers count) unless you're typing
    rerender -= dt;
    if (open && rerender <= 0 && !(document.activeElement && document.activeElement.tagName === "INPUT") && (app === "home" || app === "stocks" || app === "bank" || app === "gram")) { rerender = 1; render(); }
  }
  notif.addEventListener("click", () => { notif.classList.remove("on"); app = "gram"; show(true); });
  function vicText(t) { threads.vic.push(t); threads.unread = (threads.unread || 0) + 1; }
  return { update, show, isOpen: () => open, vicText, render, setApp: a => { app = a; render(); }, sel: v => { sel = v; } };
}
