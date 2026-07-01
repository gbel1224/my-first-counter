/* ============================================================
   Career system: education progression, job market, income.
   Called once per year by the game loop (applyYear) and by the
   UI for player actions (enroll, apply, quit).
   No DOM here — pure logic, driven by the shared game state.
   ============================================================ */

import { addLog, clamp, randInt } from "./state.js";
import { canAfford, spend } from "./banking.js";
import {
  JOBS, EDUCATION_RANK, EDUCATION_LABEL, UNIVERSITY,
} from "./data/gameData.js";

/* Backfill career fields for fresh or pre-career saves. */
export function ensureCareerFields(state) {
  const c = state.character;
  if (!c.education) c.education = { level: "none", enrolled: false, collegeYears: 0 };
  if (c.job === undefined) c.job = null;
  return state;
}

export function educationLabel(level) {
  return EDUCATION_LABEL[level] || EDUCATION_LABEL.none;
}

/* Meets the diploma + smarts + age bar for a given job? */
export function meetsRequirements(c, job) {
  return (
    c.age >= job.minAge &&
    EDUCATION_RANK[c.education.level] >= EDUCATION_RANK[job.edu] &&
    c.stats.smarts >= job.smarts
  );
}

/* Jobs the character is currently qualified to apply for. */
export function availableJobs(state) {
  const c = state.character;
  return JOBS.filter((j) => meetsRequirements(c, j));
}

/* ---------- Player actions ---------- */

export function canEnrollUniversity(state) {
  const c = state.character;
  return (
    c.education.level === "highschool" &&
    !c.education.enrolled &&
    c.age >= 18
  );
}

export function enrollUniversity(state) {
  const c = state.character;
  if (!canEnrollUniversity(state)) {
    return { ok: false, msg: "You can't enroll right now." };
  }
  if (!canAfford(c, UNIVERSITY.tuitionPerYear)) {
    return { ok: false, msg: `You need at least ${UNIVERSITY.tuitionPerYear.toLocaleString()} for the first year's tuition — try a student loan.` };
  }
  c.education.enrolled = true;
  c.education.collegeYears = 0;
  addLog("good", "You enrolled in university. Time to hit the books!");
  return { ok: true, msg: "Enrolled in university!" };
}

export function dropOut(state) {
  const c = state.character;
  if (!c.education.enrolled) return { ok: false, msg: "You're not enrolled." };
  c.education.enrolled = false;
  c.education.collegeYears = 0;
  addLog("bad", "You dropped out of university.");
  return { ok: true, msg: "You dropped out." };
}

export function applyForJob(state, jobId) {
  const c = state.character;
  const job = JOBS.find((j) => j.id === jobId);
  if (!job) return { ok: false, msg: "That job no longer exists." };
  if (!meetsRequirements(c, job)) {
    return { ok: false, msg: "You don't meet the requirements for that job." };
  }

  // Interview success scales with smarts & looks; qualified applicants
  // usually get hired, but not always — that's part of the fun.
  const chance = Math.min(0.95, 0.6 + c.stats.smarts / 250 + c.stats.looks / 500);
  if (Math.random() > chance) {
    addLog("bad", `You interviewed for ${job.title} but didn't get an offer.`);
    return { ok: false, msg: "You didn't get the job. Try again next year." };
  }

  c.job = { id: job.id, title: job.title, icon: job.icon, pay: job.pay, years: 0 };
  c.stats.happiness = clamp(c.stats.happiness + 4);
  addLog("good", `You were hired as a ${job.title}! Salary: ${job.pay.toLocaleString()}/yr.`);
  return { ok: true, msg: `Hired as ${job.title}!` };
}

export function quitJob(state) {
  const c = state.character;
  if (!c.job) return { ok: false, msg: "You don't have a job." };
  const title = c.job.title;
  c.job = null;
  c.stats.happiness = clamp(c.stats.happiness + 2);
  addLog("event", `You quit your job as a ${title}.`);
  return { ok: true, msg: `You quit being a ${title}.` };
}

/* ---------- Yearly processing (called by the game loop) ---------- */

export function applyYear(state) {
  const c = state.character;
  if (!c.alive) return;

  processEducation(c);
  processIncome(c);
}

function processEducation(c) {
  const edu = c.education;

  // Auto graduate high school at 18.
  if (c.age === 18 && edu.level === "none" && !edu.enrolled) {
    edu.level = "highschool";
    c.stats.smarts = clamp(c.stats.smarts + 3);
    addLog("good", "You graduated from high school! 🎓");
  }

  // Progress through university if enrolled.
  if (edu.enrolled) {
    if (!canAfford(c, UNIVERSITY.tuitionPerYear)) {
      edu.enrolled = false;
      edu.collegeYears = 0;
      addLog("bad", "You couldn't afford tuition and had to drop out of university.");
      return;
    }
    spend({ character: c }, UNIVERSITY.tuitionPerYear);
    c.stats.smarts = clamp(c.stats.smarts + UNIVERSITY.smartsPerYear);
    edu.collegeYears += 1;

    if (edu.collegeYears >= UNIVERSITY.years) {
      edu.enrolled = false;
      edu.level = "university";
      c.stats.happiness = clamp(c.stats.happiness + 8);
      addLog("good", "You earned your university degree! 🎓🎓");
    } else {
      addLog("event", `University year ${edu.collegeYears} done. Tuition paid.`);
    }
  }
}

function processIncome(c) {
  if (!c.job) return;

  c.money += c.job.pay;
  c.job.years += 1;
  c.stats.smarts = clamp(c.stats.smarts + 1); // on-the-job experience

  // Occasional raise for loyalty/experience.
  if (Math.random() < 0.25) {
    const bump = randInt(3, 9);
    const raise = Math.round(c.job.pay * (bump / 100));
    c.job.pay += raise;
    addLog("good", `You got a ${bump}% raise! New salary: ${c.job.pay.toLocaleString()}/yr.`);
  }

  // Retirement prompt is future work; for now seniors may retire via quitting.
}
