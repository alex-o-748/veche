import React, { useEffect, useState } from 'react';
import { FACTION_IMAGES, BUILDING_IMAGES, EVENT_IMAGES, EQUIPMENT_IMAGES, getEventImage, getEquipmentImage } from './imageAssets';

// Import Zustand store
import { useGameStore } from './store/gameStore';

// Import UI components
import { MainMenu, Lobby } from './components';

// Import game logic from modular structure
import {
  // Constants
  PHASES,
  PHASE_NAMES,
  PHASE_DESCRIPTIONS,
  BUILDING_NAMES,
  FORTRESS_DEFENSE_BONUS,

  // Region logic
  MAP_ADJACENCY,
  getValidOrderAttackTargets,
  getValidRepublicAttackTargets,
  countRepublicRegions,
  getRegionsForFortress,

  // Effects
  createEffect,
  getStrengthModifier as getStrengthModifierPure,
  getIncomeModifier as getIncomeModifierPure,

  // Combat
  calculatePlayerStrength as calculatePlayerStrengthPure,
  getVictoryChance,
  rollForVictory as rollForVictoryPure,
  surrenderRegion as surrenderRegionPure,
  executeBattle as executeBattlePure,
  destroyRandomBuildings,

  // Events
  eventDeck,
  eventTypes as eventTypesPure,
  drawEvent as drawEventPure,

  // State
  createInitialGameState,
  formatRegionName,
} from './game';

const PskovGame = () => {
  // Get state and actions from Zustand store
  const gameState = useGameStore((state) => state.gameState);
  const setGameState = useGameStore((state) => state.setGameState);
  const initLocalGame = useGameStore((state) => state.initLocalGame);
  const debugMode = useGameStore((state) => state.debugMode);
  const mode = useGameStore((state) => state.mode);
  const playerId = useGameStore((state) => state.playerId);
  const sendAction = useGameStore((state) => state.sendAction);

  // Debug mode - set to true for predictable event order
  const DEBUG_MODE = debugMode;

  // Initialize game on mount (only once)
  useEffect(() => {
    const store = useGameStore.getState();
    if (!store.gameState) {
      store.initLocalGame();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency - run only on mount

  // Animate event image reveal after 2 seconds
  useEffect(() => {
    if (gameState?.currentEvent && !gameState?.eventImageRevealed) {
      const timer = setTimeout(() => {
        // Use functional update to avoid stale closure
        setGameState(prev => ({
          ...prev,
          eventImageRevealed: true
        }));
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [gameState?.currentEvent, gameState?.eventImageRevealed, setGameState]);

  // Show loading state while initializing
  if (!gameState) {
    return (
      <div className="max-w-4xl mx-auto p-6 bg-amber-50 min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading game...</div>
      </div>
    );
  }

  const phases = ['resources', 'construction', 'events', 'veche'];
  const phaseNames = {
    resources: 'Resources',
    construction: 'Construction', 
    events: 'Events',
    veche: 'City Assembly',
  };

  // Effects management functions
  const addEffect = (newEffect) => {
    setGameState(prev => ({
      ...prev,
      activeEffects: [...prev.activeEffects, {
        ...newEffect,
        id: `${newEffect.type}_${Date.now()}` // Generate unique ID
      }]
    }));
  };

  const updateEffects = () => {
    setGameState(prev => ({
      ...prev,
      activeEffects: prev.activeEffects
        .map(effect => ({
          ...effect,
          turnsRemaining: effect.turnsRemaining - 1
        }))
        .filter(effect => effect.turnsRemaining > 0)
    }));
  };

  // Calculate strength modifiers from active effects
  const getStrengthModifier = (faction) => {
    return gameState.activeEffects.reduce((total, effect) => {
      if (effect.type === 'strength_bonus' || effect.type === 'strength_penalty') {
        if (effect.target === 'all' || effect.target === faction) {
          return total + effect.value;
        }
      }
      return total;
    }, 0);
  };

  // Calculate income modifiers from active effects
  const getIncomeModifier = (faction) => {
    let modifier = 1.0; // Start with 100%
    gameState.activeEffects.forEach(effect => {
      if (effect.type === 'income_penalty') {
        if (effect.target === 'all' || effect.target === faction) {
          modifier *= (1 + effect.value); // value should be negative (e.g., -0.5 for -50%)
        }
      }
    });
    return modifier;
  };

  // Military calculation functions
  const calculatePlayerStrength = (playerIndex, isDefending = false, regionName = null) => {
    const player = gameState.players[playerIndex];

    // Base strength by faction
    let strength = 0;
    if (player.faction === 'Nobles') strength = 40;
    else if (player.faction === 'Merchants') strength = 15;
    else if (player.faction === 'Commoners') strength = 25;

    // Equipment bonuses
    strength += player.weapons * 5;
    strength += player.armor * 5;

    // Note: Fortress bonus is applied once to total strength in executeBattle, not per-player

    // Active effects
    strength += getStrengthModifier(player.faction);

    return Math.max(0, strength);
  };

  const calculateTotalPskovStrength = (participants, isDefending = false, regionName = null) => {
    return participants.reduce((total, playerIndex) => {
      return total + calculatePlayerStrength(playerIndex, isDefending, regionName);
    }, 0);
  };

  const getVictoryChance = (strengthDiff) => {
    if (strengthDiff >= 20) return 95;      // almost certain
    if (strengthDiff >= 15) return 85;      // very high chance
    if (strengthDiff >= 10) return 70;      // high chance
    if (strengthDiff >= 5) return 60;       // good chance
    if (strengthDiff >= 0) return 50;       // even
    if (strengthDiff >= -5) return 40;      // slightly unfavorable
    if (strengthDiff >= -10) return 30;     // low chance
    if (strengthDiff >= -15) return 15;     // very low chance
    return 5;                               // almost no chance
  };

  const rollForVictory = (strengthDiff) => {
    const chancePercent = getVictoryChance(strengthDiff);
    const roll = Math.random() * 100;
    return roll < chancePercent;
  };

  // Battle outcome functions
  const surrenderRegion = (gameState, regionName) => {

    console.log("=== SURRENDER REGION START ===");
    console.log("Surrendering region:", regionName);
    console.log("Regions before surrender:", Object.entries(gameState.regions).map(([name, region]) => `${name}: ${region.controller}`));

    if (regionName === 'pskov') {
      // Game over - Pskov captured
      return {
        ...gameState,
        gameOver: true,
        lastEventResult: '💀 GAME OVER: Pskov has fallen to the Teutonic Order!'
      };
    }

    // Lose the region and destroy all buildings except fortresses
    const newRegions = { ...gameState.regions };
    newRegions[regionName].controller = 'order';

    // Destroy buildings and update player improvement counts
    const newPlayers = [...gameState.players];
    Object.entries(newRegions[regionName].buildings).forEach(([buildingType, count]) => {
      if (count > 0) {
        newRegions[regionName].buildings[buildingType] = 0;

        // Update player improvement count
        newPlayers.forEach((player, index) => {
          if ((buildingType.includes('commoner') && player.faction === 'Commoners') ||
              (buildingType.includes('noble') && player.faction === 'Nobles') ||
              (buildingType.includes('merchant') && player.faction === 'Merchants')) {
            newPlayers[index] = { ...player, improvements: Math.max(0, player.improvements - count) };
          }
        });
      }
    });

    const regionDisplayName = regionName === 'bearhill' ? 'Bear Hill' : regionName.charAt(0).toUpperCase() + regionName.slice(1);

    console.log("Regions after surrender:", Object.entries(newRegions).map(([name, region]) => `${name}: ${region.controller}`));
    console.log("=== SURRENDER REGION END ===");
    
    return {
      ...gameState,
      regions: newRegions,
      players: newPlayers,
      lastEventResult: `${regionDisplayName} surrendered to the Order! All buildings destroyed.`
    };
  };

  const executeBattle = (gameState, orderStrength, targetRegion, defendingPlayers) => {
    // Calculate Pskov strength
    const pskovStrength = calculateTotalPskovStrength(defendingPlayers, true, targetRegion);

    // Add fortress bonus if defending
    let finalPskovStrength = pskovStrength;
    if (gameState.regions[targetRegion]?.fortress) {
      finalPskovStrength += 10;
    }

    // Calculate strength difference and roll for victory
    const strengthDiff = finalPskovStrength - orderStrength;
    const pskovWins = rollForVictory(strengthDiff);
    const chancePercent = getVictoryChance(strengthDiff);

    const regionDisplayName = targetRegion === 'bearhill' ? 'Bear Hill' : targetRegion.charAt(0).toUpperCase() + targetRegion.slice(1);

    if (pskovWins) {
      // Successful defense
      return {
        ...gameState,
        lastEventResult: `🛡️ VICTORY! ${regionDisplayName} successfully defended! (${chancePercent}% chance, Strength: ${finalPskovStrength} vs ${orderStrength})`
      };
    } else {
      // Failed defense - lose region
      const result = surrenderRegion(gameState, targetRegion);
      return {
        ...result,
        lastEventResult: `💀 DEFEAT! ${regionDisplayName} lost to the Order! (${chancePercent}% chance, Strength: ${finalPskovStrength} vs ${orderStrength}) ${result.lastEventResult}`
      };
    }
  };

  const initiateAttack = (targetRegion) => {
    setGameState(prev => ({
      ...prev,
      attackPlanning: 'planning',
      attackTarget: targetRegion,
      attackVotes: [null, null, null]
    }));
  };

  const executeAttack = () => {
    const { attackTarget, attackVotes } = gameState;
    const participants = attackVotes.filter(v => v === true).length;
    const costPerParticipant = participants > 0 ? (6 / participants) : 0;

    // Deduct money from participants
    const newPlayers = gameState.players.map((player, index) => {
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

    // Calculate Order strength (base 100 + fortress bonus)
    const orderStrength = 100 + (gameState.regions[attackTarget]?.fortress ? 10 : 0);

    // Calculate Pskov strength (attacking, so no fortress bonus for defenders)
    const pskovStrength = calculateTotalPskovStrength(attackingPlayers, false, null);

    // Execute battle
    const strengthDiff = pskovStrength - orderStrength;
    const pskovWins = rollForVictory(strengthDiff);
    const chancePercent = getVictoryChance(strengthDiff);
    const regionDisplayName = attackTarget === 'bearhill' ? 'Bear Hill' : attackTarget.charAt(0).toUpperCase() + attackTarget.slice(1);

    setGameState(prev => {
      if (pskovWins) {
        // Successful attack - recapture region
        const newRegions = { ...prev.regions };
        newRegions[attackTarget].controller = 'republic';

        return {
          ...prev,
          players: newPlayers,
          regions: newRegions,
          attackPlanning: null,
          attackTarget: null,
          attackVotes: [null, null, null],
          lastEventResult: `⚔️ VICTORY! ${regionDisplayName} recaptured from the Order! (${chancePercent}% chance, Strength: ${pskovStrength} vs ${orderStrength})`
        };
      } else {
        // Failed attack
        return {
          ...prev,
          players: newPlayers,
          attackPlanning: null,
          attackTarget: null,
          attackVotes: [null, null, null],
          lastEventResult: `💀 DEFEAT! Attack on ${regionDisplayName} failed! (${chancePercent}% chance, Strength: ${pskovStrength} vs ${orderStrength})`
        };
      }
    });
  };

  // Fortress building functions
  const initiateFortressBuild = (targetRegion) => {
    setGameState(prev => ({
      ...prev,
      fortressPlanning: 'planning',
      fortressTarget: targetRegion,
      fortressVotes: [null, null, null]
    }));
  };

  const executeFortressBuild = () => {
    const { fortressTarget, fortressVotes } = gameState;
    const participants = fortressVotes.filter(v => v === true).length;
    const costPerParticipant = participants > 0 ? (6 / participants) : 0;

    // Check if all participants can afford their share
    let allCanAfford = true;
    gameState.players.forEach((player, index) => {
      if (fortressVotes[index] === true && player.money < costPerParticipant) {
        allCanAfford = false;
      }
    });

    if (participants === 0 || !allCanAfford) {
      // Not enough funding - cancel
      setGameState(prev => ({
        ...prev,
        fortressPlanning: null,
        fortressTarget: null,
        fortressVotes: [null, null, null],
        lastEventResult: '❌ Fortress construction cancelled - insufficient funding!'
      }));
      return;
    }

    // Deduct money from participants
    const newPlayers = gameState.players.map((player, index) => {
      if (fortressVotes[index] === true) {
        return { ...player, money: player.money - costPerParticipant };
      }
      return player;
    });

    // Build the fortress
    const newRegions = { ...gameState.regions };
    newRegions[fortressTarget].fortress = true;

    const regionDisplayName = fortressTarget === 'bearhill' ? 'Bear Hill' : fortressTarget.charAt(0).toUpperCase() + fortressTarget.slice(1);

    setGameState(prev => ({
      ...prev,
      players: newPlayers,
      regions: newRegions,
      fortressPlanning: null,
      fortressTarget: null,
      fortressVotes: [null, null, null],
      lastEventResult: `🏰 Fortress built in ${regionDisplayName}! (+10 defense bonus)`
    }));
  };

  // Event system abstraction
  const eventTypes = {
    immediate: {
      resolve: (event, gameState) => {
        return event.effect(gameState);
      }
    },
    participation: {
      resolve: (event, gameState, votes) => {
        const participants = votes.filter(v => v === true).length;
        const costPerParticipant = participants > 0 ? event.totalCost / participants : 0;

        let allCanAfford = true;
        gameState.players.forEach((player, index) => {
          if (votes[index] === true && player.money < costPerParticipant) {
            allCanAfford = false;
          }
        });

        if (!allCanAfford || participants === 0) {
          return gameState;
        }

        const newPlayers = gameState.players.map((player, index) => {
          if (votes[index] === true) {
            return { ...player, money: player.money - costPerParticipant };
          }
          return player;
        });

        return { ...gameState, players: newPlayers };
      }
    },
    order_attack: {
      resolve: (event, gameState, votes) => {
        console.log("=== ORDER ATTACK START ===");
        console.log("Initial regions:", Object.entries(gameState.regions).map(([name, region]) => `${name}: ${region.controller}`));

        // Get valid attack targets using map adjacency (only regions adjacent to Order territory)
        const validTargets = getValidOrderAttackTargets(gameState.regions);

        // Filter out Pskov initially (only attack Pskov if it's the only valid target)
        const nonPskovTargets = validTargets.filter(name => name !== 'pskov');

        console.log("Valid attack targets (adjacent to Order):", validTargets);
        console.log("Non-Pskov targets:", nonPskovTargets);

        let targetRegion;
        if (nonPskovTargets.length > 0) {
          // Random target from valid adjacent regions (excluding Pskov)
          const randomIndex = Math.floor(Math.random() * nonPskovTargets.length);
          targetRegion = nonPskovTargets[randomIndex];
        } else if (validTargets.includes('pskov')) {
          // Only Pskov is a valid target - attack Pskov
          targetRegion = 'pskov';
        } else {
          // No valid targets (shouldn't happen in normal gameplay)
          console.log("No valid attack targets - Order cannot attack");
          return { ...gameState, lastEventResult: 'The Teutonic Order could not find a valid target to attack.' };
        }

        console.log("Selected target region:", targetRegion);

        const participants = votes.filter(v => v === true).length;
        const costPerParticipant = participants > 0 ? 3 / participants : 0;

        console.log("Participants:", participants, "Cost per participant:", costPerParticipant);
        console.log("Votes:", votes);

        // Check if defense is funded
        let allCanAfford = true;
        let defendingPlayers = [];

        gameState.players.forEach((player, index) => {
          if (votes[index] === true) {
            if (player.money < costPerParticipant) {
              allCanAfford = false;
            } else {
              defendingPlayers.push(index);
            }
          }
        });

        const defenseFunded = participants > 0 && allCanAfford;

        console.log("Defense funded:", defenseFunded);

        if (!defenseFunded) {
          // Surrender - lose the region immediately
          return surrenderRegion(gameState, targetRegion);
        }

        // Deduct money from participants
        const newPlayers = gameState.players.map((player, index) => {
          if (votes[index] === true) {
            return { ...player, money: player.money - costPerParticipant };
          }
          return player;
        });

        // Execute the battle
        const gameStateWithPayment = {
          ...gameState,
          players: newPlayers
        };

        return executeBattle(gameStateWithPayment, event.orderStrength, targetRegion, defendingPlayers);
      }
    },
    voting: {
      resolve: (event, gameState, votes) => {
        const voteCounts = {};
        votes.forEach(vote => {
          if (vote) {
            voteCounts[vote] = (voteCounts[vote] || 0) + 1;
          }
        });

        let winningOption = event.defaultOption || 'send_back';
        let maxVotes = 0;
        Object.entries(voteCounts).forEach(([option, count]) => {
          if (count >= 2) {
            if (count > maxVotes) {
              maxVotes = count;
              winningOption = option;
            }
          }
        });

        if (winningOption === 'accept' && event.acceptCost) {
          const acceptVoters = votes.filter(v => v === 'accept').length;
          const costPerVoter = acceptVoters > 0 ? event.acceptCost / acceptVoters : 0;

          let allCanAfford = true;
          gameState.players.forEach((player, index) => {
            if (votes[index] === 'accept' && player.money < costPerVoter) {
              allCanAfford = false;
            }
          });

          if (!allCanAfford || acceptVoters === 0) {
            winningOption = event.defaultOption || 'send_back';
          }
        }

        return event.effects[winningOption](gameState, votes);
      }
    }
  };

  // Event deck with all events
  const eventDeck = [
    {
      id: 'merchants_robbed',
      name: 'Merchants Robbed',
      description: 'Foreign merchants have been robbed near your borders. How will you respond?',
      type: 'voting',
      defaultOption: 'trade_risk',
      options: [
        { id: 'rob_foreign', name: 'Rob foreign merchants', effectText: '50% chance: Order attacks (100)' },
        { id: 'demand_compensation', name: 'Demand compensation', costText: 'Merchants: -1○', effectText: '50% chance: Merchants -10 str/3 turns' },
        { id: 'trade_risk', name: 'Trade is risk', effectText: 'Merchants: -10 str/3 turns' }
      ],
      effects: {
        rob_foreign: (gameState) => {
          // Roll 1-6, on 1-3 Order attack occurs
          const roll = Math.floor(Math.random() * 6) + 1;

          if (roll <= 3) {
            // Trigger immediate Order attack with strength 100
            const orderAttackEvent = {
              id: 'order_attack_rob_foreign',
              name: 'Order Attack (100)',
              description: 'The Teutonic Order retaliates for the robbed merchants! They attack with strength 100.',
              type: 'order_attack',
              orderStrength: 100,
              question: 'Who will help fund the defense? Cost will be split evenly among participants.',
              minCostPerPlayer: 1,
              successText: 'DEFENSE FUNDED',
              failureText: 'NO DEFENSE - SURRENDER'
            };

            return {
              ...gameState,
              currentEvent: orderAttackEvent,
              eventResolved: false,
              eventVotes: [null, null, null],
              lastEventResult: `Rolled ${roll}! The Order attacks immediately!`
            };
          } else {
            return {
              ...gameState,
              lastEventResult: `Rolled ${roll}. The robbery went unnoticed.`
            };
          }
        },
        demand_compensation: (gameState) => {
          const newPlayers = gameState.players.map(player => {
            if (player.faction === 'Merchants') {
              return { ...player, money: Math.max(0, player.money - 1) };
            }
            return player;
          });
          const rollFailed = Math.random() < 0.5;
          if (rollFailed) {
            const merchantWeaknessEffect = {
              id: `merchant_weakness_${Date.now()}`,
              type: 'strength_penalty',
              target: 'Merchants',
              value: -10, // TODO -50% strength implemented as flat -10 points for now
              turnsRemaining: 3,
              description: 'Merchant trading weakness'
            };
            return {
              ...gameState,
              players: newPlayers,
              activeEffects: [...gameState.activeEffects, merchantWeaknessEffect],
              lastEventResult: 'Compensation demand failed! Merchants weakened for 3 turns.'
            };
          } else {
            return {
              ...gameState,
              players: newPlayers,
              lastEventResult: 'Compensation received successfully.'
            };
          }
        },
        trade_risk: (gameState) => {
          const merchantWeaknessEffect = {
            id: `merchant_weakness_${Date.now()}`,
            type: 'strength_penalty',
            target: 'Merchants',
            value: -10, // -50% strength
            turnsRemaining: 3,
            description: 'Trade route disruption'
          };
          return {
            ...gameState,
            activeEffects: [...gameState.activeEffects, merchantWeaknessEffect],
            lastEventResult: 'Trade routes disrupted! Merchants lose 50% strength for 3 turns.'
          };
        }
      }
    },
    {
      id: 'order_attack_95',
      name: 'Order Attack (95)',
      description: 'The Teutonic Order attacks with strength 95. Who will contribute to the defense?',
      type: 'order_attack',
      orderStrength: 95,
      question: 'Who will help fund the defense? Cost will be split evenly among participants.',
      minCostPerPlayer: 1
    },
    {
      id: 'order_attack_110',
      name: 'Order Attack (110)',
      description: 'The Teutonic Order attacks with strength 110. Who will contribute to the defense?',
      type: 'order_attack',  // CHANGE FROM 'participation' TO 'order_attack'
      orderStrength: 110,    // ADD THIS
      question: 'Who will help fund the defense? Cost will be split evenly among participants.',
      minCostPerPlayer: 1
    },
    {
      id: 'boyars_take_bribes',
      name: 'Nobles Take Bribes',
      description: 'Noble corruption has been discovered. How will you handle this?',
      type: 'voting',
      defaultOption: 'ignore',
      options: [
        { id: 'investigate', name: 'Investigate and punish', costText: 'Nobles: -2○', effectText: 'Nobles: -15 str/3 turns' },
        { id: 'ignore', name: 'This is the way it is', effectText: '50% chance: Uprising (buildings destroyed)' }
      ],
      effects: {
        investigate: (gameState) => {
          const newPlayers = gameState.players.map((player, index) => {
            if (player.faction === 'Nobles') {
              return { ...player, money: Math.max(0, player.money - 2) };
            }
            return player;
          });

          // ADD: Noble strength penalty for corruption investigation
          const nobleWeaknessEffect = {
            id: `noble_corruption_penalty_${Date.now()}`,
            type: 'strength_penalty',
            target: 'Nobles',
            value: -15,
            turnsRemaining: 3,
            description: 'Noble corruption investigation penalty'
          };

          return { 
            ...gameState, 
            players: newPlayers,
            activeEffects: [...gameState.activeEffects, nobleWeaknessEffect],
            lastEventResult: 'Nobles punished for corruption! -2○ and -15 strength for 3 turns.'
          };
        },
        ignore: (gameState) => {
          // 50% chance of uprising
          const uprisingRoll = Math.random();
          if (uprisingRoll < 0.5) {
            // Uprising occurs - destroy 2 random buildings in Pskov
            const pskovRegion = gameState.regions.pskov;
            const buildingTypes = Object.entries(pskovRegion.buildings).filter(([_, count]) => count > 0);

            let newRegions = { ...gameState.regions };
            let newPlayers = [...gameState.players];
            let destroyedBuildings = [];

            // Destroy up to 2 buildings
            for (let i = 0; i < Math.min(2, buildingTypes.length); i++) {
              if (buildingTypes.length > 0) {
                const randomIndex = Math.floor(Math.random() * buildingTypes.length);
                const [buildingType, _] = buildingTypes[randomIndex];

                // Destroy the building
                if (buildingType.startsWith('merchant_')) {
                  newRegions.pskov.buildings[buildingType] = Math.max(0, newRegions.pskov.buildings[buildingType] - 1);
                } else {
                  newRegions.pskov.buildings[buildingType] = 0;
                }

                // Update player improvement count
                newPlayers = newPlayers.map(player => {
                  if ((buildingType.includes('commoner') && player.faction === 'Commoners') ||
                      (buildingType.includes('noble') && player.faction === 'Nobles') ||
                      (buildingType.includes('merchant') && player.faction === 'Merchants')) {
                    return { ...player, improvements: Math.max(0, player.improvements - 1) };
                  }
                  return player;
                });

                // Track destroyed building for message
                const buildingNames = {
                  'commoner_huts': 'Huts',
                  'commoner_church': 'Village Church',
                  'noble_manor': 'Manor',
                  'noble_monastery': 'Monastery',
                  'merchant_mansion': 'Mansion',
                  'merchant_church': 'Merchant Church'
                };
                destroyedBuildings.push(buildingNames[buildingType] || buildingType);

                // Remove from available buildings for next iteration
                buildingTypes.splice(randomIndex, 1);
              }
            }

            return { 
              ...gameState, 
              regions: newRegions,
              players: newPlayers,
              activeEffects: [...gameState.activeEffects, {
                id: `uprising_penalty_${Date.now()}`,
                type: 'strength_penalty',
                target: 'all',
                value: -7, // TODO -50% implemented as flat -25 points for now
                turnsRemaining: 2,
                description: 'Uprising strength penalty'
              }],
              lastEventResult: `UPRISING! All factions lose 50% strength. Buildings destroyed: ${destroyedBuildings.join(', ')}`
            };
          } else {
            return { 
              ...gameState,
              lastEventResult: 'Corruption ignored. The people grumble but no uprising occurs.'
            };
          }
        }
      }
    },
    {
      id: 'embassy',
      name: 'Embassy',
      description: 'An embassy from the Grand Prince arrives. How will you receive them?',
      type: 'voting',
      defaultOption: 'modest',
      options: [
        { id: 'modest', name: 'Receive modestly', requiresMinMoney: 1, costText: '3○ split', effectText: 'Relations maintained' },
        { id: 'luxurious', name: 'Receive luxuriously', requiresMinMoney: 2, costText: '6○ split', effectText: 'All: +3 str/3 turns' },
        { id: 'refuse', name: 'Refuse to receive them', effectText: 'All: -15 str, -50% income/5 turns' }
      ],
      effects: {
        modest: (gameState, votes) => {
          const participants = votes.filter(v => v === 'modest').length;
          const costPerParticipant = participants > 0 ? 3 / participants : 0;

          let allCanAfford = true;
          gameState.players.forEach((player, index) => {
            if (votes[index] === 'modest' && player.money < costPerParticipant) {
              allCanAfford = false;
            }
          });

          if (!allCanAfford || participants === 0) {
            // Fall back to refuse with proper effects
            const refusalEffects = [
              {
                id: `embassy_strength_penalty_${Date.now()}`,
                type: 'strength_penalty',
                target: 'all',
                value: -15,
                turnsRemaining: 5,
                description: 'Embassy refusal strength penalty'
              },
              {
                id: `embassy_income_penalty_${Date.now()}`,
                type: 'income_penalty',
                target: 'all',
                value: -0.5, // -50% income
                turnsRemaining: 5,
                description: 'Embassy refusal income penalty'
              }
            ];

            return { 
              ...gameState,
              activeEffects: [...gameState.activeEffects, ...refusalEffects],
              lastEventResult: 'Embassy refused! Grand Prince is insulted. -50% strength and income for 5 turns.'
            };
          }

          const newPlayers = gameState.players.map((player, index) => {
            if (votes[index] === 'modest') {
              return { ...player, money: player.money - costPerParticipant };
            }
            return player;
          });

          return { 
            ...gameState, 
            players: newPlayers,
            lastEventResult: 'Embassy received modestly. Relations maintained.'
          };
        },
        luxurious: (gameState, votes) => {
          const participants = votes.filter(v => v === 'luxurious').length;
          const costPerParticipant = participants > 0 ? 6 / participants : 0;

          let allCanAfford = true;
          gameState.players.forEach((player, index) => {
            if (votes[index] === 'luxurious' && player.money < costPerParticipant) {
              allCanAfford = false;
            }
          });

          if (!allCanAfford || participants === 0) {
            // Fall back to modest reception
            return gameState.currentEvent.effects.modest(gameState, votes.map(() => 'modest'));
          }

          const newPlayers = gameState.players.map((player, index) => {
            if (votes[index] === 'luxurious') {
              return { ...player, money: player.money - costPerParticipant };
            }
            return player;
          });

          // Create the strength bonus effect
          const strengthEffect = {
            id: `embassy_strength_bonus_${Date.now()}`,
            type: 'strength_bonus',
            target: 'all',
            value: 3,
            turnsRemaining: 3,
            description: 'Embassy reception boost'
          };

          return { 
            ...gameState, 
            players: newPlayers,
            activeEffects: [...gameState.activeEffects, strengthEffect],
            lastEventResult: 'Embassy received luxuriously! +10 strength for 3 turns.'
          };
        },
        refuse: (gameState) => {
          const newEffects = [
            {
              id: `embassy_strength_penalty_${Date.now()}`,
              type: 'strength_penalty',
              target: 'all',
              value: -15, // Fixed strength penalty
              turnsRemaining: 5,
              description: 'Embassy refusal strength penalty'
            },
            {
              id: `embassy_income_penalty_${Date.now()}`,
              type: 'income_penalty',
              target: 'all',
              value: -0.5, // Fixed income penalty (-50%)
              turnsRemaining: 5,
              description: 'Embassy refusal income penalty'
            }
          ];

          return { 
            ...gameState,
            activeEffects: [...gameState.activeEffects, ...newEffects],
            lastEventResult: 'Embassy refused! Grand Prince is insulted.  Strength -15 and income -50% for 5 turns.'
          };
        }
      }
    },
    {
      id: 'relics_found',
      name: 'Relics Found',
      description: 'Holy relics have been discovered. Are they genuine or deception?',
      type: 'voting',
      options: [
        { id: 'build_temple', name: 'Build a church', requiresMinMoney: 1, costText: 'All: -3○', effectText: 'All: +5 str/3 turns' },
        { id: 'deception', name: 'It\'s all deception', effectText: 'All: -5 str/3 turns' }
      ],
      effects: {
        build_temple: (gameState) => {
          const newPlayers = gameState.players.map(player => ({
            ...player,
            money: Math.max(0, player.money - 3)
          }));
          // ADD: Morale boost from relics
          const relicsBoostEffect = {
            id: `relics_boost_${Date.now()}`,
            type: 'strength_bonus',
            target: 'all',
            value: 5,
            turnsRemaining: 3,
            description: 'Holy relics morale boost'
          };

          return { 
            ...gameState, 
            players: newPlayers,
            activeEffects: [...gameState.activeEffects, relicsBoostEffect],
            lastEventResult: 'Church built for holy relics! +5 strength for 3 turns.'
          };
          },
        deception: (gameState) => {
          // ADD: Morale penalty from cynicism
          const cynicismEffect = {
            id: `cynicism_penalty_${Date.now()}`,
            type: 'strength_penalty',
            target: 'all',
            value: -5,
            turnsRemaining: 3,
            description: 'Religious cynicism penalty'
          };

          return { 
            ...gameState,
            activeEffects: [...gameState.activeEffects, cynicismEffect],
            lastEventResult: 'Relics declared false! Religious cynicism spreads. -5 strength for 3 turns.'
          };
        }
      }
    },
    {
      id: 'izhorian_delegation',
      name: 'Delegation from the Izhorians',
      description: 'A delegation from the Izhorian people arrives at your gates seeking an audience.',
      type: 'voting',
      acceptCost: 6,
      defaultOption: 'send_back',
      options: [
        { id: 'accept', name: 'Accept into service', requiresMinMoney: 2, costText: '6○ split', effectText: 'All: +5 str/6 turns' },
        { id: 'rob', name: 'Rob them', effectText: 'All: +3○, then -5 str/6 turns' },
        { id: 'send_back', name: 'Send them away', effectText: 'No effect' }
      ],
      effects: {
        accept: (gameState, votes) => {
          const participants = votes.filter(v => v === 'accept').length;
          const costPerParticipant = participants > 0 ? 6 / participants : 0;

          // ADD: Check if all participants can afford it
          let allCanAfford = true;
          gameState.players.forEach((player, index) => {
            if (votes[index] === 'accept' && player.money < costPerParticipant) {
              allCanAfford = false;
            }
          });

          // ADD: Fallback if anyone can't afford it or no participants
          if (!allCanAfford || participants === 0) {
            return gameState.currentEvent.effects.send_back(gameState);
          }
          
          const newPlayers = gameState.players.map((player, index) => {
            if (votes[index] === 'accept') {
              return { ...player, money: player.money - costPerParticipant };
            }
            return player;
          });
          // Alliance strength bonus
          const izhoraAllianceEffect = {
            id: `izhora_alliance_${Date.now()}`,
            type: 'strength_bonus',
            target: 'all',
            value: 5,
            turnsRemaining: 6,
            description: 'Izhora allied forces'
          };

          return { 
            ...gameState, 
            players: newPlayers,
            activeEffects: [...gameState.activeEffects, izhoraAllianceEffect],
            lastEventResult: 'Izhorians accepted into service! +5 strength for 6 turns.'
          };
          },
        rob: (gameState) => {
          const newPlayers = gameState.players.map(player => ({
            ...player,
            money: player.money + 3
          }));
          // Izhora hostility penalty
          const izhoraHostilityEffect = {
            id: `chud_hostility_${Date.now()}`,
            type: 'strength_penalty',
            target: 'all',
            value: -5,
            turnsRemaining: 6,
            description: 'Izhora hostility'
          };

          return { 
            ...gameState, 
            players: newPlayers,
            activeEffects: [...gameState.activeEffects, izhoraHostilityEffect],
            lastEventResult: 'Izhorians robbed! They become hostile. -5 strength for 6 turns.'
          };
        },
        send_back: (gameState) => {
          return gameState;
        }
      }
    },
    {
      id: 'good_harvest',
      name: 'Good Harvest',
      description: 'The fields have produced an abundant harvest. All players receive +1○.',
      type: 'immediate',
      effect: (gameState) => {
        const newPlayers = gameState.players.map(player => ({
          ...player,
          money: player.money + 1
        }));
        return { ...gameState, players: newPlayers };
      }
    },
    {
      id: 'drought',
      name: 'Drought',
      description: 'The crops are failing due to lack of rain. How will you respond?',
      type: 'voting',
      defaultOption: 'no_food',
      options: [
        { id: 'buy_food', name: 'Buy emergency food supplies', requiresMinMoney: 2, costText: '6○ split', effectText: 'Famine avoided' },
        { id: 'no_food', name: 'Let the people endure', effectText: 'Commoners: -12 str/3 turns' }
      ],
      effects: {
        buy_food: (gameState, votes) => {
          const participants = votes.filter(v => v === 'buy_food').length;
          const costPerParticipant = participants > 0 ? 6 / participants : 0;

          // Check if all participants can afford it
          let allCanAfford = true;
          gameState.players.forEach((player, index) => {
            if (votes[index] === 'buy_food' && player.money < costPerParticipant) {
              allCanAfford = false;
            }
          });

          // If anyone can't afford it or no participants, fall back to no food
          if (!allCanAfford || participants === 0) {
            return gameState.currentEvent.effects.no_food(gameState);
          }

          // Deduct money from participants
          const newPlayers = gameState.players.map((player, index) => {
            if (votes[index] === 'buy_food') {
              return { ...player, money: player.money - costPerParticipant };
            }
            return player;
          });

          return { 
            ...gameState, 
            players: newPlayers,
            lastEventResult: 'Emergency food purchased! Famine avoided.'
          };
        },
        no_food: (gameState) => {
          const famineEffect = {
            id: `drought_famine_${Date.now()}`,
            type: 'strength_penalty',
            target: 'Commoners',
            value: -12, // Reduces Commoners from 25 to 13 strength (roughly -50%)
            turnsRemaining: 3,
            description: 'Famine weakens commoners'
          };

          return { 
            ...gameState,
            activeEffects: [...gameState.activeEffects, famineEffect],
            lastEventResult: 'Famine strikes! Commoners lose 50% strength for 3 turns.'
          };
        }
      }
    },
    {
      id: 'fire',
      name: 'Fire',
      description: 'A fire breaks out in one of your regions, destroying a building.',
      type: 'immediate',
      effect: (gameState) => {
        // Roll for region (1-6 for republic regions)
        const republicRegions = Object.entries(gameState.regions).filter(([_, region]) => region.controller === 'republic');
        if (republicRegions.length === 0) return gameState; // No regions to burn

        const randomRegionIndex = Math.floor(Math.random() * republicRegions.length);
        const [regionName, region] = republicRegions[randomRegionIndex];

        // Find all buildings in this region
        const buildingTypes = Object.entries(region.buildings).filter(([_, count]) => count > 0);
        if (buildingTypes.length === 0) {
          // No buildings to burn
          return { 
            ...gameState, 
            lastEventResult: `Fire breaks out in ${regionName.charAt(0).toUpperCase() + regionName.slice(1)}, but there are no buildings to burn.`
          };
        }

        // Roll for building type
        const randomBuildingIndex = Math.floor(Math.random() * buildingTypes.length);
        const [buildingType, _] = buildingTypes[randomBuildingIndex];

        // Destroy the building
        const newRegions = { ...gameState.regions };
        if (buildingType.startsWith('merchant_')) {
          newRegions[regionName].buildings[buildingType] = Math.max(0, newRegions[regionName].buildings[buildingType] - 1);
        } else {
          newRegions[regionName].buildings[buildingType] = 0;
        }

        // Update player improvement count
        const newPlayers = gameState.players.map(player => {
          if ((buildingType.includes('commoner') && player.faction === 'Commoners') ||
              (buildingType.includes('noble') && player.faction === 'Nobles') ||
              (buildingType.includes('merchant') && player.faction === 'Merchants')) {
            return { ...player, improvements: Math.max(0, player.improvements - 1) };
          }
          return player;
        });

        // Create human-readable building name
        const buildingNames = {
          'commoner_huts': 'Huts',
          'commoner_church': 'Village Church',
          'noble_manor': 'Manor',
          'noble_monastery': 'Monastery',
          'merchant_mansion': 'Mansion',
          'merchant_church': 'Merchant Church'
        };

        const buildingName = buildingNames[buildingType] || buildingType;
        const regionDisplayName = regionName === 'bearhill' ? 'Bear Hill' : regionName.charAt(0).toUpperCase() + regionName.slice(1);

        return { 
          ...gameState, 
          regions: newRegions,
          players: newPlayers,
          lastEventResult: `Fire destroys ${buildingName} in ${regionDisplayName}!`
        };
      }
    },
    {
      id: 'city_fire',
      name: 'City Fire',
      description: 'A fire breaks out in Pskov, destroying a building in the city.',
      type: 'immediate',
      effect: (gameState) => {
        const pskovRegion = gameState.regions.pskov;

        // Find all buildings in Pskov
        const buildingTypes = Object.entries(pskovRegion.buildings).filter(([_, count]) => count > 0);
        if (buildingTypes.length === 0) {
          return { 
            ...gameState, 
            lastEventResult: `Fire breaks out in Pskov, but there are no buildings to burn.`
          };
        }

        // Roll for building type
        const randomBuildingIndex = Math.floor(Math.random() * buildingTypes.length);
        const [buildingType, _] = buildingTypes[randomBuildingIndex];

        // Destroy the building
        const newRegions = { ...gameState.regions };
        if (buildingType.startsWith('merchant_')) {
          newRegions.pskov.buildings[buildingType] = Math.max(0, newRegions.pskov.buildings[buildingType] - 1);
        } else {
          newRegions.pskov.buildings[buildingType] = 0;
        }

        // Update player improvement count
        const newPlayers = gameState.players.map(player => {
          if ((buildingType.includes('commoner') && player.faction === 'Commoners') ||
              (buildingType.includes('noble') && player.faction === 'Nobles') ||
              (buildingType.includes('merchant') && player.faction === 'Merchants')) {
            return { ...player, improvements: Math.max(0, player.improvements - 1) };
          }
          return player;
        });

        // Create human-readable building name
        const buildingNames = {
          'commoner_huts': 'Huts',
          'commoner_church': 'Village Church',
          'noble_manor': 'Manor',
          'noble_monastery': 'Monastery',
          'merchant_mansion': 'Mansion',
          'merchant_church': 'Merchant Church'
        };

        const buildingName = buildingNames[buildingType] || buildingType;

        return { 
          ...gameState, 
          regions: newRegions,
          players: newPlayers,
          lastEventResult: `City fire destroys ${buildingName} in Pskov!`
        };
      }
    },
    {
      id: 'heresy',
      name: 'Heresy',
      description: 'Heretical ideas spread among the people, weakening military resolve.',
      type: 'immediate',
      effect: (gameState) => {
        const heresyEffect = {
          id: `heresy_penalty_${Date.now()}`,
          type: 'strength_penalty',
          target: 'all',
          value: -10,
          turnsRemaining: 2,
          description: 'Heretical discord'
        };
    
        return { 
          ...gameState,
          activeEffects: [...gameState.activeEffects, heresyEffect],
          lastEventResult: 'Heretical ideas spread! All factions lose 10 strength for 2 turns.'
        };
      }
    },
    {
      id: 'order_attack_90',
      name: 'Order Attack (90)',
      description: 'The Teutonic Order attacks with strength 90. Who will contribute to the defense?',
      type: 'order_attack',
      orderStrength: 90,
      question: 'Who will help fund the defense? Cost will be split evenly among participants.',
      minCostPerPlayer: 1
    },
    {
      id: 'order_attack_100',
      name: 'Order Attack (100)',
      description: 'The Teutonic Order attacks with strength 100. Who will contribute to the defense?',
      type: 'order_attack',
      orderStrength: 100,
      question: 'Who will help fund the defense? Cost will be split evenly among participants.',
      minCostPerPlayer: 1
    },
    {
      id: 'order_attack_105',
      name: 'Order Attack (105)',
      description: 'The Teutonic Order attacks with strength 105. Who will contribute to the defense?',
      type: 'order_attack',
      orderStrength: 105,
      question: 'Who will help fund the defense? Cost will be split evenly among participants.',
      minCostPerPlayer: 1
    },
    {
      id: 'order_attack_110',
      name: 'Order Attack (110)',
      description: 'The Teutonic Order attacks with strength 110. Who will contribute to the defense?',
      type: 'order_attack',
      orderStrength: 110,
      question: 'Who will help fund the defense? Cost will be split evenly among participants.',
      minCostPerPlayer: 1
    },
    {
      id: 'plague',
      name: 'Plague',
      description: 'A plague spreads through the city. How will you respond?',
      type: 'voting', // CHANGE: from 'participation' to 'voting'
      defaultOption: 'no_isolation',
      options: [
        { id: 'fund_isolation', name: 'Fund isolation and treatment', requiresMinMoney: 1, costText: '3○ split', effectText: 'All: -5 str/2 turns' },
        { id: 'no_isolation', name: 'Trust in God - no isolation', effectText: 'All: -25 str/2 turns' }
      ],
      effects: {
        fund_isolation: (gameState, votes) => {
          const participants = votes.filter(v => v === 'fund_isolation').length;
          const costPerParticipant = participants > 0 ? 3 / participants : 0;

          // Check if all participants can afford it
          let allCanAfford = true;
          gameState.players.forEach((player, index) => {
            if (votes[index] === 'fund_isolation' && player.money < costPerParticipant) {
              allCanAfford = false;
            }
          });

          // If anyone can't afford it or no participants, fall back to no isolation
          if (!allCanAfford || participants === 0) {
            return gameState.currentEvent.effects.no_isolation(gameState);
          }

          // Deduct money from participants
          const newPlayers = gameState.players.map((player, index) => {
            if (votes[index] === 'fund_isolation') {
              return { ...player, money: player.money - costPerParticipant };
            }
            return player;
          });

          // ADD: Even with isolation, there's still some plague impact
          const mildPlagueEffect = {
            id: `mild_plague_${Date.now()}`,
            type: 'strength_penalty',
            target: 'all',
            value: -5, // -5 strength penalty even with isolation
            turnsRemaining: 2,
            description: 'Mild plague effects despite isolation'
          };

          return { 
            ...gameState, 
            players: newPlayers,
            activeEffects: [...gameState.activeEffects, mildPlagueEffect],
            lastEventResult: 'Plague partially contained! All factions lose 5 strength for 2 turns.'
          };
        },
        no_isolation: (gameState) => {
          const plagueEffect = {
            id: `severe_plague_${Date.now()}`,
            type: 'strength_penalty',
            target: 'all',
            value: -25, // -25 strength penalty without isolation
            turnsRemaining: 2,
            description: 'Severe plague weakens population'
          };

          return { 
            ...gameState,
            activeEffects: [...gameState.activeEffects, plagueEffect],
            lastEventResult: 'Plague spreads unchecked! All factions lose 25 strength for 2 turns.'
          };
        }
      }
    }
  ];

  // Draw event (debug mode vs random)
  const drawEvent = (currentDebugIndex = 0) => {
    if (DEBUG_MODE) {
      return eventDeck[currentDebugIndex % eventDeck.length];
    } else {
      return eventDeck[Math.floor(Math.random() * eventDeck.length)];
    }
  };

  // Vote on current event
  const voteOnEvent = (playerIndex, vote) => {
    // In online mode, send action to server
    if (mode === 'online') {
      // Only allow voting for own faction
      if (playerIndex !== playerId) {
        console.warn('Cannot vote for another player');
        return;
      }
      sendAction({ type: 'VOTE_EVENT', vote });

      // After voting, check if all players have voted and auto-resolve
      // Note: We check the NEXT state since this vote will be added
      setTimeout(() => {
        const currentState = useGameStore.getState().gameState;
        if (currentState && currentState.eventVotes) {
          const allVoted = currentState.eventVotes.every(v => v !== null);
          if (allVoted && !currentState.eventResolved) {
            // Auto-resolve when all players have voted
            sendAction({ type: 'RESOLVE_EVENT' });
          }
        }
      }, 500); // Wait for server to broadcast updated votes
    } else {
      // Local mode: update state directly
      setGameState(prev => {
        const newVotes = [...prev.eventVotes];
        newVotes[playerIndex] = vote;
        return { ...prev, eventVotes: newVotes };
      });
    }
  };

  // Get voting result for any multi-option event
  const getVotingResult = () => {
    const votes = gameState.eventVotes;
    const completedVotes = votes.filter(v => v !== null);

    if (completedVotes.length === 3) {
      const voteCounts = {};
      votes.forEach(vote => {
        if (vote) {
          voteCounts[vote] = (voteCounts[vote] || 0) + 1;
        }
      });

      let winningOption = null;
      let maxVotes = 0;
      Object.entries(voteCounts).forEach(([option, count]) => {
        if (count >= 2) {
          if (count > maxVotes) {
            maxVotes = count;
            winningOption = option;
          }
        }
      });

      return winningOption || 'send_back';
    }
    return null;
  };

  // Check if participation is complete and get result
  const getParticipationResult = () => {
    const votes = gameState.eventVotes;
    const completedVotes = votes.filter(v => v !== null);

    if (completedVotes.length === 3) {
      const participants = votes.filter(v => v === true).length;
      return participants > 0 ? 'success' : 'failed';
    }
    return null;
  };

  // Calculate victory points for each player
  const calculateVictoryPoints = (player) => {
    return player.improvements;
  };

  // Check if game is over and determine winner
  const getGameResult = () => {
    if (gameState.turn > 20) {
      const playerScores = gameState.players.map((player, index) => ({
        faction: player.faction,
        victoryPoints: calculateVictoryPoints(player),
        money: player.money,
        index
      }));

      playerScores.sort((a, b) => {
        if (b.victoryPoints !== a.victoryPoints) {
          return b.victoryPoints - a.victoryPoints;
        }
        return b.money - a.money;
      });

      return {
        winner: playerScores[0],
        rankings: playerScores
      };
    }
    return null;
  };

  // Get available buildings for current player in selected region
  const getAvailableBuildings = () => {
    const player = gameState.players[gameState.currentPlayer];
    const region = gameState.regions[gameState.selectedRegion];
    const buildings = [];

    if (player.faction === 'Commoners') {
      buildings.push(
        { 
          type: 'commoner_huts', 
          name: 'Huts', 
          cost: 2, 
          built: region.buildings.commoner_huts > 0,
          canBuild: region.buildings.commoner_huts === 0
        },
        { 
          type: 'commoner_church', 
          name: 'Village Church', 
          cost: 2, 
          built: region.buildings.commoner_church > 0,
          canBuild: region.buildings.commoner_church === 0
        }
      );
    } else if (player.faction === 'Nobles') {
      buildings.push(
        { 
          type: 'noble_manor', 
          name: 'Manor', 
          cost: 2, 
          built: region.buildings.noble_manor > 0,
          canBuild: region.buildings.noble_manor === 0
        },
        { 
          type: 'noble_monastery', 
          name: 'Monastery', 
          cost: 2, 
          built: region.buildings.noble_monastery > 0,
          canBuild: region.buildings.noble_monastery === 0
        }
      );
    } else if (player.faction === 'Merchants') {
      if (gameState.selectedRegion === 'pskov') {
        buildings.push(
          { 
            type: 'merchant_mansion', 
            name: 'Mansion', 
            cost: 2, 
            built: region.buildings.merchant_mansion,
            canBuild: region.buildings.merchant_mansion < 7
          },
          { 
            type: 'merchant_church', 
            name: 'Church', 
            cost: 2, 
            built: region.buildings.merchant_church,
            canBuild: region.buildings.merchant_church < 7
          }
        );
      }
    }

    return buildings;
  };

  const buildBuilding = (buildingType) => {
    // In online mode, send action to server
    if (mode === 'online') {
      sendAction({ type: 'BUILD_BUILDING', buildingType });
      return;
    }

    // Local mode: update state directly
    setGameState(prev => {
      const player = prev.players[prev.currentPlayer];

      if (player.money < 2) {
        return prev;
      }

      const newPlayers = prev.players.map((p, i) =>
        i === prev.currentPlayer
          ? { ...p, money: p.money - 2, improvements: p.improvements + 1 }
          : p
      );

      const newConstructionActions = prev.constructionActions.map((ca, i) =>
        i === prev.currentPlayer
          ? { ...ca, improvement: true }
          : ca
      );

      const currentRegion = prev.regions[prev.selectedRegion];
      const newBuildings = buildingType.startsWith('merchant_')
        ? { ...currentRegion.buildings, [buildingType]: currentRegion.buildings[buildingType] + 1 }
        : { ...currentRegion.buildings, [buildingType]: 1 };

      const newRegions = {
        ...prev.regions,
        [prev.selectedRegion]: {
          ...currentRegion,
          buildings: newBuildings
        }
      };

      return {
        ...prev,
        regions: newRegions,
        players: newPlayers,
        constructionActions: newConstructionActions
      };
    });
  };

  const nextPhase = () => {
    // In online mode, send action to server
    if (mode === 'online') {
      sendAction({ type: 'NEXT_PHASE' });
      return;
    }

    // Local mode: update state directly
    const currentPhaseIndex = phases.indexOf(gameState.phase);
    const isLastPhase = currentPhaseIndex === phases.length - 1;

    setGameState(prev => {
      const isResourcesPhase = prev.phase === 'resources';
      const isConstructionPhase = prev.phase === 'construction';
      const nextPhase = isLastPhase ? phases[0] : phases[currentPhaseIndex + 1];

      let newState = { ...prev };

      // Auto-calculate income during resources phase
      if (isResourcesPhase) {
        const republicRegions = Object.values(prev.regions).filter(r => r.controller === 'republic').length;
        newState.players = prev.players.map((player, index) => {
          const baseIncome = 0.5 + (republicRegions * 0.25) + (player.improvements * 0.25);
          const incomeModifier = getIncomeModifier(player.faction);
          const finalIncome = baseIncome * incomeModifier;
          return {
            ...player,
            money: player.money + finalIncome
          };
        });
      }

      // Draw event when moving TO events phase
      if (nextPhase === 'events') {
        newState.currentEvent = drawEvent(prev.debugEventIndex);
        newState.eventVotes = [null, null, null];
        newState.eventResolved = false;
        newState.eventImageRevealed = false; // Start with hidden image
        if (DEBUG_MODE) {
          newState.debugEventIndex = (prev.debugEventIndex + 1) % eventDeck.length;
        }
      }

      // Reset current player and construction actions when leaving construction
      if (isConstructionPhase) {
        newState.currentPlayer = 0;
        newState.selectedRegion = 'pskov';
        newState.constructionActions = [
          { improvement: false, equipment: false },
          { improvement: false, equipment: false },
          { improvement: false, equipment: false }
        ];
      }

      // Clear event when leaving events phase
      if (prev.phase === 'events') {
        newState.currentEvent = null;
        newState.eventVotes = [null, null, null];
        newState.eventResolved = false;
        newState.lastEventResult = null;
        newState.eventImageRevealed = false;
      }

      return {
        ...newState,
        phase: nextPhase,
        turn: isLastPhase ? prev.turn + 1 : prev.turn
      };
    });

    if (isLastPhase) {
      setTimeout(() => updateEffects(), 100);
    }
  };

  const nextPlayer = () => {
    // In online mode, send action to server
    if (mode === 'online') {
      sendAction({ type: 'NEXT_PLAYER' });
      return;
    }

    // Local mode: update state directly
    setGameState(prev => ({
      ...prev,
      currentPlayer: (prev.currentPlayer + 1) % 3
    }));
  };

  const setConstructionReady = () => {
    // In online mode, send action to server
    if (mode === 'online') {
      sendAction({ type: 'SET_CONSTRUCTION_READY' });
    } else {
      // Local mode: mark current player as ready and check if all are ready
      setGameState(prev => {
        const newReady = [...prev.constructionReady];
        newReady[prev.currentPlayer] = true;

        // If all players are ready in local mode, auto-advance
        if (newReady.every(r => r)) {
          // Trigger nextPhase
          nextPhase();
          return prev; // nextPhase will handle the update
        }

        return { ...prev, constructionReady: newReady };
      });
    }
  };

  const buyItem = (playerIndex, item, cost) => {
    // In online mode, send action to server
    if (mode === 'online') {
      // Only allow buying for own faction
      if (playerIndex !== playerId) {
        console.warn('Cannot buy for another player');
        return;
      }
      sendAction({ type: 'BUY_EQUIPMENT', item });
      return;
    }

    // Local mode: update state directly
    setGameState(prev => {
      const player = prev.players[playerIndex];

      if (player.money < cost) {
        return prev;
      }

      const newPlayers = prev.players.map((p, i) =>
        i === playerIndex
          ? { ...p, money: p.money - cost, [item]: p[item] + 1 }
          : p
      );

      const newConstructionActions = (item === 'weapons' || item === 'armor')
        ? prev.constructionActions.map((action, i) =>
            i === playerIndex ? { ...action, equipment: true } : action
          )
        : prev.constructionActions;

      return {
        ...prev,
        players: newPlayers,
        constructionActions: newConstructionActions
      };
    });
  };

  // Resolve current event using abstracted system
  const resolveEvent = () => {
    console.trace("resolveEvent called from:");

    // In online mode, send resolve action to server
    if (mode === 'online') {
      sendAction({ type: 'RESOLVE_EVENT' });
      return;
    }

    // Local mode: resolve using client-side logic
    const event = gameState.currentEvent;
    const eventType = eventTypes[event.type];

    if (!eventType) {
      console.error('Unknown event type:', event.type);
      return;
    }

    // Execute the resolution ONCE, outside of setGameState
    const newState = eventType.resolve(event, gameState, gameState.eventVotes);

    // Check if a new event was triggered (nested event scenario)
    const newEventTriggered = newState.currentEvent && newState.currentEvent.id !== event.id;

    setGameState({
      ...newState,
      // Only mark as resolved if no new event was triggered
      eventResolved: newEventTriggered ? false : true
    });
  };

  const resetGame = () => {
    // Use the store's initLocalGame to reset to initial state
    initLocalGame();
  };

  const getPhaseDescription = (phase) => {
    const descriptions = {
      resources: 'Players receive income from controlled regions and improvements',
      construction: 'Players can build improvements, fortresses, and buy equipment',
      events: 'Draw and resolve an event card',
      veche: 'Assembly of citizens making collective decisions',
      military: 'Resolve any military conflicts with the Teutonic Order'
    };
    return descriptions[phase];
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-amber-50 min-h-screen">
      <div className="bg-amber-900 text-amber-100 p-4 rounded-lg mb-6">
        <h1 className="text-3xl font-bold text-center">Medieval Pskov</h1>
        <p className="text-center mt-2">Defend your city from the Teutonic Order</p>
      </div>

      {/* Phase Progress */}
      <div className="bg-white rounded-lg p-4 mb-6 shadow">
        <h3 className="text-lg font-semibold mb-3">Phase Progress</h3>
        <div className="flex space-x-2">
          {phases.map((phase, index) => (
            <div
              key={phase}
              className={`flex-1 text-center py-2 px-1 rounded text-sm ${
                phase === gameState.phase
                  ? 'bg-amber-500 text-white font-semibold'
                  : index < phases.indexOf(gameState.phase)
                  ? 'bg-green-200 text-green-800'
                  : 'bg-gray-200 text-gray-600'
              }`}
            >
              {phaseNames[phase]}
            </div>
          ))}
        </div>
      </div>

      {/* Game Controls */}
      <div className="bg-white rounded-lg p-4 mb-6 shadow">
        <div className="flex justify-between items-center">
          <button
            onClick={resetGame}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded transition-colors"
          >
            Reset Game
          </button>

          <div className="text-center">
            {/* Helper text */}
            <p className="text-sm text-gray-600 mb-2">
              {gameState.turn >= 20 ? 'Game Complete! Check results below.' :
               gameState.phase === 'construction' && mode === 'online' ? 'Mark yourself as done to proceed' :
               gameState.phase === 'construction' ? 'Players take turns in construction phase' :
               gameState.phase === 'events' && !gameState.eventResolved ? 'Resolve Event First' :
               'Click to advance to next phase'}
            </p>

            {/* Phase advance button / Ready button */}
            <button
              onClick={gameState.phase === 'construction' && mode === 'online' ? setConstructionReady : nextPhase}
              disabled={
                gameState.turn > 20 ||
                (gameState.phase === 'events' && !gameState.eventResolved) ||
                (gameState.phase === 'construction' && mode === 'online' && gameState.constructionReady[playerId])
              }
              className={`px-6 py-3 rounded font-semibold transition-colors ${
                gameState.turn > 20 ||
                (gameState.phase === 'events' && !gameState.eventResolved) ||
                (gameState.phase === 'construction' && mode === 'online' && gameState.constructionReady[playerId])
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-amber-600 hover:bg-amber-700 text-white'
              }`}
            >
              {gameState.turn > 20 ? 'Game Complete' :
               gameState.phase === 'events' && !gameState.eventResolved ? 'Resolve Event First' :
               gameState.phase === 'construction' && mode === 'online' ?
                 (gameState.constructionReady[playerId] ? '✓ Ready' : "I'm Done") :
               'Next Phase'}
            </button>
          </div>

          <div className="text-right">
            <p className="text-sm text-gray-600">Game will end after</p>
            <p className="font-semibold">Turn 20</p>
          </div>
        </div>
      </div>

      {/* Debug Info */}
      {DEBUG_MODE && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
          <h4 className="font-medium text-yellow-800">🐛 Debug Mode Active</h4>
          <p className="text-yellow-700 text-sm">
            Events cycle in order: Izhorian Delegation → Good Harvest → Drought → Fire → City Fire → Heresy → Order Attacks → Plague → Boyars → Embassy → Relics → Merchants Robbed...
            <br />
            Next event: {eventDeck[gameState.debugEventIndex]?.name}
          </p>
        </div>
      )}

      {/* Game Status */}
      <div className="bg-white rounded-lg p-4 mb-6 shadow">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold">Turn {gameState.turn} / 20</h2>
          <div className="text-lg">
            <span className="font-medium">Current Phase: </span>
            <span className="bg-amber-200 px-3 py-1 rounded font-semibold">
              {phaseNames[gameState.phase]}
            </span>
          </div>
        </div>

        <div className="bg-gray-50 p-3 rounded">
          <p className="text-gray-700">{getPhaseDescription(gameState.phase)}</p>
        </div>
      </div>

      {/* Active Effects Display */}
      {gameState.activeEffects.length > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6 shadow">
          <h3 className="text-lg font-semibold mb-3 text-purple-800">Active Effects</h3>
          <div className="space-y-2">
            {gameState.activeEffects.map((effect, index) => (
              <div key={effect.id} className="bg-white p-3 rounded border border-purple-100">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-purple-900">{effect.description}</span>
                  <span className="text-sm text-purple-600">
                    {effect.turnsRemaining} turn{effect.turnsRemaining !== 1 ? 's' : ''} remaining
                  </span>
                </div>
                <div className="text-sm text-purple-700 mt-1">
                  {effect.type === 'strength_bonus' && `+${effect.value} strength`}
                  {effect.type === 'strength_penalty' && `${effect.value} strength`}
                  {effect.type === 'income_penalty' && `${effect.value * 100}% income`}
                  {effect.target === 'all' ? ' (All factions)' : ` (${effect.target})`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Players */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {gameState.players.map((player, index) => {
          // In online mode, highlight the current user's faction
          // In local mode, highlight the current player's turn
          const isActivePlayer = gameState.phase === 'construction' &&
            (mode === 'online' ? index === playerId : index === gameState.currentPlayer);

          return (
          <div key={index} className={`bg-white rounded-lg p-4 shadow ${
            isActivePlayer
              ? 'ring-4 ring-amber-400'
              : ''
          }`}>
            <div className="flex items-start gap-3">
              {FACTION_IMAGES[player.faction] && (
                <img
                  src={FACTION_IMAGES[player.faction]}
                  alt={player.faction}
                  className="w-24 h-40 rounded-lg object-cover shadow-sm"
                />
              )}
              <div className="flex-1">
                <h3 className="text-lg font-semibold mb-2">
                  {player.faction}
                  {gameState.phase === 'construction' && gameState.currentPlayer === index && mode === 'local' && (
                    <span className="text-amber-600 ml-2">(Your Turn)</span>
                  )}
                  {gameState.phase === 'construction' && mode === 'online' && (
                    <span className={`ml-2 text-sm ${gameState.constructionReady[index] ? 'text-green-600' : 'text-gray-400'}`}>
                      {gameState.constructionReady[index] ? '✓ Ready' : '⏳ Building'}
                    </span>
                  )}
                </h3>
                <div className="space-y-1 text-sm">
                  <div>Money: {player.money.toFixed(1)} ○</div>
                  <div>Improvements: {player.improvements}</div>
                  <div className="flex items-center gap-1">
                    Weapons: {player.weapons}
                    {player.weapons > 0 && getEquipmentImage('weapons', player.faction) && (
                      <img src={getEquipmentImage('weapons', player.faction)} alt="weapons" className="w-5 h-5 object-cover rounded" />
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    Armor: {player.armor}
                    {player.armor > 0 && getEquipmentImage('armor', player.faction) && (
                      <img src={getEquipmentImage('armor', player.faction)} alt="armor" className="w-5 h-5 object-cover rounded" />
                    )}
                  </div>
                  <div className="text-gray-600">
                    Strength: {calculatePlayerStrength(index)}
                  </div>
                </div>
              </div>
            </div>
          </div>
          );
        })}
      </div>

      {/* Construction Phase Interface */}
      {gameState.phase === 'construction' && (() => {
        // In online mode, use playerId; in local mode, use currentPlayer
        const activePlayerIndex = mode === 'online' ? playerId : gameState.currentPlayer;
        const activePlayer = gameState.players[activePlayerIndex];

        return (
        <div className="bg-white rounded-lg p-4 mb-6 shadow">
          <h3 className="text-lg font-semibold mb-3">
            {activePlayer.faction} - Construction Turn
          </h3>

          {/* Region Selection */}
          <div className="mb-4">
            <h4 className="font-medium mb-2">Select Region:</h4>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(gameState.regions).map(([regionName, region]) => {
                const isMerchantRestricted = activePlayer.faction === 'Merchants' && regionName !== 'pskov';
                const isOrderControlled = region.controller === 'order';
                const isAvailable = !isMerchantRestricted && !isOrderControlled;

                return (
                  <button
                    key={regionName}
                    onClick={() => setGameState(prev => ({ ...prev, selectedRegion: regionName }))}
                    disabled={!isAvailable}
                    className={`p-2 rounded text-sm border ${
                      gameState.selectedRegion === regionName
                        ? 'bg-amber-500 text-white border-amber-600'
                        : isAvailable
                        ? 'bg-gray-100 hover:bg-gray-200 border-gray-300'
                        : 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                    }`}
                  >
                    {regionName === 'bearhill' ? 'Bear Hill' : regionName.charAt(0).toUpperCase() + regionName.slice(1)}
                    {isMerchantRestricted && (
                      <>
                        <br />
                        <span className="text-xs">(Merchants only)</span>
                      </>
                    )}
                    {isOrderControlled && (
                      <>
                        <br />
                        <span className="text-xs">(Order controlled)</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
            {activePlayer.faction === 'Merchants' && gameState.selectedRegion !== 'pskov' && (
              <p className="text-sm text-orange-600 mt-2">Merchants can only build in Pskov!</p>
            )}
          </div>

          {/* Available Buildings */}
          <div className="mb-4">
            <h4 className="font-medium mb-2">Available Buildings in {gameState.selectedRegion.charAt(0).toUpperCase() + gameState.selectedRegion.slice(1)}:</h4>
            <div className="grid grid-cols-2 gap-3">
              {getAvailableBuildings().map(building => (
                <button
                  key={building.type}
                  onClick={() => buildBuilding(building.type)}
                  disabled={
                    !building.canBuild ||
                    activePlayer.money < building.cost ||
                    gameState.constructionActions[activePlayerIndex].improvement
                  }
                  className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white p-3 rounded text-sm flex items-center gap-2"
                >
                  {BUILDING_IMAGES[building.type] && (
                    <img
                      src={BUILDING_IMAGES[building.type]}
                      alt={building.name}
                      className="w-10 h-10 rounded object-cover flex-shrink-0"
                    />
                  )}
                  <div className="text-left">
                    <div className="font-medium">{building.name}</div>
                    <div className="text-xs">
                      {building.type.startsWith('merchant_')
                        ? `Built: ${building.built}/7`
                        : building.built ? 'Already built' : 'Not built'
                      }
                    </div>
                    <div className="text-xs">Cost: {building.cost}○</div>
                  </div>
                </button>
              ))}
              {getAvailableBuildings().length === 0 && (
                <p className="text-gray-500 col-span-2 text-center py-4">
                  {activePlayer.faction === 'Merchants' && gameState.selectedRegion !== 'pskov'
                    ? 'Merchants can only build in Pskov'
                    : 'No buildings available in this region'
                  }
                </p>
              )}
            </div>
          </div>

          {/* Equipment */}
          <div className="mb-4">
            <h4 className="font-medium mb-2">Equipment (Choose 1 per turn):</h4>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => buyItem(activePlayerIndex, 'weapons', 1)}
                disabled={
                  activePlayer.money < 1 ||
                  gameState.constructionActions[activePlayerIndex].equipment ||
                  activePlayer.weapons >= 2
                }
                className="bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white p-2 rounded text-sm flex items-center gap-2"
              >
                {getEquipmentImage('weapons', activePlayer.faction) && (
                  <img
                    src={getEquipmentImage('weapons', activePlayer.faction)}
                    alt="Weapon"
                    className="w-8 h-8 rounded object-cover flex-shrink-0"
                  />
                )}
                <div className="text-left">
                  <div>Buy Weapon (1○)</div>
                  <div className="text-xs">
                    {gameState.constructionActions[activePlayerIndex].equipment ? 'Equipment bought' :
                     activePlayer.weapons >= 2 ? 'Max weapons (2)' :
                     `Owned: ${activePlayer.weapons}/2`}
                  </div>
                </div>
              </button>
              <button
                onClick={() => buyItem(activePlayerIndex, 'armor', 1)}
                disabled={
                  activePlayer.money < 1 ||
                  gameState.constructionActions[activePlayerIndex].equipment ||
                  activePlayer.armor >= 2
                }
                className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white p-2 rounded text-sm flex items-center gap-2"
              >
                {getEquipmentImage('armor', activePlayer.faction) && (
                  <img
                    src={getEquipmentImage('armor', activePlayer.faction)}
                    alt="Armor"
                    className="w-8 h-8 rounded object-cover flex-shrink-0"
                  />
                )}
                <div className="text-left">
                  <div>Buy Armor (1○)</div>
                  <div className="text-xs">
                    {gameState.constructionActions[activePlayerIndex].equipment ? 'Equipment bought' :
                     activePlayer.armor >= 2 ? 'Max armor (2)' :
                     `Owned: ${activePlayer.armor}/2`}
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Only show Next Player button in local mode */}
          {mode === 'local' && (
            <button
              onClick={nextPlayer}
              className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded"
            >
              Next Player
            </button>
          )}

          {/* In online mode, show ready message */}
          {mode === 'online' && (
            <div className="text-center text-sm text-gray-600 mt-4">
              Click "I'm Done" above when finished building to proceed
            </div>
          )}
        </div>
        );
      })()}

      {/* Construction Complete Message (local mode only) */}
      {gameState.phase === 'construction' && gameState.currentPlayer === 0 && mode === 'local' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h4 className="font-medium text-blue-800 mb-2">Construction Phase Complete</h4>
          <p className="text-blue-700 text-sm">All players have taken their construction turns. Click "Next Phase" to proceed to Events.</p>
        </div>
      )}

      {/* Events Phase Interface */}
      {gameState.phase === 'events' && gameState.currentEvent && (
        <div className="bg-white rounded-lg p-6 mb-6 shadow-lg">
          {/* Show loading message while waiting for reveal */}
          {!gameState.eventImageRevealed && getEventImage(gameState.currentEvent.id) && (
            <div className="text-center py-12 mb-4">
              <div className="text-2xl font-bold text-amber-800 mb-3">A new event unfolds...</div>
              <div className="text-lg text-gray-600">Revealing in a moment...</div>
            </div>
          )}

          {/* Large Event Image Card - Dramatic Reveal */}
          {getEventImage(gameState.currentEvent.id) && (
            <div
              className={`relative mb-6 ${
                gameState.eventImageRevealed ? 'event-card-revealed' : 'event-card-hidden'
              }`}
            >
              <div className="flex justify-center">
                <img
                  src={getEventImage(gameState.currentEvent.id)}
                  alt={gameState.currentEvent.name}
                  className="rounded-xl shadow-2xl object-cover"
                  style={{ maxHeight: '60vh', width: 'auto', maxWidth: '100%' }}
                />
              </div>
            </div>
          )}

          {/* Event Title, Description and Interactions - Only show after reveal */}
          {(gameState.eventImageRevealed || !getEventImage(gameState.currentEvent.id)) && (
            <>
              <h3 className="text-2xl font-bold mb-4 text-center">Event: {gameState.currentEvent.name}</h3>

              <div className="bg-gray-50 p-4 rounded mb-4">
                <div className="mb-4">
                  <p className="text-gray-700 text-lg text-center">{gameState.currentEvent.description}</p>
                </div>

            {gameState.currentEvent.type === 'voting' && !gameState.eventResolved && (
              <div>
                <h4 className="font-medium mb-2">Council Decision:</h4>

                {/* Options summary with costs/effects - shown once */}
                <div className="mb-4 p-3 bg-gray-50 rounded">
                  <p className="text-sm text-gray-600 mb-2">Available options:</p>
                  {gameState.currentEvent.options.map(option => (
                    <div key={option.id} className="mb-2 last:mb-0">
                      <span className="font-medium text-sm">{option.name}</span>
                      {(option.costText || option.effectText) && (
                        <span className="text-xs ml-2">
                          {option.costText && <span className="text-red-600">[{option.costText}]</span>}
                          {option.costText && option.effectText && ' '}
                          {option.effectText && <span className="text-blue-600">→ {option.effectText}</span>}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4">
                  {gameState.players.map((player, index) => {
                    const hasVoted = gameState.eventVotes[index] !== null;

                    return (
                      <div key={index} className="text-center">
                        <h5 className="font-medium mb-1">{player.faction}</h5>
                        <div className="text-xs text-gray-600 mb-2">Money: {player.money}○</div>
                        <div className="space-y-2">
                          {gameState.currentEvent.options.map(option => {
                            const canAfford = !option.requiresMinMoney || player.money >= option.requiresMinMoney;

                            return (
                              <button
                                key={option.id}
                                onClick={() => voteOnEvent(index, option.id)}
                                disabled={hasVoted || !canAfford}
                                className={`w-full px-2 py-1 rounded text-xs ${
                                  gameState.eventVotes[index] === option.id
                                    ? 'bg-amber-600 text-white'
                                    : !canAfford
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    : 'bg-gray-500 hover:bg-gray-600 text-white disabled:bg-gray-300'
                                }`}
                              >
                                {gameState.eventVotes[index] === option.id ?
                                  `Voted: ${option.name}` :
                                  !canAfford ?
                                  `Need ${option.requiresMinMoney}○ min` :
                                  option.name
                                }
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {getVotingResult() && (
                  <div className="text-center">
                    {(() => {
                      const winningOption = getVotingResult();
                      const optionName = gameState.currentEvent.options.find(opt => opt.id === winningOption)?.name;
                      const acceptVoters = gameState.eventVotes.filter(v => v === 'accept').length;

                      let resultText = `Decision: ${optionName}`;
                      if (winningOption === 'accept' && gameState.currentEvent.acceptCost) {
                        let allCanAfford = true;
                        const costPerVoter = acceptVoters > 0 ? gameState.currentEvent.acceptCost / acceptVoters : 0;
                        gameState.players.forEach((player, index) => {
                          if (gameState.eventVotes[index] === 'accept' && player.money < costPerVoter) {
                            allCanAfford = false;
                          }
                        });

                        if (!allCanAfford || acceptVoters === 0) {
                          resultText = "Decision: Accept into service → FAILED (insufficient funds) → Send them away";
                        } else {
                          resultText = `Decision: Accept into service (${acceptVoters} participants, ${costPerVoter.toFixed(1)}○ each)`;
                        }
                      }

                      return (
                        <div className="mb-3">
                          <p className="text-sm text-gray-600 mb-2">{resultText}</p>
                        </div>
                      );
                    })()}
                    {mode === 'online' ? (
                      <p className="text-sm text-gray-600 italic">Auto-applying decision...</p>
                    ) : (
                      <button
                        onClick={resolveEvent}
                        className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded"
                      >
                        Apply Decision
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {gameState.currentEvent.type === 'participation' && !gameState.eventResolved && (
              <div>
                <h4 className="font-medium mb-2">Council Decision:</h4>
                <p className="text-sm text-gray-600 mb-3">{gameState.currentEvent.question}</p>

                <div className="grid grid-cols-3 gap-4 mb-4">
                  {gameState.players.map((player, index) => {
                    const hasDecided = gameState.eventVotes[index] !== null;
                    const canAfford = player.money >= gameState.currentEvent.minCostPerPlayer;

                    return (
                      <div key={index} className="text-center">
                        <h5 className="font-medium mb-1">{player.faction}</h5>
                        <div className="text-xs text-gray-600 mb-2">Money: {player.money}○</div>
                        <div className="space-y-2">
                          <button
                            onClick={() => voteOnEvent(index, true)}
                            disabled={hasDecided || !canAfford}
                            className={`w-full px-3 py-1 rounded text-sm ${
                              gameState.eventVotes[index] === true 
                                ? 'bg-green-600 text-white' 
                                : canAfford
                                ? 'bg-green-500 hover:bg-green-600 text-white'
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            }`}
                          >
                            {gameState.eventVotes[index] === true ? 'Participating' : 
                             !canAfford ? `Need ${gameState.currentEvent.minCostPerPlayer}○ min` :
                             'Participate'}
                          </button>
                          <button
                            onClick={() => voteOnEvent(index, false)}
                            disabled={hasDecided}
                            className={`w-full px-3 py-1 rounded text-sm ${
                              gameState.eventVotes[index] === false 
                                ? 'bg-red-600 text-white' 
                                : 'bg-red-500 hover:bg-red-600 text-white disabled:bg-gray-300'
                            }`}
                          >
                            {gameState.eventVotes[index] === false ? 'Not Participating' : 'Don\'t Participate'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {getParticipationResult() && (
                  <div className="text-center">
                    {(() => {
                      const participants = gameState.eventVotes.filter(v => v === true).length;
                      const costPerParticipant = participants > 0 ? (gameState.currentEvent.totalCost / participants) : 0;

                      let allCanAfford = true;
                      let insufficientFunds = [];
                      gameState.players.forEach((player, index) => {
                        if (gameState.eventVotes[index] === true && player.money < costPerParticipant) {
                          allCanAfford = false;
                          insufficientFunds.push(player.faction);
                        }
                      });

                      const purchaseSucceeds = participants > 0 && allCanAfford;

                      return (
                        <div className="mb-3">
                          <p className="text-sm text-gray-600 mb-1">
                            {participants > 0 ? (
                              <>Participants: {participants} • Cost per participant: {costPerParticipant.toFixed(1)}○</>
                            ) : (
                              <>No participants</>
                            )}
                          </p>

                          {!allCanAfford && participants > 0 && (
                            <p className="text-sm text-red-600 mb-1">
                              {insufficientFunds.join(', ')} cannot afford {costPerParticipant.toFixed(1)}○
                            </p>
                          )}

                          <p className={`text-sm font-medium ${purchaseSucceeds ? 'text-green-600' : 'text-red-600'}`}>
                            Result: {purchaseSucceeds ? 
                              (gameState.currentEvent.successText || 'SUCCESS') : 
                              (gameState.currentEvent.failureText || 'FAILED')
                            }
                          </p>
                        </div>
                      );
                    })()}
                    {mode === 'online' ? (
                      <p className="text-sm text-gray-600 italic">Auto-applying result...</p>
                    ) : (
                      <button
                        onClick={resolveEvent}
                        className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded"
                      >
                        Apply Result
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {gameState.currentEvent.type === 'immediate' && !gameState.eventResolved && (
              <div className="text-center">
                {mode === 'online' ? (
                  <p className="text-sm text-gray-600 italic">Auto-applying effect...</p>
                ) : (
                  <button
                    onClick={resolveEvent}
                    className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded"
                  >
                    Apply Effect
                  </button>
                )}
              </div>
            )}

            {gameState.currentEvent.type === 'order_attack' && !gameState.eventResolved && (
              <div>
                <h4 className="font-medium mb-2">Order Attack!</h4>
                <p className="text-sm text-gray-600 mb-3">The Teutonic Order attacks with strength {gameState.currentEvent.orderStrength}. Fund defense or surrender the region?</p>

                <div className="grid grid-cols-3 gap-4 mb-4">
                  {gameState.players.map((player, index) => {
                    const hasDecided = gameState.eventVotes[index] !== null;
                    const canAfford = player.money >= gameState.currentEvent.minCostPerPlayer;

                    return (
                      <div key={index} className="text-center">
                        <h5 className="font-medium mb-1">{player.faction}</h5>
                        <div className="text-xs text-gray-600 mb-2">Money: {player.money}○</div>
                        <div className="space-y-2">
                          <button
                            onClick={() => voteOnEvent(index, true)}
                            disabled={hasDecided || !canAfford}
                            className={`w-full px-3 py-1 rounded text-sm ${
                              gameState.eventVotes[index] === true 
                                ? 'bg-green-600 text-white' 
                                : canAfford
                                ? 'bg-green-500 hover:bg-green-600 text-white'
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            }`}
                          >
                            {gameState.eventVotes[index] === true ? 'Defending' : 
                             !canAfford ? `Need ${gameState.currentEvent.minCostPerPlayer}○ min` :
                             'Fund Defense'}
                          </button>
                          <button
                            onClick={() => voteOnEvent(index, false)}
                            disabled={hasDecided}
                            className={`w-full px-3 py-1 rounded text-sm ${
                              gameState.eventVotes[index] === false 
                                ? 'bg-red-600 text-white' 
                                : 'bg-red-500 hover:bg-red-600 text-white disabled:bg-gray-300'
                            }`}
                          >
                            {gameState.eventVotes[index] === false ? 'No Defense' : 'Surrender'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {getParticipationResult() && (
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-2">
                      {(() => {
                        const participants = gameState.eventVotes.filter(v => v === true).length;
                        return participants > 0 ? `${participants} defenders ready` : 'No defenders - region will be surrendered';
                      })()}
                    </p>
                    {mode === 'online' ? (
                      <p className="text-sm text-gray-600 italic">Auto-resolving attack...</p>
                    ) : (
                      <button
                        onClick={resolveEvent}
                        className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded"
                      >
                        Resolve Attack
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            
            {gameState.eventResolved && (
              <div className="text-center">
                <p className="text-green-600 font-medium mb-2">✓ Event Resolved</p>
                {gameState.lastEventResult && (
                  <p className="text-sm text-gray-700 mb-2 font-medium">{gameState.lastEventResult}</p>
                )}
                <p className="text-sm text-gray-600">Click "Next Phase" to continue</p>
              </div>
            )}
              </div>
            </>
          )}
        </div>
      )}

      {/* City Assembly (Veche) Phase Interface */}
      {gameState.phase === 'veche' && (
        <div className="bg-white rounded-lg p-4 mb-6 shadow">
          <h3 className="text-lg font-semibold mb-3">City Assembly (Veche)</h3>

          <div className="bg-amber-50 p-4 rounded mb-4">
            <p className="text-amber-800 mb-4">The citizens gather to make important decisions for the city.</p>

            {/* Attack Planning */}
            <div className="mb-6">
              <h4 className="font-medium mb-3">Military Campaigns</h4>
              <p className="text-sm text-gray-600 mb-3">Launch attacks to recapture adjacent territories from the Order (6○ total cost):</p>

              <div className="grid grid-cols-2 gap-3 mb-4">
                {(() => {
                  const validTargets = getValidRepublicAttackTargets(gameState.regions);
                  const orderRegions = Object.entries(gameState.regions).filter(([name, region]) => region.controller === 'order');

                  return orderRegions.map(([regionName, region]) => {
                    const displayName = regionName === 'bearhill' ? 'Bear Hill' : regionName.charAt(0).toUpperCase() + regionName.slice(1);
                    const isAdjacent = validTargets.includes(regionName);

                    return (
                      <button
                        key={regionName}
                        onClick={() => initiateAttack(regionName)}
                        disabled={gameState.attackPlanning !== null || !isAdjacent}
                        className={`${isAdjacent ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-400 cursor-not-allowed'} disabled:bg-gray-300 text-white p-3 rounded text-sm`}
                      >
                        <div className="font-medium">Attack {displayName}</div>
                        <div className="text-xs">
                          {region.fortress ? 'Has fortress (+10 Order defense)' : 'No fortress'}
                        </div>
                        <div className="text-xs">
                          {isAdjacent ? 'Requires 6○ funding' : 'Not adjacent to Republic territory'}
                        </div>
                      </button>
                    );
                  });
                })()}
              </div>

              {Object.entries(gameState.regions).filter(([name, region]) => region.controller === 'order').length === 0 && (
                <p className="text-green-600 text-center py-2">All territories under Republic control!</p>
              )}
            </div>

            {/* Attack Planning Interface */}
            {gameState.attackPlanning === 'planning' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-red-800 mb-3">
                  Planning Attack: {gameState.attackTarget === 'bearhill' ? 'Bear Hill' : gameState.attackTarget.charAt(0).toUpperCase() + gameState.attackTarget.slice(1)}
                </h4>

                <p className="text-red-700 mb-3">
                  Attacking requires 6○ total funding. Who will contribute to this military campaign?
                </p>

                <div className="grid grid-cols-3 gap-4 mb-4">
                  {gameState.players.map((player, index) => {
                    const hasDecided = gameState.attackVotes[index] !== null;
                    const canAfford = player.money >= 2; // minimum contribution

                    return (
                      <div key={index} className="text-center">
                        <h5 className="font-medium mb-1">{player.faction}</h5>
                        <div className="text-xs text-gray-600 mb-2">Money: {player.money}○</div>
                        <div className="space-y-2">
                          <button
                            onClick={() => {
                              setGameState(prev => {
                                const newVotes = [...prev.attackVotes];
                                newVotes[index] = true;
                                return { ...prev, attackVotes: newVotes };
                              });
                            }}
                            disabled={hasDecided || !canAfford}
                            className={`w-full px-3 py-1 rounded text-sm ${
                              gameState.attackVotes[index] === true 
                                ? 'bg-red-600 text-white' 
                                : canAfford
                                ? 'bg-red-500 hover:bg-red-600 text-white'
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            }`}
                          >
                            {gameState.attackVotes[index] === true ? 'Joining Attack' : 
                             !canAfford ? 'Need 2○ min' :
                             'Join Attack'}
                          </button>
                          <button
                            onClick={() => {
                              setGameState(prev => {
                                const newVotes = [...prev.attackVotes];
                                newVotes[index] = false;
                                return { ...prev, attackVotes: newVotes };
                              });
                            }}
                            disabled={hasDecided}
                            className={`w-full px-3 py-1 rounded text-sm ${
                              gameState.attackVotes[index] === false 
                                ? 'bg-gray-600 text-white' 
                                : 'bg-gray-500 hover:bg-gray-600 text-white disabled:bg-gray-300'
                            }`}
                          >
                            {gameState.attackVotes[index] === false ? 'Not Participating' : 'Decline'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Show result when all votes are in */}
                {gameState.attackVotes.filter(v => v !== null).length === 3 && (
                  <div className="text-center">
                    {(() => {
                      const participants = gameState.attackVotes.filter(v => v === true).length;
                      const costPerParticipant = participants > 0 ? (6 / participants) : 0;

                      let allCanAfford = true;
                      let insufficientFunds = [];
                      gameState.players.forEach((player, index) => {
                        if (gameState.attackVotes[index] === true && player.money < costPerParticipant) {
                          allCanAfford = false;
                          insufficientFunds.push(player.faction);
                        }
                      });

                      const attackSucceeds = participants > 0 && allCanAfford;

                      return (
                        <div className="mb-3">
                          <p className="text-sm text-gray-600 mb-1">
                            {participants > 0 ? (
                              <>Attackers: {participants} • Cost per attacker: {costPerParticipant.toFixed(1)}○</>
                            ) : (
                              <>No participants - attack cancelled</>
                            )}
                          </p>

                          {!allCanAfford && participants > 0 && (
                            <p className="text-sm text-red-600 mb-1">
                              {insufficientFunds.join(', ')} cannot afford {costPerParticipant.toFixed(1)}○
                            </p>
                          )}

                          <p className={`text-sm font-medium ${attackSucceeds ? 'text-green-600' : 'text-red-600'}`}>
                            Result: {attackSucceeds ? 'ATTACK FUNDED' : 'ATTACK CANCELLED'}
                          </p>

                          <div className="mt-3 space-x-3">
                            <button
                              onClick={() => executeAttack()}
                              disabled={!attackSucceeds}
                              className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-4 py-2 rounded"
                            >
                              {attackSucceeds ? 'Launch Attack' : 'Cannot Launch'}
                            </button>
                            <button
                              onClick={() => {
                                setGameState(prev => ({
                                  ...prev,
                                  attackPlanning: null,
                                  attackTarget: null,
                                  attackVotes: [null, null, null]
                                }));
                              }}
                              className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Attack Result */}
            {gameState.lastEventResult && (gameState.lastEventResult.includes('VICTORY!') || gameState.lastEventResult.includes('DEFEAT!')) && (
              <div className={`p-3 rounded mb-4 ${
                gameState.lastEventResult.includes('VICTORY!') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                <p className="font-medium">{gameState.lastEventResult}</p>
              </div>
            )}

            {/* Fortress Building */}
            <div className="mb-6">
              <h4 className="font-medium mb-3">Fortress Construction</h4>
              <p className="text-sm text-gray-600 mb-3">Build fortresses for defense (6○ total cost):</p>

              <div className="grid grid-cols-2 gap-3">
                {Object.entries(gameState.regions)
                  .filter(([name, region]) => region.controller === 'republic' && !region.fortress)
                  .map(([regionName, region]) => {
                    const displayName = regionName === 'bearhill' ? 'Bear Hill' : regionName.charAt(0).toUpperCase() + regionName.slice(1);
                    return (
                      <button
                        key={regionName}
                        onClick={() => initiateFortressBuild(regionName)}
                        disabled={gameState.fortressPlanning !== null}
                        className={`p-3 rounded text-sm ${
                          gameState.fortressPlanning !== null
                            ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                            : 'bg-gray-600 hover:bg-gray-700 text-white'
                        }`}
                      >
                        <div className="font-medium">Build Fortress</div>
                        <div className="text-xs">{displayName}</div>
                        <div className="text-xs">+10 defense bonus</div>
                      </button>
                    );
                  })}
              </div>

              {Object.entries(gameState.regions).filter(([name, region]) => region.controller === 'republic' && !region.fortress).length === 0 && (
                <p className="text-green-600 text-center py-2">✓ All regions have fortresses!</p>
              )}

              {/* Fortress Planning Interface */}
              {gameState.fortressPlanning === 'planning' && (
                <div className="bg-gray-100 border border-gray-300 rounded-lg p-4 mt-4">
                  <h4 className="font-medium text-gray-800 mb-3">
                    🏰 Planning Fortress: {gameState.fortressTarget === 'bearhill' ? 'Bear Hill' : gameState.fortressTarget.charAt(0).toUpperCase() + gameState.fortressTarget.slice(1)}
                  </h4>

                  <p className="text-sm text-gray-600 mb-3">
                    Building a fortress requires 6○ total funding. Who will contribute?
                  </p>

                  <div className="grid grid-cols-3 gap-4 mb-4">
                    {gameState.players.map((player, index) => {
                      const hasDecided = gameState.fortressVotes[index] !== null;
                      const canAfford = player.money >= 2; // minimum contribution

                      return (
                        <div key={index} className="text-center">
                          <h5 className="font-medium mb-1">{player.faction}</h5>
                          <div className="text-xs text-gray-600 mb-2">Money: {player.money.toFixed(2)}○</div>
                          <div className="space-y-2">
                            <button
                              onClick={() => {
                                setGameState(prev => {
                                  const newVotes = [...prev.fortressVotes];
                                  newVotes[index] = true;
                                  return { ...prev, fortressVotes: newVotes };
                                });
                              }}
                              disabled={hasDecided || !canAfford}
                              className={`w-full px-3 py-1 rounded text-sm ${
                                gameState.fortressVotes[index] === true
                                  ? 'bg-gray-700 text-white'
                                  : canAfford
                                  ? 'bg-gray-600 hover:bg-gray-700 text-white'
                                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              }`}
                            >
                              {gameState.fortressVotes[index] === true ? 'Contributing' :
                               !canAfford ? 'Need 2○ min' :
                               'Contribute'}
                            </button>
                            <button
                              onClick={() => {
                                setGameState(prev => {
                                  const newVotes = [...prev.fortressVotes];
                                  newVotes[index] = false;
                                  return { ...prev, fortressVotes: newVotes };
                                });
                              }}
                              disabled={hasDecided}
                              className={`w-full px-3 py-1 rounded text-sm ${
                                gameState.fortressVotes[index] === false
                                  ? 'bg-gray-600 text-white'
                                  : 'bg-gray-500 hover:bg-gray-600 text-white disabled:bg-gray-300'
                              }`}
                            >
                              {gameState.fortressVotes[index] === false ? 'Not Contributing' : 'Decline'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Show result when all votes are in */}
                  {gameState.fortressVotes.filter(v => v !== null).length === 3 && (
                    <div className="text-center">
                      {(() => {
                        const participants = gameState.fortressVotes.filter(v => v === true).length;
                        const costPerParticipant = participants > 0 ? (6 / participants) : 0;

                        let allCanAfford = true;
                        let insufficientFunds = [];
                        gameState.players.forEach((player, index) => {
                          if (gameState.fortressVotes[index] === true && player.money < costPerParticipant) {
                            allCanAfford = false;
                            insufficientFunds.push(player.faction);
                          }
                        });

                        if (participants === 0) {
                          return (
                            <div>
                              <p className="text-gray-600 mb-2">No one wants to fund the fortress construction.</p>
                              <button
                                onClick={() => {
                                  setGameState(prev => ({
                                    ...prev,
                                    fortressPlanning: null,
                                    fortressTarget: null,
                                    fortressVotes: [null, null, null]
                                  }));
                                }}
                                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded"
                              >
                                Cancel Construction
                              </button>
                            </div>
                          );
                        } else if (!allCanAfford) {
                          return (
                            <div>
                              <p className="text-red-600 mb-2">
                                {insufficientFunds.join(', ')} cannot afford their share ({costPerParticipant.toFixed(2)}○ each)!
                              </p>
                              <button
                                onClick={() => {
                                  setGameState(prev => ({
                                    ...prev,
                                    fortressPlanning: null,
                                    fortressTarget: null,
                                    fortressVotes: [null, null, null]
                                  }));
                                }}
                                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded"
                              >
                                Cancel Construction
                              </button>
                            </div>
                          );
                        } else {
                          return (
                            <div>
                              <p className="text-green-600 mb-2">
                                {participants} contributor{participants > 1 ? 's' : ''} - {costPerParticipant.toFixed(2)}○ each
                              </p>
                              <div className="space-x-2">
                                <button
                                  onClick={executeFortressBuild}
                                  className="bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded"
                                >
                                  🏰 Build Fortress
                                </button>
                                <button
                                  onClick={() => {
                                    setGameState(prev => ({
                                      ...prev,
                                      fortressPlanning: null,
                                      fortressTarget: null,
                                      fortressVotes: [null, null, null]
                                    }));
                                  }}
                                  className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          );
                        }
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="text-center">
              <p className="text-sm text-gray-600 mb-2">No assembly decisions this turn</p>
              <button
                onClick={() => nextPhase()}
                className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded"
              >
                End Assembly
              </button>
            </div>
          </div>
        </div>
      )}

      
      
      {/* Regions Status */}
      <div className="bg-white rounded-lg p-4 mb-6 shadow">
        <h3 className="text-lg font-semibold mb-3">
          Republic Regions ({Object.values(gameState.regions).filter(r => r.controller === 'republic').length}/6) • 
          Order Regions ({Object.values(gameState.regions).filter(r => r.controller === 'order').length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(gameState.regions).map(([name, region]) => {
            const totalBuildings = Object.values(region.buildings).reduce((sum, count) => sum + count, 0);
            const displayName = name === 'bearhill' ? 'Bear Hill' : name.charAt(0).toUpperCase() + name.slice(1);
            return (
              <div key={name} className={`p-3 rounded border ${
                region.controller === 'republic' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
              }`}>
                <h4 className="font-medium">
                  {displayName}
                  <span className="text-xs ml-2 px-2 py-1 rounded">
                    {region.controller === 'republic' ? '🏛️ Republic' : '⚔️ Order'}
                  </span>
                  {region.fortress && (
                    <span className="text-xs ml-1 px-2 py-1 rounded bg-gray-600 text-white">
                      🏰 Fortress
                    </span>
                  )}
                </h4>
                <div className="text-sm text-gray-600">
                  {totalBuildings} building{totalBuildings !== 1 ? 's' : ''}
                  {name === 'pskov' && region.buildings.merchant_mansion > 0 && (
                    <span className="block">Merchants: {region.buildings.merchant_mansion + region.buildings.merchant_church} buildings</span>
                  )}
                  {region.fortress && (
                    <span className="block text-blue-600">+10 defense bonus</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Game End */}
      {gameState.turn > 20 && (
        <div className="bg-green-100 border border-green-400 rounded-lg p-6 mt-4">
          <h3 className="text-xl font-bold text-green-800 mb-4">🏆 Game Complete!</h3>
          {(() => {
            const result = getGameResult();
            return (
              <div>
                <div className="bg-yellow-100 border border-yellow-400 rounded p-4 mb-4">
                  <h4 className="font-bold text-lg">Winner: {result.winner.faction}</h4>
                  <p className="text-sm">
                    {result.winner.victoryPoints} Victory Points • {result.winner.money} ○
                  </p>
                </div>

                <h4 className="font-semibold mb-2">Final Rankings:</h4>
                <div className="space-y-2">
                  {result.rankings.map((player, rank) => (
                    <div 
                      key={player.index} 
                      className={`p-3 rounded ${rank === 0 ? 'bg-yellow-50 border border-yellow-300' : 'bg-gray-50'}`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium">
                          #{rank + 1} {player.faction}
                          {rank === 0 && ' 👑'}
                        </span>
                        <span className="text-sm">
                          {player.victoryPoints} ♦ • {player.money} ○
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 p-3 bg-blue-50 rounded">
                  <h5 className="font-medium text-blue-800">Victory Conditions:</h5>
                  <ul className="text-sm text-blue-700 mt-1">
                    <li>• Each improvement built = 1 Victory Point ♦</li>
                    <li>• Highest Victory Points wins</li>
                    <li>• Ties broken by most money ○</li>
                  </ul>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Progress to Game End */}
      {gameState.turn <= 20 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <h4 className="font-medium text-blue-800 mb-2">Progress to Victory</h4>
          <div className="w-full bg-blue-200 rounded-full h-3 mb-2">
            <div 
              className="bg-blue-600 h-3 rounded-full transition-all duration-300" 
              style={{ width: `${(gameState.turn / 20) * 100}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-sm text-blue-700">
            <span>Turn {gameState.turn} of 20</span>
            <span>{20 - gameState.turn} turns remaining</span>
          </div>

          <div className="mt-3">
            <h5 className="font-medium text-blue-800 mb-1">Current Victory Points:</h5>
            <div className="flex justify-between text-sm">
              {gameState.players.map((player, index) => (
                <span key={index} className="text-blue-700">
                  {player.faction}: {calculateVictoryPoints(player)} ♦
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * App Wrapper Component
 * 
 * Manages navigation between screens:
 * - MainMenu: Choose local or online play
 * - Lobby: Online multiplayer lobby
 * - PskovGame: The actual game
 */
const App = () => {
  const [screen, setScreen] = useState('menu'); // 'menu' | 'lobby' | 'game'
  
  // Store state
  const mode = useGameStore((state) => state.mode);
  const room = useGameStore((state) => state.room);
  const gameState = useGameStore((state) => state.gameState);
  const roomId = useGameStore((state) => state.roomId);
  const playerId = useGameStore((state) => state.playerId);
  const initLocalGame = useGameStore((state) => state.initLocalGame);
  const createRoom = useGameStore((state) => state.createRoom);
  const joinRoom = useGameStore((state) => state.joinRoom);
  const leaveRoom = useGameStore((state) => state.leaveRoom);
  const resetStore = useGameStore((state) => state.resetStore);

  // Handle screen transitions based on game state
  useEffect(() => {
    if (mode === 'online' && room?.gameStarted && gameState) {
      // Game has started
      setScreen('game');
    } else if (mode === 'online' && roomId && !room?.gameStarted) {
      // In lobby waiting for game to start
      setScreen('lobby');
    }
  }, [mode, room?.gameStarted, gameState, roomId]);

  // Start local hotseat game
  const handleStartLocal = () => {
    initLocalGame();
    setScreen('game');
  };

  // Create online room
  const handleCreateRoom = async (playerName) => {
    const newRoomId = await createRoom();
    // After creating, we need to join the room with a faction
    // For now, go to lobby where they can select faction
    setScreen('lobby');
  };

  // Join existing room (first step - just get room code)
  const handleJoinRoom = async (roomCode, playerName) => {
    // Store player name for later use when selecting faction
    sessionStorage.setItem('playerName', playerName);
    // For now, go to lobby where they can select faction
    useGameStore.getState().setRoomId(roomCode);
    setScreen('lobby');
  };

  // Select faction in lobby (actually joins the room)
  const handleSelectFaction = async (factionIndex) => {
    const playerName = sessionStorage.getItem('playerName') || 'Player';
    const currentRoomId = useGameStore.getState().roomId;
    await joinRoom(currentRoomId, factionIndex, playerName);
  };

  // Leave room and go back to menu
  const handleLeave = () => {
    leaveRoom();
    resetStore();
    setScreen('menu');
  };

  // Go back to menu
  const handleBackToMenu = () => {
    resetStore();
    setScreen('menu');
  };

  // Render appropriate screen
  switch (screen) {
    case 'menu':
      return (
        <MainMenu
          onStartLocal={handleStartLocal}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
        />
      );

    case 'lobby':
      return (
        <Lobby
          onSelectFaction={handleSelectFaction}
          onLeave={handleLeave}
        />
      );

    case 'game':
      return (
        <div className="relative">
          {/* Back to menu button for online games */}
          {mode === 'online' && (
            <div className="fixed top-4 right-4 z-50">
              <button
                onClick={handleLeave}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded shadow"
              >
                Leave Game
              </button>
            </div>
          )}
          {/* Back to menu button for local games */}
          {mode === 'local' && (
            <div className="fixed top-4 right-4 z-50">
              <button
                onClick={handleBackToMenu}
                className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded shadow"
              >
                Main Menu
              </button>
            </div>
          )}
          <PskovGame />
        </div>
      );

    default:
      return <MainMenu onStartLocal={handleStartLocal} onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} />;
  }
};

export default App;
