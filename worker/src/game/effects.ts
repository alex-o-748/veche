/**
 * Active effects management for server-side game logic
 * Effects can modify strength, income, and other game properties
 */

import { GameState, ActiveEffect } from './state';

// Effect types:
// - strength_bonus: Adds to faction strength
// - strength_penalty: Subtracts from faction strength
// - income_penalty: Multiplier on income (negative value, e.g., -0.5 for -50%)

/**
 * Create a new effect
 */
export function createEffect(
  type: string,
  target: string,
  value: number,
  turnsRemaining: number,
  description: string
): ActiveEffect {
  return {
    type,
    target, // 'all' or specific faction name
    value,
    turnsRemaining,
    description,
  };
}

/**
 * Add an effect to the game state
 */
export function addEffect(state: GameState, effect: ActiveEffect): GameState {
  return {
    ...state,
    activeEffects: [...state.activeEffects, effect],
  };
}

/**
 * Add multiple effects to the game state
 */
export function addEffects(state: GameState, effects: ActiveEffect[]): GameState {
  return {
    ...state,
    activeEffects: [...state.activeEffects, ...effects],
  };
}

/**
 * Calculate strength modifier from active effects for a faction
 */
export function getStrengthModifier(activeEffects: ActiveEffect[], faction: string): number {
  return activeEffects.reduce((total, effect) => {
    if (effect.type === 'strength_bonus' || effect.type === 'strength_penalty') {
      if (effect.target === 'all' || effect.target === faction) {
        return total + effect.value;
      }
    }
    return total;
  }, 0);
}

/**
 * Check if faction has any active penalty effects
 */
export function hasPenaltyEffects(activeEffects: ActiveEffect[], faction: string): boolean {
  return activeEffects.some(
    (effect) =>
      (effect.type === 'strength_penalty' || effect.type === 'income_penalty') &&
      (effect.target === 'all' || effect.target === faction)
  );
}

/**
 * Get all effects targeting a specific faction
 */
export function getEffectsForFaction(activeEffects: ActiveEffect[], faction: string): ActiveEffect[] {
  return activeEffects.filter((effect) => effect.target === 'all' || effect.target === faction);
}

/**
 * Common effect factories
 */
export function createStrengthBonus(
  target: string,
  value: number,
  turns: number,
  description: string
): ActiveEffect {
  return createEffect('strength_bonus', target, value, turns, description);
}

export function createStrengthPenalty(
  target: string,
  value: number,
  turns: number,
  description: string
): ActiveEffect {
  return createEffect('strength_penalty', target, Math.abs(value) * -1, turns, description);
}

export function createIncomePenalty(
  target: string,
  percentReduction: number,
  turns: number,
  description: string
): ActiveEffect {
  return createEffect('income_penalty', target, -percentReduction, turns, description);
}
