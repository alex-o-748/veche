// AI Player decision engine
// Simple heuristic-based AI for filling empty player slots

import { EXPEDITION_COST, EXPEDITION_MAX_PER_GAME, getRules } from './state.js';
import {
  getValidRepublicAttackTargets,
  getRegionsForFortress,
  canSelectRegion,
  isPskovThreatened,
  PSKOV_NEIGHBOURS,
} from './regions.js';
import { calculateTotalStrength } from './combat.js';
import { randomInt } from './random.js';

// Defense costs 1 per defender. Reserve enough to cover our share.
const DEFENSE_RESERVE = 1;

// In the last turns equipment has no time to pay off, but a funded defence still earns Glory
const LATE_GAME_TURN = 18;

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
  const result = { regionName: null, buildingType: null, equipmentType: null, sendExpedition: false };

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
  const keepForDefence = getRules(state).glory && state.turn >= LATE_GAME_TURN;
  if (!keepForDefence && moneyAfterBuild >= equipCost + DEFENSE_RESERVE) {
    if (player.weapons < 2 && player.weapons <= player.armor) {
      result.equipmentType = 'weapons';
    } else if (player.armor < 2) {
      result.equipmentType = 'armor';
    } else if (player.weapons < 2) {
      result.equipmentType = 'weapons';
    }
  }

  // Merchants: consider sending an expedition if they have remaining uses
  if (player.faction === 'Merchants' && player.expeditions < EXPEDITION_MAX_PER_GAME) {
    const moneyAfterActions = player.money
      - (result.buildingType ? buildCost : 0)
      - (result.equipmentType ? equipCost : 0);
    if (moneyAfterActions >= EXPEDITION_COST + DEFENSE_RESERVE) {
      result.sendExpedition = true;
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

  // Late game (turn 15+): prefer religious buildings for more VP since income has less time to compound
  const preferReligious = state.turn >= 15;

  for (const [regionName, region] of regions) {
    if (faction === 'Commoners') {
      const secular = region.buildings.commoner_huts === 0 ? 'commoner_huts' : null;
      const religious = region.buildings.commoner_church === 0 ? 'commoner_church' : null;
      const pick = preferReligious ? (religious || secular) : (secular || religious);
      if (pick) return { regionName, buildingType: pick };
    } else if (faction === 'Nobles') {
      const secular = region.buildings.noble_manor === 0 ? 'noble_manor' : null;
      const religious = region.buildings.noble_monastery === 0 ? 'noble_monastery' : null;
      const pick = preferReligious ? (religious || secular) : (secular || religious);
      if (pick) return { regionName, buildingType: pick };
    } else if (faction === 'Merchants') {
      // Merchants can only build in Pskov
      if (regionName === 'pskov') {
        const secular = region.buildings.merchant_mansion < 7 ? 'merchant_mansion' : null;
        const religious = region.buildings.merchant_church < 7 ? 'merchant_church' : null;
        const pick = preferReligious ? (religious || secular) : (secular || religious);
        if (pick) return { regionName, buildingType: pick };
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

    case 'auction':
      return decideAuctionBid(state, playerIndex, event);

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

  // Pskov itself may be struck: always defend if we can pay at all
  if (isPskovThreatened(state.regions, getRules(state))) {
    return player.money >= (event.minCostPerPlayer || 1);
  }

  // Minimum possible cost if all 3 players defend (3/3 = 1).
  // Actual cost may be higher if fewer participate (3/2 = 1.5 or 3/1 = 3).
  // The resolution logic will gracefully exclude us if we can't afford the final cost.
  const costPerPlayer = 3 / 3;

  // Volunteer to defend if we can afford at least the minimum cost
  if (player.money >= costPerPlayer) {
    return true;
  }

  // Can't afford it
  return false;
};

/**
 * Pick a random element from an array.
 */
const pickRandom = (arr) => arr[randomInt(arr.length)];

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
  if (player.money < 1) {
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
 * Decide how much to bid in an auction event.
 * AI bids up to half its available money (after keeping defense reserve),
 * with some randomness to avoid predictability.
 * Returns the bid as a string.
 */
const decideAuctionBid = (state, playerIndex, event) => {
  const player = state.players[playerIndex];
  const available = Math.floor(player.money) - DEFENSE_RESERVE;

  if (available < 1) {
    return '0'; // Can't afford to bid
  }

  // Bid between 1 and half of available money (randomized)
  const maxBid = Math.max(1, Math.floor(available / 2));
  const bid = randomInt(maxBid) + 1;
  return String(bid);
};

// Order-held regions next to Pskov: while the Order sits there, it can besiege the capital
const isSiegeBase = (state, regionName) =>
  getRules(state).siege && PSKOV_NEIGHBOURS.includes(regionName) && state.regions[regionName]?.controller === 'order';

/**
 * Pick which Order-held region to campaign against, or null if none can be reached.
 * Driving the Order out of a region next to Pskov comes before anything else.
 */
export const decideAttackTarget = (state) => {
  const targets = getValidRepublicAttackTargets(state.regions);
  if (targets.length === 0) return null;
  const siegeBases = targets.filter((name) => isSiegeBase(state, name));
  const pool = siegeBases.length > 0 ? siegeBases : targets;
  return pool[randomInt(pool.length)];
};

/**
 * Pick where to build a fortress, or null if every region has one.
 * With Pskov in reach of the Order, the regions that guard it come first.
 */
export const decideFortressTarget = (state) => {
  const sites = getRegionsForFortress(state.regions);
  if (sites.length === 0) return null;
  const guards = getRules(state).siege ? sites.filter((name) => PSKOV_NEIGHBOURS.includes(name)) : [];
  const pool = guards.length > 0 ? guards : sites;
  return pool[randomInt(pool.length)];
};

/**
 * Decide whether to vote for an attack during Veche phase.
 * Returns true (join) or false (decline).
 */
export const decideAttackVote = (state, playerIndex) => {
  const player = state.players[playerIndex];
  const costPerParticipant = 2;

  // Don't attack if we can't afford it
  if (player.money < costPerParticipant) {
    return false;
  }

  // Lifting a siege of Pskov is worth any odds
  if (state.attackTarget && isSiegeBase(state, state.attackTarget)) {
    return true;
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
