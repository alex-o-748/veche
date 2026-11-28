// Pure state mutation functions for all game actions
// These functions take state and return new state (no side effects).
//
// This is the only rulebook: solo, hot-seat (src/App.jsx) and online (worker/) all
// play through applyAction / nextPhase, and the simulator tests exactly these rules.

import {
  PHASES,
  BUILDING_TYPES,
  RELIGIOUS_BUILDING_TYPES,
  EQUIPMENT_COSTS,
  EXPEDITION_COST,
  EXPEDITION_MAX_PER_GAME,
  EXPEDITION_PROFIT,
  EXPEDITION_WINDFALL,
  ATTACK_COST_PER_PLAYER,
  FORTRESS_COST_TOTAL,
  GLORY_PER_COIN,
  getMerchantVpMultiplier,
  createInitialGameState,
  createInitialConstructionActions,
  formatRegionName,
  getRules,
} from './state.js';
import { countRepublicRegions } from './regions.js';
import { getIncomeModifier, updateEffects as updateEffectsHelper } from './effects.js';
import { executeAttack as executeAttackCombat, awardGlory } from './combat.js';
import { drawEvent, resolveEvent as resolveEventHelper } from './events.js';
import { randomInt } from './random.js';
import { createOutcome, setOutcome } from './outcome.js';

export const MAX_TURNS = 20;

// Action Types
export const ActionTypes = {
  // Phase control
  NEXT_PHASE: 'NEXT_PHASE',
  NEXT_PLAYER: 'NEXT_PLAYER',

  // Construction phase
  SELECT_REGION: 'SELECT_REGION',
  BUILD_BUILDING: 'BUILD_BUILDING',
  BUY_EQUIPMENT: 'BUY_EQUIPMENT',
  SEND_EXPEDITION: 'SEND_EXPEDITION',
  SET_CONSTRUCTION_READY: 'SET_CONSTRUCTION_READY',

  // Events phase
  VOTE_EVENT: 'VOTE_EVENT',
  RESOLVE_EVENT: 'RESOLVE_EVENT',

  // Veche phase - Attack
  INITIATE_ATTACK: 'INITIATE_ATTACK',
  VOTE_ATTACK: 'VOTE_ATTACK',
  EXECUTE_ATTACK: 'EXECUTE_ATTACK',
  CANCEL_ATTACK: 'CANCEL_ATTACK',

  // Veche phase - Fortress
  INITIATE_FORTRESS: 'INITIATE_FORTRESS',
  VOTE_FORTRESS: 'VOTE_FORTRESS',
  EXECUTE_FORTRESS: 'EXECUTE_FORTRESS',
  CANCEL_FORTRESS: 'CANCEL_FORTRESS',

  // Game control
  RESET_GAME: 'RESET_GAME',
};

// Yes/no votes arrive as booleans locally and may arrive as 'true'/'false' over the network
const toBoolVote = (vote) => vote === true || vote === 'true';

// The player a construction action is for: in online games everyone builds at once,
// so it is the sender; otherwise it is whoever's turn it is.
const constructionActor = (state, playerId) =>
  state.simultaneousConstruction && playerId !== null && playerId !== undefined ? playerId : state.currentPlayer;

const isOver = (state) => Boolean(state.gameOver) || state.turn > MAX_TURNS;

// Validate if an action can be performed
export const validateAction = (state, action, playerId) => {
  const notYourTurn = !state.simultaneousConstruction && state.currentPlayer !== playerId;
  const player = state.players[playerId];

  switch (action.type) {
    case ActionTypes.BUILD_BUILDING:
      if (state.phase !== 'construction') return { error: 'Not in construction phase' };
      if (notYourTurn) return { error: 'Not your turn' };
      if (player.money < 2) return { error: 'Not enough money' };
      if (state.constructionActions[playerId].improvement) {
        return { error: 'Already built this turn' };
      }
      return { valid: true };

    case ActionTypes.BUY_EQUIPMENT:
      if (state.phase !== 'construction') return { error: 'Not in construction phase' };
      if (notYourTurn) return { error: 'Not your turn' };
      if (player.money < 1) return { error: 'Not enough money' };
      if (state.constructionActions[playerId].equipment) {
        return { error: 'Already bought equipment this turn' };
      }
      if (action.item && player[action.item] >= 2) {
        return { error: 'Maximum equipment of this type reached' };
      }
      return { valid: true };

    case ActionTypes.SEND_EXPEDITION:
      if (state.phase !== 'construction') return { error: 'Not in construction phase' };
      if (notYourTurn) return { error: 'Not your turn' };
      if (player.faction !== 'Merchants') return { error: 'Only Merchants can send expeditions' };
      if (player.money < EXPEDITION_COST) return { error: 'Not enough money' };
      if (player.expeditions >= EXPEDITION_MAX_PER_GAME) return { error: 'Maximum expeditions reached' };
      if (state.constructionActions[playerId].expedition) return { error: 'Already sent expedition this turn' };
      return { valid: true };

    case ActionTypes.SET_CONSTRUCTION_READY:
      if (state.phase !== 'construction') return { error: 'Not in construction phase' };
      if (state.constructionReady[playerId]) return { error: 'Already marked as ready' };
      return { valid: true };

    case ActionTypes.VOTE_EVENT:
      if (state.phase !== 'events') return { error: 'Not in events phase' };
      if (state.eventVotes[playerId] !== null) return { error: 'Already voted' };
      return { valid: true };

    case ActionTypes.VOTE_ATTACK:
      if (state.attackPlanning !== 'planning') return { error: 'Not planning attack' };
      if (state.attackVotes[playerId] !== null) return { error: 'Already voted' };
      return { valid: true };

    case ActionTypes.VOTE_FORTRESS:
      if (state.fortressPlanning !== 'planning') return { error: 'Not planning fortress' };
      if (state.fortressVotes[playerId] !== null) return { error: 'Already voted' };
      return { valid: true };

    default:
      return { valid: true };
  }
};

// Apply an action to the game state.
// playerId: who sent the action (validated when given); null for trusted local calls.
export const applyAction = (state, action, playerId = null, randomValues = {}) => {
  // Validate action if playerId is provided
  if (playerId !== null && playerId !== undefined) {
    const validation = validateAction(state, action, playerId);
    if (validation.error) {
      return { newState: state, error: validation.error };
    }
  }

  const actor = constructionActor(state, playerId);

  switch (action.type) {
    case ActionTypes.NEXT_PHASE:
      return { newState: nextPhase(state), result: { type: 'phase_changed' } };

    case ActionTypes.NEXT_PLAYER:
      return { newState: nextPlayer(state), result: { type: 'player_changed' } };

    case ActionTypes.SELECT_REGION:
      return {
        newState: selectRegion(state, action.regionName),
        result: { type: 'region_selected' },
      };

    case ActionTypes.BUILD_BUILDING:
      return {
        newState: buildBuilding(state, action.buildingType, actor, action.regionName),
        result: { type: 'building_built' },
      };

    case ActionTypes.BUY_EQUIPMENT:
      return {
        newState: buyEquipment(state, action.item, actor),
        result: { type: 'equipment_bought' },
      };

    case ActionTypes.SEND_EXPEDITION:
      return sendExpedition(state, randomValues, actor);

    case ActionTypes.SET_CONSTRUCTION_READY:
      return {
        newState: setConstructionReady(state, playerId ?? state.currentPlayer),
        result: { type: 'construction_ready' },
      };

    case ActionTypes.VOTE_EVENT:
      if (playerId === null || playerId === undefined) return { newState: state, error: 'Player ID required' };
      return {
        newState: voteOnEvent(state, playerId, action.vote),
        result: { type: 'vote_cast' },
      };

    case ActionTypes.RESOLVE_EVENT:
      if (!state.currentEvent) return { newState: state, error: 'No event to resolve' };
      if (state.eventResolved) return { newState: state, error: 'Event already resolved' };
      return {
        newState: resolveCurrentEvent(state, randomValues),
        result: { type: 'event_resolved' },
      };

    case ActionTypes.INITIATE_ATTACK:
      return {
        newState: initiateAttack(state, action.targetRegion),
        result: { type: 'attack_initiated' },
      };

    case ActionTypes.VOTE_ATTACK:
      if (playerId === null || playerId === undefined) return { newState: state, error: 'Player ID required' };
      return {
        newState: voteOnAttack(state, playerId, toBoolVote(action.vote)),
        result: { type: 'attack_vote_cast' },
      };

    case ActionTypes.EXECUTE_ATTACK:
      return executeAttackAction(state, randomValues);

    case ActionTypes.CANCEL_ATTACK:
      return {
        newState: cancelAttack(state),
        result: { type: 'attack_cancelled' },
      };

    case ActionTypes.INITIATE_FORTRESS:
      return {
        newState: initiateFortress(state, action.targetRegion),
        result: { type: 'fortress_initiated' },
      };

    case ActionTypes.VOTE_FORTRESS:
      if (playerId === null || playerId === undefined) return { newState: state, error: 'Player ID required' };
      return {
        newState: voteOnFortress(state, playerId, toBoolVote(action.vote)),
        result: { type: 'fortress_vote_cast' },
      };

    case ActionTypes.EXECUTE_FORTRESS:
      return executeFortressAction(state);

    case ActionTypes.CANCEL_FORTRESS:
      return {
        newState: cancelFortress(state),
        result: { type: 'fortress_cancelled' },
      };

    case ActionTypes.RESET_GAME:
      return {
        newState: createInitialGameState({
          ruleset: state.ruleset,
          simultaneousConstruction: state.simultaneousConstruction,
        }),
        result: { type: 'game_reset' },
      };

    default:
      return { newState: state, error: 'Unknown action type' };
  }
};

// Income a player receives in the resources phase
export const calculateIncome = (player, state) => {
  const republicRegions = countRepublicRegions(state.regions);
  const secularBuildings = player.improvements - (player.religiousBuildings || 0);
  const baseIncome = 0.5 + republicRegions * 0.25 + secularBuildings * 0.25;
  return baseIncome * getIncomeModifier(state.activeEffects, player.faction);
};

// Phase transition logic
export const nextPhase = (state) => {
  if (isOver(state)) return state;

  const currentPhaseIndex = PHASES.indexOf(state.phase);
  const isLastPhase = currentPhaseIndex === PHASES.length - 1;
  const nextPhaseName = isLastPhase ? PHASES[0] : PHASES[currentPhaseIndex + 1];

  let newState = { ...state };

  // Handle resources phase - calculate income
  if (state.phase === 'resources') {
    newState.players = state.players.map((player) => ({
      ...player,
      money: player.money + calculateIncome(player, state),
    }));
  }

  // Draw event when moving TO events phase
  if (nextPhaseName === 'events') {
    const drawn = drawEvent(state.shuffledEventOrder, state.eventDrawIndex);
    newState.currentEvent = drawn.event;
    newState.shuffledEventOrder = drawn.shuffledEventOrder;
    newState.eventDrawIndex = drawn.eventDrawIndex;
    newState.eventVotes = [null, null, null];
    newState.eventResolved = false;
    newState.eventImageRevealed = false;
  }

  // Reset construction state when leaving construction phase
  if (state.phase === 'construction') {
    newState.currentPlayer = 0;
    newState.selectedRegion = 'pskov';
    newState.constructionActions = createInitialConstructionActions();
    newState.constructionReady = [false, false, false];
    newState.lastExpeditionResult = null;
  }

  // Clear event state when leaving events phase
  if (state.phase === 'events') {
    newState.currentEvent = null;
    newState.eventVotes = [null, null, null];
    newState.eventResolved = false;
    newState.eventImageRevealed = false;
  }

  // Each phase starts without the previous phase's result on screen
  if (state.phase === 'events' || state.phase === 'veche') {
    newState.lastEventResult = null;
    newState.lastOutcome = null;
    newState.battleResult = null;
  }

  // Update effects at end of turn (when moving from veche to resources)
  if (isLastPhase) {
    newState = updateEffectsHelper(newState);
  }

  newState = {
    ...newState,
    phase: nextPhaseName,
    turn: isLastPhase ? state.turn + 1 : state.turn,
  };

  // Online games skip the resources phase: income is paid and construction begins
  if (newState.phase === 'resources' && state.simultaneousConstruction && !isOver(newState)) {
    return nextPhase(newState);
  }
  return newState;
};

// Player turn transition (turn-based construction): the current player is done
export const nextPlayer = (state) => {
  const constructionReady = [...state.constructionReady];
  constructionReady[state.currentPlayer] = true;
  const nextPlayerIndex = (state.currentPlayer + 1) % 3;
  // Merchants can only build in Pskov, so select it for them
  const selectedRegion = state.players[nextPlayerIndex].faction === 'Merchants' ? 'pskov' : state.selectedRegion;
  return {
    ...state,
    currentPlayer: nextPlayerIndex,
    selectedRegion,
    constructionReady,
  };
};

// Simultaneous construction: a player says they are done; when all are, the phase moves on
export const setConstructionReady = (state, playerIndex) => {
  const constructionReady = [...state.constructionReady];
  constructionReady[playerIndex] = true;
  if (constructionReady.every(Boolean)) {
    return nextPhase({ ...state, constructionReady });
  }
  return { ...state, constructionReady };
};

// Region selection
export const selectRegion = (state, regionName) => ({
  ...state,
  selectedRegion: regionName,
});

// Build a building for a player (default: the current player) in a region (default: the selected one)
export const buildBuilding = (state, buildingType, playerIndex = state.currentPlayer, regionName = state.selectedRegion) => {
  const player = state.players[playerIndex];
  const buildingDef = BUILDING_TYPES[buildingType];
  const currentRegion = state.regions[regionName];

  if (!buildingDef || !currentRegion || player.money < buildingDef.cost) return state;
  if (state.constructionActions[playerIndex].improvement) return state;
  if (currentRegion.controller !== 'republic') return state;
  if (buildingDef.faction !== player.faction) return state;

  // Enforce pskovOnly restriction for merchant buildings
  if (buildingDef.pskovOnly && regionName !== 'pskov') return state;

  const currentCount = currentRegion.buildings[buildingType] || 0;
  if (currentCount >= (buildingDef.maxPerRegion || 1)) return state;

  const isReligious = RELIGIOUS_BUILDING_TYPES.has(buildingType);
  const newPlayers = state.players.map((p, i) =>
    i === playerIndex
      ? {
          ...p,
          money: p.money - buildingDef.cost,
          improvements: p.improvements + 1,
          religiousBuildings: (p.religiousBuildings || 0) + (isReligious ? 1 : 0),
        }
      : p
  );

  const newConstructionActions = state.constructionActions.map((ca, i) =>
    i === playerIndex ? { ...ca, improvement: true } : ca
  );

  return {
    ...state,
    regions: {
      ...state.regions,
      [regionName]: {
        ...currentRegion,
        buildings: { ...currentRegion.buildings, [buildingType]: currentCount + 1 },
      },
    },
    players: newPlayers,
    constructionActions: newConstructionActions,
  };
};

// Buy equipment
export const buyEquipment = (state, item, playerIndex = state.currentPlayer) => {
  const player = state.players[playerIndex];
  const cost = EQUIPMENT_COSTS[item];

  if (cost === undefined || player.money < cost || player[item] >= 2) return state;
  if (state.constructionActions[playerIndex].equipment) return state;

  return {
    ...state,
    players: state.players.map((p, i) =>
      i === playerIndex ? { ...p, money: p.money - cost, [item]: p[item] + 1 } : p
    ),
    constructionActions: state.constructionActions.map((action, i) =>
      i === playerIndex ? { ...action, equipment: true } : action
    ),
  };
};

// Send a trading expedition overseas (Merchants only, max 2 per game)
export const sendExpedition = (state, randomValues = {}, playerIndex = state.currentPlayer) => {
  const player = state.players[playerIndex];

  if (
    player.faction !== 'Merchants' ||
    player.money < EXPEDITION_COST ||
    player.expeditions >= EXPEDITION_MAX_PER_GAME ||
    state.constructionActions[playerIndex].expedition
  ) {
    return { newState: state, error: 'Cannot send expedition' };
  }

  // Roll for outcome: 0 = loss, 1 = profit, 2 = windfall
  const roll = randomValues.expeditionRoll !== undefined ? randomValues.expeditionRoll : randomInt(3);

  let moneyChange = -EXPEDITION_COST;
  let outcome;
  if (roll === 0) {
    outcome = 'loss';
  } else if (roll === 1) {
    outcome = 'profit';
    moneyChange += EXPEDITION_PROFIT;
  } else {
    outcome = 'windfall';
    moneyChange += EXPEDITION_WINDFALL;
  }

  return {
    newState: {
      ...state,
      players: state.players.map((p, i) =>
        i === playerIndex ? { ...p, money: p.money + moneyChange, expeditions: p.expeditions + 1 } : p
      ),
      constructionActions: state.constructionActions.map((ca, i) =>
        i === playerIndex ? { ...ca, expedition: true } : ca
      ),
      lastExpeditionResult: { outcome, moneyChange, playerIndex },
    },
    result: { type: 'expedition_sent', outcome, moneyChange },
  };
};

// Vote on event
export const voteOnEvent = (state, playerIndex, vote) => {
  const newVotes = [...state.eventVotes];
  newVotes[playerIndex] = vote;
  return { ...state, eventVotes: newVotes };
};

// Resolve current event
export const resolveCurrentEvent = (state, randomValues = {}) => {
  const event = state.currentEvent;
  if (!event) return state;

  // Start from a clean result, so the screen only shows what this event caused
  const cleanState = { ...state, battleResult: null, lastOutcome: null, lastEventResult: null };
  const newState = resolveEventHelper(event, cleanState, state.eventVotes, randomValues);

  // A new event was triggered (the Order retaliates): it still has to be decided
  const newEventTriggered = newState.currentEvent && newState.currentEvent.id !== event.id;

  return {
    ...newState,
    eventResolved: !newEventTriggered,
  };
};

// Attack planning
export const initiateAttack = (state, targetRegion) => ({
  ...state,
  attackPlanning: 'planning',
  attackTarget: targetRegion,
  attackVotes: [null, null, null],
});

export const voteOnAttack = (state, playerIndex, vote) => {
  const newVotes = [...state.attackVotes];
  newVotes[playerIndex] = vote;
  return { ...state, attackVotes: newVotes };
};

// Who would join the campaign as votes stand, and whether it can go ahead
export const getAttackFunding = (state) => {
  const participants = state.attackVotes.map((v, i) => (v === true ? i : -1)).filter((i) => i >= 0);
  const cannotAfford = participants.filter((i) => state.players[i].money < ATTACK_COST_PER_PLAYER);
  return {
    participants,
    costPerParticipant: ATTACK_COST_PER_PLAYER,
    cannotAfford,
    funded: participants.length > 0 && cannotAfford.length === 0,
  };
};

export const executeAttackAction = (state, randomValues = {}) => {
  const { attackTarget, players } = state;
  const funding = getAttackFunding(state);

  if (funding.participants.length === 0) {
    return {
      newState: cancelAttack(state),
      result: { type: 'attack_cancelled', reason: 'no_participants' },
    };
  }

  if (!funding.funded) {
    return {
      newState: setOutcome(cancelAttack(state), createOutcome('veche.attackCancelled'), 'Attack cancelled - not enough funding!'),
      result: { type: 'attack_cancelled', reason: 'insufficient_funds' },
    };
  }

  const cost = funding.costPerParticipant;
  const newPlayers = players.map((player, index) =>
    funding.participants.includes(index) ? { ...player, money: player.money - cost } : player
  );

  const combatResult = executeAttackCombat(
    { ...state, players: newPlayers },
    attackTarget,
    funding.participants,
    randomValues.battleRoll,
    { gloryPerPlayer: getRules(state).glory ? cost * GLORY_PER_COIN : 0 }
  );

  return {
    newState: {
      ...combatResult.newState,
      attackPlanning: null,
      attackTarget: null,
      attackVotes: [null, null, null],
    },
    result: {
      type: 'attack_executed',
      success: combatResult.success,
      combatResult: combatResult.result,
    },
  };
};

export const cancelAttack = (state) => ({
  ...state,
  attackPlanning: null,
  attackTarget: null,
  attackVotes: [null, null, null],
});

// Fortress planning
export const initiateFortress = (state, targetRegion) => ({
  ...state,
  fortressPlanning: 'planning',
  fortressTarget: targetRegion,
  fortressVotes: [null, null, null],
});

export const voteOnFortress = (state, playerIndex, vote) => {
  const newVotes = [...state.fortressVotes];
  newVotes[playerIndex] = vote;
  return { ...state, fortressVotes: newVotes };
};

// Who would fund the fortress as votes stand, what each pays, and whether it gets built
export const getFortressFunding = (state) => {
  const participants = state.fortressVotes.map((v, i) => (v === true ? i : -1)).filter((i) => i >= 0);
  const costPerParticipant = participants.length > 0 ? FORTRESS_COST_TOTAL / participants.length : 0;
  const cannotAfford = participants.filter((i) => state.players[i].money < costPerParticipant);
  return {
    participants,
    costPerParticipant,
    cannotAfford,
    funded: participants.length > 0 && cannotAfford.length === 0,
  };
};

export const executeFortressAction = (state) => {
  const { fortressTarget, players } = state;
  const funding = getFortressFunding(state);

  if (!funding.funded) {
    const reason = funding.participants.length === 0 ? 'no_participants' : 'insufficient_funds';
    return {
      newState: setOutcome(
        { ...cancelFortress(state), battleResult: null },
        createOutcome('battle.fortressCancelledInsufficient'),
        'Fortress construction cancelled - insufficient funding!'
      ),
      result: { type: 'fortress_cancelled', reason },
    };
  }

  const cost = funding.costPerParticipant;
  const paid = players.map((player, index) =>
    funding.participants.includes(index) ? { ...player, money: player.money - cost } : player
  );
  // Glory: every coin paid toward a fortress that gets built
  const glory = getRules(state).glory ? cost * GLORY_PER_COIN : 0;
  const newPlayers = awardGlory(paid, funding.participants, glory);

  const gloryOutcome = glory > 0
    ? createOutcome('glory.earned', { factions: funding.participants.map((i) => players[i].faction), amount: glory })
    : null;

  return {
    newState: setOutcome(
      {
        ...state,
        players: newPlayers,
        regions: {
          ...state.regions,
          [fortressTarget]: { ...state.regions[fortressTarget], fortress: true },
        },
        fortressPlanning: null,
        fortressTarget: null,
        fortressVotes: [null, null, null],
        battleResult: null,
      },
      createOutcome('battle.fortressBuilt', { region: fortressTarget }, gloryOutcome),
      `Fortress built in ${formatRegionName(fortressTarget)}! (+10 defense bonus)`
    ),
    result: { type: 'fortress_built', region: fortressTarget, glory },
  };
};

export const cancelFortress = (state) => ({
  ...state,
  fortressPlanning: null,
  fortressTarget: null,
  fortressVotes: [null, null, null],
});

// Buildings a player can put up in a region (default: the current player, the selected region)
export const getAvailableBuildings = (state, playerIndex = state.currentPlayer, regionName = state.selectedRegion) => {
  const player = state.players[playerIndex];
  const region = state.regions[regionName];
  if (!player || !region) return [];

  return Object.entries(BUILDING_TYPES)
    .filter(([, def]) => def.faction === player.faction && (!def.pskovOnly || regionName === 'pskov'))
    .map(([type, def]) => {
      const count = region.buildings[type] || 0;
      const max = def.maxPerRegion || 1;
      return {
        type,
        name: def.name,
        cost: def.cost,
        // Merchants can build several of each: they see how many stand
        built: max > 1 ? count : count > 0,
        canBuild: count < max,
        isReligious: RELIGIOUS_BUILDING_TYPES.has(type),
      };
    });
};

// VP from buildings: 1 per secular, 2 per religious; Merchants earn less (their buildings are safe in Pskov)
// rules: the game's rules (getRules(state)); defaults to the standard rules
export const calculateBuildingVictoryPoints = (player, rules) => {
  const buildingVP = player.improvements + (player.religiousBuildings || 0);
  return buildingVP * (player.faction === 'Merchants' ? getMerchantVpMultiplier(rules) : 1);
};

// Total victory points: buildings + bonus points (auction) + Glory
export const calculateVictoryPoints = (player, rules) =>
  calculateBuildingVictoryPoints(player, rules) + (player.bonusPoints || 0) + (player.glory || 0);

// Check game result
export const getGameResult = (state) => {
  if (!isOver(state)) return null;

  const rules = getRules(state);
  const playerScores = state.players.map((player, index) => {
    const religious = player.religiousBuildings || 0;
    const secular = player.improvements - religious;
    return {
      faction: player.faction,
      victoryPoints: calculateVictoryPoints(player, rules),
      money: player.money,
      index,
      breakdown: {
        secular,
        religious,
        buildingVP: calculateBuildingVictoryPoints(player, rules),
        bonus: player.bonusPoints || 0,
        glory: player.glory || 0,
      },
    };
  });

  playerScores.sort((a, b) => {
    if (b.victoryPoints !== a.victoryPoints) {
      return b.victoryPoints - a.victoryPoints;
    }
    return b.money - a.money;
  });

  return {
    winner: playerScores[0],
    rankings: playerScores,
    gameOver: Boolean(state.gameOver),
  };
};
