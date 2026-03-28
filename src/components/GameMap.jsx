import React from 'react';
import { useTranslation } from 'react-i18next';

// Settlement icons as monochrome SVG components
// Shape distinguishes faction: circle = republic, diamond = order
// Battlements distinguish fortress from town; capital is unique
const PskovIcon = ({ x, y }) => (
  <g transform={`translate(${x}, ${y})`}>
    {/* Capital city - hexagonal shield with star */}
    <path d="M 0,-30 L 26,-15 L 26,15 L 0,30 L -26,15 L -26,-15 Z"
          fill="#1c1917" stroke="white" strokeWidth="3" opacity="0.9"/>
    {/* Five-pointed star */}
    <path d="M 0,-16 L 4,-5 L 16,-5 L 6,2 L 10,14 L 0,7 L -10,14 L -6,2 L -16,-5 L -4,-5 Z"
          fill="white"/>
  </g>
);

const RepublicTownIcon = ({ x, y }) => (
  <g transform={`translate(${x}, ${y})`}>
    {/* Republic town - filled circle */}
    <circle cx="0" cy="0" r="14" fill="#1c1917" stroke="white" strokeWidth="2.5" opacity="0.9"/>
    <circle cx="0" cy="0" r="5" fill="white"/>
  </g>
);

const RepublicFortressIcon = ({ x, y }) => (
  <g transform={`translate(${x}, ${y})`}>
    {/* Republic fortress - circle with battlements */}
    <circle cx="0" cy="0" r="18" fill="#1c1917" stroke="white" strokeWidth="2.5" opacity="0.9"/>
    {/* Battlement crenellations */}
    <rect x="-12" y="-4" width="24" height="10" fill="white"/>
    <rect x="-12" y="-10" width="5" height="8" fill="white"/>
    <rect x="7" y="-10" width="5" height="8" fill="white"/>
    <rect x="-3" y="0" width="6" height="6" fill="#1c1917"/>
  </g>
);

const OrderTownIcon = ({ x, y }) => (
  <g transform={`translate(${x}, ${y})`}>
    {/* Order town - filled diamond */}
    <rect x="-10" y="-10" width="20" height="20" fill="#1c1917" stroke="white" strokeWidth="2.5"
          transform="rotate(45)" opacity="0.9"/>
    <rect x="-3.5" y="-3.5" width="7" height="7" fill="white" transform="rotate(45)"/>
  </g>
);

const OrderFortressIcon = ({ x, y }) => (
  <g transform={`translate(${x}, ${y})`}>
    {/* Order fortress - diamond with battlements */}
    <rect x="-13" y="-13" width="26" height="26" fill="#1c1917" stroke="white" strokeWidth="2.5"
          transform="rotate(45)" opacity="0.9"/>
    {/* Battlement crenellations */}
    <rect x="-12" y="-4" width="24" height="10" fill="white"/>
    <rect x="-12" y="-10" width="5" height="8" fill="white"/>
    <rect x="7" y="-10" width="5" height="8" fill="white"/>
    <rect x="-3" y="0" width="6" height="6" fill="#1c1917"/>
  </g>
);

const GameMap = ({ gameState }) => {
  const { t } = useTranslation();

  // City coordinates (relative positions: 0-1 range)
  const cities = [
    { name: 'pskov', x: 0.613, y: 0.646, region: 'pskov' },
    { name: 'ostrov', x: 0.613, y: 0.911, region: 'ostrov' },
    { name: 'izborsk', x: 0.449, y: 0.680, region: 'izborsk' },
    { name: 'pechory', x: 0.283, y: 0.653, region: 'pechory' },
    { name: 'bearhill', x: 0.132, y: 0.503, region: 'bearhill' },
    { name: 'skrynnitsy', x: 0.582, y: 0.426, region: 'skrynnitsy' },
    { name: 'gdov', x: 0.356, y: 0.077, region: 'gdov' },
  ];

  const getSettlementIcon = (city) => {
    // Convert relative coords (0-1) to viewBox coords (1024x1536)
    const x = city.x * 1024;
    const y = city.y * 1536;

    // Pskov is always special
    if (city.region === 'pskov') {
      return <PskovIcon x={x} y={y} key={city.name} />;
    }

    const region = gameState?.regions?.[city.region];
    if (!region) return null;

    const isRepublic = region.controller === 'republic';
    const hasFortress = region.fortress;

    if (isRepublic) {
      return hasFortress ? (
        <RepublicFortressIcon x={x} y={y} key={city.name} />
      ) : (
        <RepublicTownIcon x={x} y={y} key={city.name} />
      );
    } else {
      return hasFortress ? (
        <OrderFortressIcon x={x} y={y} key={city.name} />
      ) : (
        <OrderTownIcon x={x} y={y} key={city.name} />
      );
    }
  };

  const getCityLabel = (city) => {
    // Convert relative coords (0-1) to viewBox coords (1024x1536)
    const x = city.x * 1024;
    const y = city.y * 1536;

    return (
      <text
        key={`label-${city.name}`}
        x={x}
        y={y + 45}
        textAnchor="middle"
        fill="#1c1917"
        fontSize="20"
        fontWeight="bold"
        stroke="white"
        strokeWidth="4"
        paintOrder="stroke"
        style={{
          fontFamily: 'Georgia, serif',
          textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
        }}
      >
        {t(`regions.${city.name}`)}
      </text>
    );
  };

  return (
    <div className="card-parchment overflow-hidden">
      {/* Map Container */}
      <div className="relative w-full" style={{ backgroundColor: '#d4c4a8' }}>
        <img
          src="/images/map-background.png"
          alt={t('map.title')}
          className="w-full h-auto"
          style={{ display: 'block' }}
        />

        {/* SVG Overlay for settlements */}
        <svg
          className="absolute top-0 left-0 w-full h-full"
          viewBox="0 0 1024 1536"
          preserveAspectRatio="xMidYMid meet"
          style={{ pointerEvents: 'none' }}
        >
          {cities.map(city => getSettlementIcon(city))}
          {cities.map(city => getCityLabel(city))}
        </svg>
      </div>

      {/* Compact Legend */}
      <div className="px-3 py-2 border-t border-parchment-400 bg-parchment-50">
        <div className="flex flex-wrap gap-3 text-xs text-ink-light">
          <div className="flex items-center gap-1">
            <svg width="24" height="24" viewBox="0 0 40 40"><PskovIcon x="20" y="20" /></svg>
            <span className="font-medium">{t('map.legend.capital')}</span>
          </div>
          <div className="flex items-center gap-1">
            <svg width="24" height="24" viewBox="0 0 40 40"><RepublicTownIcon x="20" y="20" /></svg>
            <span>{t('map.legend.republic_town')}</span>
          </div>
          <div className="flex items-center gap-1">
            <svg width="24" height="24" viewBox="0 0 40 40"><RepublicFortressIcon x="20" y="20" /></svg>
            <span>{t('map.legend.republic_fortress')}</span>
          </div>
          <div className="flex items-center gap-1">
            <svg width="24" height="24" viewBox="0 0 40 40"><OrderTownIcon x="20" y="20" /></svg>
            <span>{t('map.legend.order_town')}</span>
          </div>
          <div className="flex items-center gap-1">
            <svg width="24" height="24" viewBox="0 0 40 40"><OrderFortressIcon x="20" y="20" /></svg>
            <span>{t('map.legend.order_fortress')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameMap;
