// Event deck and event resolution logic

import { createEffect, addEffects } from './effects.js';
import { getValidOrderAttackTargets } from './regions.js';
import { executeBattle, surrenderRegion, destroyRandomBuildings } from './combat.js';
import { formatRegionName, BUILDING_NAMES } from './state.js';

// Event type handlers
export const eventTypes = {
  immediate: {
    resolve: (event, state) => {
      return event.effect(state);
    },
  },

  participation: {
    resolve: (event, state, votes) => {
      const participants = votes.filter((v) => v === true).length;
      const costPerParticipant = participants > 0 ? event.totalCost / participants : 0;

      let allCanAfford = true;
      state.players.forEach((player, index) => {
        if (votes[index] === true && player.money < costPerParticipant) {
          allCanAfford = false;
        }
      });

      if (!allCanAfford || participants === 0) {
        return state;
      }

      const newPlayers = state.players.map((player, index) => {
        if (votes[index] === true) {
          return { ...player, money: player.money - costPerParticipant };
        }
        return player;
      });

      return { ...state, players: newPlayers };
    },
  },

  order_attack: {
    resolve: (event, state, votes, randomValues = {}) => {
      // Get valid attack targets using map adjacency
      const validTargets = getValidOrderAttackTargets(state.regions);

      // Filter out Pskov initially (only attack Pskov if it's the only valid target)
      const nonPskovTargets = validTargets.filter((name) => name !== 'pskov');

      let targetRegion;
      if (nonPskovTargets.length > 0) {
        // Random target from valid adjacent regions (excluding Pskov)
        const randomIndex =
          randomValues.targetIndex !== undefined
            ? randomValues.targetIndex
            : Math.floor(Math.random() * nonPskovTargets.length);
        targetRegion = nonPskovTargets[randomIndex % nonPskovTargets.length];
      } else if (validTargets.includes('pskov')) {
        targetRegion = 'pskov';
      } else {
        return {
          ...state,
          lastEventResult: 'The Teutonic Order could not find a valid target to attack.',
        };
      }

      const participants = votes.filter((v) => v === true).length;
      const costPerParticipant = participants > 0 ? 3 / participants : 0;

      // Check if defense is funded
      let allCanAfford = true;
      const defendingPlayers = [];

      state.players.forEach((player, index) => {
        if (votes[index] === true) {
          if (player.money < costPerParticipant) {
            allCanAfford = false;
          } else {
            defendingPlayers.push(index);
          }
        }
      });

      const defenseFunded = participants > 0 && allCanAfford;

      if (!defenseFunded) {
        return surrenderRegion(state, targetRegion);
      }

      // Deduct money from participants
      const newPlayers = state.players.map((player, index) => {
        if (votes[index] === true) {
          return { ...player, money: player.money - costPerParticipant };
        }
        return player;
      });

      // Execute the battle
      const stateWithPayment = {
        ...state,
        players: newPlayers,
      };

      return executeBattle(
        stateWithPayment,
        event.orderStrength,
        targetRegion,
        defendingPlayers,
        randomValues.battleRoll
      );
    },
  },

  voting: {
    resolve: (event, state, votes) => {
      const voteCounts = {};
      votes.forEach((vote) => {
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
        const acceptVoters = votes.filter((v) => v === 'accept').length;
        const costPerVoter = acceptVoters > 0 ? event.acceptCost / acceptVoters : 0;

        let allCanAfford = true;
        state.players.forEach((player, index) => {
          if (votes[index] === 'accept' && player.money < costPerVoter) {
            allCanAfford = false;
          }
        });

        if (!allCanAfford || acceptVoters === 0) {
          winningOption = event.defaultOption || 'send_back';
        }
      }

      return event.effects[winningOption](state, votes);
    },
  },
};

// Event deck with all events
export const eventDeck = [
  {
    id: 'merchants_robbed',
    name: 'Merchants Robbed',
    description:
      'Foreign merchants have been robbed near your borders. How will you respond?',
    type: 'voting',
    defaultOption: 'trade_risk',
    options: [
      {
        id: 'rob_foreign',
        name: 'Rob foreign merchants',
        effectText: '50% chance: Order attacks (100)',
      },
      {
        id: 'demand_compensation',
        name: 'Demand compensation',
        costText: 'Merchants: -1○',
        effectText: '50% chance: Merchants -10 str/3 turns',
      },
      { id: 'trade_risk', name: 'Trade is risk', effectText: 'Merchants: -10 str/3 turns' },
    ],
    effects: {
      rob_foreign: (state) => {
        const roll = Math.floor(Math.random() * 6) + 1;

        if (roll <= 3) {
          const orderAttackEvent = {
            id: 'order_attack_rob_foreign',
            name: 'Order Attack (100)',
            description:
              'The Teutonic Order retaliates for the robbed merchants! They attack with strength 100.',
            type: 'order_attack',
            orderStrength: 100,
            question:
              'Who will help fund the defense? Cost will be split evenly among participants.',
            minCostPerPlayer: 1,
          };

          return {
            ...state,
            currentEvent: orderAttackEvent,
            eventResolved: false,
            eventVotes: [null, null, null],
            lastEventResult: `Rolled ${roll}! The Order attacks immediately!`,
          };
        } else {
          return {
            ...state,
            lastEventResult: `Rolled ${roll}. The robbery went unnoticed.`,
          };
        }
      },
      demand_compensation: (state) => {
        const newPlayers = state.players.map((player) => {
          if (player.faction === 'Merchants') {
            return { ...player, money: Math.max(0, player.money - 1) };
          }
          return player;
        });
        const rollFailed = Math.random() < 0.5;
        if (rollFailed) {
          const merchantWeaknessEffect = createEffect(
            'strength_penalty',
            'Merchants',
            -10,
            3,
            'Merchant trading weakness'
          );
          return {
            ...state,
            players: newPlayers,
            activeEffects: [...state.activeEffects, merchantWeaknessEffect],
            lastEventResult:
              'Compensation demand failed! Merchants weakened for 3 turns.',
          };
        } else {
          return {
            ...state,
            players: newPlayers,
            lastEventResult: 'Compensation received successfully.',
          };
        }
      },
      trade_risk: (state) => {
        const merchantWeaknessEffect = createEffect(
          'strength_penalty',
          'Merchants',
          -10,
          3,
          'Trade route disruption'
        );
        return {
          ...state,
          activeEffects: [...state.activeEffects, merchantWeaknessEffect],
          lastEventResult:
            'Trade routes disrupted! Merchants lose 50% strength for 3 turns.',
        };
      },
    },
  },
  {
    id: 'order_attack_95',
    name: 'Order Attack (95)',
    description:
      'The Teutonic Order attacks with strength 95. Who will contribute to the defense?',
    type: 'order_attack',
    orderStrength: 95,
    question: 'Who will help fund the defense? Cost will be split evenly among participants.',
    minCostPerPlayer: 1,
  },
  {
    id: 'order_attack_110',
    name: 'Order Attack (110)',
    description:
      'The Teutonic Order attacks with strength 110. Who will contribute to the defense?',
    type: 'order_attack',
    orderStrength: 110,
    question: 'Who will help fund the defense? Cost will be split evenly among participants.',
    minCostPerPlayer: 1,
  },
  {
    id: 'boyars_take_bribes',
    name: 'Nobles Take Bribes',
    description: 'Noble corruption has been discovered. How will you handle this?',
    type: 'voting',
    defaultOption: 'ignore',
    options: [
      {
        id: 'investigate',
        name: 'Investigate and punish',
        costText: 'Nobles: -2○',
        effectText: 'Nobles: -15 str/3 turns',
      },
      {
        id: 'ignore',
        name: 'This is the way it is',
        effectText: '50% chance: Uprising (buildings destroyed)',
      },
    ],
    effects: {
      investigate: (state) => {
        const newPlayers = state.players.map((player) => {
          if (player.faction === 'Nobles') {
            return { ...player, money: Math.max(0, player.money - 2) };
          }
          return player;
        });

        const nobleWeaknessEffect = createEffect(
          'strength_penalty',
          'Nobles',
          -15,
          3,
          'Noble corruption investigation penalty'
        );

        return {
          ...state,
          players: newPlayers,
          activeEffects: [...state.activeEffects, nobleWeaknessEffect],
          lastEventResult:
            'Nobles punished for corruption! -2○ and -15 strength for 3 turns.',
        };
      },
      ignore: (state) => {
        const uprisingRoll = Math.random();
        if (uprisingRoll < 0.5) {
          const { state: newState, destroyedBuildings } = destroyRandomBuildings(
            state,
            'pskov',
            2
          );

          const uprisingEffect = createEffect(
            'strength_penalty',
            'all',
            -7,
            2,
            'Uprising strength penalty'
          );

          return {
            ...newState,
            activeEffects: [...newState.activeEffects, uprisingEffect],
            lastEventResult: `UPRISING! All factions lose 50% strength. Buildings destroyed: ${destroyedBuildings.join(', ') || 'None'}`,
          };
        } else {
          return {
            ...state,
            lastEventResult:
              'Corruption ignored. The people grumble but no uprising occurs.',
          };
        }
      },
    },
  },
  {
    id: 'embassy',
    name: 'Embassy',
    description: 'An embassy from the Grand Prince arrives. How will you receive them?',
    type: 'voting',
    defaultOption: 'modest',
    options: [
      {
        id: 'modest',
        name: 'Receive modestly',
        requiresMinMoney: 1,
        costText: '3○ split',
        effectText: 'Relations maintained',
      },
      {
        id: 'luxurious',
        name: 'Receive luxuriously',
        requiresMinMoney: 2,
        costText: '6○ split',
        effectText: 'All: +3 str/3 turns',
      },
      {
        id: 'refuse',
        name: 'Refuse to receive them',
        effectText: 'All: -15 str, -50% income/5 turns',
      },
    ],
    effects: {
      modest: (state, votes) => {
        const participants = votes.filter((v) => v === 'modest').length;
        const costPerParticipant = participants > 0 ? 3 / participants : 0;

        let allCanAfford = true;
        state.players.forEach((player, index) => {
          if (votes[index] === 'modest' && player.money < costPerParticipant) {
            allCanAfford = false;
          }
        });

        if (!allCanAfford || participants === 0) {
          // Fall back to refuse
          return eventDeck.find((e) => e.id === 'embassy').effects.refuse(state);
        }

        const newPlayers = state.players.map((player, index) => {
          if (votes[index] === 'modest') {
            return { ...player, money: player.money - costPerParticipant };
          }
          return player;
        });

        return {
          ...state,
          players: newPlayers,
          lastEventResult: 'Embassy received modestly. Relations maintained.',
        };
      },
      luxurious: (state, votes) => {
        const participants = votes.filter((v) => v === 'luxurious').length;
        const costPerParticipant = participants > 0 ? 6 / participants : 0;

        let allCanAfford = true;
        state.players.forEach((player, index) => {
          if (votes[index] === 'luxurious' && player.money < costPerParticipant) {
            allCanAfford = false;
          }
        });

        if (!allCanAfford || participants === 0) {
          return eventDeck
            .find((e) => e.id === 'embassy')
            .effects.modest(
              state,
              votes.map(() => 'modest')
            );
        }

        const newPlayers = state.players.map((player, index) => {
          if (votes[index] === 'luxurious') {
            return { ...player, money: player.money - costPerParticipant };
          }
          return player;
        });

        const strengthEffect = createEffect(
          'strength_bonus',
          'all',
          3,
          3,
          'Embassy reception boost'
        );

        return {
          ...state,
          players: newPlayers,
          activeEffects: [...state.activeEffects, strengthEffect],
          lastEventResult: 'Embassy received luxuriously! +10 strength for 3 turns.',
        };
      },
      refuse: (state) => {
        const newEffects = [
          createEffect('strength_penalty', 'all', -15, 5, 'Embassy refusal strength penalty'),
          createEffect('income_penalty', 'all', -0.5, 5, 'Embassy refusal income penalty'),
        ];

        return {
          ...state,
          activeEffects: [...state.activeEffects, ...newEffects],
          lastEventResult:
            'Embassy refused! Grand Prince is insulted. Strength -15 and income -50% for 5 turns.',
        };
      },
    },
  },
  {
    id: 'relics_found',
    name: 'Relics Found',
    description: 'Holy relics have been discovered. Are they genuine or deception?',
    type: 'voting',
    options: [
      {
        id: 'build_temple',
        name: 'Build a church',
        requiresMinMoney: 1,
        costText: 'All: -3○',
        effectText: 'All: +5 str/3 turns',
      },
      { id: 'deception', name: "It's all deception", effectText: 'All: -5 str/3 turns' },
    ],
    effects: {
      build_temple: (state) => {
        const newPlayers = state.players.map((player) => ({
          ...player,
          money: Math.max(0, player.money - 3),
        }));
        const relicsBoostEffect = createEffect(
          'strength_bonus',
          'all',
          5,
          3,
          'Holy relics morale boost'
        );

        return {
          ...state,
          players: newPlayers,
          activeEffects: [...state.activeEffects, relicsBoostEffect],
          lastEventResult: 'Church built for holy relics! +5 strength for 3 turns.',
        };
      },
      deception: (state) => {
        const cynicismEffect = createEffect(
          'strength_penalty',
          'all',
          -5,
          3,
          'Religious cynicism penalty'
        );

        return {
          ...state,
          activeEffects: [...state.activeEffects, cynicismEffect],
          lastEventResult:
            'Relics declared false! Religious cynicism spreads. -5 strength for 3 turns.',
        };
      },
    },
  },
  {
    id: 'izhorian_delegation',
    name: 'Delegation from the Izhorians',
    description:
      'A delegation from the Izhorian people arrives at your gates seeking an audience.',
    type: 'voting',
    acceptCost: 6,
    defaultOption: 'send_back',
    options: [
      {
        id: 'accept',
        name: 'Accept into service',
        requiresMinMoney: 2,
        costText: '6○ split',
        effectText: 'All: +5 str/6 turns',
      },
      { id: 'rob', name: 'Rob them', effectText: 'All: +3○, then -5 str/6 turns' },
      { id: 'send_back', name: 'Send them away', effectText: 'No effect' },
    ],
    effects: {
      accept: (state, votes) => {
        const participants = votes.filter((v) => v === 'accept').length;
        const costPerParticipant = participants > 0 ? 6 / participants : 0;

        let allCanAfford = true;
        state.players.forEach((player, index) => {
          if (votes[index] === 'accept' && player.money < costPerParticipant) {
            allCanAfford = false;
          }
        });

        if (!allCanAfford || participants === 0) {
          return eventDeck.find((e) => e.id === 'izhorian_delegation').effects.send_back(
            state
          );
        }

        const newPlayers = state.players.map((player, index) => {
          if (votes[index] === 'accept') {
            return { ...player, money: player.money - costPerParticipant };
          }
          return player;
        });

        const izhoraAllianceEffect = createEffect(
          'strength_bonus',
          'all',
          5,
          6,
          'Izhora allied forces'
        );

        return {
          ...state,
          players: newPlayers,
          activeEffects: [...state.activeEffects, izhoraAllianceEffect],
          lastEventResult: 'Izhorians accepted into service! +5 strength for 6 turns.',
        };
      },
      rob: (state) => {
        const newPlayers = state.players.map((player) => ({
          ...player,
          money: player.money + 3,
        }));

        const izhoraHostilityEffect = createEffect(
          'strength_penalty',
          'all',
          -5,
          6,
          'Izhora hostility'
        );

        return {
          ...state,
          players: newPlayers,
          activeEffects: [...state.activeEffects, izhoraHostilityEffect],
          lastEventResult:
            'Izhorians robbed! They become hostile. -5 strength for 6 turns.',
        };
      },
      send_back: (state) => {
        return state;
      },
    },
  },
  {
    id: 'good_harvest',
    name: 'Good Harvest',
    description: 'The fields have produced an abundant harvest. All players receive +1○.',
    type: 'immediate',
    effect: (state) => {
      const newPlayers = state.players.map((player) => ({
        ...player,
        money: player.money + 1,
      }));
      return { ...state, players: newPlayers };
    },
  },
  {
    id: 'drought',
    name: 'Drought',
    description: 'The crops are failing due to lack of rain. How will you respond?',
    type: 'voting',
    defaultOption: 'no_food',
    options: [
      {
        id: 'buy_food',
        name: 'Buy emergency food supplies',
        requiresMinMoney: 2,
        costText: '6○ split',
        effectText: 'Famine avoided',
      },
      {
        id: 'no_food',
        name: 'Let the people endure',
        effectText: 'Commoners: -12 str/3 turns',
      },
    ],
    effects: {
      buy_food: (state, votes) => {
        const participants = votes.filter((v) => v === 'buy_food').length;
        const costPerParticipant = participants > 0 ? 6 / participants : 0;

        let allCanAfford = true;
        state.players.forEach((player, index) => {
          if (votes[index] === 'buy_food' && player.money < costPerParticipant) {
            allCanAfford = false;
          }
        });

        if (!allCanAfford || participants === 0) {
          return eventDeck.find((e) => e.id === 'drought').effects.no_food(state);
        }

        const newPlayers = state.players.map((player, index) => {
          if (votes[index] === 'buy_food') {
            return { ...player, money: player.money - costPerParticipant };
          }
          return player;
        });

        return {
          ...state,
          players: newPlayers,
          lastEventResult: 'Emergency food purchased! Famine avoided.',
        };
      },
      no_food: (state) => {
        const famineEffect = createEffect(
          'strength_penalty',
          'Commoners',
          -12,
          3,
          'Famine weakens commoners'
        );

        return {
          ...state,
          activeEffects: [...state.activeEffects, famineEffect],
          lastEventResult: 'Famine strikes! Commoners lose 50% strength for 3 turns.',
        };
      },
    },
  },
  {
    id: 'fire',
    name: 'Fire',
    description: 'A fire breaks out in one of your regions, destroying a building.',
    type: 'immediate',
    effect: (state) => {
      const republicRegions = Object.entries(state.regions).filter(
        ([_, region]) => region.controller === 'republic'
      );
      if (republicRegions.length === 0) return state;

      const randomRegionIndex = Math.floor(Math.random() * republicRegions.length);
      const [regionName] = republicRegions[randomRegionIndex];

      const { state: newState, destroyedBuildings } = destroyRandomBuildings(
        state,
        regionName,
        1
      );

      const regionDisplayName = formatRegionName(regionName);

      if (destroyedBuildings.length === 0) {
        return {
          ...state,
          lastEventResult: `Fire breaks out in ${regionDisplayName}, but there are no buildings to burn.`,
        };
      }

      return {
        ...newState,
        lastEventResult: `Fire destroys ${destroyedBuildings[0]} in ${regionDisplayName}!`,
      };
    },
  },
  {
    id: 'city_fire',
    name: 'City Fire',
    description: 'A fire breaks out in Pskov, destroying a building in the city.',
    type: 'immediate',
    effect: (state) => {
      const { state: newState, destroyedBuildings } = destroyRandomBuildings(
        state,
        'pskov',
        1
      );

      if (destroyedBuildings.length === 0) {
        return {
          ...state,
          lastEventResult: 'Fire breaks out in Pskov, but there are no buildings to burn.',
        };
      }

      return {
        ...newState,
        lastEventResult: `City fire destroys ${destroyedBuildings[0]} in Pskov!`,
      };
    },
  },
  {
    id: 'heresy',
    name: 'Heresy',
    description: 'Heretical ideas spread among the people, weakening military resolve.',
    type: 'immediate',
    effect: (state) => {
      const heresyEffect = createEffect(
        'strength_penalty',
        'all',
        -10,
        2,
        'Heretical discord'
      );

      return {
        ...state,
        activeEffects: [...state.activeEffects, heresyEffect],
        lastEventResult: 'Heretical ideas spread! All factions lose 10 strength for 2 turns.',
      };
    },
  },
  {
    id: 'order_attack_90',
    name: 'Order Attack (90)',
    description:
      'The Teutonic Order attacks with strength 90. Who will contribute to the defense?',
    type: 'order_attack',
    orderStrength: 90,
    question: 'Who will help fund the defense? Cost will be split evenly among participants.',
    minCostPerPlayer: 1,
  },
  {
    id: 'order_attack_100',
    name: 'Order Attack (100)',
    description:
      'The Teutonic Order attacks with strength 100. Who will contribute to the defense?',
    type: 'order_attack',
    orderStrength: 100,
    question: 'Who will help fund the defense? Cost will be split evenly among participants.',
    minCostPerPlayer: 1,
  },
  {
    id: 'order_attack_105',
    name: 'Order Attack (105)',
    description:
      'The Teutonic Order attacks with strength 105. Who will contribute to the defense?',
    type: 'order_attack',
    orderStrength: 105,
    question: 'Who will help fund the defense? Cost will be split evenly among participants.',
    minCostPerPlayer: 1,
  },
  {
    id: 'order_attack_110_2',
    name: 'Order Attack (110)',
    description:
      'The Teutonic Order attacks with strength 110. Who will contribute to the defense?',
    type: 'order_attack',
    orderStrength: 110,
    question: 'Who will help fund the defense? Cost will be split evenly among participants.',
    minCostPerPlayer: 1,
  },
  {
    id: 'plague',
    name: 'Plague',
    description: 'A plague spreads through the city. How will you respond?',
    type: 'voting',
    defaultOption: 'no_isolation',
    options: [
      {
        id: 'fund_isolation',
        name: 'Fund isolation and treatment',
        requiresMinMoney: 1,
        costText: '3○ split',
        effectText: 'All: -5 str/2 turns',
      },
      {
        id: 'no_isolation',
        name: 'Trust in God - no isolation',
        effectText: 'All: -25 str/2 turns',
      },
    ],
    effects: {
      fund_isolation: (state, votes) => {
        const participants = votes.filter((v) => v === 'fund_isolation').length;
        const costPerParticipant = participants > 0 ? 3 / participants : 0;

        let allCanAfford = true;
        state.players.forEach((player, index) => {
          if (votes[index] === 'fund_isolation' && player.money < costPerParticipant) {
            allCanAfford = false;
          }
        });

        if (!allCanAfford || participants === 0) {
          return eventDeck.find((e) => e.id === 'plague').effects.no_isolation(state);
        }

        const newPlayers = state.players.map((player, index) => {
          if (votes[index] === 'fund_isolation') {
            return { ...player, money: player.money - costPerParticipant };
          }
          return player;
        });

        const mildPlagueEffect = createEffect(
          'strength_penalty',
          'all',
          -5,
          2,
          'Mild plague effects despite isolation'
        );

        return {
          ...state,
          players: newPlayers,
          activeEffects: [...state.activeEffects, mildPlagueEffect],
          lastEventResult:
            'Plague partially contained! All factions lose 5 strength for 2 turns.',
        };
      },
      no_isolation: (state) => {
        const plagueEffect = createEffect(
          'strength_penalty',
          'all',
          -25,
          2,
          'Severe plague weakens population'
        );

        return {
          ...state,
          activeEffects: [...state.activeEffects, plagueEffect],
          lastEventResult:
            'Plague spreads unchecked! All factions lose 25 strength for 2 turns.',
        };
      },
    },
  },
];

// Draw a random event (or sequential in debug mode)
export const drawEvent = (debugMode = false, debugEventIndex = 0) => {
  if (debugMode) {
    return eventDeck[debugEventIndex % eventDeck.length];
  } else {
    return eventDeck[Math.floor(Math.random() * eventDeck.length)];
  }
};

// Resolve an event
export const resolveEvent = (event, state, votes, randomValues = {}) => {
  const eventType = eventTypes[event.type];

  if (!eventType) {
    console.error('Unknown event type:', event.type);
    return state;
  }

  return eventType.resolve(event, state, votes, randomValues);
};

// Get voting result for multi-option events
export const getVotingResult = (votes) => {
  const completedVotes = votes.filter((v) => v !== null);

  if (completedVotes.length === 3) {
    const voteCounts = {};
    votes.forEach((vote) => {
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

// Get participation result (for yes/no events)
export const getParticipationResult = (votes) => {
  const completedVotes = votes.filter((v) => v !== null);

  if (completedVotes.length === 3) {
    const participants = votes.filter((v) => v === true).length;
    return participants > 0 ? 'success' : 'failed';
  }
  return null;
};
