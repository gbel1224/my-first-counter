/* ============================================================
   UI helpers: screen switching, toasts, and rendering of the
   main life dashboard from game state.
   ============================================================ */

import { getState, findCountry, lifeStage, STAT_META } from "./state.js";
import { BACKGROUNDS, TIER_LABEL, UNIVERSITY } from "./data/gameData.js";
import {
  availableJobs, educationLabel, canEnrollUniversity,
} from "./career.js";
import {
  creditLabel, netWorth, totalDebt, maxLoanAmount, loanInterestRate,
} from "./banking.js";

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

  // Career + education status chips
  const jobChip = c.job
    ? `<span class="pill selected" style="cursor:default">${c.job.icon} ${c.job.title}</span>`
    : `<span class="pill" style="cursor:default">💼 Unemployed</span>`;
  const eduChip = c.education && c.education.enrolled
    ? `<span class="pill" style="cursor:default">🎓 University (Yr ${c.education.collegeYears + 1})</span>`
    : `<span class="pill" style="cursor:default">🎓 ${educationLabel(c.education ? c.education.level : "none")}</span>`;
  const creditChip = c.bank
    ? `<span class="pill" style="cursor:default">💳 ${creditLabel(c.bank.creditScore)} (${c.bank.creditScore})</span>`
    : "";
  document.getElementById("dashCareer").innerHTML = `${jobChip} ${eduChip} ${creditChip}`;

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

  // Disable activity buttons once the life has ended.
  document.querySelectorAll(".activity-btn").forEach((b) => (b.disabled = !c.alive));
}

/* ============================================================
   Modal system — a lightweight overlay used by activity panels.
   openModal(title, bodyHtml, onMount) returns a close() fn.
   ============================================================ */

export function openModal(title, bodyHtml, onMount) {
  closeModal();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal card" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h3>${title}</h3>
        <button class="modal-close" aria-label="Close">✕</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector(".modal-close").onclick = close;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); }
  });

  if (onMount) onMount(overlay.querySelector(".modal-body"), close);
  return close;
}

export function closeModal() {
  document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
}

/* ---------- Career panel ---------- */

export function openCareerPanel(actions) {
  const s = getState();
  const c = s.character;

  const render = (body) => {
    const jobs = availableJobs(s);
    const current = c.job
      ? `<div class="panel-note good">
           <strong>${c.job.icon} ${c.job.title}</strong><br>
           <span class="hint">Salary ${formatMoney(c.job.pay, c.countryCode)}/yr · ${c.job.years} yr(s) worked</span>
           <div class="mt"><button class="btn danger" data-quit>Quit Job</button></div>
         </div><hr class="divider" />`
      : `<p class="hint">You are currently unemployed.</p>`;

    const jobList = jobs.length
      ? jobs.map((j) => `
          <div class="job-row">
            <div>
              <div class="job-title">${j.icon} ${j.title}</div>
              <div class="hint">${formatMoney(j.pay, c.countryCode)}/yr · ${TIER_LABEL[j.tier]}${j.smarts ? ` · Smarts ${j.smarts}+` : ""}</div>
            </div>
            <button class="btn" data-apply="${j.id}" ${c.job && c.job.id === j.id ? "disabled" : ""}>
              ${c.job && c.job.id === j.id ? "Current" : "Apply"}
            </button>
          </div>`).join("")
      : `<p class="hint">No jobs available yet. Grow up, get educated, and boost your smarts to unlock opportunities.</p>`;

    body.innerHTML = `${current}<p class="section-title">Job Market</p>${jobList}`;

    body.querySelectorAll("[data-apply]").forEach((btn) => {
      btn.onclick = () => { actions.apply(btn.dataset.apply); render(body); };
    });
    const quit = body.querySelector("[data-quit]");
    if (quit) quit.onclick = () => { actions.quit(); render(body); };
  };

  openModal("💼 Career", "", render);
}

/* ---------- Education panel ---------- */

export function openEducationPanel(actions) {
  const s = getState();
  const c = s.character;

  const render = (body) => {
    const edu = c.education;
    let html = `<p class="panel-note">Current education: <strong>${educationLabel(edu.level)}</strong></p>`;

    if (edu.enrolled) {
      html += `
        <p class="hint">Enrolled in university — year ${edu.collegeYears + 1} of ${UNIVERSITY.years}.
        Tuition is ${formatMoney(UNIVERSITY.tuitionPerYear, c.countryCode)}/yr, paid each Age Up.</p>
        <button class="btn danger" data-drop>Drop Out</button>`;
    } else if (canEnrollUniversity(s)) {
      const fullCost = UNIVERSITY.tuitionPerYear * UNIVERSITY.years;
      html += `
        <p class="hint">A university degree unlocks professional careers (doctor, lawyer, developer…)
        and raises your smarts. It takes ${UNIVERSITY.years} years at
        ${formatMoney(UNIVERSITY.tuitionPerYear, c.countryCode)}/yr.</p>
        <div class="btn-row">
          <button class="btn accent" data-enroll>🎓 Enroll (pay tuition)</button>
          <button class="btn" data-studentloan>💳 Enroll with Student Loan</button>
        </div>
        <p class="hint mt">A student loan covers the full ${formatMoney(fullCost, c.countryCode)} degree so you can study now and pay later.</p>`;
    } else if (edu.level === "university") {
      html += `<p class="hint">You've earned your degree. Every professional path is open to you.</p>`;
    } else if (c.age < 18) {
      html += `<p class="hint">You're still in school. Graduate high school at 18 to unlock university.</p>`;
    } else {
      html += `<p class="hint">Finish high school to become eligible for university.</p>`;
    }

    body.innerHTML = html;
    const enroll = body.querySelector("[data-enroll]");
    if (enroll) enroll.onclick = () => { actions.enroll(); render(body); };
    const loanEnroll = body.querySelector("[data-studentloan]");
    if (loanEnroll) loanEnroll.onclick = () => { actions.enrollWithLoan(); render(body); };
    const drop = body.querySelector("[data-drop]");
    if (drop) drop.onclick = () => { actions.drop(); render(body); };
  };

  openModal("🎓 Education", "", render);
}

/* ---------- Banking panel ---------- */

export function openBankingPanel(actions) {
  const s = getState();
  const c = s.character;

  const render = (body) => {
    const b = c.bank;
    const rate = loanInterestRate(b.creditScore);
    const max = maxLoanAmount(c);

    const loanRows = b.loans.length
      ? b.loans.map((l) => `
          <div class="job-row">
            <div>
              <div class="job-title">${l.purpose}</div>
              <div class="hint">Balance ${formatMoney(l.balance, c.countryCode)} · ${(l.rate * 100).toFixed(1)}% APR · min ${formatMoney(l.minPayment, c.countryCode)}/yr</div>
            </div>
            <button class="btn" data-repay="${l.id}">Repay</button>
          </div>`).join("")
      : `<p class="hint">No active loans.</p>`;

    body.innerHTML = `
      <div class="bank-grid">
        <div class="bank-stat"><span>Cash</span><strong>${formatMoney(c.money, c.countryCode)}</strong></div>
        <div class="bank-stat"><span>Savings</span><strong>${formatMoney(b.savings, c.countryCode)}</strong></div>
        <div class="bank-stat"><span>Credit</span><strong>${b.creditScore} · ${creditLabel(b.creditScore)}</strong></div>
        <div class="bank-stat"><span>Net Worth</span><strong>${formatMoney(netWorth(c), c.countryCode)}</strong></div>
      </div>

      <p class="section-title mt">Savings (earns 3%/yr)</p>
      <div class="amount-row">
        <input type="number" id="saveAmt" min="1" placeholder="Amount" />
        <button class="btn" data-deposit>Deposit</button>
        <button class="btn ghost" data-withdraw>Withdraw</button>
      </div>

      <p class="section-title mt">Loans</p>
      ${loanRows}

      <p class="hint mt">Borrow up to <strong>${formatMoney(max, c.countryCode)}</strong> at ${(rate * 100).toFixed(1)}% APR (based on your credit &amp; income).</p>
      <div class="amount-row">
        <input type="number" id="loanAmt" min="1" placeholder="Amount" />
        <button class="btn gold" data-borrow ${max <= 0 ? "disabled" : ""}>Borrow</button>
      </div>
    `;

    const amt = (id) => Math.floor(Number(body.querySelector(id).value));
    body.querySelector("[data-deposit]").onclick = () => { actions.deposit(amt("#saveAmt")); render(body); };
    body.querySelector("[data-withdraw]").onclick = () => { actions.withdraw(amt("#saveAmt")); render(body); };
    const borrow = body.querySelector("[data-borrow]");
    if (borrow) borrow.onclick = () => { actions.borrow(amt("#loanAmt")); render(body); };
    body.querySelectorAll("[data-repay]").forEach((btn) => {
      btn.onclick = () => { actions.repay(btn.dataset.repay); render(body); };
    });
  };

  openModal("🏦 Bank", "", render);
}
