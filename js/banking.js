/* ============================================================
   Banking system: savings (with interest), loans, and a credit
   score that reacts to financial behavior. Pure logic — called
   once per year by the game loop (applyYear) and by the UI for
   player actions (deposit, withdraw, borrow, repay).
   Depends only on state.js — no cycle with career.js.
   ============================================================ */

import { addLog } from "./state.js";

const CREDIT_MIN = 300;
const CREDIT_MAX = 850;
const SAVINGS_RATE = 0.03;   // annual interest on savings
const LOAN_TERM = 10;        // years used to size the minimum payment

const clampCredit = (n) => Math.max(CREDIT_MIN, Math.min(CREDIT_MAX, Math.round(n)));

/* Backfill bank fields for fresh or pre-banking saves. */
export function ensureBankFields(state) {
  const c = state.character;
  if (!c.bank) c.bank = { savings: 0, loans: [], creditScore: 600 };
  if (!Array.isArray(c.bank.loans)) c.bank.loans = [];
  if (typeof c.bank.savings !== "number") c.bank.savings = 0;
  if (typeof c.bank.creditScore !== "number") c.bank.creditScore = 600;
  return state;
}

export function creditLabel(score) {
  if (score >= 800) return "Exceptional";
  if (score >= 740) return "Very Good";
  if (score >= 670) return "Good";
  if (score >= 580) return "Fair";
  return "Poor";
}

export function totalDebt(c) {
  return c.bank.loans.reduce((s, l) => s + l.balance, 0);
}

export function netWorth(c) {
  return Math.round(c.money + c.bank.savings - totalDebt(c));
}

/* Better credit → lower interest rate. */
export function loanInterestRate(score) {
  return Math.max(0.04, Math.min(0.22, 0.18 - (score - 500) / 3000));
}

/* How much the player can borrow right now (income + credit driven). */
export function maxLoanAmount(c) {
  const income = c.job ? c.job.pay : 0;
  const base = income * 3 + 6000;
  const scaled = base * (c.bank.creditScore / 650);
  return Math.max(0, Math.round(scaled - totalDebt(c)));
}

/* ---------- Shared money helpers (used by other systems too) ---------- */

export function canAfford(c, amount) {
  return c.money + c.bank.savings >= amount;
}

/* Draw an amount from cash first, then savings. Assumes affordability
   was checked; returns the amount actually drawn. */
export function spend(state, amount) {
  const c = state.character;
  if (amount <= 0) return 0;
  let remaining = amount;
  const fromCash = Math.min(c.money, remaining);
  c.money -= fromCash; remaining -= fromCash;
  if (remaining > 0) {
    const fromSavings = Math.min(c.bank.savings, remaining);
    c.bank.savings -= fromSavings; remaining -= fromSavings;
  }
  return amount - remaining;
}

/* ---------- Player actions ---------- */

export function deposit(state, amount) {
  const c = state.character;
  amount = Math.floor(amount);
  if (!amount || amount <= 0) return { ok: false, msg: "Enter a valid amount." };
  if (amount > c.money) return { ok: false, msg: "You don't have that much cash." };
  c.money -= amount; c.bank.savings += amount;
  return { ok: true, msg: `Deposited ${amount.toLocaleString()} into savings.` };
}

export function withdraw(state, amount) {
  const c = state.character;
  amount = Math.floor(amount);
  if (!amount || amount <= 0) return { ok: false, msg: "Enter a valid amount." };
  if (amount > c.bank.savings) return { ok: false, msg: "Not enough in savings." };
  c.bank.savings -= amount; c.money += amount;
  return { ok: true, msg: `Withdrew ${amount.toLocaleString()} to cash.` };
}

export function takeLoan(state, amount, purpose = "Personal Loan", ignoreCap = false) {
  const c = state.character;
  amount = Math.floor(amount);
  if (!amount || amount <= 0) return { ok: false, msg: "Enter a valid amount." };
  if (!ignoreCap && amount > maxLoanAmount(c)) {
    return { ok: false, msg: `You can borrow at most ${maxLoanAmount(c).toLocaleString()} right now.` };
  }
  const rate = loanInterestRate(c.bank.creditScore);
  const loan = {
    id: "loan-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
    purpose,
    original: amount,
    balance: amount,
    rate,
    minPayment: Math.max(1, Math.round(amount / LOAN_TERM)),
    // Student loans defer payments until you finish school.
    deferInSchool: purpose === "Student Loan",
  };
  c.bank.loans.push(loan);
  c.money += amount;
  addLog("event", `You took out a ${purpose.toLowerCase()} of ${amount.toLocaleString()} at ${(rate * 100).toFixed(1)}% APR.`);
  return { ok: true, msg: `Loan approved: +${amount.toLocaleString()} cash.`, loan };
}

export function repayLoan(state, loanId) {
  const c = state.character;
  const loan = c.bank.loans.find((l) => l.id === loanId);
  if (!loan) return { ok: false, msg: "Loan not found." };
  if (c.money <= 0) return { ok: false, msg: "You have no cash to repay with." };
  const pay = Math.min(loan.balance, c.money);
  c.money -= pay; loan.balance -= pay;
  let msg = `Repaid ${pay.toLocaleString()} toward your ${loan.purpose.toLowerCase()}.`;
  if (loan.balance <= 0.5) {
    c.bank.loans = c.bank.loans.filter((l) => l.id !== loan.id);
    c.bank.creditScore = clampCredit(c.bank.creditScore + 20);
    addLog("good", `You fully paid off your ${loan.purpose.toLowerCase()}! Credit improved.`);
    msg += " Loan cleared!";
  }
  return { ok: true, msg };
}

/* ---------- Yearly processing (called by the game loop) ---------- */

export function applyYear(state) {
  const c = state.character;
  if (!c.alive) return;

  // Interest on savings.
  if (c.bank.savings > 0) {
    c.bank.savings += Math.round(c.bank.savings * SAVINGS_RATE);
  }

  let missedAny = false;
  let paidAny = false;

  const inSchool = c.education && c.education.enrolled;

  for (const loan of [...c.bank.loans]) {
    loan.balance = Math.round(loan.balance * (1 + loan.rate)); // accrue interest

    // In-school deferment: interest still accrues, but no payment is due
    // and there's no missed-payment penalty while you study.
    if (loan.deferInSchool && inSchool) continue;

    // First year out of school: remind the player payments have started.
    if (loan.deferInSchool && !loan.repaymentStarted) {
      loan.repaymentStarted = true;
      addLog("event", "Your student loan repayment period has begun — time to earn.");
    }

    const due = Math.min(loan.minPayment, loan.balance);

    if (canAfford(c, due)) {
      spend(state, due);
      loan.balance -= due;
      paidAny = true;
      if (loan.balance <= 0.5) {
        c.bank.loans = c.bank.loans.filter((l) => l.id !== loan.id);
        c.bank.creditScore = clampCredit(c.bank.creditScore + 15);
        addLog("good", `You finished paying off your ${loan.purpose.toLowerCase()}.`);
      }
    } else {
      missedAny = true;
    }
  }

  // Credit score drifts based on behavior.
  let delta = 0;
  if (paidAny) delta += 6;
  if (missedAny) { delta -= 40; addLog("bad", "You missed a loan payment — your credit score took a hit."); }
  if (c.bank.savings > 5000) delta += 3;
  if (c.bank.loans.length === 0 && !missedAny) delta += 2;
  if (delta) c.bank.creditScore = clampCredit(c.bank.creditScore + delta);
}
