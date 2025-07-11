import React, { useState } from 'react';

const PskovGame = () => {
  // Debug mode - set to true for predictable event order
  const DEBUG_MODE = true;

  const [gameState, setGameState] = useState({
    turn: 1,
    phase: 'resources',
    currentPlayer: 0, // for construction phase
    selectedRegion: 'pskov', // for construction phase
    currentEvent: null, // current event card
    eventVotes: [null, null, null], // votes for current event
    eventResolved: false, // has current event been resolved
    debugEventIndex: 0, // for debug mode - cycles through events in order
    lastEventResult: null, // stores result message for immediate events
    activeEffects: [], // tracks ongoing effects
    regions: {
      pskov: { 
        controller: 'republic', 
        buildings: {
          commoner_huts: 0,
          commoner_church: 0,
          noble_manor: 0,
          noble_monastery: 0,
          merchant_mansion: 0,
          merchant_church: 0
        }
      },
      ostrov: { 
        controller: 'republic', 
        buildings: {
          commoner_huts: 0,
          commoner_church: 0,
          noble_manor: 0,
          noble_monastery: 0
        }
      },
      izborsk: { 
        controller: 'republic', 
        buildings: {
          commoner_huts: 0,
          commoner_church: 0,
          noble_manor: 0,
          noble_monastery: 0
        }
      },
      skrynnitsy: { 
        controller: 'republic', 
        buildings: {
          commoner_huts: 0,
          commoner_church: 0,
          noble_manor: 0,
          noble_monastery: 0
        }
      },
      gdov: { 
        controller: 'republic', 
        buildings: {
          commoner_huts: 0,
          commoner_church: 0,
          noble_manor: 0,
          noble_monastery: 0
        }
      },
      pechory: { 
        controller: 'republic', 
        buildings: {
          commoner_huts: 0,
          commoner_church: 0,
          noble_manor: 0,
          noble_monastery: 0
        }
      },
      bearhill: { 
        controller: 'order', 
        buildings: {
          commoner_huts: 0,
          commoner_church: 0,
          noble_manor: 0,
          noble_monastery: 0
        }
      }
    },
    constructionActions: [
      { improvement: false, equipment: false },
      { improvement: false, equipment: false },
      { improvement: false, equipment: false }
    ],
    players: [
      { faction: 'Nobles', money: 0, weapons: 0, armor: 0, improvements: 0 },
      { faction: 'Merchants', money: 0, weapons: 0, armor: 0, improvements: 0 },
      { faction: 'Commoners', money: 0, weapons: 0, armor: 0, improvements: 0 }
    ]
  });

  const phases = ['resources', 'construction', 'events', 'veche', 'military'];
  const phaseNames = {
    resources: 'Resources',
    construction: 'Construction', 
    events: 'Events',
    veche: 'Veche (Council)',
    military: 'Military Actions'
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
      id: 'plague',
      name: 'Plague',
      description: 'A plague spreads through the city. Who will fund isolation and treatment?',
      type: 'participation',
      totalCost: 3,
      question: 'Who will help fund isolation and treatment? Cost will be split evenly among participants.',
      minCostPerPlayer: 1,
      successText: 'ISOLATION FUNDED',
      failureText: 'PLAGUE ALLOWED TO ROAM FREE'
    },
    {
      id: 'order_attack_110',
      name: 'Order Attack (110)',
      description: 'The Teutonic Order attacks with strength 110. Who will contribute to the defense?',
      type: 'participation',
      totalCost: 3,
      question: 'Who will help fund the defense? Cost will be split evenly among participants.',
      minCostPerPlayer: 1,
      successText: 'DEFENSE FUNDED',
      failureText: 'NO DEFENSE - SURRENDER'
    },
    {
      id: 'boyars_take_bribes',
      name: 'Nobles Take Bribes',
      description: 'Noble corruption has been discovered. How will you handle this?',
      type: 'voting',
      defaultOption: 'ignore',
      options: [
        { id: 'investigate', name: 'Investigate and punish' },
        { id: 'ignore', name: 'This is the way it is' }
      ],
      effects: {
        investigate: (gameState) => {
          const newPlayers = gameState.players.map((player, index) => {
            if (player.faction === 'Nobles') {
              return { ...player, money: Math.max(0, player.money - 2) };
            }
            return player;
          });
          return { 
            ...gameState, 
            players: newPlayers,
            lastEventResult: 'Nobles punished for corruption! -2○ and strength penalty applied.'
          };
          // TODO: Implement -15 noble strength effect
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
                value: -50, // TODO -50% implemented as flat -50 points for now
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
        { id: 'modest', name: 'Receive modestly', requiresMinMoney: 1 },
        { id: 'luxurious', name: 'Receive luxuriously', requiresMinMoney: 2 },
        { id: 'refuse', name: 'Refuse to receive them' }
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
            return { 
              ...gameState,
              lastEventResult: 'Embassy refused! Grand Prince is insulted. -50% strength and income for 5 turns.'
            };
            // TODO: Implement -50% strength and income for 5 turns
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

          //Create the strength bonus effect
          const strengthEffect = {
            id: `embassy_strength_bonus_${Date.now()}`,
            type: 'strength_bonus',
            target: 'all',
            value: 10,
            turnsRemaining: 3,
            description: 'Embassy reception boost'
          };

          return { 
            ...gameState, 
            players: newPlayers,
            activeEffects: [...gameState.activeEffects, strengthEffect],
            lastEventResult: 'Embassy received luxuriously! +10 strength for 3 turns.'
          };
          // TODO: Implement +10 strength for 3 turns
        },
        refuse: (gameState) => {
          // CREATE BOTH EFFECTS: strength penalty and income penalty
          const newEffects = [
            {
              id: `embassy_strength_penalty_${Date.now()}`,
              type: 'strength_penalty',
              target: 'all',
              value: -50, // -50% as flat penalty for now
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
            activeEffects: [...gameState.activeEffects, ...newEffects], // ADD BOTH EFFECTS
            lastEventResult: 'Embassy refused! Grand Prince is insulted and prohibits trade with Pskov. -50% strength and income for 5 turns.'
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
        { id: 'build_temple', name: 'Build a church', requiresMinMoney: 1 },
        { id: 'deception', name: 'It\'s all deception' }
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
      id: 'merchants_robbed',
      name: 'Merchants Robbed',
      description: 'Foreign merchants have been robbed near your borders. How will you respond?',
      type: 'voting',
      defaultOption: 'trade_risk',
      options: [
        { id: 'rob_foreign', name: 'Rob foreign merchants' },
        { id: 'demand_compensation', name: 'Demand compensation' },
        { id: 'trade_risk', name: 'Trade is risk' }
      ],
      effects: {
        rob_foreign: (gameState) => {
          // TODO: Implement "on roll 1-3 Order attack occurs"
          return gameState;
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
            value: -25, // -50% strength
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
      id: 'izhorian_delegation',
      name: 'Delegation from the Izhorians',
      description: 'A delegation from the Izhorian people arrives at your gates seeking an audience.',
      type: 'voting',
      acceptCost: 6,
      defaultOption: 'send_back',
      options: [
        { id: 'accept', name: 'Accept into service', requiresMinMoney: 2 },
        { id: 'rob', name: 'Rob them' },
        { id: 'send_back', name: 'Send them away' }
      ],
      effects: {
        accept: (gameState, votes) => {
          const participants = votes.filter(v => v === 'accept').length;
          const costPerParticipant = participants > 0 ? 6 / participants : 0;

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
      description: 'The crops are failing due to lack of rain. Emergency food supplies cost 6○ total.',
      type: 'participation',
      totalCost: 6,
      question: 'Who will help buy emergency food supplies? Cost will be split evenly among participants.',
      minCostPerPlayer: 2,
      successText: 'FOOD PURCHASED',
      failureText: 'PURCHASE FAILED',
      effects: {
        success: (gameState, votes) => {
          // Apply normal participation logic (money deduction)
          const participants = votes.filter(v => v === true).length;
          const costPerParticipant = participants > 0 ? 3 / participants : 0;
          const newPlayers = gameState.players.map((player, index) => {
            if (votes[index] === true) {
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
        failure: (gameState) => {
          const famineEffect = {
            id: `drought_famine_${Date.now()}`,
            type: 'strength_penalty',
            target: 'Commoners',
            value: -20, // TODO 50% implemented as flat -30 points for now
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
      type: 'participation',
      totalCost: 3,
      question: 'Who will help fund the defense? Cost will be split evenly among participants.',
      minCostPerPlayer: 1,
      successText: 'DEFENSE FUNDED',
      failureText: 'NO DEFENSE - SURRENDER'
    },
    {
      id: 'order_attack_95',
      name: 'Order Attack (95)',
      description: 'The Teutonic Order attacks with strength 95. Who will contribute to the defense?',
      type: 'participation',
      totalCost: 3,
      question: 'Who will help fund the defense? Cost will be split evenly among participants.',
      minCostPerPlayer: 1,
      successText: 'DEFENSE FUNDED',
      failureText: 'NO DEFENSE - SURRENDER'
    },
    {
      id: 'order_attack_100',
      name: 'Order Attack (100)',
      description: 'The Teutonic Order attacks with strength 100. Who will contribute to the defense?',
      type: 'participation',
      totalCost: 3,
      question: 'Who will help fund the defense? Cost will be split evenly among participants.',
      minCostPerPlayer: 1,
      successText: 'DEFENSE FUNDED',
      failureText: 'NO DEFENSE - SURRENDER'
    },
    {
      id: 'order_attack_105',
      name: 'Order Attack (105)',
      description: 'The Teutonic Order attacks with strength 105. Who will contribute to the defense?',
      type: 'participation',
      totalCost: 3,
      question: 'Who will help fund the defense? Cost will be split evenly among participants.',
      minCostPerPlayer: 1,
      successText: 'DEFENSE FUNDED',
      failureText: 'NO DEFENSE - SURRENDER'
    },
    {
      id: 'order_attack_110',
      name: 'Order Attack (110)',
      description: 'The Teutonic Order attacks with strength 110. Who will contribute to the defense?',
      type: 'participation',
      totalCost: 3,
      question: 'Who will help fund the defense? Cost will be split evenly among participants.',
      minCostPerPlayer: 1,
      successText: 'DEFENSE FUNDED',
      failureText: 'NO DEFENSE - SURRENDER'
    },
    {
      id: 'plague',
      name: 'Plague',
      description: 'A plague spreads through the city. Who will fund isolation and treatment?',
      type: 'participation',
      totalCost: 3,
      question: 'Who will help fund isolation and treatment? Cost will be split evenly among participants.',
      minCostPerPlayer: 1,
      successText: 'ISOLATION FUNDED',
      failureText: 'NO ISOLATION - PLAGUE SPREADS',
      effects: {
        success: (gameState, votes) => {
          const participants = votes.filter(v => v === true).length;
          const costPerParticipant = participants > 0 ? 3 / participants : 0;
          const newPlayers = gameState.players.map((player, index) => {
            if (votes[index] === true) {
              return { ...player, money: player.money - costPerParticipant };
            }
            return player;
          });
          return { 
            ...gameState, 
            players: newPlayers,
            lastEventResult: 'Plague contained through isolation measures!'
          };
        },
        failure: (gameState) => {
          const plagueEffect = {
            id: `plague_weakness_${Date.now()}`,
            type: 'strength_penalty',
            target: 'all',
            value: -10, // -25% strength for all
            turnsRemaining: 2,
            description: 'Plague weakens population'
          };
          return { 
            ...gameState,
            activeEffects: [...gameState.activeEffects, plagueEffect],
            lastEventResult: 'Plague spreads unchecked! All factions lose 25% strength for 2 turns.'
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
    setGameState(prev => {
      const newVotes = [...prev.eventVotes];
      newVotes[playerIndex] = vote;
      return { ...prev, eventVotes: newVotes };
    });
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
    setGameState(prev => {
      const newRegions = { ...prev.regions };
      const newPlayers = [...prev.players];
      const newConstructionActions = [...prev.constructionActions];

      if (newPlayers[prev.currentPlayer].money >= 2) {
        newPlayers[prev.currentPlayer].money -= 2;
        newPlayers[prev.currentPlayer].improvements += 1;
        newConstructionActions[prev.currentPlayer].improvement = true;

        if (buildingType.startsWith('merchant_')) {
          newRegions[prev.selectedRegion].buildings[buildingType] += 1;
        } else {
          newRegions[prev.selectedRegion].buildings[buildingType] = 1;
        }
      }

      return {
        ...prev,
        regions: newRegions,
        players: newPlayers,
        constructionActions: newConstructionActions
      };
    });
  };

  const nextPhase = () => {
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
    setGameState(prev => ({
      ...prev,
      currentPlayer: (prev.currentPlayer + 1) % 3
    }));
  };

  const buyItem = (playerIndex, item, cost) => {
    setGameState(prev => {
      const newPlayers = [...prev.players];
      const newConstructionActions = [...prev.constructionActions];

      if (newPlayers[playerIndex].money >= cost) {
        newPlayers[playerIndex].money -= cost;
        newPlayers[playerIndex][item] += 1;

        if (item === 'weapons' || item === 'armor') {
          newConstructionActions[playerIndex].equipment = true;
        }
      }
      return { 
        ...prev, 
        players: newPlayers,
        constructionActions: newConstructionActions
      };
    });
  };

  // Resolve current event using abstracted system
  const resolveEvent = () => {
    setGameState(prev => {
      const event = prev.currentEvent;
      const eventType = eventTypes[event.type];

      if (!eventType) {
        console.error('Unknown event type:', event.type);
        return prev;
      }

      const newState = eventType.resolve(event, prev, prev.eventVotes);

      return {
        ...newState,
        eventResolved: true
      };
    });
  };

  const resetGame = () => {
    setGameState({
      turn: 1,
      phase: 'resources',
      currentPlayer: 0,
      selectedRegion: 'pskov',
      currentEvent: null,
      eventVotes: [null, null, null],
      eventResolved: false,
      debugEventIndex: 0,
      lastEventResult: null,
      regions: {
        pskov: { 
          controller: 'republic', 
          buildings: {
            commoner_huts: 0,
            commoner_church: 0,
            noble_manor: 0,
            noble_monastery: 0,
            merchant_mansion: 0,
            merchant_church: 0
          }
        },
        ostrov: { 
          controller: 'republic', 
          buildings: {
            commoner_huts: 0,
            commoner_church: 0,
            noble_manor: 0,
            noble_monastery: 0
          }
        },
        izborsk: { 
          controller: 'republic', 
          buildings: {
            commoner_huts: 0,
            commoner_church: 0,
            noble_manor: 0,
            noble_monastery: 0
          }
        },
        skrynnitsy: { 
          controller: 'republic', 
          buildings: {
            commoner_huts: 0,
            commoner_church: 0,
            noble_manor: 0,
            noble_monastery: 0
          }
        },
        gdov: { 
          controller: 'republic', 
          buildings: {
            commoner_huts: 0,
            commoner_church: 0,
            noble_manor: 0,
            noble_monastery: 0
          }
        },
        pechory: { 
          controller: 'republic', 
          buildings: {
            commoner_huts: 0,
            commoner_church: 0,
            noble_manor: 0,
            noble_monastery: 0
          }
        },
        bearhill: { 
          controller: 'order', 
          buildings: {
            commoner_huts: 0,
            commoner_church: 0,
            noble_manor: 0,
            noble_monastery: 0
          }
        }
      },
      constructionActions: [
        { improvement: false, equipment: false },
        { improvement: false, equipment: false },
        { improvement: false, equipment: false }
      ],
      players: [
        { faction: 'Nobles', money: 0, weapons: 0, armor: 0, improvements: 0 },
        { faction: 'Merchants', money: 0, weapons: 0, armor: 0, improvements: 0 },
        { faction: 'Commoners', money: 0, weapons: 0, armor: 0, improvements: 0 }
      ]
    });
  };

  const getPhaseDescription = (phase) => {
    const descriptions = {
      resources: 'Players receive income from controlled regions and improvements',
      construction: 'Players can build improvements, fortresses, and buy equipment',
      events: 'Draw and resolve an event card',
      veche: 'Council meeting to make collective decisions',
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
        {gameState.players.map((player, index) => (
          <div key={index} className={`bg-white rounded-lg p-4 shadow ${
            gameState.phase === 'construction' && gameState.currentPlayer === index 
              ? 'ring-4 ring-amber-400' 
              : ''
          }`}>
            <h3 className="text-lg font-semibold mb-2">
              {player.faction}
              {gameState.phase === 'construction' && gameState.currentPlayer === index && (
                <span className="text-amber-600 ml-2">(Your Turn)</span>
              )}
            </h3>
            <div className="space-y-1 text-sm">
              <div>Money: {player.money.toFixed(1)} ○</div>
              <div>Improvements: {player.improvements}</div>
              <div>Weapons: {player.weapons}</div>
              <div>Armor: {player.armor}</div>
              <div className="text-gray-600">
                {player.faction === 'Nobles' && `Base Strength: 40`}
                {player.faction === 'Merchants' && `Base Strength: 15`}
                {player.faction === 'Commoners' && `Base Strength: 25`}
                {(() => {
                  const modifier = getStrengthModifier(player.faction);
                  return modifier !== 0 ? (
                    <span className={modifier > 0 ? 'text-green-600' : 'text-red-600'}>
                      {modifier > 0 ? ` (+${modifier})` : ` (${modifier})`}
                    </span>
                  ) : null;
                })()}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Construction Phase Interface */}
      {gameState.phase === 'construction' && (
        <div className="bg-white rounded-lg p-4 mb-6 shadow">
          <h3 className="text-lg font-semibold mb-3">
            {gameState.players[gameState.currentPlayer].faction} - Construction Turn
          </h3>

          {/* Region Selection */}
          <div className="mb-4">
            <h4 className="font-medium mb-2">Select Region:</h4>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(gameState.regions).map(([regionName, region]) => {
                const isMerchantRestricted = gameState.players[gameState.currentPlayer].faction === 'Merchants' && regionName !== 'pskov';
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
            {gameState.players[gameState.currentPlayer].faction === 'Merchants' && gameState.selectedRegion !== 'pskov' && (
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
                    gameState.players[gameState.currentPlayer].money < building.cost ||
                    gameState.constructionActions[gameState.currentPlayer].improvement
                  }
                  className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white p-3 rounded text-sm"
                >
                  <div className="font-medium">{building.name}</div>
                  <div className="text-xs">
                    {building.type.startsWith('merchant_') 
                      ? `Built: ${building.built}/7`
                      : building.built ? 'Already built' : 'Not built'
                    }
                  </div>
                  <div className="text-xs">Cost: {building.cost}○</div>
                </button>
              ))}
              {getAvailableBuildings().length === 0 && (
                <p className="text-gray-500 col-span-2 text-center py-4">
                  {gameState.players[gameState.currentPlayer].faction === 'Merchants' && gameState.selectedRegion !== 'pskov'
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
                onClick={() => buyItem(gameState.currentPlayer, 'weapons', 1)}
                disabled={
                  gameState.players[gameState.currentPlayer].money < 1 || 
                  gameState.constructionActions[gameState.currentPlayer].equipment ||
                  gameState.players[gameState.currentPlayer].weapons >= 2
                }
                className="bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white p-2 rounded text-sm"
              >
                <div>Buy Weapon (1○)</div>
                <div className="text-xs">
                  {gameState.constructionActions[gameState.currentPlayer].equipment ? 'Equipment bought' :
                   gameState.players[gameState.currentPlayer].weapons >= 2 ? 'Max weapons (2)' :
                   `Owned: ${gameState.players[gameState.currentPlayer].weapons}/2`}
                </div>
              </button>
              <button
                onClick={() => buyItem(gameState.currentPlayer, 'armor', 1)}
                disabled={
                  gameState.players[gameState.currentPlayer].money < 1 || 
                  gameState.constructionActions[gameState.currentPlayer].equipment ||
                  gameState.players[gameState.currentPlayer].armor >= 2
                }
                className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white p-2 rounded text-sm"
              >
                <div>Buy Armor (1○)</div>
                <div className="text-xs">
                  {gameState.constructionActions[gameState.currentPlayer].equipment ? 'Equipment bought' :
                   gameState.players[gameState.currentPlayer].armor >= 2 ? 'Max armor (2)' :
                   `Owned: ${gameState.players[gameState.currentPlayer].armor}/2`}
                </div>
              </button>
            </div>
          </div>

          <button
            onClick={nextPlayer}
            className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded"
          >
            Next Player
          </button>
        </div>
      )}

      {/* Construction Complete Message */}
      {gameState.phase === 'construction' && gameState.currentPlayer === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h4 className="font-medium text-blue-800 mb-2">Construction Phase Complete</h4>
          <p className="text-blue-700 text-sm">All players have taken their construction turns. Click "Next Phase" to proceed to Events.</p>
        </div>
      )}

      {/* Events Phase Interface */}
      {gameState.phase === 'events' && gameState.currentEvent && (
        <div className="bg-white rounded-lg p-4 mb-6 shadow">
          <h3 className="text-lg font-semibold mb-3">Event: {gameState.currentEvent.name}</h3>

          <div className="bg-gray-50 p-4 rounded mb-4">
            <p className="text-gray-700 mb-3">{gameState.currentEvent.description}</p>

            {gameState.currentEvent.type === 'voting' && !gameState.eventResolved && (
              <div>
                <h4 className="font-medium mb-2">Council Decision:</h4>
                <p className="text-sm text-gray-600 mb-4">Choose how to respond to the delegation:</p>

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
                    <button
                      onClick={resolveEvent}
                      className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded"
                    >
                      Apply Decision
                    </button>
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
                    <button
                      onClick={resolveEvent}
                      className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded"
                    >
                      Apply Result
                    </button>
                  </div>
                )}
              </div>
            )}

            {gameState.currentEvent.type === 'immediate' && !gameState.eventResolved && (
              <div className="text-center">
                <button
                  onClick={resolveEvent}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded"
                >
                  Apply Effect
                </button>
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
                </h4>
                <div className="text-sm text-gray-600">
                  {totalBuildings} building{totalBuildings !== 1 ? 's' : ''}
                  {name === 'pskov' && region.buildings.merchant_mansion > 0 && (
                    <span className="block">Merchants: {region.buildings.merchant_mansion + region.buildings.merchant_church} buildings</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
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
      <div className="bg-white rounded-lg p-4 shadow">
        <div className="flex justify-between items-center">
          <button
            onClick={resetGame}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded transition-colors"
          >
            Reset Game
          </button>

          <div className="text-center">
            <p className="text-sm text-gray-600 mb-2">
              {gameState.turn >= 20 ? 'Game Complete! Check results below.' : 
               gameState.phase === 'construction' ? 'Players take turns in construction phase' :
               gameState.phase === 'events' && !gameState.eventResolved ? 'Resolve Event First' :
               'Click to advance to next phase'}
            </p>
            <button
              onClick={nextPhase}
              disabled={gameState.turn > 20 || (gameState.phase === 'events' && !gameState.eventResolved)}
              className={`px-6 py-3 rounded font-semibold transition-colors ${
                gameState.turn > 20 || (gameState.phase === 'events' && !gameState.eventResolved)
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-amber-600 hover:bg-amber-700 text-white'
              }`}
            >
              {gameState.turn > 20 ? 'Game Complete' : 
               gameState.phase === 'events' && !gameState.eventResolved ? 'Resolve Event First' :
               'Next Phase'}
            </button>
          </div>

          <div className="text-right">
            <p className="text-sm text-gray-600">Game will end after</p>
            <p className="font-semibold">Turn 20</p>
          </div>
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

export default PskovGame;