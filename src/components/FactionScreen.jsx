import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FACTION_IMAGES } from '../imageAssets';

const FACTION_ACCENTS = {
  Nobles: {
    border: 'border-purple-400/60',
    glow: 'shadow-purple-300/30',
    text: 'text-purple-200',
    divider: 'bg-purple-300/40',
  },
  Merchants: {
    border: 'border-yellow-400/60',
    glow: 'shadow-yellow-300/30',
    text: 'text-yellow-200',
    divider: 'bg-yellow-300/40',
  },
  Commoners: {
    border: 'border-green-400/60',
    glow: 'shadow-green-300/30',
    text: 'text-green-200',
    divider: 'bg-green-300/40',
  },
};

/**
 * FactionScreen - shown after faction selection in online mode.
 * Displays the faction portrait, name, and lore with a smooth fade-in.
 */
export const FactionScreen = ({ faction, onContinue }) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger fade-in on mount
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const accent = FACTION_ACCENTS[faction] || FACTION_ACCENTS.Nobles;
  const image = FACTION_IMAGES[faction];
  const descKey = `factions.${faction.toLowerCase()}Desc`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.6s ease-in',
      }}
    >
      {/* Subtle radial vignette */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)',
        }}
      />

      <div className="relative flex flex-col items-center gap-6 px-6 max-w-md w-full">
        {/* Faction portrait */}
        <div
          className={`w-56 h-56 md:w-64 md:h-64 rounded-full overflow-hidden border-4 ${accent.border} shadow-2xl ${accent.glow}`}
          style={{
            transform: visible ? 'scale(1)' : 'scale(0.92)',
            transition: 'transform 0.7s ease-out',
          }}
        >
          {image && (
            <img
              src={image}
              alt={t(`factions.${faction}`)}
              className="w-full h-full object-cover"
            />
          )}
        </div>

        {/* Faction name */}
        <h1
          className="text-4xl md:text-5xl font-bold text-parchment-100 tracking-wide text-center"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(12px)',
            transition: 'opacity 0.6s ease-out 0.3s, transform 0.6s ease-out 0.3s',
          }}
        >
          {t(`factions.${faction}`)}
        </h1>

        {/* Decorative divider */}
        <div
          className={`w-24 h-px ${accent.divider}`}
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'scaleX(1)' : 'scaleX(0)',
            transition: 'opacity 0.5s ease-out 0.5s, transform 0.5s ease-out 0.5s',
          }}
        />

        {/* Faction description */}
        <p
          className={`text-lg ${accent.text} text-center leading-relaxed max-w-sm`}
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 0.6s ease-out 0.55s, transform 0.6s ease-out 0.55s',
          }}
        >
          {t(descKey)}
        </p>

        {/* Continue button */}
        <button
          onClick={onContinue}
          className="mt-4 px-8 py-3 rounded-lg text-lg font-semibold
                     bg-parchment-100/10 hover:bg-parchment-100/20
                     text-parchment-200 border border-parchment-400/30
                     hover:border-parchment-400/50 transition-all cursor-pointer"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(10px)',
            transition: 'opacity 0.5s ease-out 0.8s, transform 0.5s ease-out 0.8s, background-color 0.2s, border-color 0.2s',
          }}
        >
          {t('factionScreen.continue')}
        </button>
      </div>
    </div>
  );
};

export default FactionScreen;
