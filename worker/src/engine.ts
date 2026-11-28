/**
 * The rules engine, shared with the solo and hot-seat game.
 *
 * The worker has no rules of its own: it imports the same modules as the
 * client (src/game at the repository root), and wrangler bundles them in.
 */

// @ts-ignore -- plain JavaScript module, typed by the declarations below
import * as rules from '../../src/game/index.js';

/** Game state as the engine builds it (see src/game/state.js). */
export interface GameState {
  turn: number;
  phase: 'resources' | 'construction' | 'events' | 'veche';
  gameOver: boolean;
  players: Array<{ faction: string; money: number; [key: string]: unknown }>;
  [key: string]: unknown;
}

/** An action a client sends (see ActionTypes in src/game/actions.js). */
export interface GameAction {
  type: string;
  regionName?: string;
  buildingType?: string;
  item?: 'weapons' | 'armor';
  vote?: unknown;
  targetRegion?: string;
}

export interface RandomValues {
  battleRoll?: number;
  targetIndex?: number;
  expeditionRoll?: number;
}

export interface ActionResult {
  newState: GameState;
  error?: string;
  result?: { type: string; [key: string]: unknown };
}

export const FACTIONS: readonly string[] = rules.FACTIONS;

export const createInitialGameState: (options?: {
  ruleset?: 'standard' | 'classic';
  simultaneousConstruction?: boolean;
}) => GameState = rules.createInitialGameState;

export const nextPhase: (state: GameState) => GameState = rules.nextPhase;

export const applyAction: (
  state: GameState,
  action: GameAction,
  playerId?: number | null,
  randomValues?: RandomValues
) => ActionResult = rules.applyAction;

/** The whole engine, for the build check (scripts/check-worker-engine.mjs). */
export const engine = rules;
