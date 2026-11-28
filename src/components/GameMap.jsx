import React, { useLayoutEffect, useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MAP_IMAGE } from '../imageAssets';
import { MAP_ADJACENCY } from '../game';

/**
 * The campaign map.
 *
 * The background image (1024×1536) already has the roads and a dark diamond
 * marker for every settlement drawn in. Everything else is drawn here in SVG,
 * in the image's own pixel coordinates:
 *   - a ring around each diamond showing who holds it (gold: Republic, black: Order),
 *     with battlements when the settlement has a fortress
 *   - name labels, and small pips for the buildings standing there
 *   - selection, threat and campaign highlights, and arrows that follow the roads
 *
 * The view is cropped to the playable area (the empty forest on the right is cut off),
 * which makes everything about a third larger than showing the whole image.
 */

// Crop of the 1024×1536 image that contains every settlement and label
const VIEW = { x: 0, y: 0, w: 768, h: 1536 };

// Centre of each baked-in marker, in image pixels (measured on the image)
const SETTLEMENTS = {
  gdov: { x: 364, y: 118 },
  skrynnitsy: { x: 595, y: 654 },
  bearhill: { x: 135, y: 773 },
  pechory: { x: 290, y: 1004 },
  izborsk: { x: 459, y: 1043 },
  pskov: { x: 627, y: 990 },
  ostrov: { x: 627, y: 1399 },
};

// The capital's marker is a hexagon (about 147 × 184 px) with the cathedral in it
const PSKOV_HEX = [
  [627, 893], [705, 940], [705, 1040], [627, 1087], [549, 1040], [549, 940],
];

// Road centre-lines, traced from the red roads on the image. Listed from the
// first region to the second; reversed automatically when travelling the other way.
// "order_lands" is where the two roads leave the map towards Livonia.
const ROADS = {
  'gdov|skrynnitsy': [[364, 118], [365, 160], [369, 200], [379, 240], [395, 280], [411, 320], [433, 360], [454, 400], [486, 440], [510, 480], [536, 520], [554, 560], [572, 600], [590, 640], [595, 654]],
  'skrynnitsy|pskov': [[595, 654], [605, 700], [607, 760], [623, 800], [634, 840], [630, 880], [627, 990]],
  'pskov|ostrov': [[627, 990], [628, 1080], [621, 1120], [619, 1160], [614, 1200], [612, 1240], [607, 1280], [612, 1320], [620, 1360], [627, 1399]],
  'pskov|izborsk': [[627, 990], [575, 1000], [532, 1001], [495, 1020], [459, 1043]],
  'izborsk|ostrov': [[459, 1043], [453, 1080], [446, 1120], [457, 1160], [467, 1200], [475, 1240], [510, 1280], [541, 1320], [565, 1365], [627, 1399]],
  'izborsk|pechory': [[459, 1043], [400, 1012], [343, 1000], [290, 1004]],
  'pechory|bearhill': [[290, 1004], [236, 960], [192, 920], [165, 880], [143, 840], [135, 773]],
  'bearhill|order_lands': [[135, 773], [120, 720], [110, 680], [98, 640], [80, 600], [73, 560], [67, 520], [55, 480], [26, 440], [0, 420]],
  'gdov|order_lands': [[364, 118], [359, 80], [364, 40], [365, 0]],
};

const roadBetween = (from, to) => {
  if (ROADS[`${from}|${to}`]) return ROADS[`${from}|${to}`];
  if (ROADS[`${to}|${from}`]) return [...ROADS[`${to}|${from}`]].reverse();
  return [[SETTLEMENTS[from]?.x, SETTLEMENTS[from]?.y], [SETTLEMENTS[to].x, SETTLEMENTS[to].y]];
};

// Shorten a polyline by `cut` px at its end, so an arrowhead stops at the ring
const trimEnd = (pts, cut) => {
  const out = [...pts];
  let remaining = cut;
  while (out.length > 1 && remaining > 0) {
    const [x1, y1] = out[out.length - 2];
    const [x2, y2] = out[out.length - 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len <= remaining) {
      out.pop();
      remaining -= len;
    } else {
      const k = (len - remaining) / len;
      out[out.length - 1] = [x1 + (x2 - x1) * k, y1 + (y2 - y1) * k];
      remaining = 0;
    }
  }
  return out;
};

const trimStart = (pts, cut) => trimEnd([...pts].reverse(), cut).reverse();

// How far to pull an arrow back from a settlement: past the ring, and past the
// label and building pips when the road runs through them (they sit below the marker)
const clearance = (name, pts, atEnd) => {
  if (name === 'order_lands') return 0;
  const [a, b] = atEnd ? [pts[pts.length - 2], pts[pts.length - 1]] : [pts[1], pts[0]];
  const approachingFromBelow = b[1] - a[1] < 0;
  if (approachingFromBelow) return name === 'pskov' ? 190 : 150;
  return name === 'pskov' ? 120 : RING_R + 30;
};

const arrowPath = (from, to) => {
  const pts = roadBetween(from, to);
  return smoothPath(trimStart(trimEnd(pts, clearance(to, pts, true)), clearance(from, pts, false)));
};

// Smooth a polyline into a cubic Bézier path (Catmull-Rom)
const smoothPath = (pts) => {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
};

const RING_R = 54; // just outside the 82 px diamonds
const COLORS = {
  republic: '#d9bf7a',
  republicEdge: '#5c4033',
  order: '#1c1917',
  war: '#9b2f1e',
  good: '#3f6b2f',
  accent: '#8b4513',
};
const FACTION_PIP = {
  noble: '#8f5a80',
  merchant: '#c9963a',
  commoner: '#6f9455',
};

// Battlements: small merlons around a ring
const Merlons = ({ x, y, r, color }) => (
  <g>
    {Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return (
        <rect
          key={i}
          x={-6}
          y={-6}
          width={12}
          height={12}
          fill={color}
          stroke={COLORS.republicEdge}
          strokeWidth={2}
          transform={`translate(${x + Math.cos(a) * (r + 6)}, ${y + Math.sin(a) * (r + 6)}) rotate(${(a * 180) / Math.PI})`}
        />
      );
    })}
  </g>
);

// Teutonic pennant: black cross on a white shield
const OrderBadge = ({ x, y }) => (
  <g transform={`translate(${x}, ${y})`}>
    <path d="M -15,-17 H 15 V 2 Q 15,15 0,21 Q -15,15 -15,2 Z" fill="#f4efe6" stroke="#1c1917" strokeWidth="3" />
    <path d="M -2.5,-12 H 2.5 V -2.5 H 10 V 2.5 H 2.5 V 13 H -2.5 V 2.5 H -10 V -2.5 H -2.5 Z" fill="#1c1917" />
  </g>
);

// Crossed swords, marking where a battle was fought
const BattleBadge = ({ x, y, color }) => (
  <g transform={`translate(${x}, ${y})`} pointerEvents="none">
  <g className="map-pop">
    <circle r="24" fill="#faf3e8" stroke={color} strokeWidth="4" />
    <g stroke={color} strokeWidth="4.5" strokeLinecap="round">
      <line x1="-11" y1="-11" x2="11" y2="11" />
      <line x1="11" y1="-11" x2="-11" y2="11" />
      <line x1="-14" y1="-4" x2="-4" y2="-14" />
      <line x1="14" y1="-4" x2="4" y2="-14" />
    </g>
  </g>
  </g>
);

// Label: region name on a parchment pill, sized to its text
const Label = ({ x, y, text, emphasis }) => {
  const textRef = useRef(null);
  const [width, setWidth] = useState(text.length * 17 + 28);

  useLayoutEffect(() => {
    let alive = true;
    const measure = () => {
      if (alive && textRef.current) setWidth(textRef.current.getBBox().width + 28);
    };
    measure();
    // Web fonts load after first paint: measure again once they are ready
    document.fonts?.ready?.then(measure);
    return () => { alive = false; };
  }, [text]);

  const h = 38;
  return (
    <g pointerEvents="none">
      <rect
        x={x - width / 2}
        y={y - h / 2}
        width={width}
        height={h}
        rx={8}
        fill="#faf3e8"
        fillOpacity="0.93"
        stroke={emphasis ? COLORS.accent : '#8b7355'}
        strokeWidth={emphasis ? 3 : 1.5}
      />
      <text
        ref={textRef}
        x={x}
        y={y + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#2c1810"
        fontSize="27"
        fontWeight="500"
        style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.03em' }}
      >
        {text}
      </text>
    </g>
  );
};

// Buildings standing in a region, as faction-coloured pips
// (circles: secular buildings, diamonds: churches and monasteries)
const buildingPips = (buildings) => {
  const pips = [];
  Object.entries(buildings || {}).forEach(([type, count]) => {
    const faction = type.split('_')[0];
    for (let i = 0; i < (count || 0); i++) {
      pips.push({ color: FACTION_PIP[faction] || '#8b7355', religious: /church|monastery/.test(type) });
    }
  });
  return pips;
};

const MAX_PIPS = 8;
const Pips = ({ x, y, pips }) => {
  if (!pips.length) return null;
  const shown = pips.slice(0, MAX_PIPS);
  const gap = 17;
  const extra = pips.length - shown.length;
  const startX = x - ((shown.length - 1) * gap) / 2 - (extra > 0 ? 14 : 0);
  return (
    <g pointerEvents="none">
      {shown.map((p, i) => {
        const cx = startX + i * gap;
        return p.religious ? (
          <rect key={i} x={cx - 6} y={y - 6} width="12" height="12" transform={`rotate(45 ${cx} ${y})`} fill={p.color} stroke="#2c1810" strokeWidth="2" />
        ) : (
          <circle key={i} cx={cx} cy={y} r="7" fill={p.color} stroke="#2c1810" strokeWidth="2" />
        );
      })}
      {extra > 0 && (
        <text x={startX + MAX_PIPS * gap + 4} y={y + 1} dominantBaseline="middle" fontSize="20" fontWeight="700" fill="#2c1810" stroke="#faf3e8" strokeWidth="4" paintOrder="stroke">
          +{extra}
        </text>
      )}
    </g>
  );
};

/**
 * Props
 *  gameState          the game state (regions are read from it)
 *  selectedRegion     region selected for construction (highlighted)
 *  selectableRegions  regions that can be clicked right now
 *  onRegionClick      called with the region name when a selectable region is clicked
 *  threatTargets      regions the Order may attack (pending Order attack event)
 *  capitalThreatened  the Order holds a region next to Pskov and can besiege the capital
 *  campaign           { target } Republic attack being planned in the Veche
 *  battle             { region, outcome: 'won' | 'lost' } last battle, if any
 */
const GameMap = ({
  gameState,
  selectedRegion = null,
  selectableRegions = [],
  onRegionClick,
  threatTargets = [],
  capitalThreatened = false,
  campaign = null,
  battle = null,
}) => {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(null);
  const regions = gameState?.regions || {};

  // Close the region card when the phase changes
  useEffect(() => { setHovered(null); }, [gameState?.phase]);

  // Where an Order army comes from to reach `target`
  const orderSourceFor = (target) =>
    (MAP_ADJACENCY[target] || []).find((n) => n === 'order_lands' || regions[n]?.controller === 'order');
  // Where a Republic army sets out from to reach `target`
  const republicSourceFor = (target) =>
    (MAP_ADJACENCY[target] || []).find((n) => regions[n]?.controller === 'republic');

  const arrows = [];
  threatTargets.forEach((target) => {
    const from = orderSourceFor(target);
    if (from) arrows.push({ key: `threat-${target}`, d: arrowPath(from, target), marker: 'war', color: COLORS.war });
  });
  if (campaign?.target) {
    const from = republicSourceFor(campaign.target);
    if (from) arrows.push({ key: 'campaign', d: arrowPath(from, campaign.target), marker: 'accent', color: COLORS.accent });
  }

  const regionCard = hovered && regions[hovered] ? (() => {
    const region = regions[hovered];
    const s = SETTLEMENTS[hovered];
    const leftPct = ((s.x - VIEW.x) / VIEW.w) * 100;
    const topPct = ((s.y - VIEW.y) / VIEW.h) * 100;
    const below = topPct < 45;
    const built = Object.entries(region.buildings || {}).filter(([, c]) => c > 0);
    return (
      <div
        role="tooltip"
        className="absolute z-10 w-52 pointer-events-none card-parchment-raised px-3 py-2 text-left"
        style={{
          left: `clamp(0.25rem, calc(${leftPct}% - 6.5rem), calc(100% - 13.25rem))`,
          top: below ? `calc(${topPct}% + 3.2rem)` : undefined,
          bottom: below ? undefined : `calc(${100 - topPct}% + 3.2rem)`,
        }}
      >
        <div className="font-display text-base font-medium text-ink leading-tight">
          {t(`regions.${hovered}`)}
          {hovered === 'pskov' && <span className="ml-1 text-xs text-ink-muted">· {t('map.capital')}</span>}
        </div>
        <div className={`text-xs font-semibold ${region.controller === 'order' ? 'text-war' : 'text-good'}`}>
          {region.controller === 'order' ? t('map.heldByOrder') : t('map.heldByRepublic')}
          {region.fortress && <span className="text-ink-light font-normal"> · {t('map.fortress')}</span>}
        </div>
        {threatTargets.includes(hovered) && <div className="text-xs text-war mt-0.5">{t('map.threatened')}</div>}
        {hovered === 'pskov' && capitalThreatened && <div className="text-xs font-semibold text-war mt-0.5">{t('map.capitalThreatened')}</div>}
        <div className="mt-1 text-xs text-ink-light">
          {built.length === 0 ? (
            <span className="italic text-ink-muted">{t('map.noBuildings')}</span>
          ) : (
            <ul className="space-y-0.5">
              {built.map(([type, count]) => (
                <li key={type} className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: FACTION_PIP[type.split('_')[0]] }} />
                  {t(`buildings.${type}`)}{count > 1 ? ` ×${count}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
        {selectableRegions.includes(hovered) && hovered !== selectedRegion && (
          <div className="mt-1 text-xs text-accent font-semibold">{t('map.clickToBuild')}</div>
        )}
      </div>
    );
  })() : null;

  return (
    <div className="card-parchment overflow-hidden">
      <div className="relative w-full" style={{ backgroundColor: '#d4c4a8' }}>
        <svg
          className="block w-full h-auto"
          viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
          role="group"
          aria-label={t('map.title')}
        >
          <defs>
            <marker id="arrow-war" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={COLORS.war} />
            </marker>
            <marker id="arrow-accent" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={COLORS.accent} />
            </marker>
            {/* Antique grade for the painted map: warmer, less saturated */}
            <filter id="map-grade">
              <feColorMatrix type="matrix" values="0.93 0.12 0.02 0 0.02  0.06 0.9 0.04 0 0.02  0.04 0.08 0.72 0 0.02  0 0 0 1 0" />
            </filter>
            <filter id="soft-edge" x="-20%" y="-50%" width="140%" height="200%">
              <feGaussianBlur stdDeviation="7" />
            </filter>
            <radialGradient id="map-vignette" cx="50%" cy="50%" r="75%">
              <stop offset="65%" stopColor="#3a2a17" stopOpacity="0" />
              <stop offset="100%" stopColor="#3a2a17" stopOpacity="0.35" />
            </radialGradient>
          </defs>

          <g filter="url(#map-grade)">
            <image href={MAP_IMAGE} x="0" y="0" width="1024" height="1536" />
            {/* The painted map has a garbled lake name baked in: paint lake water over it */}
            <ellipse cx="208" cy="195" rx="118" ry="36" fill="rgb(166,181,168)" filter="url(#soft-edge)" />
          </g>
          <text
            x="208"
            y="198"
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="26"
            fontStyle="italic"
            fill="#3d5466"
            fillOpacity="0.85"
            pointerEvents="none"
            style={{ fontFamily: 'var(--font-serif)', letterSpacing: '0.04em' }}
          >
            {t('map.lake')}
          </text>
          <rect x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h} fill="url(#map-vignette)" pointerEvents="none" />

          {/* Arrows along the roads: Order threats and Republic campaigns */}
          {arrows.map((a) => (
            <path
              key={a.key}
              d={a.d}
              fill="none"
              stroke={a.color}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray="18 14"
              markerEnd={`url(#arrow-${a.marker})`}
              className="map-march"
              pointerEvents="none"
            />
          ))}

          {/* Settlements */}
          {Object.entries(SETTLEMENTS).map(([name, { x, y }]) => {
            const region = regions[name];
            if (!region) return null;
            const isOrder = region.controller === 'order';
            const isPskov = name === 'pskov';
            const isSelectable = selectableRegions.includes(name);
            const isSelected = selectedRegion === name;
            const isThreatened = threatTargets.includes(name) || campaign?.target === name;
            const ringColor = isOrder ? COLORS.order : COLORS.republic;
            const pips = buildingPips(region.buildings);
            const labelY = y + (isPskov ? 128 : 88);
            const haloR = isPskov ? 112 : RING_R + 22;
            const activate = () => { if (isSelectable && onRegionClick) onRegionClick(name); };

            return (
              <g
                key={name}
                role={isSelectable ? 'button' : undefined}
                tabIndex={0}
                aria-pressed={isSelectable ? isSelected : undefined}
                aria-label={`${t(`regions.${name}`)}: ${isOrder ? t('map.heldByOrder') : t('map.heldByRepublic')}${region.fortress ? `, ${t('map.fortress')}` : ''}`}
                className={`map-settlement ${isSelectable ? 'cursor-pointer' : ''}`}
                onClick={activate}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } }}
                onMouseEnter={() => setHovered(name)}
                onMouseLeave={() => setHovered((h) => (h === name ? null : h))}
                onFocus={() => setHovered(name)}
                onBlur={() => setHovered((h) => (h === name ? null : h))}
              >
                {/* Generous invisible hit area */}
                <circle className="map-hit" cx={x} cy={y} r={isPskov ? 105 : 75} fill="transparent" />

                {/* Highlights */}
                {isSelected && (
                  <circle cx={x} cy={y} r={haloR} fill={COLORS.accent} fillOpacity="0.2" stroke={COLORS.accent} strokeWidth="6" className="map-pulse" />
                )}
                {isSelectable && !isSelected && (
                  <circle cx={x} cy={y} r={haloR} fill="none" stroke={COLORS.accent} strokeWidth="4" strokeDasharray="10 10" className="map-selectable" />
                )}
                {isThreatened && (
                  <circle cx={x} cy={y} r={haloR + 6} fill={COLORS.war} fillOpacity="0.15" stroke={COLORS.war} strokeWidth="6" strokeDasharray="16 10" className="map-threat" />
                )}
                {/* Siege: a stronger, steady warning around the capital while the Order is at its gates */}
                {isPskov && capitalThreatened && (
                  <circle cx={x} cy={y} r={haloR + 22} fill="none" stroke={COLORS.war} strokeWidth="10" strokeOpacity="0.85" className="map-siege" />
                )}

                {/* Control ring (a hexagon for the capital) */}
                {isPskov ? (
                  <>
                    <polygon
                      points={PSKOV_HEX.map(([px, py]) => `${x + (px - 627) * 1.14},${y + (py - 990) * 1.14}`).join(' ')}
                      fill="none"
                      stroke={COLORS.republicEdge}
                      strokeOpacity="0.55"
                      strokeWidth="13"
                      strokeLinejoin="round"
                    />
                    <polygon
                      points={PSKOV_HEX.map(([px, py]) => `${x + (px - 627) * 1.14},${y + (py - 990) * 1.14}`).join(' ')}
                      fill="none"
                      stroke={ringColor}
                      strokeWidth="8"
                      strokeLinejoin="round"
                    />
                  </>
                ) : (
                  <>
                    {region.fortress && <Merlons x={x} y={y} r={RING_R} color={ringColor} />}
                    <circle cx={x} cy={y} r={RING_R} fill="none" stroke={COLORS.republicEdge} strokeWidth="12" strokeOpacity="0.55" />
                    <circle cx={x} cy={y} r={RING_R} fill="none" stroke={ringColor} strokeWidth="7" />
                    {isOrder && <circle cx={x} cy={y} r={RING_R - 6} fill="none" stroke="#f4efe6" strokeWidth="2" strokeOpacity="0.8" />}
                  </>
                )}
                {isOrder && <OrderBadge x={x + 44} y={y - 44} />}

                <Label x={x} y={labelY} text={t(`regions.${name}`)} emphasis={isSelected} />
                <Pips x={x} y={labelY + 34} pips={pips} />
              </g>
            );
          })}

          {/* Where the last battle was fought */}
          {battle?.region && SETTLEMENTS[battle.region] && (
            <BattleBadge
              x={SETTLEMENTS[battle.region].x - 52}
              y={SETTLEMENTS[battle.region].y - 52}
              color={battle.outcome === 'won' ? COLORS.good : COLORS.war}
            />
          )}
        </svg>

        {regionCard}
      </div>

      {/* Legend */}
      <div className="px-3 py-2 border-t border-parchment-400 bg-parchment-50">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-light">
          <LegendItem label={t('map.legend.republic')}>
            <circle cx="12" cy="12" r="8" fill="none" stroke={COLORS.republicEdge} strokeWidth="5" strokeOpacity="0.55" />
            <circle cx="12" cy="12" r="8" fill="none" stroke={COLORS.republic} strokeWidth="3" />
          </LegendItem>
          <LegendItem label={t('map.legend.order')}>
            <circle cx="12" cy="12" r="8" fill="none" stroke={COLORS.order} strokeWidth="3" />
          </LegendItem>
          <LegendItem label={t('map.legend.fortress')}>
            <circle cx="12" cy="12" r="7" fill="none" stroke={COLORS.republic} strokeWidth="3" />
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i / 8) * Math.PI * 2;
              return <rect key={i} x={12 + Math.cos(a) * 9 - 1.8} y={12 + Math.sin(a) * 9 - 1.8} width="3.6" height="3.6" fill={COLORS.republic} stroke={COLORS.republicEdge} strokeWidth="0.8" />;
            })}
          </LegendItem>
          <LegendItem label={t('map.legend.buildings')}>
            <circle cx="7" cy="12" r="3.5" fill={FACTION_PIP.noble} stroke="#2c1810" strokeWidth="1" />
            <rect x="13" y="9" width="6" height="6" transform="rotate(45 16 12)" fill={FACTION_PIP.commoner} stroke="#2c1810" strokeWidth="1" />
          </LegendItem>
        </div>
      </div>
    </div>
  );
};

const LegendItem = ({ label, children }) => (
  <div className="flex items-center gap-1">
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">{children}</svg>
    <span>{label}</span>
  </div>
);

export default GameMap;
