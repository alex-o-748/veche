import React from 'react';
import { useTranslation } from 'react-i18next';

const GameMap = ({ gameState, onRegionClick, highlightRegions = [], phase }) => {
  const { t } = useTranslation();

  // Region definitions with SVG polygon points
  // Layout designed so adjacent regions share borders
  const regionPolygons = {
    order_lands: '350,20 650,20 650,200 550,200 450,200 350,200',
    bearhill: '50,200 350,200 350,400 250,400 50,350',
    gdov: '650,200 950,200 950,400 750,400 650,350',
    pechory: '100,400 350,400 400,600 250,600 150,550',
    skrynnitsy: '650,400 900,400 850,600 700,600 600,550',
    izborsk: '150,650 400,650 450,850 350,850 200,800',
    ostrov: '350,750 600,750 600,900 450,900 350,850',
    pskov: '600,650 850,650 800,850 650,850 600,750',
  };

  // Region center points for labels and icons
  const regionCenters = {
    order_lands: { x: 500, y: 110 },
    bearhill: { x: 200, y: 300 },
    gdov: { x: 800, y: 300 },
    pechory: { x: 250, y: 500 },
    skrynnitsy: { x: 750, y: 500 },
    izborsk: { x: 300, y: 750 },
    ostrov: { x: 475, y: 825 },
    pskov: { x: 725, y: 750 },
  };

  const getRegionColor = (region) => {
    const isRepublic = region.controller === 'republic';
    const isHighlighted = highlightRegions.includes(region);

    if (isRepublic) {
      return isHighlighted ? '#86efac' : '#bbf7d0'; // green-300 : green-200
    } else {
      return isHighlighted ? '#fca5a5' : '#fecaca'; // red-300 : red-200
    }
  };

  const getRegionStroke = (region) => {
    const isRepublic = region.controller === 'republic';
    return isRepublic ? '#16a34a' : '#dc2626'; // green-600 : red-600
  };

  const getTotalBuildings = (region) => {
    const buildings = region.buildings || {};
    return Object.values(buildings).reduce((sum, count) => sum + count, 0);
  };

  const getRegionDisplayName = (regionKey) => {
    const names = {
      order_lands: t('regions.order_lands', 'Order Lands'),
      bearhill: t('regions.bearhill', 'Bearhill'),
      gdov: t('regions.gdov', 'Gdov'),
      pechory: t('regions.pechory', 'Pechory'),
      skrynnitsy: t('regions.skrynnitsy', 'Skrynnitsy'),
      izborsk: t('regions.izborsk', 'Izborsk'),
      ostrov: t('regions.ostrov', 'Ostrov'),
      pskov: t('regions.pskov', 'Pskov'),
    };
    return names[regionKey] || regionKey;
  };

  return (
    <div className="w-full bg-amber-50 border-4 border-amber-900 rounded-lg p-4 shadow-lg">
      <h3 className="text-2xl font-bold text-center mb-4 text-amber-900">
        {t('map.title', 'Map of the Republic')}
      </h3>

      <svg
        viewBox="0 0 1000 950"
        className="w-full h-auto"
        style={{ maxHeight: '600px' }}
      >
        {/* Region polygons */}
        {Object.entries(gameState.regions).map(([regionKey, region]) => (
          <g key={regionKey}>
            {/* Region territory */}
            <polygon
              points={regionPolygons[regionKey]}
              fill={getRegionColor(region)}
              stroke={getRegionStroke(region)}
              strokeWidth="3"
              className="transition-all duration-200 cursor-pointer hover:opacity-80"
              onClick={() => onRegionClick && onRegionClick(regionKey)}
            />

            {/* Region label */}
            <text
              x={regionCenters[regionKey].x}
              y={regionCenters[regionKey].y - 20}
              textAnchor="middle"
              className="text-xs font-bold fill-amber-900 pointer-events-none"
              style={{ fontSize: '14px' }}
            >
              {getRegionDisplayName(regionKey)}
            </text>

            {/* Fortress icon */}
            {region.fortress && (
              <text
                x={regionCenters[regionKey].x - 30}
                y={regionCenters[regionKey].y + 10}
                className="text-2xl pointer-events-none"
              >
                🏰
              </text>
            )}

            {/* Building icon and count */}
            {getTotalBuildings(region) > 0 && (
              <g>
                <text
                  x={regionCenters[regionKey].x + (region.fortress ? 30 : 0)}
                  y={regionCenters[regionKey].y + 10}
                  className="text-2xl pointer-events-none"
                >
                  🏘️
                </text>
                <text
                  x={regionCenters[regionKey].x + (region.fortress ? 50 : 20)}
                  y={regionCenters[regionKey].y + 10}
                  className="text-sm font-bold fill-amber-900 pointer-events-none"
                  style={{ fontSize: '16px' }}
                >
                  {getTotalBuildings(region)}
                </text>
              </g>
            )}

            {/* Controller indicator */}
            <text
              x={regionCenters[regionKey].x}
              y={regionCenters[regionKey].y + 35}
              textAnchor="middle"
              className="text-xs pointer-events-none"
              style={{ fontSize: '12px' }}
            >
              {region.controller === 'republic' ? '🏛️' : '⚔️'}
            </text>
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div className="mt-4 flex justify-center gap-8 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-green-200 border-2 border-green-600 rounded"></div>
          <span>{t('map.republic', 'Republic')}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-red-200 border-2 border-red-600 rounded"></div>
          <span>{t('map.order', 'Teutonic Order')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏰</span>
          <span>{t('map.fortress', 'Fortress')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏘️</span>
          <span>{t('map.buildings', 'Buildings')}</span>
        </div>
      </div>
    </div>
  );
};

export default GameMap;
