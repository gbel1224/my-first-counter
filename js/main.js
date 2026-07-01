/* ============================================================
   Life Simulator — entry point.
   Wires the start menu, character creator, and life dashboard,
   and connects everything to the save system.
   ============================================================ */

import { setState, getState, ageUp } from "./state.js";
import * as store from "./storage.js";
import { startCreator } from "./characterCreator.js";
import { showScreen, renderDashboard, toast } from "./ui.js";

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
  const result = ageUp();
  store.save(s);
  renderDashboard();

  const c = s.character;
  if (!c.alive) {
    toast(`${c.firstName} has died at age ${c.age}`, "bad");
  }
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
  document.getElementById("saveBtn").onclick = saveNow;
  document.getElementById("menuBtn").onclick = quitToMenu;

  refreshStartMenu();
  showScreen("screen-start");
}

document.addEventListener("DOMContentLoaded", init);
