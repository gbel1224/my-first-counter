/* ============================================================
   Character Creator — a guided 3-step flow:
     1. Identity   (name, gender, avatar)
     2. Origin     (country, family background)
     3. Traits     (pick up to 2) + review
   Renders into #screen-create and calls onComplete(state).
   ============================================================ */

import {
  FIRST_NAMES, LAST_NAMES, COUNTRIES, AVATARS, BACKGROUNDS, TRAITS,
} from "./data/gameData.js";
import { createCharacter, pick, MAX_TRAITS } from "./state.js";
import { toast } from "./ui.js";

const STEPS = ["Identity", "Origin", "Traits"];

// Working draft while the player fills things out.
let draft;
let step;
let onCompleteCb;

function freshDraft() {
  return {
    firstName: "",
    lastName: pick(LAST_NAMES),
    gender: "male",
    avatar: AVATARS[0],
    countryCode: "US",
    backgroundId: "working",
    traits: [],
  };
}

export function startCreator(container, onComplete) {
  draft = freshDraft();
  step = 0;
  onCompleteCb = onComplete;
  // Give a sensible starting name so the field is never empty.
  draft.firstName = pick(FIRST_NAMES.male);
  render(container);
}

function render(container) {
  container.innerHTML = `
    <div class="brand" style="padding-top:1.4rem">
      <h1>Create Your Life</h1>
      <p>Every legend starts somewhere. Shape who you'll become.</p>
    </div>
    <div class="stepper">
      ${STEPS.map((_, i) =>
        `<div class="step-dot ${i === step ? "active" : ""} ${i < step ? "done" : ""}"></div>`
      ).join("")}
    </div>
    <div class="card" id="creatorBody"></div>
    <div class="btn-row mt" style="justify-content:space-between">
      <button class="btn ghost" id="backBtn">${step === 0 ? "Cancel" : "Back"}</button>
      <button class="btn" id="nextBtn">${step === STEPS.length - 1 ? "🚀 Start Life" : "Next"}</button>
    </div>
  `;

  renderStep(container.querySelector("#creatorBody"));

  container.querySelector("#backBtn").onclick = () => {
    if (step === 0) { onCompleteCb(null); return; }
    step--; render(container);
  };
  container.querySelector("#nextBtn").onclick = () => {
    if (!validateStep()) return;
    if (step === STEPS.length - 1) { finish(); return; }
    step++; render(container);
  };
}

function renderStep(body) {
  if (step === 0) return renderIdentity(body);
  if (step === 1) return renderOrigin(body);
  return renderTraits(body);
}

/* ---------- Step 1: Identity ---------- */

function renderIdentity(body) {
  body.innerHTML = `
    <p class="section-title">Who are you?</p>
    <div class="grid-2">
      <div class="field">
        <label for="firstName">First name</label>
        <input type="text" id="firstName" maxlength="18" value="${escapeHtml(draft.firstName)}" placeholder="First name" />
      </div>
      <div class="field">
        <label for="lastName">Last name</label>
        <input type="text" id="lastName" maxlength="18" value="${escapeHtml(draft.lastName)}" placeholder="Last name" />
      </div>
    </div>
    <button class="btn ghost" id="randomName" type="button">🎲 Random name</button>

    <hr class="divider" />

    <div class="field">
      <label>Gender</label>
      <div class="pills" id="genderPills">
        ${genderPill("male", "♂ Male")}
        ${genderPill("female", "♀ Female")}
        ${genderPill("neutral", "⚧ Non-binary")}
      </div>
    </div>

    <div class="field">
      <label>Choose a look</label>
      <div class="avatar-picker" id="avatarPicker">
        ${AVATARS.map((a) =>
          `<div class="avatar-choice ${a === draft.avatar ? "selected" : ""}" data-avatar="${a}">${a}</div>`
        ).join("")}
      </div>
    </div>
  `;

  const firstEl = body.querySelector("#firstName");
  const lastEl = body.querySelector("#lastName");
  firstEl.oninput = () => (draft.firstName = firstEl.value);
  lastEl.oninput = () => (draft.lastName = lastEl.value);

  body.querySelector("#randomName").onclick = () => {
    const pool = FIRST_NAMES[draft.gender] || FIRST_NAMES.neutral;
    draft.firstName = pick(pool);
    draft.lastName = pick(LAST_NAMES);
    firstEl.value = draft.firstName;
    lastEl.value = draft.lastName;
  };

  body.querySelector("#genderPills").onclick = (e) => {
    const pill = e.target.closest(".pill");
    if (!pill) return;
    draft.gender = pill.dataset.value;
    body.querySelectorAll("#genderPills .pill").forEach((p) =>
      p.classList.toggle("selected", p.dataset.value === draft.gender));
  };

  body.querySelector("#avatarPicker").onclick = (e) => {
    const choice = e.target.closest(".avatar-choice");
    if (!choice) return;
    draft.avatar = choice.dataset.avatar;
    body.querySelectorAll(".avatar-choice").forEach((c) =>
      c.classList.toggle("selected", c.dataset.avatar === draft.avatar));
  };
}

function genderPill(value, label) {
  return `<button type="button" class="pill ${draft.gender === value ? "selected" : ""}" data-value="${value}">${label}</button>`;
}

/* ---------- Step 2: Origin ---------- */

function renderOrigin(body) {
  body.innerHTML = `
    <p class="section-title">Where does your story begin?</p>
    <div class="field">
      <label for="country">Country of birth</label>
      <select id="country">
        ${COUNTRIES.map((c) =>
          `<option value="${c.code}" ${c.code === draft.countryCode ? "selected" : ""}>${c.flag} ${c.name}</option>`
        ).join("")}
      </select>
    </div>

    <p class="section-title mt">Family background</p>
    <div class="pills" id="bgPills" style="flex-direction:column;gap:0.6rem">
      ${BACKGROUNDS.map((b) => `
        <button type="button" class="pill ${b.id === draft.backgroundId ? "selected" : ""}"
          data-bg="${b.id}" style="border-radius:12px;text-align:left;justify-content:flex-start;width:100%;padding:0.8rem 1rem">
          <div>
            <div style="font-size:1.02rem">${b.icon} ${b.name}</div>
            <div class="hint" style="margin-top:0.2rem">${b.desc}</div>
          </div>
        </button>
      `).join("")}
    </div>
  `;

  body.querySelector("#country").onchange = (e) => (draft.countryCode = e.target.value);
  body.querySelector("#bgPills").onclick = (e) => {
    const pill = e.target.closest(".pill");
    if (!pill) return;
    draft.backgroundId = pill.dataset.bg;
    body.querySelectorAll("#bgPills .pill").forEach((p) =>
      p.classList.toggle("selected", p.dataset.bg === draft.backgroundId));
  };
}

/* ---------- Step 3: Traits + review ---------- */

function renderTraits(body) {
  const country = COUNTRIES.find((c) => c.code === draft.countryCode);
  const bg = BACKGROUNDS.find((b) => b.id === draft.backgroundId);

  body.innerHTML = `
    <p class="section-title">Pick your traits <span class="hint">(up to ${MAX_TRAITS})</span></p>
    <div class="pills" id="traitPills" style="flex-direction:column;gap:0.55rem">
      ${TRAITS.map((t) => traitRow(t)).join("")}
    </div>

    <hr class="divider" />

    <p class="section-title">Review</p>
    <div class="row" style="gap:1rem">
      <div class="avatar">${draft.avatar}</div>
      <div>
        <div style="font-size:1.2rem;font-weight:800">${escapeHtml(draft.firstName)} ${escapeHtml(draft.lastName)}</div>
        <div class="hint">${country.flag} ${country.name} · ${bg.icon} ${bg.name}</div>
      </div>
    </div>
  `;

  body.querySelector("#traitPills").onclick = (e) => {
    const pill = e.target.closest(".pill");
    if (!pill) return;
    const id = pill.dataset.trait;
    const idx = draft.traits.indexOf(id);
    if (idx >= 0) {
      draft.traits.splice(idx, 1);
    } else if (draft.traits.length < MAX_TRAITS) {
      draft.traits.push(id);
    } else {
      toast(`You can only pick ${MAX_TRAITS} traits`, "bad");
      return;
    }
    renderTraits(body); // re-render to update selected + disabled states
  };
}

function traitRow(t) {
  const selected = draft.traits.includes(t.id);
  const full = draft.traits.length >= MAX_TRAITS && !selected;
  return `
    <button type="button" class="pill ${selected ? "selected" : ""} ${full ? "disabled" : ""}"
      data-trait="${t.id}" style="border-radius:12px;text-align:left;justify-content:flex-start;width:100%;padding:0.7rem 1rem">
      <div>
        <div>${t.icon} ${t.name}</div>
        <div class="hint" style="margin-top:0.15rem">${t.desc}</div>
      </div>
    </button>`;
}

/* ---------- Validation + finish ---------- */

function validateStep() {
  if (step === 0) {
    draft.firstName = draft.firstName.trim();
    draft.lastName = draft.lastName.trim();
    if (!draft.firstName) { toast("Please enter a first name", "bad"); return false; }
    if (!draft.lastName) { toast("Please enter a last name", "bad"); return false; }
  }
  return true;
}

function finish() {
  const state = createCharacter(draft);
  onCompleteCb(state);
}

/* ---------- util ---------- */

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}
