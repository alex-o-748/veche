// Pure state mutation functions for all game actions
// These functions take state and return new state (no side effects)

import {
  PHASES,
  BUILDING_TYPES,
  EQUIPMENT_COSTS,
  createInitialGameState,
  createInitialConstructionActions,
  formatRegionName,
} from './state.js';
import { countRepublicRegions, getValidRepublicAttackTargets } from './regions.js';
import { getIncomeModifier, updateEffects as updateEffectsHelper } from './effects.js';
import {
  calculatePlayerStrength,
  calculateTotalStrength,
  executeAttack as executeAttackCombat,
} from './combat.js';
import { drawEvent, resolveEvent as resolveEventHelper } from './events.js';

// Action Types
export const ActionTypes = {
  // Phase control
  NEXT_PHASE: 'NEXT_PHASE',
  NEXT_PLAYER: 'NEXT_PLAYER',

  // Construction phase
  SELECT_REGION: 'SELECT_REGION',
  BUILD_BUILDING: 'BUILD_BUILDING',
  BUY_EQUIPMENT: 'BUY_EQUIPMENT',

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

// Validate if an action can be performed
export const validateAction = (state, action, playerId) => {
  switch (action.type) {
    case ActionTypes.BUILD_BUILDING:
      if (state.phase !== 'construction') return { error: 'Not in construction phase' };
      if (state.currentPlayer !== playerId) return { error: 'Not your turn' };
      if (state.players[playerId].money < 2) return { error: 'Not enough money' };
      if (state.constructionActions[playerId].improvement) {
        return { error: 'Already built this turn' };
      }
      return { valid: true };

    case ActionTypes.BUY_EQUIPMENT:
      if (state.phase !== 'construction') return { error: 'Not in construction phase' };
      if (state.currentPlayer !== playerId) return { error: 'Not your turn' };
      if (state.players[playerId].money < 1) return { error: 'Not enough money' };
      if (state.constructionActions[playerId].equipment) {
        return { error: 'Already bought equipment this turn' };
      }
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

// Apply an action to the game state
export const applyAction = (state, action, playerId = null, randomValues = {}) => {
  // Validate action if playerId is provided
  if (playerId !== null) {
    const validation = validateAction(state, action, playerId);
    if (validation.error) {
      return { newState: state, error: validation.error };
    }
  }

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
        newState: buildBuilding(state, action.buildingType),
        result: { type: 'building_built' },
      };

    case ActionTypes.BUY_EQUIPMENT:
      return {
        newState: buyEquipment(state, action.item),
        result: { type: 'equipment_bought' },
      };

    case ActionTypes.VOTE_EVENT:
      return {
        newState: voteOnEvent(state, playerId, action.vote),
        result: { type: 'vote_cast' },
      };

    case ActionTypes.RESOLVE_EVENT:
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
      return {
        newState: voteOnAttack(state, playerId, action.vote),
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
      return {
        newState: voteOnFortress(state, playerId, action.vote),
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
        newState: createInitialGameState(),
        result: { type: 'game_reset' },
      };

    default:
      return { newState: state, error: 'Unknown action type' };
  }
};

// Phase transition logic
export const nextPhase = (state, debugMode = false) => {
  const currentPhaseIndex = PHASES.indexOf(state.phase);
  const isLastPhase = currentPhaseIndex === PHASES.length - 1;
  const nextPhaseName = isLastPhase ? PHASES[0] : PHASES[currentPhaseIndex + 1];

  let newState = { ...state };

  // Handle resources phase - calculate income
  if (state.phase === 'resources') {
    const republicRegions = countRepublicRegions(state.regions);
    newState.players = state.players.map((player) => {
      const baseIncome = 0.5 + republicRegions * 0.25 + player.improvements * 0.25;
      const incomeModifier = getIncomeModifier(state.activeEffects, player.faction);
      const finalIncome = baseIncome * incomeModifier;
      return {
        ...player,
        money: player.money + finalIncome,
      };
    });
  }

  // Draw event when moving TO events phase
  if (nextPhaseName === 'events') {
    newState.currentEvent = drawEvent(debugMode, state.debugEventIndex);
    newState.eventVotes = [null, null, null];
    newState.eventResolved = false;
    newState.eventImageRevealed = false;
    if (debugMode) {
      newState.debugEventIndex = (state.debugEventIndex + 1) % 17; // eventDeck.length
    }
  }

  // Reset construction state when leaving construction phase
  if (state.phase === 'construction') {
    newState.currentPlayer = 0;
    newState.selectedRegion = 'pskov';
    newState.constructionActions = createInitialConstructionActions();
  }

  // Clear event state when leaving events phase
  if (state.phase === 'events') {
    newState.currentEvent = null;
    newState.eventVotes = [null, null, null];
    newState.eventResolved = false;
    newState.lastEventResult = null;
    newState.eventImageRevealed = false;
  }

  // Update effects at end of turn (when moving from veche to resources)
  if (isLastPhase) {
    newState = updateEffectsHelper(newState);
  }

  return {
    ...newState,
    phase: nextPhaseName,
    turn: isLastPhase ? state.turn + 1 : state.turn,
  };
};

// Player turn transition
export const nextPlayer = (state) => ({
  ...state,
  currentPlayer: (state.currentPlayer + 1) % 3,
});

// Region selection
export const selectRegion = (state, regionName) => ({
  ...state,
  selectedRegion: regionName,
});

// Build a building
export const buildBuilding = (state, buildingType) => {
  const player = state.players[state.currentPlayer];

  if (player.money < 2) {
    return state;
  }

  const newPlayers = state.players.map((p, i) =>
    i === state.currentPlayer
      ? { ...p, money: p.money - 2, improvements: p.improvements + 1 }
      : p
  );

  const newConstructionActions = state.constructionActions.map((ca, i) =>
    i === state.currentPlayer ? { ...ca, improvement: true } : ca
  );

  const currentRegion = state.regions[state.selectedRegion];
  const newBuildings = buildingType.startsWith('merchant_')
    ? { ...currentRegion.buildings, [buildingType]: currentRegion.buildings[buildingType] + 1 }
    : { ...currentRegion.buildings, [buildingType]: 1 };

  const newRegions = {
    ...state.regions,
    [state.selectedRegion]: {
      ...currentRegion,
      buildings: newBuildings,
    },
  };

  return {
    ...state,
    regions: newRegions,
    players: newPlayers,
    constructionActions: newConstructionActions,
  };
};

// Buy equipment
export const buyEquipment = (state, item) => {
  const playerIndex = state.currentPlayer;
  const player = state.players[playerIndex];
  const cost = EQUIPMENT_COSTS[item] || 1;

  if (player.money < cost) {
    return state;
  }

  const newPlayers = state.players.map((p, i) =>
    i === playerIndex ? { ...p, money: p.money - cost, [item]: p[item] + 1 } : p
  );

  const newConstructionActions =
    item === 'weapons' || item === 'armor'
      ? state.constructionActions.map((action, i) =>
          i === playerIndex ? { ...action, equipment: true } : action
        )
      : state.constructionActions;

  return {
    ...state,
    players: newPlayers,
    constructionActions: newConstructionActions,
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

  if (!event) {
    return state;
  }

  const newState = resolveEventHelper(event, state, state.eventVotes, randomValues);

  // Check if a new event was triggered (nested event scenario)
  const newEventTriggered = newState.currentEvent && newState.currentEvent.id !== event.id;

  return {
    ...newState,
    eventResolved: newEventTriggered ? false : true,
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

export const executeAttackAction = (state, randomValues = {}) => {
  const { attackTarget, attackVotes, players } = state;
  const participants = attackVotes.filter((v) => v === true).length;

  if (participants === 0) {
    return {
      newState: cancelAttack(state),
      result: { type: 'attack_cancelled', reason: 'no_participants' },
    };
  }

  const costPerParticipant = 6 / participants;

  // Check if all participants can afford
  let allCanAfford = true;
  players.forEach((player, index) => {
    if (attackVotes[index] === true && player.money < costPerParticipant) {
      allCanAfford = false;
    }
  });

  if (!allCanAfford) {
    return {
      newState: {
        ...cancelAttack(state),
        lastEventResult: 'Attack cancelled - not enough funding!',
      },
      result: { type: 'attack_cancelled', reason: 'insufficient_funds' },
    };
  }

  // Deduct money from participants
  const newPlayers = players.map((player, index) => {
    if (attackVotes[index] === true) {
      return { ...player, money: player.money - costPerParticipant };
    }
    return player;
  });

  // Get attacking players
  const attackingPlayers = [];
  attackVotes.forEach((vote, index) => {
    if (vote === true) attackingPlayers.push(index);
  });

  // Execute combat
  const combatResult = executeAttackCombat(
    { ...state, players: newPlayers },
    attackTarget,
    attackingPlayers,
    randomValues.battleRoll
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

export const executeFortressAction = (state) => {
  const { fortressTarget, fortressVotes, players } = state;
  const participants = fortressVotes.filter((v) => v === true).length;

  if (participants === 0) {
    return {
      newState: {
        ...cancelFortress(state),
        lastEventResult: 'Fortress construction cancelled - no funding!',
      },
      result: { type: 'fortress_cancelled', reason: 'no_participants' },
    };
  }

  const costPerParticipant = 6 / participants;

  // Check if all participants can afford
  let allCanAfford = true;
  players.forEach((player, index) => {
    if (fortressVotes[index] === true && player.money < costPerParticipant) {
      allCanAfford = false;
    }
  });

  if (!allCanAfford) {
    return {
      newState: {
        ...cancelFortress(state),
        lastEventResult: 'Fortress construction cancelled - insufficient funding!',
      },
      result: { type: 'fortress_cancelled', reason: 'insufficient_funds' },
    };
  }

  // Deduct money from participants
  const newPlayers = players.map((player, index) => {
    if (fortressVotes[index] === true) {
      return { ...player, money: player.money - costPerParticipant };
    }
    return player;
  });

  // Build the fortress
  const newRegions = {
    ...state.regions,
    [fortressTarget]: {
      ...state.regions[fortressTarget],
      fortress: true,
    },
  };

  const regionDisplayName = formatRegionName(fortressTarget);

  return {
    newState: {
      ...state,
      players: newPlayers,
      regions: newRegions,
      fortressPlanning: null,
      fortressTarget: null,
      fortressVotes: [null, null, null],
      lastEventResult: `Fortress built in ${regionDisplayName}! (+10 defense bonus)`,
    },
    result: { type: 'fortress_built', region: fortressTarget },
  };
};

export const cancelFortress = (state) => ({
  ...state,
  fortressPlanning: null,
  fortressTarget: null,
  fortressVotes: [null, null, null],
});

// Get available buildings for current player in selected region
export const getAvailableBuildings = (state) => {
  const player = state.players[state.currentPlayer];
  const region = state.regions[state.selectedRegion];
  const buildings = [];

  if (player.faction === 'Commoners') {
    buildings.push(
      {
        type: 'commoner_huts',
        name: 'Huts',
        cost: 2,
        built: region.buildings.commoner_huts > 0,
        canBuild: region.buildings.commoner_huts === 0,
      },
      {
        type: 'commoner_church',
        name: 'Village Church',
        cost: 2,
        built: region.buildings.commoner_church > 0,
        canBuild: region.buildings.commoner_church === 0,
      }
    );
  } else if (player.faction === 'Nobles') {
    buildings.push(
      {
        type: 'noble_manor',
        name: 'Manor',
        cost: 2,
        built: region.buildings.noble_manor > 0,
        canBuild: region.buildings.noble_manor === 0,
      },
      {
        type: 'noble_monastery',
        name: 'Monastery',
        cost: 2,
        built: region.buildings.noble_monastery > 0,
        canBuild: region.buildings.noble_monastery === 0,
      }
    );
  } else if (player.faction === 'Merchants') {
    if (state.selectedRegion === 'pskov') {
      buildings.push(
        {
          type: 'merchant_mansion',
          name: 'Mansion',
          cost: 2,
          built: region.buildings.merchant_mansion,
          canBuild: region.buildings.merchant_mansion < 7,
        },
        {
          type: 'merchant_church',
          name: 'Church',
          cost: 2,
          built: region.buildings.merchant_church,
          canBuild: region.buildings.merchant_church < 7,
        }
      );
    }
  }

  return buildings;
};

// Calculate victory points
export const calculateVictoryPoints = (player) => {
  return player.improvements;
};

// Check game result
export const getGameResult = (state) => {
  if (state.turn > 20 || state.gameOver) {
    const playerScores = state.players.map((player, index) => ({
      faction: player.faction,
      victoryPoints: calculateVictoryPoints(player),
      money: player.money,
      index,
    }));

    playerScores.sort((a, b) => {
      if (b.victoryPoints !== a.victoryPoints) {
        return b.victoryPoints - a.victoryPoints;
      }
      return b.money - a.money;
    });

    return {
      winner: playerScores[0],
      rankings: playerScores,
      gameOver: state.gameOver,
    };
  }
  return null;
};
