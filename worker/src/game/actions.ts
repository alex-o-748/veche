/**
 * Pure state mutation functions for all game actions
 * TypeScript version for Cloudflare Worker
 */

import {
  GameState,
  PHASES,
  createInitialGameState,
  createInitialConstructionActions,
  countRepublicRegions,
  formatRegionName,
  FACTION_BASE_STRENGTH,
  EQUIPMENT_STRENGTH_BONUS,
  FORTRESS_DEFENSE_BONUS,
  Player,
  ActiveEffect,
} from './state';

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
} as const;

export type ActionType = (typeof ActionTypes)[keyof typeof ActionTypes];

// Game action interface
export interface GameAction {
  type: ActionType;
  regionName?: string;
  buildingType?: string;
  item?: 'weapons' | 'armor';
  vote?: string; // Option ID for voting events (e.g., 'rob_foreign', 'trade_risk')
  targetRegion?: string;
}

// Action result interface
export interface ActionResult {
  newState: GameState;
  error?: string;
  result?: {
    type: string;
    [key: string]: unknown;
  };
}

// Random values for server-authoritative randomness
export interface RandomValues {
  battleRoll?: number;
  eventRoll?: number;
  targetRoll?: number;
}

// Equipment costs
const EQUIPMENT_COSTS: Record<string, number> = {
  weapons: 1,
  armor: 1,
};

// Validation result
interface ValidationResult {
  valid?: boolean;
  error?: string;
}

// Validate if an action can be performed
export function validateAction(
  state: GameState,
  action: GameAction,
  playerId: number
): ValidationResult {
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
}

// Get income modifier from active effects
function getIncomeModifier(activeEffects: ActiveEffect[], faction: string): number {
  let modifier = 1.0;
  for (const effect of activeEffects) {
    if (effect.type === 'income' && (effect.target === faction || effect.target === 'all')) {
      modifier += effect.value;
    }
  }
  return modifier;
}

// Get strength modifier from active effects
function getStrengthModifier(activeEffects: ActiveEffect[], faction: string): number {
  let modifier = 0;
  for (const effect of activeEffects) {
    if (effect.type === 'strength' && (effect.target === faction || effect.target === 'all')) {
      modifier += effect.value;
    }
  }
  return modifier;
}

// Calculate player strength
function calculatePlayerStrength(player: Player, activeEffects: ActiveEffect[]): number {
  let strength = FACTION_BASE_STRENGTH[player.faction] || 0;
  strength += player.weapons * EQUIPMENT_STRENGTH_BONUS;
  strength += player.armor * EQUIPMENT_STRENGTH_BONUS;
  strength += getStrengthModifier(activeEffects, player.faction);
  return Math.max(0, strength);
}

// Calculate total strength for multiple players
function calculateTotalStrength(
  players: Player[],
  playerIndices: number[],
  activeEffects: ActiveEffect[]
): number {
  return playerIndices.reduce((total, index) => {
    return total + calculatePlayerStrength(players[index], activeEffects);
  }, 0);
}

// Get victory chance based on strength difference
function getVictoryChance(strengthDiff: number): number {
  if (strengthDiff >= 20) return 95;
  if (strengthDiff >= 15) return 85;
  if (strengthDiff >= 10) return 70;
  if (strengthDiff >= 5) return 60;
  if (strengthDiff >= 0) return 50;
  if (strengthDiff >= -5) return 40;
  if (strengthDiff >= -10) return 30;
  if (strengthDiff >= -15) return 15;
  return 5;
}

// Roll for victory
function rollForVictory(
  strengthDiff: number,
  randomValue: number | null = null
): { success: boolean; roll: number; chancePercent: number } {
  const chancePercent = getVictoryChance(strengthDiff);
  const roll = randomValue !== null ? randomValue * 100 : Math.random() * 100;
  return {
    success: roll < chancePercent,
    roll,
    chancePercent,
  };
}

// Update effects (decrement turns, remove expired)
function updateEffects(state: GameState): GameState {
  const newEffects = state.activeEffects
    .map((effect) => ({ ...effect, turnsRemaining: effect.turnsRemaining - 1 }))
    .filter((effect) => effect.turnsRemaining > 0);

  return { ...state, activeEffects: newEffects };
}

// Phase transition logic
export function nextPhase(state: GameState, debugMode = false): GameState {
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
    // TODO: Implement event drawing with server-side randomness
    newState.currentEvent = null; // Will be set by server
    newState.eventVotes = [null, null, null];
    newState.eventResolved = false;
    newState.eventImageRevealed = false;
    if (debugMode) {
      newState.debugEventIndex = (state.debugEventIndex + 1) % 17;
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

  // Update effects at end of turn
  if (isLastPhase) {
    newState = updateEffects(newState);
  }

  return {
    ...newState,
    phase: nextPhaseName,
    turn: isLastPhase ? state.turn + 1 : state.turn,
  };
}

// Player turn transition
function nextPlayer(state: GameState): GameState {
  return {
    ...state,
    currentPlayer: (state.currentPlayer + 1) % 3,
  };
}

// Region selection
function selectRegion(state: GameState, regionName: string): GameState {
  return {
    ...state,
    selectedRegion: regionName,
  };
}

// Build a building
function buildBuilding(state: GameState, buildingType: string): GameState {
  const player = state.players[state.currentPlayer];

  if (player.money < 2) {
    return state;
  }

  const newPlayers = state.players.map((p, i) =>
    i === state.currentPlayer ? { ...p, money: p.money - 2, improvements: p.improvements + 1 } : p
  );

  const newConstructionActions = state.constructionActions.map((ca, i) =>
    i === state.currentPlayer ? { ...ca, improvement: true } : ca
  );

  const currentRegion = state.regions[state.selectedRegion];
  const currentBuildings = currentRegion.buildings;
  const currentCount = currentBuildings[buildingType] ?? 0;
  const newBuildings = {
    ...currentBuildings,
    [buildingType]: buildingType.startsWith('merchant_') ? currentCount + 1 : 1,
  };

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
}

// Buy equipment
function buyEquipment(state: GameState, item: 'weapons' | 'armor'): GameState {
  const playerIndex = state.currentPlayer;
  const player = state.players[playerIndex];
  const cost = EQUIPMENT_COSTS[item] || 1;

  if (player.money < cost) {
    return state;
  }

  const newPlayers = state.players.map((p, i) =>
    i === playerIndex ? { ...p, money: p.money - cost, [item]: p[item] + 1 } : p
  );

  const newConstructionActions = state.constructionActions.map((action, i) =>
    i === playerIndex ? { ...action, equipment: true } : action
  );

  return {
    ...state,
    players: newPlayers,
    constructionActions: newConstructionActions,
  };
}

// Vote on event
function voteOnEvent(state: GameState, playerIndex: number, vote: string): GameState {
  const newVotes = [...state.eventVotes];
  newVotes[playerIndex] = vote;
  return { ...state, eventVotes: newVotes };
}

// Attack planning
function initiateAttack(state: GameState, targetRegion: string): GameState {
  return {
    ...state,
    attackPlanning: 'planning',
    attackTarget: targetRegion,
    attackVotes: [null, null, null],
  };
}

function voteOnAttack(state: GameState, playerIndex: number, vote: boolean): GameState {
  const newVotes = [...state.attackVotes];
  newVotes[playerIndex] = vote;
  return { ...state, attackVotes: newVotes };
}

function cancelAttack(state: GameState): GameState {
  return {
    ...state,
    attackPlanning: null,
    attackTarget: null,
    attackVotes: [null, null, null],
  };
}

function executeAttack(state: GameState, randomValues: RandomValues): ActionResult {
  const { attackTarget, attackVotes, players, regions, activeEffects } = state;
  const participants = attackVotes.filter((v) => v === true).length;

  if (participants === 0 || !attackTarget) {
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
  const attackingPlayers: number[] = [];
  attackVotes.forEach((vote, index) => {
    if (vote === true) attackingPlayers.push(index);
  });

  // Calculate Order strength
  const orderStrength = 100 + (regions[attackTarget]?.fortress ? FORTRESS_DEFENSE_BONUS : 0);

  // Calculate Pskov strength
  const pskovStrength = calculateTotalStrength(newPlayers, attackingPlayers, activeEffects);

  // Execute combat
  const strengthDiff = pskovStrength - orderStrength;
  const result = rollForVictory(strengthDiff, randomValues.battleRoll ?? null);
  const regionDisplayName = formatRegionName(attackTarget);

  if (result.success) {
    // Successful attack - recapture region
    const newRegions = {
      ...regions,
      [attackTarget]: {
        ...regions[attackTarget],
        controller: 'republic' as const,
      },
    };

    return {
      newState: {
        ...state,
        players: newPlayers,
        regions: newRegions,
        attackPlanning: null,
        attackTarget: null,
        attackVotes: [null, null, null],
        lastEventResult: `VICTORY! ${regionDisplayName} recaptured from the Order! (${result.chancePercent}% chance, Strength: ${pskovStrength} vs ${orderStrength})`,
      },
      result: {
        type: 'attack_executed',
        success: true,
      },
    };
  } else {
    return {
      newState: {
        ...state,
        players: newPlayers,
        attackPlanning: null,
        attackTarget: null,
        attackVotes: [null, null, null],
        lastEventResult: `DEFEAT! Attack on ${regionDisplayName} failed! (${result.chancePercent}% chance, Strength: ${pskovStrength} vs ${orderStrength})`,
      },
      result: {
        type: 'attack_executed',
        success: false,
      },
    };
  }
}

// Fortress planning
function initiateFortress(state: GameState, targetRegion: string): GameState {
  return {
    ...state,
    fortressPlanning: 'planning',
    fortressTarget: targetRegion,
    fortressVotes: [null, null, null],
  };
}

function voteOnFortress(state: GameState, playerIndex: number, vote: boolean): GameState {
  const newVotes = [...state.fortressVotes];
  newVotes[playerIndex] = vote;
  return { ...state, fortressVotes: newVotes };
}

function cancelFortress(state: GameState): GameState {
  return {
    ...state,
    fortressPlanning: null,
    fortressTarget: null,
    fortressVotes: [null, null, null],
  };
}

function executeFortress(state: GameState): ActionResult {
  const { fortressTarget, fortressVotes, players, regions } = state;
  const participants = fortressVotes.filter((v) => v === true).length;

  if (participants === 0 || !fortressTarget) {
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
    ...regions,
    [fortressTarget]: {
      ...regions[fortressTarget],
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
}

// Apply an action to the game state
export function applyAction(
  state: GameState,
  action: GameAction,
  playerId: number | null = null,
  randomValues: RandomValues = {}
): ActionResult {
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
        newState: selectRegion(state, action.regionName || 'pskov'),
        result: { type: 'region_selected' },
      };

    case ActionTypes.BUILD_BUILDING:
      return {
        newState: buildBuilding(state, action.buildingType || ''),
        result: { type: 'building_built' },
      };

    case ActionTypes.BUY_EQUIPMENT:
      return {
        newState: buyEquipment(state, action.item || 'weapons'),
        result: { type: 'equipment_bought' },
      };

    case ActionTypes.VOTE_EVENT:
      if (playerId === null) return { newState: state, error: 'Player ID required' };
      if (!action.vote) return { newState: state, error: 'Vote option required' };
      return {
        newState: voteOnEvent(state, playerId, action.vote),
        result: { type: 'vote_cast' },
      };

    case ActionTypes.RESOLVE_EVENT:
      // TODO: Implement event resolution with server-side randomness
      return {
        newState: { ...state, eventResolved: true },
        result: { type: 'event_resolved' },
      };

    case ActionTypes.INITIATE_ATTACK:
      return {
        newState: initiateAttack(state, action.targetRegion || ''),
        result: { type: 'attack_initiated' },
      };

    case ActionTypes.VOTE_ATTACK:
      if (playerId === null) return { newState: state, error: 'Player ID required' };
      return {
        newState: voteOnAttack(state, playerId, action.vote ?? false),
        result: { type: 'attack_vote_cast' },
      };

    case ActionTypes.EXECUTE_ATTACK:
      return executeAttack(state, randomValues);

    case ActionTypes.CANCEL_ATTACK:
      return {
        newState: cancelAttack(state),
        result: { type: 'attack_cancelled' },
      };

    case ActionTypes.INITIATE_FORTRESS:
      return {
        newState: initiateFortress(state, action.targetRegion || ''),
        result: { type: 'fortress_initiated' },
      };

    case ActionTypes.VOTE_FORTRESS:
      if (playerId === null) return { newState: state, error: 'Player ID required' };
      return {
        newState: voteOnFortress(state, playerId, action.vote ?? false),
        result: { type: 'fortress_vote_cast' },
      };

    case ActionTypes.EXECUTE_FORTRESS:
      return executeFortress(state);

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
}
