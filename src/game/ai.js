// AI Player decision engine
// Simple heuristic-based AI for filling empty player slots

import { FACTION_BASE_STRENGTH, BUILDING_TYPES } from './state.js';
import { getValidRepublicAttackTargets, getRegionsForFortress, canSelectRegion } from './regions.js';
import { calculatePlayerStrength, calculateTotalStrength } from './combat.js';

/**
 * Decide what to build during the construction phase.
 * Returns an object: { regionName, buildingType, equipmentType }
 * Any field can be null if the AI decides not to act.
 */
export const decideConstruction = (state, playerIndex) => {
  const player = state.players[playerIndex];
  const result = { regionName: null, buildingType: null, equipmentType: null };

  // Priority 1: If we can afford a building (cost 2), try to build one
  if (player.money >= 2) {
    const buildOption = findBestBuilding(state, playerIndex);
    if (buildOption) {
      result.regionName = buildOption.regionName;
      result.buildingType = buildOption.buildingType;
    }
  }

  // Priority 2: Buy equipment if we have leftover money (cost 1 each)
  // Prefer weapons if we have fewer weapons than armor, otherwise armor
  if (player.money >= 1 || (result.buildingType && player.money >= 3)) {
    if (player.weapons <= player.armor) {
      result.equipmentType = 'weapons';
    } else {
      result.equipmentType = 'armor';
    }
  }

  return result;
};

/**
 * Find the best building to construct.
 */
const findBestBuilding = (state, playerIndex) => {
  const player = state.players[playerIndex];
  const faction = player.faction;

  // Get buildable regions
  const regions = Object.entries(state.regions).filter(
    ([name, region]) => canSelectRegion(name, region, faction)
  );

  for (const [regionName, region] of regions) {
    if (faction === 'Commoners') {
      if (region.buildings.commoner_huts === 0) {
        return { regionName, buildingType: 'commoner_huts' };
      }
      if (region.buildings.commoner_church === 0) {
        return { regionName, buildingType: 'commoner_church' };
      }
    } else if (faction === 'Nobles') {
      if (region.buildings.noble_manor === 0) {
        return { regionName, buildingType: 'noble_manor' };
      }
      if (region.buildings.noble_monastery === 0) {
        return { regionName, buildingType: 'noble_monastery' };
      }
    } else if (faction === 'Merchants') {
      // Merchants can only build in Pskov
      if (regionName === 'pskov') {
        if (region.buildings.merchant_mansion < 7) {
          return { regionName, buildingType: 'merchant_mansion' };
        }
        if (region.buildings.merchant_church < 7) {
          return { regionName, buildingType: 'merchant_church' };
        }
      }
    }
  }

  return null;
};

/**
 * Decide how to vote on an event.
 * Returns the vote value appropriate for the event type.
 */
export const decideEventVote = (state, playerIndex, event) => {
  const player = state.players[playerIndex];

  switch (event.type) {
    case 'order_attack':
      return decideDefenseVote(state, playerIndex, event);

    case 'voting':
      return decideVotingEvent(state, playerIndex, event);

    case 'participation':
      return decideParticipation(state, playerIndex, event);

    case 'immediate':
      // Immediate events don't need votes
      return null;

    default:
      return true;
  }
};

/**
 * Decide whether to fund defense against Order attack.
 * AI almost always defends - losing regions is bad for everyone.
 */
const decideDefenseVote = (state, playerIndex, event) => {
  const player = state.players[playerIndex];
  const costPerPlayer = 3 / 3; // defense cost split 3 ways = 1 per player

  // Always defend if we can afford it
  if (player.money >= costPerPlayer) {
    return true;
  }

  // Can't afford it
  return false;
};

/**
 * Decide on a voting event (multi-option).
 * Uses simple heuristics based on money and faction interests.
 */
const decideVotingEvent = (state, playerIndex, event) => {
  const player = state.players[playerIndex];
  const options = event.options;

  // Special case: events that punish our own faction - vote against
  if (event.id === 'boyars_take_bribes' && player.faction === 'Nobles') {
    return 'ignore'; // Nobles don't want to investigate themselves
  }
  if (event.id === 'boyars_take_bribes' && player.faction !== 'Nobles') {
    return 'investigate'; // Others want to punish corruption
  }

  // For events with costly options, prefer cheaper ones if low on money
  if (player.money < 2) {
    // Pick the cheapest/free option
    const freeOption = options.find(o => !o.costText && !o.requiresMinMoney);
    if (freeOption) return freeOption.id;
  }

  // For drought - always try to buy food if affordable
  if (event.id === 'drought') {
    return player.money >= 2 ? 'buy_food' : 'no_food';
  }

  // For plague - fund isolation if possible
  if (event.id === 'plague') {
    return player.money >= 1 ? 'fund_isolation' : 'no_isolation';
  }

  // For embassy - receive modestly (safe middle ground)
  if (event.id === 'embassy') {
    if (player.money >= 2) return 'luxurious';
    if (player.money >= 1) return 'modest';
    return 'refuse';
  }

  // For relics - build temple if affordable
  if (event.id === 'relics_found') {
    return player.money >= 3 ? 'build_temple' : 'deception';
  }

  // For merchants robbed - safe option
  if (event.id === 'merchants_robbed') {
    return 'trade_risk'; // safest, no random chance of Order attack
  }

  // For Izhorian delegation
  if (event.id === 'izhorian_delegation') {
    if (player.money >= 2) return 'accept';
    return 'send_back';
  }

  // Default: pick the first option or the default
  return event.defaultOption || (options.length > 0 ? options[0].id : null);
};

/**
 * Decide whether to participate in a participation event.
 */
const decideParticipation = (state, playerIndex, event) => {
  const player = state.players[playerIndex];

  if (event.totalCost) {
    const costPerPlayer = event.totalCost / 3;
    return player.money >= costPerPlayer;
  }

  return true;
};

/**
 * Decide whether to vote for an attack during Veche phase.
 * Returns true (join) or false (decline).
 */
export const decideAttackVote = (state, playerIndex) => {
  const player = state.players[playerIndex];
  const costPerParticipant = 6 / 3; // Assume 3 participants initially

  // Don't attack if we can't afford it
  if (player.money < costPerParticipant) {
    return false;
  }

  // Calculate our total strength
  const totalStrength = calculateTotalStrength(
    state.players,
    [0, 1, 2],
    state.activeEffects
  );

  // Only attack if we're reasonably strong (total > 100)
  return totalStrength > 100;
};

/**
 * Decide whether to vote for fortress construction during Veche.
 * Returns true (fund) or false (decline).
 */
export const decideFortressVote = (state, playerIndex) => {
  const player = state.players[playerIndex];
  const costPerParticipant = 6 / 3;

  // Fund fortress if we can afford it - fortresses are always useful
  return player.money >= costPerParticipant;
};
