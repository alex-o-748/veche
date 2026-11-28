#!/usr/bin/env node
// Faction Balance Simulator
// Runs N headless games with all AI players through the rules engine (src/game)
// and reports win rates & stats.
//
// Usage:
//   node simulate.js                         # 1000 games, standard rules (Glory + siege)
//   node simulate.js 3000                    # 3000 games
//   node simulate.js 3000 --classic          # the rules without Glory and the siege
//   node simulate.js 3000 --never-pay=Merchants      # one faction pays for nothing shared
//   node simulate.js 3000 --defence-only=Merchants   # one faction funds only defences
//   node simulate.js 3000 --merchant-vp=0.6          # try another Merchant VP multiplier
//   node simulate.js 3000 --glory=0.5                # try another Glory per coin
//   node simulate.js --check                 # replay the seeded games, compare to the snapshot
//   node simulate.js --record                # re-record the snapshot (after an intended rule change)
//   node simulate.js --check --engine=path/to/bundle.mjs  # check another build of the engine

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { playGame, seededGameRecord } from './scripts/simulation.js';

const args = process.argv.slice(2);
const flag = (name) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const enginePath = flag('engine') ? path.resolve(flag('engine')) : path.join(here, 'src/game/index.js');
const engineModule = await import(pathToFileURL(enginePath).href);
// A worker bundle exposes the engine as `engine`; src/game exports it directly
const engine = { ...(engineModule.engine || engineModule) };

// ---------------------------------------------------------------------------
// Snapshot check: seeded games must replay exactly as recorded
// ---------------------------------------------------------------------------

const SNAPSHOT_FILE = path.join(here, 'scripts/snapshot.json');
const SNAPSHOT_GAMES = [
  { seed: 1, ruleset: 'standard' },
  { seed: 2, ruleset: 'standard' },
  { seed: 3, ruleset: 'classic' },
];

if (flag('check') || flag('record')) {
  const records = SNAPSHOT_GAMES.map(({ seed, ruleset }) => seededGameRecord(engine, seed, { ruleset }));

  if (flag('record')) {
    writeFileSync(SNAPSHOT_FILE, JSON.stringify(records, null, 1) + '\n');
    console.log(`Recorded ${records.length} seeded games to ${path.relative(process.cwd(), SNAPSHOT_FILE)}`);
    process.exit(0);
  }

  const expected = JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8'));
  let failed = false;
  records.forEach((record, i) => {
    const want = expected[i];
    const label = `seed ${record.seed} (${record.ruleset})`;
    if (JSON.stringify(record) === JSON.stringify(want)) {
      console.log(`ok    ${label}: ${record.result.winner} wins after ${record.turns.length} turns`);
      return;
    }
    failed = true;
    const turn = record.turns.findIndex((t, n) => JSON.stringify(t) !== JSON.stringify(want?.turns?.[n]));
    console.log(`FAIL  ${label}: differs from the snapshot${turn >= 0 ? ` at turn ${turn + 1}` : ' in the result'}`);
    if (turn >= 0) {
      console.log('  expected:', JSON.stringify(want?.turns?.[turn]));
      console.log('  actual:  ', JSON.stringify(record.turns[turn]));
    }
  });
  if (failed) {
    console.log('\nThe rules changed. If that was intended, run `node simulate.js --record`.');
    process.exit(1);
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Balance run
// ---------------------------------------------------------------------------

const NUM_GAMES = parseInt(args.find((a) => /^\d+$/.test(a)), 10) || 1000;
const ruleset = flag('classic') ? 'classic' : 'standard';
const policies = {};
if (flag('never-pay')) policies[flag('never-pay')] = 'never_pay';
if (flag('defence-only')) policies[flag('defence-only')] = 'defence_only';

// Tuning knobs: the engine reads these constants through live ES module bindings,
// so overriding them needs the engine's own setters. They are plain exports, so we
// patch them through a small hook in state.js when present.
if (flag('merchant-vp') || flag('glory')) {
  if (!engine.setTuning) {
    console.error('This engine build has no setTuning(): tuning flags are not supported.');
    process.exit(1);
  }
  engine.setTuning({
    ...(flag('merchant-vp') ? { merchantVpMultiplier: parseFloat(flag('merchant-vp')) } : {}),
    ...(flag('glory') ? { gloryPerCoin: parseFloat(flag('glory')) } : {}),
  });
}

const stats = Object.fromEntries(
  ['Nobles', 'Merchants', 'Commoners'].map((f) => [f, { wins: 0, totalVP: 0, totalMoney: 0, totalGlory: 0 }])
);
let pskovFell = 0;
const startTime = Date.now();

for (let i = 0; i < NUM_GAMES; i++) {
  let state = playGame(engine, { ruleset, policies });
  if (!state.gameOver && state.turn <= engine.MAX_TURNS) state = { ...state, turn: engine.MAX_TURNS + 1 };
  const result = engine.getGameResult(state);

  for (const ranking of result.rankings) {
    stats[ranking.faction].totalVP += ranking.victoryPoints;
    stats[ranking.faction].totalMoney += ranking.money;
    stats[ranking.faction].totalGlory += ranking.breakdown.glory;
  }

  // When Pskov falls, everyone loses
  if (result.gameOver) pskovFell++;
  else stats[result.winner.faction].wins++;
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
const pct = (n) => ((n / NUM_GAMES) * 100).toFixed(1) + '%';

const setup = [
  ruleset,
  ...Object.entries(policies).map(([f, p]) => `${f}: ${p.replace('_', ' ')}`),
  flag('merchant-vp') && `merchant VP ×${flag('merchant-vp')}`,
  flag('glory') && `glory ${flag('glory')}/coin`,
].filter(Boolean).join(', ');

console.log(`\nFaction Balance Simulation (${NUM_GAMES} games, ${setup}, ${elapsed}s)`);
console.log('='.repeat(64));
console.log('Faction'.padEnd(14) + 'Wins'.padStart(6) + 'Win%'.padStart(8) + 'Avg VP'.padStart(9) + 'Avg Glory'.padStart(11) + 'Avg Money'.padStart(11));
console.log('-'.repeat(64));
for (const faction of Object.keys(stats)) {
  const s = stats[faction];
  console.log(
    faction.padEnd(14) +
      String(s.wins).padStart(6) +
      pct(s.wins).padStart(8) +
      (s.totalVP / NUM_GAMES).toFixed(1).padStart(9) +
      (s.totalGlory / NUM_GAMES).toFixed(1).padStart(11) +
      (s.totalMoney / NUM_GAMES).toFixed(1).padStart(11)
  );
}
console.log('-'.repeat(64));
console.log(`Pskov fell: ${pskovFell}/${NUM_GAMES} (${pct(pskovFell)}) — everyone loses`);
