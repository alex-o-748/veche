/**
 * Map adjacency and region logic for server-side game logic
 */

import { GameState, Region } from './state';

// Map adjacency graph - defines which regions are connected
// "order_lands" represents the Teutonic Order's home territory (always Order-controlled)
export const MAP_ADJACENCY: Record<string, string[]> = {
  order_lands: ['bearhill', 'gdov'],
  bearhill: ['order_lands', 'pechory'],
  pechory: ['bearhill', 'izborsk'],
  izborsk: ['pechory', 'ostrov', 'pskov'],
  ostrov: ['izborsk', 'pskov'],
  pskov: ['izborsk', 'ostrov', 'skrynnitsy'],
  skrynnitsy: ['pskov', 'gdov'],
  gdov: ['order_lands', 'skrynnitsy'],
};

/**
 * Get all valid attack targets for the Order (republic regions adjacent to Order territory)
 */
export function getValidOrderAttackTargets(regions: Record<string, Region>): string[] {
  // Find all Order-controlled regions (including the permanent "order_lands")
  const orderControlledRegions = ['order_lands']; // Order always controls their home territory
  Object.entries(regions).forEach(([name, region]) => {
    if (region.controller === 'order') {
      orderControlledRegions.push(name);
    }
  });

  // Find all republic regions that are adjacent to any Order-controlled region
  const validTargets = new Set<string>();
  orderControlledRegions.forEach((orderRegion) => {
    const adjacentRegions = MAP_ADJACENCY[orderRegion] || [];
    adjacentRegions.forEach((adjacent) => {
      // Only add if it's a republic-controlled region (not order_lands or already order-controlled)
      if (regions[adjacent] && regions[adjacent].controller === 'republic') {
        validTargets.add(adjacent);
      }
    });
  });

  return Array.from(validTargets);
}

/**
 * Get all valid attack targets for the Republic (order regions adjacent to Republic territory)
 */
export function getValidRepublicAttackTargets(regions: Record<string, Region>): string[] {
  // Find all Republic-controlled regions
  const republicControlledRegions: string[] = [];
  Object.entries(regions).forEach(([name, region]) => {
    if (region.controller === 'republic') {
      republicControlledRegions.push(name);
    }
  });

  // Find all Order regions that are adjacent to any Republic-controlled region
  const validTargets = new Set<string>();
  republicControlledRegions.forEach((republicRegion) => {
    const adjacentRegions = MAP_ADJACENCY[republicRegion] || [];
    adjacentRegions.forEach((adjacent) => {
      // Only add if it's an Order-controlled region (and exists in regions, not order_lands)
      if (regions[adjacent] && regions[adjacent].controller === 'order') {
        validTargets.add(adjacent);
      }
    });
  });

  return Array.from(validTargets);
}
