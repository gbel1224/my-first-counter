/* ============================================================
   UI helpers: screen switching, toasts, and rendering of the
   main life dashboard from game state.
   ============================================================ */

import { getState, findCountry, lifeStage, STAT_META } from "./state.js";
import { BACKGROUNDS } from "./data/gameData.js";

/* ---------- Screen manager ---------- */

export function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------- Toasts ---------- */

let toastWrap;
export function toast(text, tone = "") {
  if (!toastWrap) {
    toastWrap = document.createElement("div");
    toastWrap.className = "toast-wrap";
    document.body.appendChild(toastWrap);
  }
  const el = document.createElement("div");
  el.className = `toast ${tone}`;
  el.textContent = text;
  toastWrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .3s, transform .3s";
    el.style.opacity = "0";
    el.style.transform = "translateY(10px)";
    setTimeout(() => el.remove(), 320);
  }, 2600);
}

/* ---------- Money formatting ---------- */

export function formatMoney(amount, countryCode) {
  const country = findCountry(countryCode);
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  return `${sign}${country.currency}${abs.toLocaleString()}`;
}

/* ---------- Stat bar ---------- */

function statBar(meta, value) {
  return `
    <div class="stat">
      <div class="stat-head">
        <span class="label">${meta.icon} ${meta.label}</span>
        <span class="value">${Math.round(value)}</span>
      </div>
      <div class="bar ${meta.key}"><span style="width:${value}%"></span></div>
    </div>`;
}

/* ---------- Dashboard render ---------- */

export function renderDashboard() {
  const s = getState();
  if (!s) return;
  const c = s.character;
  const country = findCountry(c.countryCode);
  const bg = BACKGROUNDS.find((b) => b.id === c.background);

  // Header
  document.getElementById("dashAvatar").textContent = c.avatar;
  document.getElementById("dashName").textContent = `${c.firstName} ${c.lastName}`;
  document.getElementById("dashSub").innerHTML =
    `${country.flag} ${country.name} · Age ${c.age} · ${lifeStage(c.age)}`;
  document.getElementById("dashMoney").textContent = formatMoney(c.money, c.countryCode);

  // Stats
  document.getElementById("dashStats").innerHTML =
    STAT_META.map((m) => statBar(m, c.stats[m.key])).join("");

  // Traits + background chip line
  const traitChips = c.traits.length
    ? c.traits.map((t) => `<span class="pill selected" style="cursor:default">${t}</span>`).join(" ")
    : `<span class="hint">No special traits</span>`;
  document.getElementById("dashTraits").innerHTML =
    `<span class="pill" style="cursor:default">${bg ? bg.icon + " " + bg.name : ""}</span> ${traitChips}`;

  // Life log — newest first
  const logEl = document.getElementById("dashLog");
  logEl.innerHTML = [...s.log].reverse().map((entry) => `
    <div class="log-entry ${entry.type}">
      <div class="age-tag">Age ${entry.age}</div>
      ${entry.text}
    </div>`).join("");

  // Age-up button state reflects life/death
  const ageBtn = document.getElementById("ageUpBtn");
  if (!c.alive) {
    ageBtn.disabled = true;
    ageBtn.textContent = "💀 Life Ended";
  } else {
    ageBtn.disabled = false;
    ageBtn.textContent = "🎂 Age Up (+1 Year)";
  }
}
