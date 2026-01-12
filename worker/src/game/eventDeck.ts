/**
 * Event deck for server-side event drawing
 * Contains minimal event data needed for random selection
 * Client has full event data with effects, options, etc.
 */

import { GameEvent } from './state';

export const eventDeck: GameEvent[] = [
  { id: 'merchants_robbed', name: 'Merchants Robbed', type: 'voting', description: 'Foreign merchants have been robbed near your borders.' },
  { id: 'order_attack_95', name: 'Order Attack (95)', type: 'order_attack', description: 'The Teutonic Order attacks with strength 95.' },
  { id: 'order_attack_110', name: 'Order Attack (110)', type: 'order_attack', description: 'The Teutonic Order attacks with strength 110.' },
  { id: 'boyars_take_bribes', name: 'Nobles Take Bribes', type: 'voting', description: 'Noble corruption has been discovered.' },
  { id: 'embassy', name: 'Foreign Embassy', type: 'voting', description: 'A foreign power offers to establish an embassy.' },
  { id: 'relics_found', name: 'Holy Relics Found', type: 'voting', description: 'Ancient holy relics have been discovered.' },
  { id: 'izhorian_delegation', name: 'Izhorian Delegation', type: 'voting', description: 'Izhorian merchants request safe passage.' },
  { id: 'good_harvest', name: 'Good Harvest', type: 'immediate', description: 'The harvest is bountiful this year.' },
  { id: 'drought', name: 'Drought', type: 'voting', description: 'A severe drought threatens the food supply.' },
  { id: 'fire', name: 'Fire', type: 'immediate', description: 'A fire breaks out in the merchant quarter.' },
  { id: 'city_fire', name: 'City Fire', type: 'immediate', description: 'A massive fire engulfs parts of the city.' },
  { id: 'heresy', name: 'Heresy', type: 'immediate', description: 'Heretical teachings spread through the city.' },
  { id: 'order_attack_90', name: 'Order Attack (90)', type: 'order_attack', description: 'The Teutonic Order attacks with strength 90.' },
  { id: 'order_attack_100', name: 'Order Attack (100)', type: 'order_attack', description: 'The Teutonic Order attacks with strength 100.' },
  { id: 'order_attack_105', name: 'Order Attack (105)', type: 'order_attack', description: 'The Teutonic Order attacks with strength 105.' },
  { id: 'order_attack_110_2', name: 'Order Attack (110)', type: 'order_attack', description: 'The Teutonic Order attacks with strength 110.' },
  { id: 'plague', name: 'Plague', type: 'voting', description: 'Plague threatens the city.' },
];

/**
 * Draw a random event from the deck
 * @param debugMode - If true, use sequential event selection
 * @param debugIndex - Current debug index for sequential selection
 * @returns The selected event and updated debug index
 */
export function drawEvent(debugMode: boolean = false, debugIndex: number = 0): { event: GameEvent; nextDebugIndex: number } {
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
