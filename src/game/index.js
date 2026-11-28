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
  EXPEDITION_COST,
  EXPEDITION_MAX_PER_GAME,
  EXPEDITION_PROFIT,
  EXPEDITION_WINDFALL,
  FORTRESS_DEFENSE_BONUS,
  EQUIPMENT_STRENGTH_BONUS,
  ORDER_BASE_STRENGTH,
  DEFENSE_COST_TOTAL,
  ATTACK_COST_TOTAL,
  FORTRESS_COST_TOTAL,
  DEFENSE_COST_PER_PLAYER,
  ATTACK_COST_PER_PLAYER,
  GLORY_PER_COIN,
  MERCHANT_VP_MULTIPLIER,
  MERCHANT_VP_MULTIPLIER_STANDARD,
  getMerchantVpMultiplier,
  setTuning,
  RULESETS,
  getRules,
  RELIGIOUS_BUILDING_TYPES,
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
  PSKOV_NEIGHBOURS,
  getOrderAttackTargets,
  isPskovThreatened,
} from './regions.js';

// Randomness (seedable for tests)
export { random, randomInt, setRandomSource, createSeededRandom } from './random.js';

// Outcomes (result codes the UI translates)
export { createOutcome, setOutcome } from './outcome.js';

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
  getOrderTurnBonus,
  getAttackStrengthLabel,
  calculatePlayerStrength,
  calculateTotalStrength,
  getVictoryChance,
  rollForVictory,
  surrenderRegion,
  executeBattle,
  executeAttack,
  destroyRandomBuildings,
  awardGlory,
  getOrderDefenseStrength,
} from './combat.js';

// Events
export {
  eventTypes,
  eventDeck,
  drawEvent,
  toEventCard,
  resolveEvent,
  getDefenders,
  getVotingResult,
  getAuctionResult,
  getParticipationResult,
} from './events.js';

// AI player logic
export {
  decideConstruction,
  decideEventVote,
  decideAttackVote,
  decideFortressVote,
  decideAttackTarget,
  decideFortressTarget,
} from './ai.js';

// Actions (main entry point for state mutations)
export {
  ActionTypes,
  MAX_TURNS,
  validateAction,
  applyAction,
  nextPhase,
  nextPlayer,
  selectRegion,
  buildBuilding,
  buyEquipment,
  sendExpedition,
  setConstructionReady,
  calculateIncome,
  getAttackFunding,
  getFortressFunding,
  calculateBuildingVictoryPoints,
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
