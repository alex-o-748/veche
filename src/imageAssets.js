// Image asset mappings for game graphics
// All images are stored in /public/images/ and referenced by path

// Faction images - displayed in player cards
export const FACTION_IMAGES = {
  Nobles: '/images/factions/alexsyggr_a_medieval_Russian_horseman_with_a_stern_face_weari_7fe783e7-e4ca-4cd5-ab95-c561e16ca7c5_1.png',
  Merchants: '/images/factions/alexsyggr_A_medieval_rich_Russian_merchant_half-body_portrait_2db14a53-1310-442f-aa46-be695301daf3_0.png',
  Commoners: '/images/factions/alexsyggr_a_medieval_Russian_peasant_with_a_wooden_shield_lea_eeec1450-419a-4791-b261-e57425db6f3f_2.png',
};

// Building images - displayed in construction UI
export const BUILDING_IMAGES = {
  noble_manor: '/images/buildings/alexsyggr_A_manor_of_a_medieval_Russian_nobleman_several_wood_7c4b29b2-f640-4577-8296-75faa4c1360a_1.png',
  noble_monastery: 'public/images/buildings/alexsyggr_blue_sky_--ar_916_--v_6.1_9d21074b-6af5-4ca4-b440-009e16f8e74b_0.png',
  merchant_mansion: '/images/buildings/alexsyggr_a_white_two-story_building_with_small_windows_in_th_b1ce883e-0ce1-438d-9afc-a0bc4bd6cf02_1.png',
  merchant_church: null, // Not yet added
  commoner_huts: null, // Not yet added
  commoner_church: null, // Not yet added
  fortress: '/images/buildings/alexsyggr_a_simple_and_austere_old_Russian_fortress_built_of__066240a6-a9a9-4861-97f7-f45351b398c0_0.png',
};

// Equipment images - displayed in player cards
export const EQUIPMENT_IMAGES = {
  weapons: {
    Nobles: '/images/equipment/alexsyggr_fancy_medieval_Russian_swords_with_golden_accents_l_310414eb-8c83-4204-89d3-a76a2fcf8b65_3.png',
    Merchants: '/images/equipment/alexsyggr_sturdy_unadorned_medieval_Russian_swords_lying_on_a_e88b3060-7a7f-42ce-b6e65cb0e2e2_3.png',
    Commoners: '/images/equipment/alexsyggr_sharp_and_shiny_metal_spear_point_--ar_1117_--v_6.1_43177e5f-864a-4b1d-9faf-588fe98a1af2_1.png',
  },
  armor: {
    Nobles: '/images/equipment/alexsyggr_wooden_wall_--ar_1117_--v_6.1_748c2b2f-ec73-4005-80d7-aa8eee5b7bc2_1.png',
    Merchants: null, // Not yet added
    Commoners: '/images/equipment/alexsyggr_medieval_peasants_simple_wooden_shield_and_second-h_2f0077a2-222c-4b72-a97e-3bdd7d45bfd7_1.png',
  },
};

// Event images - displayed in event cards
export const EVENT_IMAGES = {
  // Voting events
  merchants_robbed: '/images/events/alexsyggr_medieval_Russian_merchants_in_long_robes_and_fur_ha_64fefaaf-d67c-453e-a2ed-2429f8c556a8_0.png',
  boyars_take_bribes: '/images/events/alexsyggr_An_angry_crowd_of_people_gathered_on_a_square_in_a__fdc77283-6311-4fbb-9cca-0d5c184325a0_2.png',
  embassy: '/images/events/alexsyggr_group_of_Russian_nobles_in_the_early_Middle_Ages_dr_699d9660-94d7-434d-88d5-202fe8a7e104_2.png',
  relics_found: '/images/events/alexsyggr_an_Orthodox_priest_in_ornate_clothing_heading_a_rel_0cba2a95-bdba-46b2-b5a5-c9d56f25a882_2.png',
  izhorian_delegation: '/images/events/alexsyggr_a_delegation_of_a_remote_tribe_in_austere_fur_cloth_80512fd8-6a3f-4845-9480-a58943925a16_2.png',
  drought: null, // Not yet added
  plague: '/images/events/alexsyggr_a_street_in_a_medieval_Russian_town_suffering_from__670d54fc-409b-4146-aa5a-f5b70fa990a1_2.png',

  // Immediate events
  good_harvest: '/images/events/alexsyggr_medieval_peasants_celebrating_a_good_harvest_amidst_afa9f5c8-81d3-4dea-b8f2-ce81e945abad_0.png',
  fire: null, // Not yet added
  city_fire: null, // Not yet added
  heresy: '/images/events/alexsyggr_a_street_preacher_in_ragged_clothes_standing_in_fro_be26bd8e-6607-427d-936f-2cf776b4c576_1.png',

  // Order attacks - all use same image
  order_attack: '/images/events/alexsyggr_knights_with_black_crosses_on_their_white_shields_r_a2c78c6a-9860-4d06-b99c-1c13874b176a_1.png',
  order_attack_90: '/images/events/alexsyggr_knights_with_black_crosses_on_their_white_shields_r_a2c78c6a-9860-4d06-b99c-1c13874b176a_1.png',
  order_attack_95: '/images/events/alexsyggr_knights_with_black_crosses_on_their_white_shields_r_a2c78c6a-9860-4d06-b99c-1c13874b176a_1.png',
  order_attack_100: '/images/events/alexsyggr_knights_with_black_crosses_on_their_white_shields_r_a2c78c6a-9860-4d06-b99c-1c13874b176a_1.png',
  order_attack_105: '/images/events/alexsyggr_knights_with_black_crosses_on_their_white_shields_r_a2c78c6a-9860-4d06-b99c-1c13874b176a_1.png',
  order_attack_110: '/images/events/alexsyggr_knights_with_black_crosses_on_their_white_shields_r_a2c78c6a-9860-4d06-b99c-1c13874b176a_1.png',
  order_attack_rob_foreign: '/images/events/alexsyggr_knights_with_black_crosses_on_their_white_shields_r_a2c78c6a-9860-4d06-b99c-1c13874b176a_1.png',

  // Future events (not yet in deck)
  hunters_brought_furs: '/images/events/alexsyggr_a_stall_with_fur_pelts_in_a_marketplace_in_a_mediev_edaaadeb-ea66-48c2-8e25-b190cd24e740_0.png',
  huge_squirrels_found: '/images/events/alexsyggr_Hunters_come_back_to_a_medieval_Russian_village_wit_35940424-a2d1-4488-bb62-57a61b91cde3_1.png',
};

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
