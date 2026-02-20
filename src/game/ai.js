// AI Player decision engine
// Simple heuristic-based AI for filling empty player slots

import { FACTION_BASE_STRENGTH, BUILDING_TYPES } from './state.js';
import { getValidRepublicAttackTargets, getRegionsForFortress, canSelectRegion } from './regions.js';
import { calculatePlayerStrength, calculateTotalStrength } from './combat.js';

// Defense costs 3 total split among defenders. Reserve enough to cover our share.
const DEFENSE_RESERVE = 1;

/**
 * Decide what to build during the construction phase.
 * Returns an object: { regionName, buildingType, equipmentType }
 * Any field can be null if the AI decides not to act.
 *
 * The AI keeps a reserve so it can afford to defend against Order attacks.
 * It only builds when it has enough money for both the building AND the reserve.
 */
export const decideConstruction = (state, playerIndex) => {
  const player = state.players[playerIndex];
  const result = { regionName: null, buildingType: null, equipmentType: null };

  const buildCost = 2;
  const equipCost = 1;

  // Only build if we can afford it AND still have a defense reserve
  if (player.money >= buildCost + DEFENSE_RESERVE) {
    const buildOption = findBestBuilding(state, playerIndex);
    if (buildOption) {
      result.regionName = buildOption.regionName;
      result.buildingType = buildOption.buildingType;
    }
  }

  // Buy equipment only if we still have enough left over after the reserve
  const moneyAfterBuild = result.buildingType ? player.money - buildCost : player.money;
  if (moneyAfterBuild >= equipCost + DEFENSE_RESERVE) {
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
 * Pick a random element from an array.
 */
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Get the options the AI can afford for a voting event.
 * Returns all options that the player has enough money for.
 */
const getAffordableOptions = (options, playerMoney) => {
  return options.filter(o => {
    if (o.requiresMinMoney && playerMoney < o.requiresMinMoney) return false;
    return true;
  });
};

/**
 * Decide on a voting event (multi-option).
 * Uses randomized choices among affordable options, with some faction bias.
 */
const decideVotingEvent = (state, playerIndex, event) => {
  const player = state.players[playerIndex];
  const options = event.options;

  // Special case: events that punish our own faction - vote against
  if (event.id === 'boyars_take_bribes' && player.faction === 'Nobles') {
    return 'ignore'; // Nobles don't want to investigate themselves
  }

  // If low on money, pick among free/cheap options
  if (player.money < 2) {
    const freeOptions = options.filter(o => !o.costText && !o.requiresMinMoney);
    if (freeOptions.length > 0) return pickRandom(freeOptions).id;
  }

  // Pick randomly from all affordable options
  const affordable = getAffordableOptions(options, player.money);
  if (affordable.length > 0) {
    return pickRandom(affordable).id;
  }

  // Fallback: pick any option at random
  return pickRandom(options).id;
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
