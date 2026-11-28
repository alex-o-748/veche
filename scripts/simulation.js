// Headless game loop shared by the balance simulator and the snapshot check.
//
// playGame(engine, options) plays one all-AI game through a rules engine module
// (src/game, or the worker's bundle of it) and returns the final state.
//
// options.ruleset   'standard' | 'classic'
// options.policies  { [faction]: 'default' | 'never_pay' | 'defence_only' }
//   never_pay     pays for nothing shared: no defence, campaign, fortress, event costs or bids
//   defence_only  funds defences against the Order, nothing else shared
// options.onTurn    called with the state at the end of every turn

const FACTIONS = ['Nobles', 'Merchants', 'Commoners'];

// Voting options a stingy faction picks: the ones that cost nothing
const freeOption = (event) =>
  (event.options.find((o) => !o.costText && !o.requiresMinMoney) || event.options[event.options.length - 1]).id;

const decideVote = (engine, state, p, event, policy) => {
  if (policy === 'default') return engine.decideEventVote(state, p, event);
  if (event.type === 'order_attack') return policy === 'defence_only' ? engine.decideEventVote(state, p, event) : false;
  if (event.type === 'voting') return freeOption(event);
  if (event.type === 'auction') return '0';
  if (event.type === 'participation') return false;
  return engine.decideEventVote(state, p, event);
};

export function playGame(engine, options = {}) {
  const { ActionTypes, applyAction, nextPhase } = engine;
  const policies = FACTIONS.map((f) => options.policies?.[f] || 'default');
  const pays = (p) => policies[p] === 'default';
  let state = engine.createInitialGameState({ ruleset: options.ruleset });

  while (state.turn <= engine.MAX_TURNS && !state.gameOver) {
    // --- RESOURCES phase: just advance past it (nextPhase pays income) ---
    state = nextPhase(state);

    // --- CONSTRUCTION phase ---
    for (let p = 0; p < 3; p++) {
      const decision = engine.decideConstruction(state, p);
      if (decision.regionName) {
        state = applyAction(state, { type: ActionTypes.SELECT_REGION, regionName: decision.regionName }).newState;
      }
      if (decision.buildingType) {
        state = applyAction(state, { type: ActionTypes.BUILD_BUILDING, buildingType: decision.buildingType }).newState;
      }
      if (decision.equipmentType) {
        state = applyAction(state, { type: ActionTypes.BUY_EQUIPMENT, item: decision.equipmentType }).newState;
      }
      if (decision.sendExpedition) {
        state = applyAction(state, { type: ActionTypes.SEND_EXPEDITION }).newState;
      }
      state = applyAction(state, { type: ActionTypes.NEXT_PLAYER }).newState;
    }

    state = nextPhase(state); // construction → events

    // --- EVENTS phase (a card can trigger a follow-up: the Order's retaliation) ---
    let eventLoops = 0;
    while (state.currentEvent && !state.eventResolved && eventLoops < 5) {
      eventLoops++;
      const event = state.currentEvent;
      for (let p = 0; p < 3; p++) {
        const vote = decideVote(engine, state, p, event, policies[p]);
        state = applyAction(state, { type: ActionTypes.VOTE_EVENT, vote }, p).newState;
      }
      state = applyAction(state, { type: ActionTypes.RESOLVE_EVENT }).newState;
      if (state.gameOver) break;
    }
    if (state.gameOver) break;

    state = nextPhase(state); // events → veche

    // --- VECHE phase: a campaign, then a fortress ---
    const target = engine.decideAttackTarget(state);
    if (target) {
      const planned = applyAction(state, { type: ActionTypes.INITIATE_ATTACK, targetRegion: target }).newState;
      const votes = [0, 1, 2].map((p) => pays(p) && engine.decideAttackVote(planned, p));
      if (votes.filter(Boolean).length >= 2) {
        state = planned;
        for (let p = 0; p < 3; p++) {
          state = applyAction(state, { type: ActionTypes.VOTE_ATTACK, vote: votes[p] }, p).newState;
        }
        state = applyAction(state, { type: ActionTypes.EXECUTE_ATTACK }).newState;
      }
    }

    const site = engine.decideFortressTarget(state);
    if (site) {
      const votes = [0, 1, 2].map((p) => pays(p) && engine.decideFortressVote(state, p));
      if (votes.filter(Boolean).length >= 2) {
        state = applyAction(state, { type: ActionTypes.INITIATE_FORTRESS, targetRegion: site }).newState;
        for (let p = 0; p < 3; p++) {
          state = applyAction(state, { type: ActionTypes.VOTE_FORTRESS, vote: votes[p] }, p).newState;
        }
        state = applyAction(state, { type: ActionTypes.EXECUTE_FORTRESS }).newState;
      }
    }

    if (options.onTurn) options.onTurn(state);
    state = nextPhase(state); // veche → resources (turn increments)
  }

  if (options.onTurn && state.gameOver) options.onTurn(state);
  return state;
}

// A compact, stable record of a state for snapshots (no effect ids, rounded money)
export const summarize = (state) => ({
  turn: state.turn,
  gameOver: Boolean(state.gameOver),
  players: state.players.map((p) => ({
    faction: p.faction,
    money: Math.round(p.money * 1000) / 1000,
    improvements: p.improvements,
    religiousBuildings: p.religiousBuildings,
    weapons: p.weapons,
    armor: p.armor,
    expeditions: p.expeditions,
    bonusPoints: Math.round((p.bonusPoints || 0) * 1000) / 1000,
    glory: p.glory || 0,
  })),
  regions: Object.fromEntries(
    Object.entries(state.regions).map(([name, r]) => [
      name,
      `${r.controller}${r.fortress ? '+fort' : ''} ${Object.values(r.buildings).join('')}`,
    ])
  ),
  effects: state.activeEffects.map((e) => `${e.type}:${e.target}:${e.value}:${e.turnsRemaining}`),
});

// Play one seeded game and return its turn-by-turn summary
export function seededGameRecord(engine, seed, options = {}) {
  engine.setRandomSource(engine.createSeededRandom(seed));
  const turns = [];
  try {
    const final = playGame(engine, { ...options, onTurn: (s) => turns.push(summarize(s)) });
    const result = engine.getGameResult(final.turn > engine.MAX_TURNS || final.gameOver ? final : { ...final, turn: engine.MAX_TURNS + 1 });
    return {
      seed,
      ruleset: options.ruleset || 'standard',
      turns,
      result: result && { winner: result.winner.faction, scores: result.rankings.map((r) => [r.faction, r.victoryPoints]) },
    };
  } finally {
    engine.setRandomSource(null);
  }
}
