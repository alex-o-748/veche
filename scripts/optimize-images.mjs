// Generates the web images the game loads from the original artwork.
//
//   npm run images
//
// Originals live in art/originals/ (large PNG/JPEG, not served).
// Output goes to public/img/ as WebP:
//   <name>.webp        full image, at most FULL_WIDTH px wide (never upscaled)
//   <name>-thumb.webp  square crop, THUMB_SIZE px, for small icons and avatars
//
// To add or replace art: drop the original into art/originals/, add a line to
// ASSETS below, run the script, and point src/imageAssets.js at /img/<name>.webp.

import sharp from 'sharp';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const SRC = 'art/originals';
const OUT = 'public/img';
const FULL_WIDTH = 800;
const THUMB_SIZE = 160;

// name: [source path, options]
//   full: max width of the full image (default FULL_WIDTH)
//   thumb: whether to emit a square thumbnail (default true)
//   position: crop focus for the thumbnail (sharp position, default 'attention')
const ASSETS = {
  // Map: shown large and overlaid with SVG at native coordinates, keep native size
  'map': ['map-background.png', { full: 1024, thumb: false }],

  // Faction portraits: crop thumbnails towards the face
  'faction-nobles': ['factions/alexsyggr_a_medieval_Russian_horseman_with_a_stern_face_weari_7fe783e7-e4ca-4cd5-ab95-c561e16ca7c5_1.png', { position: 'top' }],
  'faction-merchants': ['factions/alexsyggr_A_medieval_rich_Russian_merchant_half-body_portrait_2db14a53-1310-442f-aa46-be695301daf3_0.png', { position: 'top' }],
  'faction-commoners': ['factions/alexsyggr_a_medieval_Russian_peasant_with_a_wooden_shield_lea_eeec1450-419a-4791-b261-e57425db6f3f_2.png', { position: 'top' }],

  // Buildings
  'building-noble-manor': ['buildings/alexsyggr_A_manor_of_a_medieval_Russian_nobleman_several_wood_7c4b29b2-f640-4577-8296-75faa4c1360a_1.png'],
  'building-noble-monastery': ['buildings/alexsyggr_blue_sky_--ar_916_--v_6.1_9d21074b-6af5-4ca4-b440-009e16f8e74b_0.png'],
  'building-merchant-mansion': ['buildings/alexsyggr_a_white_two-story_building_with_small_windows_in_th_b1ce883e-0ce1-438d-9afc-a0bc4bd6cf02_1.png'],
  'building-merchant-church': ['buildings/alexsyggr_an_austere_white_church_in_Medieval_Russian_style_o_31caee18-bef4-4f2e-ac1c-917f6aefcd77_0.jpeg'],
  'building-commoner-huts': ['buildings/alexsyggr_a_board_game_card_with_a_small_Russian_hamlet_with__05df951a-2c96-4a00-9b44-f424939dd294_2.jpeg'],
  'building-commoner-church': ['buildings/alexsyggr_A_small_medieval_Russian_log_church_among_the_trees_3237fc53-3b82-4d6e-98bc-f0bb83c07d79_3.jpeg'],
  'building-fortress': ['buildings/alexsyggr_a_simple_and_austere_old_Russian_fortress_built_of__066240a6-a9a9-4861-97f7-f45351b398c0_0.png'],

  // Equipment
  'weapons-nobles': ['equipment/alexsyggr_fancy_medieval_Russian_swords_with_golden_accents_l_310414eb-8c83-4204-89d3-a76a2fcf8b65_3.png'],
  'weapons-merchants': ['equipment/alexsyggr_sturdy_unadorned_medieval_Russian_swords_lying_on_a_e88b3060-7a7f-42be-82ce-b6e65cb0e2e2_3.png'],
  'weapons-commoners': ['equipment/alexsyggr_sharp_and_shiny_metal_spear_point_--ar_1117_--v_6.1_43177e5f-864a-4b1d-9faf-588fe98a1af2_1.png'],
  'armor-nobles': ['equipment/alexsyggr_medieval_Russian_armour_with_golden_accents_hanging_20caea06-4f70-40a1-a4dd-4416406c6780_1.jpeg'],
  'armor-merchants': ['equipment/alexsyggr_wooden_wall_--ar_1117_--v_6.1_748c2b2f-ec73-4005-80d7-aa8eee5b7bc2_1.png'],
  'armor-commoners': ['equipment/alexsyggr_medieval_peasants_simple_wooden_shield_and_second-h_2f0077a2-222c-4b72-a97e-3bdd7d45bfd7_1.png'],

  // Expedition
  'expedition': ['alexsyggr_a_small_medieval_merchant_ship_with_one_sail_seen_f_47eb22a5-0516-48ba-a63b-9e37e8cec0c0_1.png'],

  // Events (shown large only)
  'event-merchants-robbed': ['events/alexsyggr_medieval_Russian_merchants_in_long_robes_and_fur_ha_64fefaaf-d67c-453e-a2ed-2429f8c556a8_0.png', { thumb: false }],
  'event-boyars-bribes': ['events/alexsyggr_An_angry_crowd_of_people_gathered_on_a_square_in_a__fdc77283-6311-4fbb-9cca-0d5c184325a0_2.png', { thumb: false }],
  'event-embassy': ['events/alexsyggr_group_of_Russian_nobles_in_the_early_Middle_Ages_dr_699d9660-94d7-434d-88d5-202fe8a7e104_2.png', { thumb: false }],
  'event-relics': ['events/alexsyggr_an_Orthodox_priest_in_ornate_clothing_heading_a_rel_0cba2a95-bdba-46b2-b5a5-c9d56f25a882_2.png', { thumb: false }],
  'event-izhorians': ['events/alexsyggr_a_delegation_of_a_remote_tribe_in_austere_fur_cloth_80512fd8-6a3f-4845-9480-a58943925a16_2.png', { thumb: false }],
  'event-drought': ['events/alexsyggr_a_field_parched_due_to_draught_withered_crops_small_2e14e3e1-b46b-41df-ae6e-38e4ab766037_0.jpeg', { thumb: false }],
  'event-plague': ['events/alexsyggr_a_street_in_a_medieval_Russian_town_suffering_from__670d54fc-409b-4146-aa5a-f5b70fa990a1_2.png', { thumb: false }],
  'event-harvest': ['events/alexsyggr_medieval_peasants_celebrating_a_good_harvest_amidst_afa9f5c8-81d3-4dea-b8f2-ce81e945abad_0.png', { thumb: false }],
  'event-fire': ['events/alexsyggr_a_small_medieval_Russian_hamlet_engulfed_by_fire._S_057c9cff-c024-40ff-b511-344cb3e9c49e_2.jpeg', { thumb: false }],
  'event-city-fire': ['events/alexsyggr_a_fire_in_a_medieval_Russian_city_with_mostly_woode_9cae393b-8584-432f-8e58-ef7943433a7b_1.jpeg', { thumb: false }],
  'event-heresy': ['events/alexsyggr_a_street_preacher_in_ragged_clothes_standing_in_fro_be26bd8e-6607-427d-936f-2cf776b4c576_1.png', { thumb: false }],
  'event-order-attack': ['events/alexsyggr_knights_with_black_crosses_on_their_white_shields_r_a2c78c6a-9860-4d06-b99c-1c13874b176a_1.png', { thumb: false }],
  'event-fur-market': ['events/alexsyggr_a_stall_with_fur_pelts_in_a_marketplace_in_a_mediev_edaaadeb-ea66-48c2-8e25-b190cd24e740_0.png', { thumb: false }],
  'event-giant-squirrels': ['events/alexsyggr_giant_squirrels_35940424-a2d1-4488-bb62-57a61b91cde3_1.png', { thumb: false }],
};

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

await mkdir(OUT, { recursive: true });
let before = 0;
let after = 0;

for (const [name, [file, opts = {}]] of Object.entries(ASSETS)) {
  const src = path.join(SRC, file);
  before += (await stat(src)).size;

  const fullPath = path.join(OUT, `${name}.webp`);
  await sharp(src)
    .resize({ width: opts.full ?? FULL_WIDTH, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(fullPath);
  const fullSize = (await stat(fullPath)).size;
  after += fullSize;

  let line = `${name}: ${kb(fullSize)}`;
  if (opts.thumb !== false) {
    const thumbPath = path.join(OUT, `${name}-thumb.webp`);
    await sharp(src)
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: opts.position ?? sharp.strategy.attention })
      .webp({ quality: 80 })
      .toFile(thumbPath);
    const thumbSize = (await stat(thumbPath)).size;
    after += thumbSize;
    line += `, thumb ${kb(thumbSize)}`;
  }
  console.log(line);
}

console.log(`\nOriginals: ${kb(before)}  →  web images: ${kb(after)}`);
