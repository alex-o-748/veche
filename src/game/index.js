// Game logic module exports
// This file re-exports all game logic for easy importing

// State and constants
export {
  PHASES,
  PHASE_NAMES,
  PHASE_DESCRIPTIONS,
  FACTIONS,
  FACTION_BASE_STRENGTH,
  BUILDING_TYPES,
  BUILDING_NAMES,
  EQUIPMENT_COSTS,
  FORTRESS_DEFENSE_BONUS,
  EQUIPMENT_STRENGTH_BONUS,
  ORDER_BASE_STRENGTH,
  DEFENSE_COST_TOTAL,
  ATTACK_COST_TOTAL,
  FORTRESS_COST_TOTAL,
  createRegionBuildings,
  createInitialRegions,
  createInitialPlayers,
  createInitialConstructionActions,
  createInitialGameState,
  formatRegionName,
} from './state.js';

// Region logic
export {
  MAP_ADJACENCY,
  getValidOrderAttackTargets,
  getValidRepublicAttackTargets,
  countRepublicRegions,
  getRegionsWithFortresses,
  getRegionsForFortress,
  canSelectRegion,
  getRegionBuildings,
} from './regions.js';

// Effects management
export {
  createEffect,
  addEffect,
  addEffects,
  updateEffects,
  getStrengthModifier,
  getIncomeModifier,
  hasPenaltyEffects,
  getEffectsForFaction,
  createStrengthBonus,
  createStrengthPenalty,
  createIncomePenalty,
} from './effects.js';

// Combat calculations
export {
  calculatePlayerStrength,
  calculateTotalStrength,
  getVictoryChance,
  rollForVictory,
  surrenderRegion,
  executeBattle,
  executeAttack,
  destroyRandomBuildings,
} from './combat.js';

// Events
export {
  eventTypes,
  eventDeck,
  drawEvent,
  resolveEvent,
  getVotingResult,
  getParticipationResult,
} from './events.js';

// AI player logic
export {
  decideConstruction,
  decideEventVote,
  decideAttackVote,
  decideFortressVote,
} from './ai.js';

// Actions (main entry point for state mutations)
export {
  ActionTypes,
  validateAction,
  applyAction,
  nextPhase,
  nextPlayer,
  selectRegion,
  buildBuilding,
  buyEquipment,
  voteOnEvent,
  resolveCurrentEvent,
  initiateAttack,
  voteOnAttack,
  executeAttackAction,
  cancelAttack,
  initiateFortress,
  voteOnFortress,
  executeFortressAction,
  cancelFortress,
  getAvailableBuildings,
  calculateVictoryPoints,
  getGameResult,
} from './actions.js';
