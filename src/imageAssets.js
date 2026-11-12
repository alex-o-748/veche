// Image asset mappings for game graphics
//
// Web images live in /public/img/ and are generated from the originals in
// art/originals/ by `npm run images` (scripts/optimize-images.mjs).
// Each image has a full version (<name>.webp, up to 800px wide) and most have a
// square thumbnail (<name>-thumb.webp, 160px) for icons, avatars and tiles.

const full = (name) => `/img/${name}.webp`;
const thumb = (name) => `/img/${name}-thumb.webp`;

// Map background (1024x1536, the SVG overlay in GameMap uses the same coordinates)
export const MAP_IMAGE = full('map');

// Faction portraits - full size for the faction intro screen
export const FACTION_IMAGES = {
  Nobles: full('faction-nobles'),
  Merchants: full('faction-merchants'),
  Commoners: full('faction-commoners'),
};

// Faction portraits - thumbnails for the menu, player cards and other small avatars
export const FACTION_THUMBS = {
  Nobles: thumb('faction-nobles'),
  Merchants: thumb('faction-merchants'),
  Commoners: thumb('faction-commoners'),
};

// Building images - shown as small tiles in the construction UI
export const BUILDING_IMAGES = {
  noble_manor: thumb('building-noble-manor'),
  noble_monastery: thumb('building-noble-monastery'),
  merchant_mansion: thumb('building-merchant-mansion'),
  merchant_church: thumb('building-merchant-church'),
  commoner_huts: thumb('building-commoner-huts'),
  commoner_church: thumb('building-commoner-church'),
  fortress: thumb('building-fortress'),
};

// Equipment images - shown as small icons in player cards and the construction UI
export const EQUIPMENT_IMAGES = {
  weapons: {
    Nobles: thumb('weapons-nobles'),
    Merchants: thumb('weapons-merchants'),
    Commoners: thumb('weapons-commoners'),
  },
  armor: {
    Nobles: thumb('armor-nobles'),
    Merchants: thumb('armor-merchants'),
    Commoners: thumb('armor-commoners'),
  },
};

// Event images - displayed large in event cards
export const EVENT_IMAGES = {
  // Voting events
  merchants_robbed: full('event-merchants-robbed'),
  boyars_take_bribes: full('event-boyars-bribes'),
  embassy: full('event-embassy'),
  relics_found: full('event-relics'),
  izhorian_delegation: full('event-izhorians'),
  drought: full('event-drought'),
  plague: full('event-plague'),

  // Immediate events
  good_harvest: full('event-harvest'),
  fire: full('event-fire'),
  city_fire: full('event-city-fire'),
  heresy: full('event-heresy'),

  // Order attacks - all share one image (see getEventImage)
  order_attack: full('event-order-attack'),

  // Auction events
  fur_auction: full('event-fur-market'),
  hunters_brought_furs: full('event-fur-market'),
  giant_squirrels: full('event-giant-squirrels'),
};

// Expedition image - shown as a small tile in the construction UI
export const EXPEDITION_IMAGE = thumb('expedition');

// Helper function to get event image, with fallback for order attacks
export const getEventImage = (eventId) => {
  if (eventId && eventId.startsWith('order_attack')) {
    return EVENT_IMAGES.order_attack;
  }
  return EVENT_IMAGES[eventId] || null;
};

// Helper function to get equipment image by type and faction
export const getEquipmentImage = (type, faction) => {
  return EQUIPMENT_IMAGES[type]?.[faction] || null;
};
