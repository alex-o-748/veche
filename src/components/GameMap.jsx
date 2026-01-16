import React from 'react';
import { useTranslation } from 'react-i18next';

// Settlement icons as SVG components
const PskovIcon = ({ x, y }) => (
  <g transform={`translate(${x}, ${y})`}>
    {/* Capital city - grand fortress with cathedral domes */}
    <circle cx="0" cy="0" r="28" fill="#3b82f6" stroke="#1e40af" strokeWidth="3" opacity="0.9"/>
    <path d="M -12,-8 L -12,-18 L -8,-22 L -4,-18 L -4,-8 Z" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1.5"/>
    <circle cx="-8" cy="-22" r="3" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1"/>
    <path d="M 4,-8 L 4,-18 L 8,-22 L 12,-18 L 12,-8 Z" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1.5"/>
    <circle cx="8" cy="-22" r="3" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1"/>
    <rect x="-15" y="-8" width="30" height="12" fill="#dc2626" stroke="#991b1b" strokeWidth="2"/>
    <rect x="-18" y="4" width="36" height="8" fill="#78716c" stroke="#57534e" strokeWidth="2"/>
  </g>
);

const RepublicTownIcon = ({ x, y }) => (
  <g transform={`translate(${x}, ${y})`}>
    {/* Simple unfortified town - circle with cross */}
    <circle cx="0" cy="0" r="16" fill="#10b981" stroke="#059669" strokeWidth="2.5" opacity="0.9"/>
    <rect x="-1.5" y="-8" width="3" height="16" fill="white"/>
    <rect x="-8" y="-1.5" width="16" height="3" fill="white"/>
  </g>
);

const RepublicFortressIcon = ({ x, y }) => (
  <g transform={`translate(${x}, ${y})`}>
    {/* Fortified town - castle with towers */}
    <circle cx="0" cy="0" r="20" fill="#10b981" stroke="#059669" strokeWidth="3" opacity="0.9"/>
    <rect x="-12" y="-6" width="24" height="12" fill="#78716c" stroke="#57534e" strokeWidth="2"/>
    <rect x="-14" y="-10" width="6" height="8" fill="#78716c" stroke="#57534e" strokeWidth="1.5"/>
    <rect x="8" y="-10" width="6" height="8" fill="#78716c" stroke="#57534e" strokeWidth="1.5"/>
    <rect x="-3" y="-2" width="6" height="8" fill="#292524" stroke="#1c1917" strokeWidth="1"/>
  </g>
);

const OrderTownIcon = ({ x, y }) => (
  <g transform={`translate(${x}, ${y})`}>
    {/* Order unfortified - circle with Teutonic cross */}
    <circle cx="0" cy="0" r="16" fill="#ef4444" stroke="#dc2626" strokeWidth="2.5" opacity="0.9"/>
    <path d="M -2,-10 L -2,-3 L -10,-3 L -10,3 L -2,3 L -2,10 L 2,10 L 2,3 L 10,3 L 10,-3 L 2,-3 L 2,-10 Z"
          fill="white" stroke="#1c1917" strokeWidth="0.5"/>
  </g>
);

const OrderFortressIcon = ({ x, y }) => (
  <g transform={`translate(${x}, ${y})`}>
    {/* Order fortress - intimidating castle */}
    <circle cx="0" cy="0" r="20" fill="#ef4444" stroke="#dc2626" strokeWidth="3" opacity="0.9"/>
    <rect x="-12" y="-6" width="24" height="12" fill="#1c1917" stroke="#000000" strokeWidth="2"/>
    <rect x="-14" y="-10" width="6" height="8" fill="#1c1917" stroke="#000000" strokeWidth="1.5"/>
    <rect x="8" y="-10" width="6" height="8" fill="#1c1917" stroke="#000000" strokeWidth="1.5"/>
    <path d="M -2,-10 L -2,-5 L -6,-5 L -6,-1 L -2,-1 L -2,4 L 2,4 L 2,-1 L 6,-1 L 6,-5 L 2,-5 L 2,-10 Z"
          fill="white" stroke="#1c1917" strokeWidth="0.5"/>
  </g>
);

const GameMap = ({ gameState }) => {
  const { t } = useTranslation();

  // City coordinates from user
  const cities = [
    { name: 'pskov', x: 628, y: 993, region: 'pskov' },
    { name: 'ostrov', x: 628, y: 1400, region: 'ostrov' },
    { name: 'izborsk', x: 460, y: 1044, region: 'izborsk' },
    { name: 'pechory', x: 290, y: 1003, region: 'pechory' },
    { name: 'bearhill', x: 135, y: 773, region: 'bearhill' },
    { name: 'skrynnitsy', x: 596, y: 654, region: 'skrynnitsy' },
    { name: 'gdov', x: 365, y: 118, region: 'gdov' },
  ];

  const getSettlementIcon = (city) => {
    // Pskov is always special
    if (city.region === 'pskov') {
      return <PskovIcon x={city.x} y={city.y} key={city.name} />;
    }

    const region = gameState?.regions?.[city.region];
    if (!region) return null;

    const isRepublic = region.controller === 'republic';
    const hasFortress = region.fortress;

    if (isRepublic) {
      return hasFortress ? (
        <RepublicFortressIcon x={city.x} y={city.y} key={city.name} />
      ) : (
        <RepublicTownIcon x={city.x} y={city.y} key={city.name} />
      );
    } else {
      return hasFortress ? (
        <OrderFortressIcon x={city.x} y={city.y} key={city.name} />
      ) : (
        <OrderTownIcon x={city.x} y={city.y} key={city.name} />
      );
    }
  };

  const getCityLabel = (city) => {
    return (
      <text
        key={`label-${city.name}`}
        x={city.x}
        y={city.y + 45}
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
    <div className="w-full border-4 border-amber-900 rounded-lg overflow-hidden shadow-lg bg-amber-50">
      {/* Map Container */}
      <div className="relative w-full" style={{ backgroundColor: '#d4d4d4' }}>
        <img
          src="/images/map-background.png"
          alt={t('map.title')}
          className="w-full h-auto"
          style={{ display: 'block' }}
        />

        {/* SVG Overlay for settlements */}
        <svg
          className="absolute top-0 left-0 w-full h-full"
          viewBox="0 0 800 1600"
          preserveAspectRatio="xMidYMid meet"
          style={{ pointerEvents: 'none' }}
        >
          {/* Settlement icons */}
          {cities.map(city => getSettlementIcon(city))}

          {/* City name labels */}
          {cities.map(city => getCityLabel(city))}
        </svg>
      </div>

      {/* Legend */}
      <div className="bg-amber-100 p-4 border-t-4 border-amber-900">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <svg width="40" height="40" viewBox="0 0 40 40">
              <PskovIcon x="20" y="20" />
            </svg>
            <span className="font-semibold">{t('map.legend.capital')}</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="40" height="40" viewBox="0 0 40 40">
              <RepublicTownIcon x="20" y="20" />
            </svg>
            <span>{t('map.legend.republic_town')}</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="40" height="40" viewBox="0 0 40 40">
              <RepublicFortressIcon x="20" y="20" />
            </svg>
            <span>{t('map.legend.republic_fortress')}</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="40" height="40" viewBox="0 0 40 40">
              <OrderTownIcon x="20" y="20" />
            </svg>
            <span>{t('map.legend.order_town')}</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="40" height="40" viewBox="0 0 40 40">
              <OrderFortressIcon x="20" y="20" />
            </svg>
            <span>{t('map.legend.order_fortress')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameMap;
