/* ============================================================
   Life Simulator — entry point.
   Wires the start menu, character creator, and life dashboard,
   and connects everything to the save system.
   ============================================================ */

import { setState, getState, ageUp } from "./state.js";
import * as store from "./storage.js";
import { startCreator } from "./characterCreator.js";
import {
  showScreen, renderDashboard, toast,
  openCareerPanel, openEducationPanel, openBankingPanel,
} from "./ui.js";
import * as career from "./career.js";
import * as bank from "./banking.js";
import { UNIVERSITY } from "./data/gameData.js";

/* ---------- Start menu ---------- */

function refreshStartMenu() {
  const continueBtn = document.getElementById("continueBtn");
  const has = store.hasSave();
  continueBtn.disabled = !has;
  continueBtn.classList.toggle("ghost", !has);

  const info = document.getElementById("saveInfo");
  if (has) {
    const s = store.load();
    if (s && s.character) {
      const c = s.character;
      info.textContent = `Saved life: ${c.firstName} ${c.lastName}, age ${c.age}`;
    }
  } else {
    info.textContent = "No saved life yet — start a new one!";
  }
}

/* ---------- Flow: new life ---------- */

function newLife() {
  if (store.hasSave() &&
      !confirm("Starting a new life will overwrite your current save. Continue?")) {
    return;
  }
  showScreen("screen-create");
  const container = document.getElementById("screen-create");
  startCreator(container, (state) => {
    if (!state) { // cancelled
      showScreen("screen-start");
      return;
    }
    setState(state);
    store.save(state);
    enterGame();
  });
}

/* ---------- Flow: continue ---------- */

function continueLife() {
  const s = store.load();
  if (!s) { toast("No save found", "bad"); return; }
  career.ensureCareerFields(s); // backfill fields for older saves
  bank.ensureBankFields(s);
  setState(s);
  enterGame();
}

/* ---------- Enter the running game ---------- */

function enterGame() {
  showScreen("screen-game");
  renderDashboard();
}

/* ---------- Dashboard actions ---------- */

function onAgeUp() {
  const s = getState();
  if (!s || !s.character.alive) return;
  ageUp();
  career.applyYear(s); // education progress + income for the new year
  bank.applyYear(s);   // savings interest, loan payments, credit drift
  store.save(s);
  renderDashboard();

  const c = s.character;
  if (!c.alive) {
    toast(`${c.firstName} has died at age ${c.age}`, "bad");
  }
}

/* ---------- Activity panels ---------- */

function openCareer() {
  const s = getState();
  if (!s || !s.character.alive) return;
  openCareerPanel({
    apply: (jobId) => {
      const r = career.applyForJob(s, jobId);
      toast(r.msg, r.ok ? "good" : "bad");
      store.save(s);
      renderDashboard();
    },
    quit: () => {
      const r = career.quitJob(s);
      toast(r.msg, r.ok ? "good" : "bad");
      store.save(s);
      renderDashboard();
    },
  });
}

function openEducation() {
  const s = getState();
  if (!s || !s.character.alive) return;
  openEducationPanel({
    enroll: () => {
      const r = career.enrollUniversity(s);
      toast(r.msg, r.ok ? "good" : "bad");
      store.save(s);
      renderDashboard();
    },
    enrollWithLoan: () => {
      // Take a student loan covering the full degree, then enroll.
      const cost = UNIVERSITY.tuitionPerYear * UNIVERSITY.years;
      const loanRes = bank.takeLoan(s, cost, "Student Loan", true);
      if (!loanRes.ok) { toast(loanRes.msg, "bad"); return; }
      const r = career.enrollUniversity(s);
      toast(r.ok ? "Student loan funded — enrolled!" : r.msg, r.ok ? "good" : "bad");
      store.save(s);
      renderDashboard();
    },
    drop: () => {
      const r = career.dropOut(s);
      toast(r.msg, r.ok ? "good" : "bad");
      store.save(s);
      renderDashboard();
    },
  });
}

function openBanking() {
  const s = getState();
  if (!s || !s.character.alive) return;
  const act = (fn) => (...args) => {
    const r = fn(...args);
    toast(r.msg, r.ok ? "good" : "bad");
    store.save(s);
    renderDashboard();
  };
  openBankingPanel({
    deposit: act((amt) => bank.deposit(s, amt)),
    withdraw: act((amt) => bank.withdraw(s, amt)),
    borrow: act((amt) => bank.takeLoan(s, amt)),
    repay: act((loanId) => bank.repayLoan(s, loanId)),
  });
}

function saveNow() {
  const s = getState();
  if (!s) return;
  if (store.save(s)) toast("Game saved ✓", "good");
  else toast("Save failed", "bad");
}

function quitToMenu() {
  const s = getState();
  if (s) store.save(s);
  refreshStartMenu();
  showScreen("screen-start");
}

/* ---------- Wire up ---------- */

function init() {
  document.getElementById("newLifeBtn").onclick = newLife;
  document.getElementById("continueBtn").onclick = continueLife;

  document.getElementById("ageUpBtn").onclick = onAgeUp;
  document.getElementById("careerActBtn").onclick = openCareer;
  document.getElementById("educationActBtn").onclick = openEducation;
  document.getElementById("bankActBtn").onclick = openBanking;
  document.getElementById("saveBtn").onclick = saveNow;
  document.getElementById("menuBtn").onclick = quitToMenu;

  refreshStartMenu();
  showScreen("screen-start");
}

document.addEventListener("DOMContentLoaded", init);
