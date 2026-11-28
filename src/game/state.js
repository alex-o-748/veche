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

// Religious building types (give more VP but no income)
export const RELIGIOUS_BUILDING_TYPES = new Set(['commoner_church', 'noble_monastery', 'merchant_church']);

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

// Expedition constants
export const EXPEDITION_COST = 1;
export const EXPEDITION_MAX_PER_GAME = 2;
export const EXPEDITION_PROFIT = 3;
export const EXPEDITION_WINDFALL = 6;

// Combat constants
export const FORTRESS_DEFENSE_BONUS = 10;
export const EQUIPMENT_STRENGTH_BONUS = 5;
export const ORDER_BASE_STRENGTH = 100;

// Order turn-based scaling: Order grows stronger over time
// Every ORDER_SCALING_INTERVAL turns, Order gains ORDER_TURN_SCALING strength
export const ORDER_TURN_SCALING = 5;
export const ORDER_SCALING_INTERVAL = 4;
export const DEFENSE_COST_TOTAL = 3;
export const ATTACK_COST_TOTAL = 6;
export const FORTRESS_COST_TOTAL = 6;

// What each faction pays to fund a defence or to join a Veche campaign
export const DEFENSE_COST_PER_PLAYER = 1;
export const ATTACK_COST_PER_PLAYER = 2;

// Glory: VP earned for every coin spent on a defence or campaign that wins,
// or on a fortress that gets built. Never halved for Merchants, never lost.
export let GLORY_PER_COIN = 1;

// Merchant buildings sit safe inside Pskov, so they are worth less VP.
// Building VP only: Glory and bonus points are never multiplied.
// Classic rules use ×0.5; with Glory and the siege, ×0.6 keeps Merchants near a 30% win rate.
export const MERCHANT_VP_MULTIPLIER = 0.5;
export const MERCHANT_VP_MULTIPLIER_STANDARD = 0.6;

// Balance experiments only (simulate.js --glory= / --merchant-vp=): override the tuning knobs
export let merchantVpOverride = null;
export const setTuning = ({ gloryPerCoin, merchantVpMultiplier } = {}) => {
  if (gloryPerCoin !== undefined) GLORY_PER_COIN = gloryPerCoin;
  if (merchantVpMultiplier !== undefined) merchantVpOverride = merchantVpMultiplier;
};

// Rule sets. "standard" adds Glory and the Siege of Pskov; "classic" is the game without them.
export const RULESETS = {
  standard: { glory: true, siege: true, merchantVpMultiplier: MERCHANT_VP_MULTIPLIER_STANDARD },
  classic: { glory: false, siege: false, merchantVpMultiplier: MERCHANT_VP_MULTIPLIER },
};

// The rules a game is played with (old saves have none: they get the standard rules)
export const getRules = (state) => ({ ...RULESETS.standard, ...(state?.rules || {}) });

// Merchant building VP multiplier under a set of rules
export const getMerchantVpMultiplier = (rules = RULESETS.standard) =>
  merchantVpOverride ?? rules.merchantVpMultiplier ?? MERCHANT_VP_MULTIPLIER;

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
const createPlayer = (faction) => ({
  faction,
  money: 0,
  weapons: 0,
  armor: 0,
  improvements: 0,
  bonusPoints: 0,
  glory: 0,
  expeditions: 0,
  religiousBuildings: 0,
});

export const createInitialPlayers = () => FACTIONS.map(createPlayer);

// Create initial construction actions
export const createInitialConstructionActions = () => [
  { improvement: false, equipment: false, expedition: false },
  { improvement: false, equipment: false, expedition: false },
  { improvement: false, equipment: false, expedition: false },
];

// Create complete initial game state
// options.ruleset: 'standard' (default) or 'classic'
// options.simultaneousConstruction: every player builds at once (online games)
export const createInitialGameState = (options = {}) => ({
  // Rules this game is played with
  ruleset: options.ruleset === 'classic' ? 'classic' : 'standard',
  rules: { ...(RULESETS[options.ruleset] || RULESETS.standard) },
  simultaneousConstruction: Boolean(options.simultaneousConstruction),

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
  lastEventResult: null, // English text of the last outcome (logs, simulator)
  lastOutcome: null, // the same outcome as { key, params, then? } for the UI to translate
  eventImageRevealed: false,
  shuffledEventOrder: [],
  eventDrawIndex: 0,

  // Expedition result (shown during construction)
  lastExpeditionResult: null,

  // Active effects
  activeEffects: [],

  // Battle state
  battleState: null,
  battleResult: null,
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
  if (regionName === 'bearhill') return "Bear's Head";
  return regionName.charAt(0).toUpperCase() + regionName.slice(1);
};
