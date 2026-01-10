// Map adjacency and region logic

// Map adjacency graph - defines which regions are connected
// "order_lands" represents the Teutonic Order's home territory (always Order-controlled)
export const MAP_ADJACENCY = {
  order_lands: ['bearhill', 'gdov'],
  bearhill: ['order_lands', 'pechory'],
  pechory: ['bearhill', 'izborsk'],
  izborsk: ['pechory', 'ostrov', 'pskov'],
  ostrov: ['izborsk', 'pskov'],
  pskov: ['izborsk', 'ostrov', 'skrynnitsy'],
  skrynnitsy: ['pskov', 'gdov'],
  gdov: ['order_lands', 'skrynnitsy'],
};

// Get all valid attack targets for the Order (republic regions adjacent to Order territory)
export const getValidOrderAttackTargets = (regions) => {
  // Find all Order-controlled regions (including the permanent "order_lands")
  const orderControlledRegions = ['order_lands']; // Order always controls their home territory
  Object.entries(regions).forEach(([name, region]) => {
    if (region.controller === 'order') {
      orderControlledRegions.push(name);
    }
  });

  // Find all republic regions that are adjacent to any Order-controlled region
  const validTargets = new Set();
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
};

// Get all valid attack targets for the Republic (order regions adjacent to Republic territory)
export const getValidRepublicAttackTargets = (regions) => {
  // Find all Republic-controlled regions
  const republicControlledRegions = [];
  Object.entries(regions).forEach(([name, region]) => {
    if (region.controller === 'republic') {
      republicControlledRegions.push(name);
    }
  });

  // Find all Order regions that are adjacent to any Republic-controlled region
  const validTargets = new Set();
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
};

// Count republic-controlled regions
export const countRepublicRegions = (regions) => {
  return Object.values(regions).filter((r) => r.controller === 'republic').length;
};

// Get all regions with fortresses
export const getRegionsWithFortresses = (regions) => {
  return Object.entries(regions)
    .filter(([_, region]) => region.fortress && region.controller === 'republic')
    .map(([name, _]) => name);
};

// Get regions available for fortress construction
export const getRegionsForFortress = (regions) => {
  return Object.entries(regions)
    .filter(([_, region]) => !region.fortress && region.controller === 'republic')
    .map(([name, _]) => name);
};

// Check if a region can be selected for construction by a faction
export const canSelectRegion = (regionName, region, faction) => {
  if (region.controller !== 'republic') return false;

  // Merchants can only build in Pskov
  if (faction === 'Merchants' && regionName !== 'pskov') return false;

  return true;
};

// Get all buildings in a region
export const getRegionBuildings = (region) => {
  return Object.entries(region.buildings)
    .filter(([_, count]) => count > 0)
    .map(([type, count]) => ({ type, count }));
};
