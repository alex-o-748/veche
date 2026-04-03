// Combat calculations and battle execution

import {
  FACTION_BASE_STRENGTH,
  EQUIPMENT_STRENGTH_BONUS,
  FORTRESS_DEFENSE_BONUS,
  ORDER_TURN_SCALING,
  ORDER_SCALING_INTERVAL,
  BUILDING_NAMES,
  RELIGIOUS_BUILDING_TYPES,
  formatRegionName,
} from './state.js';
import { getStrengthModifier } from './effects.js';

// Calculate Order turn-based strength bonus
// The Order grows stronger over time, gaining ORDER_TURN_SCALING strength
// every ORDER_SCALING_INTERVAL turns.
export const getOrderTurnBonus = (turn) => {
  return Math.floor(turn / ORDER_SCALING_INTERVAL) * ORDER_TURN_SCALING;
};

// Get a descriptive label key for attack strength
export const getAttackStrengthLabel = (strength) => {
  if (strength <= 95) return 'weak';
  if (strength >= 105) return 'strong';
  return 'normal';
};

// Calculate strength for a single player
export const calculatePlayerStrength = (player, activeEffects) => {
  // Base strength by faction
  let strength = FACTION_BASE_STRENGTH[player.faction] || 0;

  // Equipment bonuses
  strength += player.weapons * EQUIPMENT_STRENGTH_BONUS;
  strength += player.armor * EQUIPMENT_STRENGTH_BONUS;

  // Active effects modifier
  strength += getStrengthModifier(activeEffects, player.faction);

  return Math.max(0, strength);
};

// Calculate total strength for multiple players
export const calculateTotalStrength = (players, playerIndices, activeEffects) => {
  return playerIndices.reduce((total, index) => {
    return total + calculatePlayerStrength(players[index], activeEffects);
  }, 0);
};

// Get victory chance based on strength difference
// Linear scaling: each point of strength difference = 1% chance shift
// Clamped to [5, 95] so there's always a small chance either way
export const getVictoryChance = (strengthDiff) => {
  return Math.min(95, Math.max(5, 50 + strengthDiff));
};

// Roll for victory (deterministic version for server use)
export const rollForVictory = (strengthDiff, randomValue = null) => {
  const chancePercent = getVictoryChance(strengthDiff);
  const roll = randomValue !== null ? randomValue * 100 : Math.random() * 100;
  return {
    success: roll < chancePercent,
    roll,
    chancePercent,
  };
};

// Surrender a region to the Order
export const surrenderRegion = (state, regionName) => {
  if (regionName === 'pskov') {
    // Game over - Pskov captured
    return {
      ...state,
      gameOver: true,
      gameEnded: true,
      lastEventResult: 'GAME OVER: Pskov has fallen to the Teutonic Order!',
      battleResult: { type: 'game_over', region: regionName },
    };
  }

  // Lose the region and destroy all buildings except fortresses
  const newRegions = { ...state.regions };
  const region = { ...newRegions[regionName] };
  region.controller = 'order';

  // Destroy buildings and update player improvement counts
  const newPlayers = [...state.players];
  Object.entries(region.buildings).forEach(([buildingType, count]) => {
    if (count > 0) {
      region.buildings = { ...region.buildings, [buildingType]: 0 };

      // Update player improvement count
      newPlayers.forEach((player, index) => {
        if (
          (buildingType.includes('commoner') && player.faction === 'Commoners') ||
          (buildingType.includes('noble') && player.faction === 'Nobles') ||
          (buildingType.includes('merchant') && player.faction === 'Merchants')
        ) {
          const religiousDelta = RELIGIOUS_BUILDING_TYPES.has(buildingType) ? count : 0;
          newPlayers[index] = {
            ...player,
            improvements: Math.max(0, player.improvements - count),
            religiousBuildings: Math.max(0, (player.religiousBuildings || 0) - religiousDelta),
          };
        }
      });
    }
  });

  newRegions[regionName] = region;
  const regionDisplayName = formatRegionName(regionName);

  return {
    ...state,
    regions: newRegions,
    players: newPlayers,
    lastEventResult: `${regionDisplayName} surrendered to the Order! All buildings destroyed.`,
    battleResult: { type: 'surrendered', region: regionName },
  };
};

// Execute a battle (defense)
export const executeBattle = (
  state,
  orderStrength,
  targetRegion,
  defendingPlayers,
  randomValue = null
) => {
  const { players, regions, activeEffects } = state;

  // Calculate Pskov strength
  const pskovStrength = calculateTotalStrength(players, defendingPlayers, activeEffects);

  // Add fortress bonus if defending
  let finalPskovStrength = pskovStrength;
  if (regions[targetRegion]?.fortress) {
    finalPskovStrength += FORTRESS_DEFENSE_BONUS;
  }

  // Calculate strength difference and roll for victory
  const strengthDiff = finalPskovStrength - orderStrength;
  const result = rollForVictory(strengthDiff, randomValue);
  const regionDisplayName = formatRegionName(targetRegion);

  const battleResult = {
    region: targetRegion,
    chancePercent: result.chancePercent,
    pskovStrength: finalPskovStrength,
    orderStrength,
  };

  if (result.success) {
    // Successful defense
    return {
      ...state,
      lastEventResult: `VICTORY! ${regionDisplayName} successfully defended! (${result.chancePercent}% chance)`,
      battleResult: { ...battleResult, type: 'defense_victory' },
    };
  } else {
    // Failed defense - lose region
    const surrenderResult = surrenderRegion(state, targetRegion);
    return {
      ...surrenderResult,
      lastEventResult: `DEFEAT! ${regionDisplayName} lost to the Order! (${result.chancePercent}% chance) ${surrenderResult.lastEventResult}`,
      battleResult: { ...battleResult, type: 'defense_defeat' },
    };
  }
};

// Execute an attack on Order territory
export const executeAttack = (state, targetRegion, attackingPlayers, randomValue = null) => {
  const { players, regions, activeEffects } = state;

  // Calculate Order strength (base 100 + turn bonus + fortress bonus)
  const orderStrength = 100 + getOrderTurnBonus(state.turn) + (regions[targetRegion]?.fortress ? FORTRESS_DEFENSE_BONUS : 0);

  // Calculate Pskov strength (attacking, so no fortress bonus for attackers)
  const pskovStrength = calculateTotalStrength(players, attackingPlayers, activeEffects);

  // Execute battle
  const strengthDiff = pskovStrength - orderStrength;
  const result = rollForVictory(strengthDiff, randomValue);
  const regionDisplayName = formatRegionName(targetRegion);

  const battleResult = {
    region: targetRegion,
    chancePercent: result.chancePercent,
    pskovStrength,
    orderStrength,
  };

  if (result.success) {
    // Successful attack - recapture region
    const newRegions = { ...regions };
    newRegions[targetRegion] = {
      ...newRegions[targetRegion],
      controller: 'republic',
    };

    return {
      newState: {
        ...state,
        regions: newRegions,
        lastEventResult: `VICTORY! ${regionDisplayName} recaptured from the Order! (${result.chancePercent}% chance)`,
        battleResult: { ...battleResult, type: 'attack_victory' },
      },
      success: true,
      result,
    };
  } else {
    // Failed attack
    return {
      newState: {
        ...state,
        lastEventResult: `DEFEAT! Attack on ${regionDisplayName} failed! (${result.chancePercent}% chance)`,
        battleResult: { ...battleResult, type: 'attack_defeat' },
      },
      success: false,
      result,
    };
  }
};

// Destroy random buildings in a region (for events like uprising, fire)
export const destroyRandomBuildings = (state, regionName, count = 1) => {
  const region = state.regions[regionName];
  const buildingTypes = Object.entries(region.buildings).filter(([_, cnt]) => cnt > 0);

  if (buildingTypes.length === 0) {
    return {
      state,
      destroyedBuildings: [],
    };
  }

  let newRegions = { ...state.regions };
  let newPlayers = [...state.players];
  const destroyedBuildings = [];

  // Copy remaining building types for random selection
  const availableBuildings = [...buildingTypes];

  for (let i = 0; i < Math.min(count, buildingTypes.length); i++) {
    if (availableBuildings.length === 0) break;

    const randomIndex = Math.floor(Math.random() * availableBuildings.length);
    const [buildingType, _] = availableBuildings[randomIndex];

    // Destroy the building
    const currentBuildings = { ...newRegions[regionName].buildings };
    if (buildingType.startsWith('merchant_')) {
      currentBuildings[buildingType] = Math.max(0, currentBuildings[buildingType] - 1);
    } else {
      currentBuildings[buildingType] = 0;
    }
    newRegions[regionName] = {
      ...newRegions[regionName],
      buildings: currentBuildings,
    };

    // Update player improvement count
    newPlayers = newPlayers.map((player) => {
      if (
        (buildingType.includes('commoner') && player.faction === 'Commoners') ||
        (buildingType.includes('noble') && player.faction === 'Nobles') ||
        (buildingType.includes('merchant') && player.faction === 'Merchants')
      ) {
        const isReligious = RELIGIOUS_BUILDING_TYPES.has(buildingType);
        return {
          ...player,
          improvements: Math.max(0, player.improvements - 1),
          religiousBuildings: isReligious ? Math.max(0, (player.religiousBuildings || 0) - 1) : (player.religiousBuildings || 0),
        };
      }
      return player;
    });

    destroyedBuildings.push(BUILDING_NAMES[buildingType] || buildingType);

    // Remove from available buildings for next iteration
    availableBuildings.splice(randomIndex, 1);
  }

  return {
    state: {
      ...state,
      regions: newRegions,
      players: newPlayers,
    },
    destroyedBuildings,
  };
};
