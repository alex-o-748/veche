#!/usr/bin/env node
// Faction Balance Simulator
// Runs N headless games with all AI players and reports win rates & stats.
//
// Usage:
//   node simulate.js          # 1000 games (default)
//   node simulate.js 500      # 500 games

import { createInitialGameState, PHASES } from './src/game/state.js';
import { applyAction, ActionTypes, nextPhase, getGameResult } from './src/game/actions.js';
import { decideConstruction, decideEventVote, decideAttackVote, decideFortressVote } from './src/game/ai.js';
import { getValidRepublicAttackTargets, getRegionsForFortress } from './src/game/regions.js';

const NUM_GAMES = parseInt(process.argv[2], 10) || 1000;

// ---------------------------------------------------------------------------
// Headless game loop
// ---------------------------------------------------------------------------

function simulateGame() {
  let state = createInitialGameState();

  // The game starts on phase 'resources' at turn 1.
  // Phase order: resources → construction → events → veche → (next turn) resources …
  // nextPhase() handles income calc when *leaving* resources, draws event when
  // *entering* events, and bumps the turn counter when wrapping from veche→resources.

  while (state.turn <= 20 && !state.gameOver) {
    // --- RESOURCES phase: just advance past it (nextPhase computes income) ---
    state = nextPhase(state); // resources → construction

    // --- CONSTRUCTION phase ---
    for (let p = 0; p < 3; p++) {
      const decision = decideConstruction(state, p);

      // Select region
      if (decision.regionName) {
        state = applyAction(state, { type: ActionTypes.SELECT_REGION, regionName: decision.regionName }).newState;
      }

      // Build
      if (decision.buildingType) {
        state = applyAction(state, { type: ActionTypes.BUILD_BUILDING, buildingType: decision.buildingType }).newState;
      }

      // Equipment
      if (decision.equipmentType) {
        state = applyAction(state, { type: ActionTypes.BUY_EQUIPMENT, item: decision.equipmentType }).newState;
      }

      // Expedition
      if (decision.sendExpedition) {
        const result = applyAction(state, { type: ActionTypes.SEND_EXPEDITION });
        state = result.newState;
      }

      // Advance currentPlayer so the next AI sees correct index
      state = applyAction(state, { type: ActionTypes.NEXT_PLAYER }).newState;
    }

    state = nextPhase(state); // construction → events

    // --- EVENTS phase ---
    // nextPhase already drew the event. Process it.
    let eventLoops = 0;
    while (state.currentEvent && !state.eventResolved && eventLoops < 5) {
      eventLoops++;
      const event = state.currentEvent;

      // All AI players vote
      for (let p = 0; p < 3; p++) {
        const vote = decideEventVote(state, p, event);
        const result = applyAction(state, { type: ActionTypes.VOTE_EVENT, vote }, p);
        state = result.newState;
      }

      // Resolve the event
      const resolveResult = applyAction(state, { type: ActionTypes.RESOLVE_EVENT });
      state = resolveResult.newState;

      // Check for nested event (e.g. rob_foreign triggers an Order attack)
      // If a new event was triggered, eventResolved will be false and currentEvent changed.
      // The while loop will handle it.
      if (state.gameOver) break;
    }

    if (state.gameOver) break;

    state = nextPhase(state); // events → veche

    // --- VECHE phase ---
    // AI decides whether to initiate an attack
    const attackTargets = getValidRepublicAttackTargets(state.regions);
    if (attackTargets.length > 0) {
      // Pick a random target
      const target = attackTargets[Math.floor(Math.random() * attackTargets.length)];

      // Check if majority would vote yes before initiating
      const votes = [0, 1, 2].map(p => decideAttackVote(state, p));
      const yesCount = votes.filter(v => v === true).length;

      if (yesCount >= 2) {
        // Initiate attack
        state = applyAction(state, { type: ActionTypes.INITIATE_ATTACK, targetRegion: target }).newState;

        // Cast votes
        for (let p = 0; p < 3; p++) {
          state = applyAction(state, { type: ActionTypes.VOTE_ATTACK, vote: votes[p] }, p).newState;
        }

        // Execute attack
        const attackResult = applyAction(state, { type: ActionTypes.EXECUTE_ATTACK });
        state = attackResult.newState;
      }
    }

    // AI decides whether to build a fortress
    const fortressSites = getRegionsForFortress(state.regions);
    if (fortressSites.length > 0 && !state.gameOver) {
      const target = fortressSites[Math.floor(Math.random() * fortressSites.length)];

      const votes = [0, 1, 2].map(p => decideFortressVote(state, p));
      const yesCount = votes.filter(v => v === true).length;

      if (yesCount >= 2) {
        state = applyAction(state, { type: ActionTypes.INITIATE_FORTRESS, targetRegion: target }).newState;

        for (let p = 0; p < 3; p++) {
          state = applyAction(state, { type: ActionTypes.VOTE_FORTRESS, vote: votes[p] }, p).newState;
        }

        const fortressResult = applyAction(state, { type: ActionTypes.EXECUTE_FORTRESS });
        state = fortressResult.newState;
      }
    }

    if (state.gameOver) break;

    state = nextPhase(state); // veche → resources (turn increments)
  }

  // Force turn past 20 so getGameResult fires
  if (!state.gameOver && state.turn <= 20) {
    state = { ...state, turn: 21 };
  }

  return getGameResult(state);
}

// ---------------------------------------------------------------------------
// Run simulation & collect stats
// ---------------------------------------------------------------------------

const stats = {
  Nobles:    { wins: 0, totalVP: 0, totalMoney: 0 },
  Merchants: { wins: 0, totalVP: 0, totalMoney: 0 },
  Commoners: { wins: 0, totalVP: 0, totalMoney: 0 },
};
let pskovFell = 0;

const startTime = Date.now();

for (let i = 0; i < NUM_GAMES; i++) {
  const result = simulateGame();

  if (!result) {
    // Shouldn't happen, but guard against it
    continue;
  }

  if (result.gameOver) pskovFell++;

  stats[result.winner.faction].wins++;

  for (const ranking of result.rankings) {
    stats[ranking.faction].totalVP += ranking.victoryPoints;
    stats[ranking.faction].totalMoney += ranking.money;
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

// ---------------------------------------------------------------------------
// Print results
// ---------------------------------------------------------------------------

console.log(`\nFaction Balance Simulation (${NUM_GAMES} games, ${elapsed}s)`);
console.log('='.repeat(56));
console.log(
  'Faction'.padEnd(14) +
  'Wins'.padStart(6) +
  'Win%'.padStart(8) +
  'Avg VP'.padStart(9) +
  'Avg Money'.padStart(11)
);
console.log('-'.repeat(56));

for (const faction of ['Nobles', 'Merchants', 'Commoners']) {
  const s = stats[faction];
  const winPct = ((s.wins / NUM_GAMES) * 100).toFixed(1);
  const avgVP = (s.totalVP / NUM_GAMES).toFixed(1);
  const avgMoney = (s.totalMoney / NUM_GAMES).toFixed(1);
  console.log(
    faction.padEnd(14) +
    String(s.wins).padStart(6) +
    (winPct + '%').padStart(8) +
    avgVP.padStart(9) +
    avgMoney.padStart(11)
  );
}

console.log('-'.repeat(56));
console.log(`Pskov fell: ${pskovFell}/${NUM_GAMES} (${((pskovFell / NUM_GAMES) * 100).toFixed(1)}%)`);
