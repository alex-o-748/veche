// Game state constants and initial state factory

export const PHASES = ['resources', 'construction', 'events', 'veche'];

export const PHASE_NAMES = {
  resources: 'Resources',
  construction: 'Construction',
  events: 'Events',
  veche: 'City Assembly',
};

export const PHASE_DESCRIPTIONS = {
  resources: 'Players receive income from controlled regions and improvements',
  construction: 'Players can build improvements, fortresses, and buy equipment',
  events: 'Draw and resolve an event card',
  veche: 'Assembly of citizens making collective decisions',
};

export const FACTIONS = ['Nobles', 'Merchants', 'Commoners'];

// Base strength by faction
export const FACTION_BASE_STRENGTH = {
  Nobles: 40,
  Merchants: 15,
  Commoners: 25,
};

// Building definitions
export const BUILDING_TYPES = {
  commoner_huts: { name: 'Huts', cost: 2, faction: 'Commoners', maxPerRegion: 1 },
  commoner_church: { name: 'Village Church', cost: 2, faction: 'Commoners', maxPerRegion: 1 },
  noble_manor: { name: 'Manor', cost: 2, faction: 'Nobles', maxPerRegion: 1 },
  noble_monastery: { name: 'Monastery', cost: 2, faction: 'Nobles', maxPerRegion: 1 },
  merchant_mansion: { name: 'Mansion', cost: 2, faction: 'Merchants', maxPerRegion: 7, pskovOnly: true },
  merchant_church: { name: 'Church', cost: 2, faction: 'Merchants', maxPerRegion: 7, pskovOnly: true },
};

export const BUILDING_NAMES = {
  commoner_huts: 'Huts',
  commoner_church: 'Village Church',
  noble_manor: 'Manor',
  noble_monastery: 'Monastery',
  merchant_mansion: 'Mansion',
  merchant_church: 'Merchant Church',
};

// Equipment costs
export const EQUIPMENT_COSTS = {
  weapons: 1,
  armor: 1,
};

// Combat constants
export const FORTRESS_DEFENSE_BONUS = 10;
export const EQUIPMENT_STRENGTH_BONUS = 5;
export const ORDER_BASE_STRENGTH = 100;
export const DEFENSE_COST_TOTAL = 3;
export const ATTACK_COST_TOTAL = 6;
export const FORTRESS_COST_TOTAL = 6;

// Create empty buildings object for a region
export const createRegionBuildings = (isPskov = false) => {
  const buildings = {
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
};

// Create initial regions state
export const createInitialRegions = () => ({
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
});

// Create initial player state
export const createInitialPlayers = () => [
  { faction: 'Nobles', money: 0, weapons: 0, armor: 0, improvements: 0 },
  { faction: 'Merchants', money: 0, weapons: 0, armor: 0, improvements: 0 },
  { faction: 'Commoners', money: 0, weapons: 0, armor: 0, improvements: 0 },
];

// Create initial construction actions
export const createInitialConstructionActions = () => [
  { improvement: false, equipment: false },
  { improvement: false, equipment: false },
  { improvement: false, equipment: false },
];

// Create complete initial game state
export const createInitialGameState = () => ({
  // Turn tracking
  turn: 1,
  phase: 'resources',
  gameOver: false,
  gameEnded: false,

  // Construction phase state
  currentPlayer: 0,
  selectedRegion: 'pskov',
  constructionActions: createInitialConstructionActions(),
  constructionReady: [false, false, false],

  // Event phase state
  currentEvent: null,
  eventVotes: [null, null, null],
  eventResolved: false,
  lastEventResult: null,
  eventImageRevealed: false,
  debugEventIndex: 0,

  // Active effects
  activeEffects: [],

  // Battle state
  battleState: null,
  militaryAction: null,
  militaryParticipants: [],
  targetRegion: null,
  orderStrength: 0,

  // Attack planning
  attackPlanning: null,
  attackTarget: null,
  attackVotes: [null, null, null],

  // Fortress planning
  fortressPlanning: null,
  fortressTarget: null,
  fortressVotes: [null, null, null],

  // Core game data
  regions: createInitialRegions(),
  players: createInitialPlayers(),
});

// Format region name for display
export const formatRegionName = (regionName) => {
  if (regionName === 'bearhill') return 'Bear Hill';
  return regionName.charAt(0).toUpperCase() + regionName.slice(1);
};
