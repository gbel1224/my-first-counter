/* Headless bot-vs-bot design check (brief §7):
   a bot that never retreats must LOSE to one that does (<35% win rate).
   Usage: npm run sim [-- matches=200 seed=1] */
import { CONFIG } from '../src/config.js';
import { createBus, EV } from '../src/core/events.js';
import { createSim } from '../src/core/sim.js';
import { createBotBrain } from '../src/core/bots.js';
import { mulberry32 } from '../src/core/rng.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')));
const MATCHES = +(args.matches ?? 200);
const BASE_SEED = +(args.seed ?? 1);

function runMatch(seed) {
  const bus = createBus();
  const brainRngA = mulberry32(seed * 7 + 1);
  const brainRngB = mulberry32(seed * 7 + 2);
  const matchConfig = {
    seed,
    countdown: 0,
    slots: [
      { name: 'NEVER_RETREAT', isBot: true, brain: createBotBrain(brainRngA, { retreat: false, difficulty: 1.0 }) },
      { name: 'RETREATER', isBot: true, brain: createBotBrain(brainRngB, { retreat: true, difficulty: 1.0 }) },
    ],
    scoreLimit: CONFIG.scoreLimit,
    timeLimit: CONFIG.timeLimit,
  };
  const sim = createSim(matchConfig, bus);
  let result = null;
  bus.on(EV.MATCH_END, e => { result = e; });
  const maxTicks = (CONFIG.timeLimit + 5) * CONFIG.tickRate;
  for (let t = 0; t < maxTicks && !result; t++) sim.step();
  return result;
}

let winsA = 0, winsB = 0, draws = 0, totalA = 0, totalB = 0;
const t0 = Date.now();
for (let i = 0; i < MATCHES; i++) {
  const r = runMatch(BASE_SEED + i * 13);
  if (!r) { draws++; continue; }
  const a = r.scores[0], b = r.scores[1];
  totalA += a.score; totalB += b.score;
  if (r.winner === 0) winsA++; else if (r.winner === 1) winsB++; else draws++;
}
const rate = (winsA / MATCHES * 100);
console.log(`matches=${MATCHES} | never-retreat wins: ${winsA} (${rate.toFixed(1)}%) | retreat wins: ${winsB} | draws: ${draws}`);
console.log(`avg score — never-retreat: ${(totalA / MATCHES).toFixed(1)}, retreat: ${(totalB / MATCHES).toFixed(1)}`);
console.log(`elapsed ${(Date.now() - t0) / 1000}s`);
console.log(rate < 35 ? 'PASS: shield-dance core loop validated (<35%)' : 'FAIL: tune CONFIG shield/regen numbers');
process.exit(rate < 35 ? 0 : 1);
