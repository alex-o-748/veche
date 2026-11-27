import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FACTION_IMAGES } from '../imageAssets';

// Faction pigment for the portrait frame and the divider
const FACTION_ACCENTS = {
  Nobles: '#8f5a80',
  Merchants: '#c9963a',
  Commoners: '#6f9455',
};

/**
 * FactionScreen - shown after faction selection in online mode.
 * Displays the faction portrait, name, and lore with a smooth fade-in.
 */
export const FactionScreen = ({ faction, onContinue, onBack }) => {
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
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.6s ease-in',
      }}
    >
      {/* Backdrop: the faction's own portrait, blurred and darkened, over dark wood */}
      <div className="fixed inset-0 pointer-events-none" style={{ background: '#1d150d' }} aria-hidden="true">
        {image && (
          <img
            src={image}
            alt=""
            className="w-full h-full object-cover scale-110"
            style={{ filter: 'blur(28px) brightness(0.4) sepia(0.4) saturate(0.8)' }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at center, transparent 35%, rgba(12,8,4,0.75) 100%)' }}
        />
      </div>

      {onBack && (
        <button
          onClick={onBack}
          className="absolute top-4 left-4 z-10 px-2 py-1 text-sm text-parchment-400 hover:text-parchment-100 transition-colors cursor-pointer"
        >
          {t('factionScreen.back')}
        </button>
      )}

      <div className="min-h-full flex items-center justify-center py-12">
      <div className="relative flex flex-col items-center gap-6 px-6 max-w-md w-full">
        {/* Faction portrait, framed like a playing card */}
        <div
          className="art-frame w-52 md:w-64 aspect-[2/3]"
          style={{
            borderColor: accent,
            boxShadow: `0 0 0 1px #b08a3e, 0 20px 50px rgba(0,0,0,0.55), 0 0 60px ${accent}40`,
            transform: visible ? 'scale(1)' : 'scale(0.94)',
            transition: 'transform 0.7s ease-out',
          }}
        >
          {image && (
            <img
              src={image}
              alt={t(`factions.${faction}`)}
              className="art w-full h-full object-cover object-top"
            />
          )}
        </div>

        {/* Faction name */}
        <h1
          className="font-display text-4xl md:text-5xl font-bold text-parchment-100 tracking-wide text-center"
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
          className="w-24 h-px"
          style={{
            background: `linear-gradient(to right, transparent, ${accent}, transparent)`,
            opacity: visible ? 1 : 0,
            transform: visible ? 'scaleX(1)' : 'scaleX(0)',
            transition: 'opacity 0.5s ease-out 0.5s, transform 0.5s ease-out 0.5s',
          }}
        />

        {/* Faction description */}
        <p
          className="text-lg text-parchment-200 text-center leading-relaxed max-w-sm"
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
          className="mt-2 px-10 py-3 text-lg btn-accent"
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
    </div>
  );
};

export default FactionScreen;
