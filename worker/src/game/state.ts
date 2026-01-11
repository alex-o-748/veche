/**
 * Game state constants and initial state factory
 * TypeScript version for Cloudflare Worker
 */

export const PHASES = ['resources', 'construction', 'events', 'veche'] as const;
export type Phase = (typeof PHASES)[number];

export const FACTIONS = ['Nobles', 'Merchants', 'Commoners'] as const;
export type Faction = (typeof FACTIONS)[number];

// Base strength by faction
export const FACTION_BASE_STRENGTH: Record<Faction, number> = {
  Nobles: 40,
  Merchants: 15,
  Commoners: 25,
};

// Combat constants
export const FORTRESS_DEFENSE_BONUS = 10;
export const EQUIPMENT_STRENGTH_BONUS = 5;
export const ORDER_BASE_STRENGTH = 100;

// Building type definition
export interface BuildingType {
  name: string;
  cost: number;
  faction: Faction;
  maxPerRegion: number;
  pskovOnly?: boolean;
}

export const BUILDING_TYPES: Record<string, BuildingType> = {
  commoner_huts: { name: 'Huts', cost: 2, faction: 'Commoners', maxPerRegion: 1 },
  commoner_church: { name: 'Village Church', cost: 2, faction: 'Commoners', maxPerRegion: 1 },
  noble_manor: { name: 'Manor', cost: 2, faction: 'Nobles', maxPerRegion: 1 },
  noble_monastery: { name: 'Monastery', cost: 2, faction: 'Nobles', maxPerRegion: 1 },
  merchant_mansion: {
    name: 'Mansion',
    cost: 2,
    faction: 'Merchants',
    maxPerRegion: 7,
    pskovOnly: true,
  },
  merchant_church: { name: 'Church', cost: 2, faction: 'Merchants', maxPerRegion: 7, pskovOnly: true },
};

// Region buildings
export interface RegionBuildings {
  commoner_huts: number;
  commoner_church: number;
  noble_manor: number;
  noble_monastery: number;
  merchant_mansion?: number;
  merchant_church?: number;
  [key: string]: number | undefined;
}

// Region state
export interface Region {
  controller: 'republic' | 'order';
  fortress: boolean;
  buildings: RegionBuildings;
}

// Player state
export interface Player {
  faction: Faction;
  money: number;
  weapons: number;
  armor: number;
  improvements: number;
}

// Construction action tracking
export interface ConstructionAction {
  improvement: boolean;
  equipment: boolean;
}

// Active effect
export interface ActiveEffect {
  type: string;
  target: string;
  value: number;
  turnsRemaining: number;
  description: string;
}

// Event definition
export interface GameEvent {
  id: string;
  name: string;
  type: 'immediate' | 'participation' | 'order_attack' | 'voting';
  description: string;
  image?: string;
}

// Complete game state
export interface GameState {
  // Turn tracking
  turn: number;
  phase: Phase;
  gameOver: boolean;
  gameEnded: boolean;

  // Construction phase state
  currentPlayer: number;
  selectedRegion: string;
  constructionActions: ConstructionAction[];

  // Event phase state
  currentEvent: GameEvent | null;
  eventVotes: (boolean | null)[];
  eventResolved: boolean;
  lastEventResult: string | null;
  eventImageRevealed: boolean;
  debugEventIndex: number;

  // Active effects
  activeEffects: ActiveEffect[];

  // Battle state
  battleState: unknown;
  militaryAction: unknown;
  militaryParticipants: number[];
  targetRegion: string | null;
  orderStrength: number;

  // Attack planning
  attackPlanning: string | null;
  attackTarget: string | null;
  attackVotes: (boolean | null)[];

  // Fortress planning
  fortressPlanning: string | null;
  fortressTarget: string | null;
  fortressVotes: (boolean | null)[];

  // Core game data
  regions: Record<string, Region>;
  players: Player[];
}

// Create empty buildings object for a region
export function createRegionBuildings(isPskov = false): RegionBuildings {
  const buildings: RegionBuildings = {
    commoner_huts: 0,
    commoner_church: 0,
    noble_manor: 0,
    noble_monastery: 0,
  };

  if (isPskov) {
    buildings.merchant_mansion = 0;
    buildings.merchant_church = 0;
  }

  return buildings;
}

// Create initial regions state
export function createInitialRegions(): Record<string, Region> {
  return {
    pskov: {
      controller: 'republic',
      fortress: true,
      buildings: createRegionBuildings(true),
    },
    ostrov: {
      controller: 'republic',
      fortress: false,
      buildings: createRegionBuildings(false),
    },
    izborsk: {
      controller: 'republic',
      fortress: false,
      buildings: createRegionBuildings(false),
    },
    skrynnitsy: {
      controller: 'republic',
      fortress: false,
      buildings: createRegionBuildings(false),
    },
    gdov: {
      controller: 'republic',
      fortress: false,
      buildings: createRegionBuildings(false),
    },
    pechory: {
      controller: 'republic',
      fortress: false,
      buildings: createRegionBuildings(false),
    },
    bearhill: {
      controller: 'order',
      fortress: false,
      buildings: createRegionBuildings(false),
    },
  };
}

// Create initial player state
export function createInitialPlayers(): Player[] {
  return [
    { faction: 'Nobles', money: 0, weapons: 0, armor: 0, improvements: 0 },
    { faction: 'Merchants', money: 0, weapons: 0, armor: 0, improvements: 0 },
    { faction: 'Commoners', money: 0, weapons: 0, armor: 0, improvements: 0 },
  ];
}

// Create initial construction actions
export function createInitialConstructionActions(): ConstructionAction[] {
  return [
    { improvement: false, equipment: false },
    { improvement: false, equipment: false },
    { improvement: false, equipment: false },
  ];
}

// Create complete initial game state
export function createInitialGameState(): GameState {
  return {
    turn: 1,
    phase: 'resources',
    gameOver: false,
    gameEnded: false,
    currentPlayer: 0,
    selectedRegion: 'pskov',
    constructionActions: createInitialConstructionActions(),
    currentEvent: null,
    eventVotes: [null, null, null],
    eventResolved: false,
    lastEventResult: null,
    eventImageRevealed: false,
    debugEventIndex: 0,
    activeEffects: [],
    battleState: null,
    militaryAction: null,
    militaryParticipants: [],
    targetRegion: null,
    orderStrength: 0,
    attackPlanning: null,
    attackTarget: null,
    attackVotes: [null, null, null],
    fortressPlanning: null,
    fortressTarget: null,
    fortressVotes: [null, null, null],
    regions: createInitialRegions(),
    players: createInitialPlayers(),
  };
}

// Format region name for display
export function formatRegionName(regionName: string): string {
  if (regionName === 'bearhill') return 'Bear Hill';
  return regionName.charAt(0).toUpperCase() + regionName.slice(1);
}

// Count regions controlled by the republic
export function countRepublicRegions(regions: Record<string, Region>): number {
  return Object.values(regions).filter((r) => r.controller === 'republic').length;
}
