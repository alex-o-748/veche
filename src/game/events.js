// Event deck and event resolution logic
//
// Effects return a new state with an outcome ({ key, params }) that the UI translates;
// no player-facing text is written here. Cards stored in the game state are plain
// data (see toEventCard): the effect functions are looked up by id when resolving,
// so state survives JSON (saves, the network, Durable Object storage).

import { createEffect } from './effects.js';
import { getOrderAttackTargets } from './regions.js';
import { executeBattle, surrenderRegion, destroyRandomBuildings, getOrderTurnBonus } from './combat.js';
import {
  formatRegionName,
  BUILDING_NAMES,
  DEFENSE_COST_PER_PLAYER,
  GLORY_PER_COIN,
  getRules,
} from './state.js';
import { random, randomInt } from './random.js';
import { createOutcome, setOutcome } from './outcome.js';

// Shorthand: return the state with an outcome
const done = (state, key, params = {}, english = null) =>
  setOutcome(state, createOutcome(key, params), english);

// Add effects to the state
const withEffects = (state, ...effects) => ({
  ...state,
  activeEffects: [...state.activeEffects, ...effects],
});

// Players who voted for `optionId` split `total`. Returns the new players array,
// or null if nobody voted for it or someone cannot afford their share.
const payShared = (state, votes, optionId, total) => {
  const payers = votes.map((v, i) => (v === optionId ? i : -1)).filter((i) => i >= 0);
  if (payers.length === 0) return null;
  const share = total / payers.length;
  if (payers.some((i) => state.players[i].money < share)) return null;
  return state.players.map((player, index) =>
    payers.includes(index) ? { ...player, money: player.money - share } : player
  );
};

// Event type handlers
export const eventTypes = {
  immediate: {
    resolve: (event, state) => event.effect(state),
  },

  participation: {
    resolve: (event, state, votes) => {
      const newPlayers = payShared(state, votes, true, event.totalCost);
      return newPlayers ? { ...state, players: newPlayers } : state;
    },
  },

  order_attack: {
    resolve: (event, state, votes, randomValues = {}) => {
      const rules = getRules(state);
      const targets = getOrderAttackTargets(state.regions, rules);

      if (targets.length === 0) {
        return done(state, 'battle.noValidTarget', {}, 'The Teutonic Order could not find a valid target to attack.');
      }

      // One target at random from the regions the Order can reach
      const randomIndex =
        randomValues.targetIndex !== undefined ? randomValues.targetIndex : randomInt(targets.length);
      const targetRegion = targets[randomIndex % targets.length];

      // Everyone who voted to defend and can pay their coin defends
      const cost = event.minCostPerPlayer || DEFENSE_COST_PER_PLAYER;
      const defendingPlayers = getDefenders(state, votes, cost);

      if (defendingPlayers.length === 0) {
        return surrenderRegion(state, targetRegion);
      }

      const stateWithPayment = {
        ...state,
        players: state.players.map((player, index) =>
          defendingPlayers.includes(index) ? { ...player, money: player.money - cost } : player
        ),
      };

      const scaledOrderStrength = event.orderStrength + getOrderTurnBonus(state.turn);

      return executeBattle(stateWithPayment, scaledOrderStrength, targetRegion, defendingPlayers, randomValues.battleRoll, {
        gloryPerPlayer: rules.glory ? cost * GLORY_PER_COIN : 0,
      });
    },
  },

  auction: {
    resolve: (event, state, votes) => {
      const auction = getAuctionResult(votes.map((v) => (v === null ? '0' : v)));

      if (!auction || auction.result === 'no_bids') {
        return done(state, 'auction.noBids', {}, 'No one placed a worthy bid. The furs remain unsold.');
      }

      // All top bidders pay their bid and split the bonus point
      const winners = auction.result === 'winner' ? [auction.winnerIndex] : auction.tiedIndices;
      const pointShare = 1 / winners.length;
      const newPlayers = state.players.map((player, index) =>
        winners.includes(index)
          ? { ...player, money: player.money - auction.amount, bonusPoints: (player.bonusPoints || 0) + pointShare }
          : player
      );
      const next = { ...state, players: newPlayers };

      if (winners.length === 1) {
        const faction = state.players[winners[0]].faction;
        return done(next, 'auction.winner', { faction, amount: auction.amount },
          `${faction} wins the auction with a bid of ${auction.amount}○! (+1 Victory Point)`);
      }

      const factions = winners.map((i) => state.players[i].faction);
      const points = winners.length === 2 ? '½' : `1/${winners.length}`;
      return done(next, 'auction.tie', { factions, amount: auction.amount, points },
        `${factions.join(' & ')} tied at ${auction.amount}○! (+${points} Victory Point each)`);
    },
  },

  voting: {
    resolve: (event, state, votes) => {
      let winningOption = getVotingResult(votes, event.defaultOption || 'send_back');

      // "Accept" is only chosen if its voters can pay for it
      if (winningOption === 'accept' && event.acceptCost && !payShared(state, votes, 'accept', event.acceptCost)) {
        winningOption = event.defaultOption || 'send_back';
      }

      // A card without a default whose vote is split falls back to its last option
      const effect = event.effects[winningOption] || event.effects[event.options[event.options.length - 1].id];
      return effect(state, votes);
    },
  },
};

// Players who voted to defend and can afford their coin
export const getDefenders = (state, votes, cost = DEFENSE_COST_PER_PLAYER) =>
  votes
    .map((v, i) => (v === true && state.players[i].money >= cost ? i : -1))
    .filter((i) => i >= 0);

// Look up a card's live definition (with its effect functions) by id
const findCard = (id) => eventDeck.find((e) => e.id === id);

// Order attack triggered by robbing the Order's merchants
const orderRetaliation = {
  id: 'order_attack_rob_foreign',
  name: 'Order Attack',
  description: 'The Teutonic Order retaliates for the robbed merchants! They launch an attack.',
  type: 'order_attack',
  orderStrength: 100,
  question: 'Who will help fund the defense? Each faction that funds the defense pays 1○.',
  minCostPerPlayer: 1,
};

const orderAttack = (id, orderStrength, name, description) => ({
  id,
  name,
  description,
  type: 'order_attack',
  orderStrength,
  question: 'Who will help fund the defense? Each faction that funds the defense pays 1○.',
  minCostPerPlayer: 1,
});

const WEAK = ['Order Attack (Weak)', 'The Teutonic Order launches a weak attack. Who will contribute to the defense?'];
const NORMAL = ['Order Attack', 'The Teutonic Order launches an attack. Who will contribute to the defense?'];
const STRONG = ['Order Attack (Strong)', 'The Teutonic Order launches a strong attack. Who will contribute to the defense?'];

// Fire in one region: one random building burns
const burnOneBuilding = (state, regionName) => destroyRandomBuildings(state, regionName, 1);

// Event deck with all events
export const eventDeck = [
  {
    id: 'merchants_robbed',
    name: 'Merchants Robbed',
    description: 'Our merchants have been robbed in the Order lands. How will you respond?',
    type: 'voting',
    defaultOption: 'trade_risk',
    options: [
      { id: 'rob_foreign', name: 'Rob foreign merchants', effectText: '50% chance: Order attacks' },
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
        const roll = randomInt(6) + 1;
        if (roll <= 3) {
          return done(
            { ...state, currentEvent: orderRetaliation, eventResolved: false, eventVotes: [null, null, null] },
            'battle.orderAttacksImmediately',
            { roll },
            `Rolled ${roll}! The Order attacks immediately!`
          );
        }
        return done(state, 'battle.robberyUnnoticed', { roll }, `Rolled ${roll}. The robbery went unnoticed.`);
      },
      demand_compensation: (state) => {
        const next = {
          ...state,
          players: state.players.map((player) =>
            player.faction === 'Merchants' ? { ...player, money: Math.max(0, player.money - 1) } : player
          ),
        };
        if (random() < 0.5) {
          return done(
            withEffects(next, createEffect('strength_penalty', 'Merchants', -10, 3, 'Merchant trading weakness')),
            'battle.compensationFailed'
          );
        }
        return done(next, 'battle.compensationReceived');
      },
      trade_risk: (state) =>
        done(
          withEffects(state, createEffect('strength_penalty', 'Merchants', -10, 3, 'Trade route disruption')),
          'battle.tradeDisrupted'
        ),
    },
  },
  orderAttack('order_attack_95', 95, ...WEAK),
  orderAttack('order_attack_110', 110, ...STRONG),
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
      { id: 'ignore', name: 'This is the way it is', effectText: '50% chance: Uprising (buildings destroyed)' },
    ],
    effects: {
      investigate: (state) =>
        done(
          withEffects(
            {
              ...state,
              players: state.players.map((player) =>
                player.faction === 'Nobles' ? { ...player, money: Math.max(0, player.money - 2) } : player
              ),
            },
            createEffect('strength_penalty', 'Nobles', -15, 3, 'Noble corruption investigation penalty')
          ),
          'battle.noblesPunished'
        ),
      ignore: (state) => {
        if (random() < 0.5) {
          const { state: burned, destroyedTypes } = destroyRandomBuildings(state, 'pskov', 2);
          return done(
            withEffects(burned, createEffect('strength_penalty', 'all', -7, 2, 'Uprising strength penalty')),
            'battle.uprising',
            { buildings: destroyedTypes },
            `UPRISING! Buildings destroyed: ${destroyedTypes.map((b) => BUILDING_NAMES[b]).join(', ') || 'None'}`
          );
        }
        return done(state, 'battle.corruptionIgnored');
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
      { id: 'modest', name: 'Receive modestly', requiresMinMoney: 1, costText: '3○ split', effectText: 'Relations maintained' },
      { id: 'luxurious', name: 'Receive luxuriously', requiresMinMoney: 2, costText: '6○ split', effectText: 'All: +3 str/3 turns' },
      { id: 'refuse', name: 'Refuse to receive them', effectText: 'All: -15 str, -50% income/5 turns' },
    ],
    effects: {
      modest: (state, votes) => {
        const newPlayers = payShared(state, votes, 'modest', 3);
        if (!newPlayers) return findCard('embassy').effects.refuse(state);
        return done({ ...state, players: newPlayers }, 'battle.embassyModest');
      },
      luxurious: (state, votes) => {
        const newPlayers = payShared(state, votes, 'luxurious', 6);
        if (!newPlayers) {
          // Fall back to a modest reception, paid by everyone
          return findCard('embassy').effects.modest(state, votes.map(() => 'modest'));
        }
        return done(
          withEffects({ ...state, players: newPlayers }, createEffect('strength_bonus', 'all', 3, 3, 'Embassy reception boost')),
          'battle.embassyLuxurious'
        );
      },
      refuse: (state) =>
        done(
          withEffects(
            state,
            createEffect('strength_penalty', 'all', -15, 5, 'Embassy refusal strength penalty'),
            createEffect('income_penalty', 'all', -0.5, 5, 'Embassy refusal income penalty')
          ),
          'battle.embassyRefused'
        ),
    },
  },
  {
    id: 'relics_found',
    name: 'Relics Found',
    description: 'Holy relics have been discovered. Are they genuine or deception?',
    type: 'voting',
    options: [
      { id: 'build_temple', name: 'Build a church', requiresMinMoney: 1, costText: 'All: -3○', effectText: 'All: +5 str/3 turns' },
      { id: 'deception', name: "It's all deception", effectText: 'All: -5 str/3 turns' },
    ],
    effects: {
      build_temple: (state) =>
        done(
          withEffects(
            { ...state, players: state.players.map((player) => ({ ...player, money: Math.max(0, player.money - 3) })) },
            createEffect('strength_bonus', 'all', 5, 3, 'Holy relics morale boost')
          ),
          'battle.relicsChurchBuilt'
        ),
      deception: (state) =>
        done(
          withEffects(state, createEffect('strength_penalty', 'all', -5, 3, 'Religious cynicism penalty')),
          'battle.relicsDeception'
        ),
    },
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
      { id: 'send_back', name: 'Send them away', effectText: 'No effect' },
    ],
    effects: {
      accept: (state, votes) => {
        const newPlayers = payShared(state, votes, 'accept', 6);
        if (!newPlayers) return findCard('izhorian_delegation').effects.send_back(state);
        return done(
          withEffects({ ...state, players: newPlayers }, createEffect('strength_bonus', 'all', 5, 6, 'Izhora allied forces')),
          'battle.izhorianAccepted'
        );
      },
      rob: (state) =>
        done(
          withEffects(
            { ...state, players: state.players.map((player) => ({ ...player, money: player.money + 3 })) },
            createEffect('strength_penalty', 'all', -5, 6, 'Izhora hostility')
          ),
          'battle.izhorianRobbed'
        ),
      send_back: (state) => done(state, 'battle.izhorianSentBack'),
    },
  },
  {
    id: 'good_harvest',
    name: 'Good Harvest',
    description: 'The fields have produced an abundant harvest. All players receive +1○.',
    type: 'immediate',
    effect: (state) =>
      done(
        { ...state, players: state.players.map((player) => ({ ...player, money: player.money + 1 })) },
        'battle.goodHarvest'
      ),
  },
  {
    id: 'drought',
    name: 'Drought',
    description: 'The crops are failing due to lack of rain. How will you respond?',
    type: 'voting',
    defaultOption: 'no_food',
    options: [
      { id: 'buy_food', name: 'Buy emergency food supplies', requiresMinMoney: 2, costText: '6○ split', effectText: 'Famine avoided' },
      { id: 'no_food', name: 'Let the people endure', effectText: 'Commoners: -12 str/3 turns' },
    ],
    effects: {
      buy_food: (state, votes) => {
        const newPlayers = payShared(state, votes, 'buy_food', 6);
        if (!newPlayers) return findCard('drought').effects.no_food(state);
        return done({ ...state, players: newPlayers }, 'battle.droughtFoodPurchased');
      },
      no_food: (state) =>
        done(
          withEffects(state, createEffect('strength_penalty', 'Commoners', -12, 3, 'Famine weakens commoners')),
          'battle.droughtFamine'
        ),
    },
  },
  {
    id: 'fire',
    name: 'Fire',
    description: 'A fire breaks out in one of your regions, destroying a building.',
    type: 'immediate',
    effect: (state) => {
      const republicRegions = Object.keys(state.regions).filter((name) => state.regions[name].controller === 'republic');
      if (republicRegions.length === 0) return state;

      const region = republicRegions[randomInt(republicRegions.length)];
      const { state: burned, destroyedTypes } = burnOneBuilding(state, region);

      if (destroyedTypes.length === 0) {
        return done(state, 'battle.fireNoBuildings', { region },
          `Fire breaks out in ${formatRegionName(region)}, but there are no buildings to burn.`);
      }
      return done(burned, 'battle.fireDestroysBuilding', { building: destroyedTypes[0], region },
        `Fire destroys ${BUILDING_NAMES[destroyedTypes[0]]} in ${formatRegionName(region)}!`);
    },
  },
  {
    id: 'city_fire',
    name: 'City Fire',
    description: 'A fire breaks out in Pskov, destroying a building in the city.',
    type: 'immediate',
    effect: (state) => {
      const { state: burned, destroyedTypes } = burnOneBuilding(state, 'pskov');
      if (destroyedTypes.length === 0) {
        return done(state, 'battle.cityFireNoBuildings');
      }
      return done(burned, 'battle.cityFireDestroysBuilding', { building: destroyedTypes[0] },
        `City fire destroys ${BUILDING_NAMES[destroyedTypes[0]]} in Pskov!`);
    },
  },
  {
    id: 'heresy',
    name: 'Heresy',
    description: 'Heretical ideas spread among the people, weakening military resolve.',
    type: 'immediate',
    effect: (state) =>
      done(withEffects(state, createEffect('strength_penalty', 'all', -10, 2, 'Heretical discord')), 'battle.heresy'),
  },
  orderAttack('order_attack_90', 90, ...WEAK),
  orderAttack('order_attack_100', 100, ...NORMAL),
  orderAttack('order_attack_105', 105, ...STRONG),
  orderAttack('order_attack_110_2', 110, ...STRONG),
  {
    id: 'fur_auction',
    name: 'Grand Fur Auction',
    description:
      'Hunters have returned from the northern forests with a magnificent haul of furs — sable, marten, and fox pelts of the finest quality. A grand auction is held in the Pskov marketplace. The highest bidder wins the furs and gains lasting prestige!',
    type: 'auction',
    minBid: 1,
  },
  {
    id: 'plague',
    name: 'Plague',
    description: 'A plague spreads through the city. How will you respond?',
    type: 'voting',
    defaultOption: 'no_isolation',
    options: [
      { id: 'fund_isolation', name: 'Fund isolation and treatment', requiresMinMoney: 1, costText: '3○ split', effectText: 'All: -5 str/2 turns' },
      { id: 'no_isolation', name: 'Trust in God - no isolation', effectText: 'All: -25 str/2 turns' },
    ],
    effects: {
      fund_isolation: (state, votes) => {
        const newPlayers = payShared(state, votes, 'fund_isolation', 3);
        if (!newPlayers) return findCard('plague').effects.no_isolation(state);
        return done(
          withEffects({ ...state, players: newPlayers }, createEffect('strength_penalty', 'all', -5, 2, 'Mild plague effects despite isolation')),
          'battle.plagueContained'
        );
      },
      no_isolation: (state) =>
        done(
          withEffects(state, createEffect('strength_penalty', 'all', -25, 2, 'Severe plague weakens population')),
          'battle.plagueSpread'
        ),
    },
  },
  {
    id: 'giant_squirrels',
    name: 'Giant Squirrels',
    description:
      'Hunters have returned from the forest with incredible news — they befriended giant squirrels! What shall the veche decide?',
    type: 'voting',
    defaultOption: 'befriend',
    options: [
      { id: 'skin_them', name: 'Skin them for furs', effectText: '+25% income, Commoners: -12 str/3 turns' },
      { id: 'befriend', name: 'Very well, let them stay!', effectText: '-25% income, All: +5 str/3 turns' },
    ],
    effects: {
      skin_them: (state) =>
        done(
          withEffects(
            state,
            createEffect('income_penalty', 'all', 0.25, 3, 'Squirrel fur trade boost'),
            createEffect('strength_penalty', 'Commoners', -12, 3, 'Commoners outraged by squirrel slaughter')
          ),
          'battle.squirrelsSkinned'
        ),
      befriend: (state) =>
        done(
          withEffects(
            state,
            createEffect('income_penalty', 'all', -0.25, 3, 'Less fur trade due to squirrel friendship'),
            createEffect('strength_bonus', 'all', 5, 3, 'Giant squirrels help find paths and bring nuts')
          ),
          'battle.squirrelsBefriended'
        ),
    },
  },
];

// A card as stored in the game state: its data without the effect functions
export const toEventCard = (event) => {
  if (!event) return null;
  const { effect, effects, ...card } = event;
  return card;
};

// Fisher-Yates shuffle: returns a shuffled array of indices [0..deckLength-1]
export const shuffleEventDeck = () => {
  const indices = Array.from({ length: eventDeck.length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
};

// Draw an event using shuffle-without-replacement
// Returns { event, shuffledEventOrder, eventDrawIndex }; event is a plain card (no functions)
export const drawEvent = (shuffledEventOrder = [], eventDrawIndex = 0) => {
  let order = shuffledEventOrder;
  let index = eventDrawIndex;
  if (order.length === 0 || index >= order.length) {
    order = shuffleEventDeck();
    index = 0;
  }
  return {
    event: toEventCard(eventDeck[order[index]]),
    shuffledEventOrder: order,
    eventDrawIndex: index + 1,
  };
};

// Resolve an event. The card may be a stored copy: its live definition is found by id.
export const resolveEvent = (event, state, votes, randomValues = {}) => {
  const card = findCard(event.id) || event;
  const eventType = eventTypes[card.type];

  if (!eventType) {
    console.error('Unknown event type:', card.type);
    return state;
  }

  const resolved = eventType.resolve(card, state, votes, randomValues);
  // A card that triggered a follow-up event (the Order's retaliation) leaves it in play
  const followUp = resolved.currentEvent && resolved.currentEvent.id !== event.id;
  return followUp ? { ...resolved, currentEvent: toEventCard(resolved.currentEvent) } : resolved;
};

// Winning option of a vote: the option with at least 2 of 3 votes, else the fallback
export const getVotingResult = (votes, fallback = 'send_back') => {
  if (votes.some((v) => v === null)) return null;

  const voteCounts = {};
  votes.forEach((vote) => {
    if (vote) voteCounts[vote] = (voteCounts[vote] || 0) + 1;
  });

  const winner = Object.entries(voteCounts).find(([, count]) => count >= 2);
  return winner ? winner[0] : fallback;
};

// Get auction result (for bid events)
export const getAuctionResult = (votes) => {
  if (votes.some((v) => v === null)) return null;

  const bids = votes.map((v, i) => ({ playerIndex: i, bid: parseFloat(v) || 0 }));
  const maxBid = Math.max(...bids.map((b) => b.bid));

  if (maxBid < 1) {
    return { result: 'no_bids' };
  }

  const topBidders = bids.filter((b) => b.bid === maxBid);
  if (topBidders.length > 1) {
    return { result: 'tie', amount: maxBid, tiedIndices: topBidders.map((b) => b.playerIndex) };
  }

  return { result: 'winner', winnerIndex: topBidders[0].playerIndex, amount: maxBid };
};

// Get participation result (for yes/no events)
export const getParticipationResult = (votes) => {
  if (votes.some((v) => v === null)) return null;
  return votes.some((v) => v === true) ? 'success' : 'failed';
};
