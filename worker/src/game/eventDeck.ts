/**
 * Complete event deck for server
 * Contains ALL event metadata (options, descriptions, etc.)
 * Does NOT contain effects functions (those stay on client for now)
 */

import { GameEvent } from './state';

// Extended event interface with full metadata
export interface FullGameEvent extends GameEvent {
  defaultOption?: string;
  options?: Array<{
    id: string;
    name: string;
    costText?: string;
    effectText?: string;
    requiresMinMoney?: number;
  }>;
  orderStrength?: number;
  question?: string;
  minCostPerPlayer?: number;
  totalCost?: number;
  acceptCost?: number;
}

export const eventDeck: FullGameEvent[] = [
  {
    id: 'merchants_robbed',
    name: 'Merchants Robbed',
    type: 'voting',
    description: 'Foreign merchants have been robbed near your borders. How will you respond?',
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
      {
        id: 'trade_risk',
        name: 'Trade is risk',
        effectText: 'Merchants: -10 str/3 turns',
      },
    ],
  },
  {
    id: 'order_attack_95',
    name: 'Order Attack (95)',
    type: 'order_attack',
    description: 'The Teutonic Order attacks with strength 95. Who will contribute to the defense?',
    orderStrength: 95,
    question: 'Who will help fund the defense? Cost will be split evenly among participants.',
    minCostPerPlayer: 1,
  },
  {
    id: 'order_attack_110',
    name: 'Order Attack (110)',
    type: 'order_attack',
    description: 'The Teutonic Order attacks with strength 110. Who will contribute to the defense?',
    orderStrength: 110,
    question: 'Who will help fund the defense? Cost will be split evenly among participants.',
    minCostPerPlayer: 1,
  },
  {
    id: 'boyars_take_bribes',
    name: 'Nobles Take Bribes',
    type: 'voting',
    description: 'Noble corruption has been discovered. How will you handle this?',
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
  },
  {
    id: 'embassy',
    name: 'Foreign Embassy',
    type: 'voting',
    description: 'A foreign power offers to establish an embassy in Pskov. What will you do?',
    defaultOption: 'refuse',
    acceptCost: 2,
    options: [
      {
        id: 'modest',
        name: 'Build modest embassy',
        costText: 'Split 2○',
        effectText: 'All: +1○/turn for 5 turns',
      },
      {
        id: 'luxurious',
        name: 'Build luxurious embassy',
        costText: 'Split 2○',
        effectText: 'All: +2○/turn for 5 turns',
      },
      {
        id: 'refuse',
        name: 'Refuse the embassy',
        effectText: 'No effect',
      },
    ],
  },
  {
    id: 'relics_found',
    name: 'Holy Relics Found',
    type: 'voting',
    description: 'Ancient holy relics have been discovered near the city. How will you respond?',
    defaultOption: 'deception',
    options: [
      {
        id: 'build_temple',
        name: 'Build a temple',
        costText: 'All: -2○',
        effectText: 'All: +10 str/5 turns',
      },
      {
        id: 'deception',
        name: "It's all deception",
        effectText: 'All: -5 str/3 turns',
      },
    ],
  },
  {
    id: 'izhorian_delegation',
    name: 'Izhorian Delegation',
    type: 'voting',
    description: 'Izhorian merchants request safe passage through your lands. What will you do?',
    defaultOption: 'send_back',
    options: [
      {
        id: 'accept',
        name: 'Accept delegation',
        effectText: 'All: +3○, then -5 str/3 turns',
      },
      {
        id: 'rob',
        name: 'Rob them',
        effectText: 'All: +3○, then -5 str/6 turns',
      },
      {
        id: 'send_back',
        name: 'Send them away',
        effectText: 'No effect',
      },
    ],
  },
  {
    id: 'good_harvest',
    name: 'Good Harvest',
    type: 'immediate',
    description: 'The harvest is bountiful this year! Everyone benefits.',
  },
  {
    id: 'drought',
    name: 'Drought',
    type: 'voting',
    description: 'A severe drought threatens the food supply. Will you buy food from abroad?',
    defaultOption: 'no_food',
    options: [
      {
        id: 'buy_food',
        name: 'Buy food',
        costText: 'All: -1○',
        effectText: 'No penalties',
      },
      {
        id: 'no_food',
        name: 'Do not buy food',
        effectText: 'All: -10 str/3 turns',
      },
    ],
  },
  {
    id: 'fire',
    name: 'Fire',
    type: 'immediate',
    description: 'A fire breaks out in the merchant quarter, destroying buildings.',
  },
  {
    id: 'city_fire',
    name: 'City Fire',
    type: 'immediate',
    description: 'A massive fire engulfs parts of the city, causing extensive damage.',
  },
  {
    id: 'heresy',
    name: 'Heresy',
    type: 'immediate',
    description: 'Heretical teachings spread through the city, weakening social cohesion.',
  },
  {
    id: 'order_attack_90',
    name: 'Order Attack (90)',
    type: 'order_attack',
    description: 'The Teutonic Order attacks with strength 90. Who will contribute to the defense?',
    orderStrength: 90,
    question: 'Who will help fund the defense? Cost will be split evenly among participants.',
    minCostPerPlayer: 1,
  },
  {
    id: 'order_attack_100',
    name: 'Order Attack (100)',
    type: 'order_attack',
    description: 'The Teutonic Order attacks with strength 100. Who will contribute to the defense?',
    orderStrength: 100,
    question: 'Who will help fund the defense? Cost will be split evenly among participants.',
    minCostPerPlayer: 1,
  },
  {
    id: 'order_attack_105',
    name: 'Order Attack (105)',
    type: 'order_attack',
    description: 'The Teutonic Order attacks with strength 105. Who will contribute to the defense?',
    orderStrength: 105,
    question: 'Who will help fund the defense? Cost will be split evenly among participants.',
    minCostPerPlayer: 1,
  },
  {
    id: 'order_attack_110_2',
    name: 'Order Attack (110)',
    type: 'order_attack',
    description: 'The Teutonic Order attacks with strength 110. Who will contribute to the defense?',
    orderStrength: 110,
    question: 'Who will help fund the defense? Cost will be split evenly among participants.',
    minCostPerPlayer: 1,
  },
  {
    id: 'plague',
    name: 'Plague',
    type: 'voting',
    description: 'Plague threatens the city. Will you fund isolation measures?',
    defaultOption: 'no_isolation',
    options: [
      {
        id: 'fund_isolation',
        name: 'Fund isolation',
        costText: 'All: -2○',
        effectText: 'All: -10 str/2 turns',
      },
      {
        id: 'no_isolation',
        name: 'No isolation',
        effectText: 'All: -25 str/2 turns',
      },
    ],
  },
];

/**
 * Draw a random event from the deck
 * @param debugMode - If true, use sequential event selection
 * @param debugIndex - Current debug index for sequential selection
 * @returns The selected event and updated debug index
 */
export function drawEvent(
  debugMode: boolean = false,
  debugIndex: number = 0
): { event: FullGameEvent; nextDebugIndex: number } {
  if (debugMode) {
    const index = debugIndex % eventDeck.length;
    return {
      event: eventDeck[index],
      nextDebugIndex: (debugIndex + 1) % eventDeck.length,
    };
  } else {
    const randomIndex = Math.floor(Math.random() * eventDeck.length);
    return {
      event: eventDeck[randomIndex],
      nextDebugIndex: debugIndex, // Don't change in random mode
    };
  }
}
