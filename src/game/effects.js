// Active effects management

// Effect types:
// - strength_bonus: Adds to faction strength
// - strength_penalty: Subtracts from faction strength
// - income_penalty: Multiplier on income (negative value, e.g., -0.5 for -50%)

// Create a new effect
export const createEffect = (type, target, value, turnsRemaining, description) => ({
  id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  type,
  target, // 'all' or specific faction name
  value,
  turnsRemaining,
  description,
});

// Add an effect to the game state
export const addEffect = (state, effect) => ({
  ...state,
  activeEffects: [...state.activeEffects, effect],
});

// Add multiple effects to the game state
export const addEffects = (state, effects) => ({
  ...state,
  activeEffects: [...state.activeEffects, ...effects],
});

// Update effects at end of turn (decrement counters, remove expired)
export const updateEffects = (state) => ({
  ...state,
  activeEffects: state.activeEffects
    .map((effect) => ({
      ...effect,
      turnsRemaining: effect.turnsRemaining - 1,
    }))
    .filter((effect) => effect.turnsRemaining > 0),
});

// Calculate strength modifier from active effects for a faction
export const getStrengthModifier = (activeEffects, faction) => {
  return activeEffects.reduce((total, effect) => {
    if (effect.type === 'strength_bonus' || effect.type === 'strength_penalty') {
      if (effect.target === 'all' || effect.target === faction) {
        return total + effect.value;
      }
    }
    return total;
  }, 0);
};

// Calculate income modifier from active effects for a faction
export const getIncomeModifier = (activeEffects, faction) => {
  let modifier = 1.0; // Start with 100%
  activeEffects.forEach((effect) => {
    if (effect.type === 'income_penalty') {
      if (effect.target === 'all' || effect.target === faction) {
        modifier *= 1 + effect.value; // value should be negative (e.g., -0.5 for -50%)
      }
    }
  });
  return modifier;
};

// Check if faction has any active penalty effects
export const hasPenaltyEffects = (activeEffects, faction) => {
  return activeEffects.some(
    (effect) =>
      (effect.type === 'strength_penalty' || effect.type === 'income_penalty') &&
      (effect.target === 'all' || effect.target === faction)
  );
};

// Get all effects targeting a specific faction
export const getEffectsForFaction = (activeEffects, faction) => {
  return activeEffects.filter(
    (effect) => effect.target === 'all' || effect.target === faction
  );
};

// Common effect factories
export const createStrengthBonus = (target, value, turns, description) =>
  createEffect('strength_bonus', target, value, turns, description);

export const createStrengthPenalty = (target, value, turns, description) =>
  createEffect('strength_penalty', target, Math.abs(value) * -1, turns, description);

export const createIncomePenalty = (target, percentReduction, turns, description) =>
  createEffect('income_penalty', target, -percentReduction, turns, description);
