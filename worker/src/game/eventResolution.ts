/**
 * Event resolution logic for server-side game logic
 * Handles applying event effects to game state
 */

import { GameState } from './state';
import { FullGameEvent } from './eventDeck';
import { createEffect, addEffects } from './effects';
import { getValidOrderAttackTargets } from './regions';
import { executeBattle, surrenderRegion, destroyRandomBuildings } from './combat';

interface RandomValues {
  battleRoll?: number;
  eventRoll?: number;
  targetIndex?: number;
}

/**
 * Resolve an immediate event (no voting required)
 */
export function resolveImmediateEvent(
  event: FullGameEvent,
  state: GameState
): GameState {
  // Immediate events have predefined effects based on event ID
  switch (event.id) {
    case 'good_harvest':
      // All players gain money
      return {
        ...state,
        players: state.players.map(p => ({ ...p, money: p.money + 2 })),
        lastEventResult: 'Good harvest! All factions gain 2○.',
      };

    case 'fire':
      // Destroy 1 random building in Pskov
      const fireResult = destroyRandomBuildings(state, 'pskov', 1);
      return {
        ...fireResult.state,
        lastEventResult: `Fire in the merchant quarter! Building destroyed: ${fireResult.destroyedBuildings.join(', ') || 'None'}`,
      };

    case 'city_fire':
      // Destroy 2 random buildings in Pskov
      const cityFireResult = destroyRandomBuildings(state, 'pskov', 2);
      return {
        ...cityFireResult.state,
        lastEventResult: `City fire! Buildings destroyed: ${cityFireResult.destroyedBuildings.join(', ') || 'None'}`,
      };

    case 'heresy':
      // All factions get strength penalty
      const heresyEffect = createEffect('strength_penalty', 'all', -5, 2, 'Heresy weakens unity');
      return {
        ...state,
        activeEffects: [...state.activeEffects, heresyEffect],
        lastEventResult: 'Heresy spreads! All factions lose 5 strength for 2 turns.',
      };

    default:
      return {
        ...state,
        lastEventResult: `${event.name} occurred.`,
      };
  }
}

/**
 * Resolve a voting event
 */
export function resolveVotingEvent(
  event: FullGameEvent,
  state: GameState,
  votes: (string | null)[]
): GameState {
  // Count votes
  const voteCounts: Record<string, number> = {};
  votes.forEach((vote) => {
    if (vote) {
      voteCounts[vote] = (voteCounts[vote] || 0) + 1;
    }
  });

  // Determine winner (need 2+ votes to win, otherwise default)
  let winningOption = event.defaultOption || 'refuse';
  let maxVotes = 0;
  Object.entries(voteCounts).forEach(([option, count]) => {
    if (count >= 2 && count > maxVotes) {
      maxVotes = count;
      winningOption = option;
    }
  });

  // Apply effects based on event and winning option
  return applyVotingEffects(event, state, votes, winningOption);
}

/**
 * Apply voting effects based on event ID and winning option
 */
function applyVotingEffects(
  event: FullGameEvent,
  state: GameState,
  votes: (string | null)[],
  winningOption: string
): GameState {
  switch (event.id) {
    case 'merchants_robbed':
      return resolveMerchantsRobbed(state, winningOption);

    case 'boyars_take_bribes':
      return resolveBoyarsTakeBribes(state, winningOption);

    case 'embassy':
      return resolveEmbassy(state, votes, winningOption);

    case 'relics_found':
      return resolveRelicsFound(state, winningOption);

    case 'izhorian_delegation':
      return resolveIzhorianDelegation(state, winningOption);

    case 'drought':
      return resolveDrought(state, winningOption);

    case 'plague':
      return resolvePlague(state, winningOption);

    default:
      return {
        ...state,
        lastEventResult: `Option chosen: ${winningOption}`,
      };
  }
}

// Individual voting event resolvers
function resolveMerchantsRobbed(state: GameState, option: string): GameState {
  switch (option) {
    case 'rob_foreign': {
      const roll = Math.floor(Math.random() * 6) + 1;
      if (roll <= 3) {
        // Trigger Order attack
        return {
          ...state,
          lastEventResult: `Rolled ${roll}! The Order retaliates! Prepare for attack!`,
        };
      } else {
        return {
          ...state,
          lastEventResult: `Rolled ${roll}. The robbery went unnoticed.`,
        };
      }
    }

    case 'demand_compensation': {
      const newPlayers = state.players.map((player) =>
        player.faction === 'Merchants' ? { ...player, money: Math.max(0, player.money - 1) } : player
      );
      const rollFailed = Math.random() < 0.5;
      if (rollFailed) {
        const effect = createEffect('strength_penalty', 'Merchants', -10, 3, 'Merchant trading weakness');
        return {
          ...state,
          players: newPlayers,
          activeEffects: [...state.activeEffects, effect],
          lastEventResult: 'Compensation demand failed! Merchants weakened for 3 turns.',
        };
      } else {
        return {
          ...state,
          players: newPlayers,
          lastEventResult: 'Compensation received successfully.',
        };
      }
    }

    case 'trade_risk': {
      const effect = createEffect('strength_penalty', 'Merchants', -10, 3, 'Trade route disruption');
      return {
        ...state,
        activeEffects: [...state.activeEffects, effect],
        lastEventResult: 'Trade routes disrupted! Merchants weakened for 3 turns.',
      };
    }

    default:
      return state;
  }
}

function resolveBoyarsTakeBribes(state: GameState, option: string): GameState {
  switch (option) {
    case 'investigate': {
      const newPlayers = state.players.map((player) =>
        player.faction === 'Nobles' ? { ...player, money: Math.max(0, player.money - 2) } : player
      );
      const effect = createEffect('strength_penalty', 'Nobles', -15, 3, 'Noble corruption investigation penalty');
      return {
        ...state,
        players: newPlayers,
        activeEffects: [...state.activeEffects, effect],
        lastEventResult: 'Nobles punished for corruption! -2○ and -15 strength for 3 turns.',
      };
    }

    case 'ignore': {
      const uprisingRoll = Math.random();
      if (uprisingRoll < 0.5) {
        const { state: newState, destroyedBuildings } = destroyRandomBuildings(state, 'pskov', 2);
        const effect = createEffect('strength_penalty', 'all', -7, 2, 'Uprising strength penalty');
        return {
          ...newState,
          activeEffects: [...newState.activeEffects, effect],
          lastEventResult: `UPRISING! Buildings destroyed: ${destroyedBuildings.join(', ') || 'None'}`,
        };
      } else {
        return {
          ...state,
          lastEventResult: 'Corruption ignored. The people grumble but no uprising occurs.',
        };
      }
    }

    default:
      return state;
  }
}

function resolveEmbassy(state: GameState, votes: (string | null)[], option: string): GameState {
  if (option === 'modest' || option === 'luxurious') {
    // Check if acceptors can afford
    const acceptVoters = votes.filter(v => v === option).length;
    if (acceptVoters === 0) {
      return { ...state, lastEventResult: 'Embassy refused.' };
    }

    const costPerVoter = 2 / acceptVoters;
    let allCanAfford = true;
    state.players.forEach((player, index) => {
      if (votes[index] === option && player.money < costPerVoter) {
        allCanAfford = false;
      }
    });

    if (!allCanAfford) {
      return { ...state, lastEventResult: 'Embassy refused - cannot afford.' };
    }

    // Deduct money
    const newPlayers = state.players.map((player, index) =>
      votes[index] === option ? { ...player, money: player.money - costPerVoter } : player
    );

    // Apply income bonus
    const bonus = option === 'luxurious' ? 2 : 1;
    const effect = createEffect('income_bonus', 'all', bonus, 5, `Embassy income bonus (+${bonus}○/turn)`);
    return {
      ...state,
      players: newPlayers,
      activeEffects: [...state.activeEffects, effect],
      lastEventResult: `Embassy built! All factions gain +${bonus}○/turn for 5 turns.`,
    };
  }

  return { ...state, lastEventResult: 'Embassy refused.' };
}

function resolveRelicsFound(state: GameState, option: string): GameState {
  switch (option) {
    case 'build_temple': {
      // All players pay 2○
      let allCanAfford = true;
      state.players.forEach(player => {
        if (player.money < 2) allCanAfford = false;
      });

      if (!allCanAfford) {
        const effect = createEffect('strength_penalty', 'all', -5, 3, 'Deception');
        return {
          ...state,
          activeEffects: [...state.activeEffects, effect],
          lastEventResult: 'Cannot afford temple! Deception weakens all for 3 turns.',
        };
      }

      const newPlayers = state.players.map(p => ({ ...p, money: p.money - 2 }));
      const effect = createEffect('strength_bonus', 'all', 10, 5, 'Holy relics blessing');
      return {
        ...state,
        players: newPlayers,
        activeEffects: [...state.activeEffects, effect],
        lastEventResult: 'Temple built! All factions gain +10 strength for 5 turns.',
      };
    }

    case 'deception': {
      const effect = createEffect('strength_penalty', 'all', -5, 3, 'Deception');
      return {
        ...state,
        activeEffects: [...state.activeEffects, effect],
        lastEventResult: "It's all deception! All factions lose 5 strength for 3 turns.",
      };
    }

    default:
      return state;
  }
}

function resolveIzhorianDelegation(state: GameState, option: string): GameState {
  switch (option) {
    case 'accept': {
      const newPlayers = state.players.map(p => ({ ...p, money: p.money + 3 }));
      const effect = createEffect('strength_penalty', 'all', -5, 3, 'Izhorian delegation risk');
      return {
        ...state,
        players: newPlayers,
        activeEffects: [...state.activeEffects, effect],
        lastEventResult: 'Izhorians accepted! All gain 3○, then -5 strength for 3 turns.',
      };
    }

    case 'rob': {
      const newPlayers = state.players.map(p => ({ ...p, money: p.money + 3 }));
      const effect = createEffect('strength_penalty', 'all', -5, 6, 'Robbing Izhorians - reputation damaged');
      return {
        ...state,
        players: newPlayers,
        activeEffects: [...state.activeEffects, effect],
        lastEventResult: 'Izhorians robbed! All gain 3○, then -5 strength for 6 turns.',
      };
    }

    case 'send_back':
      return { ...state, lastEventResult: 'Izhorians sent away. No effect.' };

    default:
      return state;
  }
}

function resolveDrought(state: GameState, option: string): GameState {
  switch (option) {
    case 'buy_food': {
      const newPlayers = state.players.map(p => ({ ...p, money: p.money - 1 }));
      return {
        ...state,
        players: newPlayers,
        lastEventResult: 'Food purchased! All lose 1○ but avoid drought penalties.',
      };
    }

    case 'no_food': {
      const effect = createEffect('strength_penalty', 'all', -10, 3, 'Drought');
      return {
        ...state,
        activeEffects: [...state.activeEffects, effect],
        lastEventResult: 'No food purchased! All factions lose 10 strength for 3 turns.',
      };
    }

    default:
      return state;
  }
}

function resolvePlague(state: GameState, option: string): GameState {
  switch (option) {
    case 'fund_isolation': {
      const newPlayers = state.players.map(p => ({ ...p, money: p.money - 2 }));
      const effect = createEffect('strength_penalty', 'all', -10, 2, 'Plague isolation');
      return {
        ...state,
        players: newPlayers,
        activeEffects: [...state.activeEffects, effect],
        lastEventResult: 'Isolation funded! All lose 2○ and 10 strength for 2 turns.',
      };
    }

    case 'no_isolation': {
      const effect = createEffect('strength_penalty', 'all', -25, 2, 'Plague spreads unchecked');
      return {
        ...state,
        activeEffects: [...state.activeEffects, effect],
        lastEventResult: 'Plague spreads unchecked! All factions lose 25 strength for 2 turns.',
      };
    }

    default:
      return state;
  }
}

/**
 * Resolve an order attack event (participation-based)
 */
export function resolveOrderAttackEvent(
  event: FullGameEvent,
  state: GameState,
  votes: (string | null)[],
  randomValues: RandomValues = {}
): GameState {
  // Get valid attack targets
  const validTargets = getValidOrderAttackTargets(state.regions);
  const nonPskovTargets = validTargets.filter((name) => name !== 'pskov');

  let targetRegion: string;
  if (nonPskovTargets.length > 0) {
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

  // Check who is defending (voted true)
  const participants = votes.filter((v) => v === 'true').length;
  const costPerParticipant = participants > 0 ? 3 / participants : 0;

  // Check if defense is funded
  let allCanAfford = true;
  const defendingPlayers: number[] = [];

  state.players.forEach((player, index) => {
    if (votes[index] === 'true') {
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
    if (votes[index] === 'true') {
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
    event.orderStrength || 100,
    targetRegion,
    defendingPlayers,
    randomValues.battleRoll
  );
}

/**
 * Main event resolution dispatcher
 */
export function resolveEvent(
  event: FullGameEvent,
  state: GameState,
  votes: (string | null)[],
  randomValues: RandomValues = {}
): GameState {
  switch (event.type) {
    case 'immediate':
      return resolveImmediateEvent(event, state);

    case 'voting':
      return resolveVotingEvent(event, state, votes);

    case 'order_attack':
      return resolveOrderAttackEvent(event, state, votes, randomValues);

    default:
      return {
        ...state,
        lastEventResult: `Event type ${event.type} not implemented.`,
      };
  }
}
