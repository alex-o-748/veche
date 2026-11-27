import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MAP_IMAGE } from '../imageAssets';

/**
 * HowToPlay - rules overview shown before the first game, and accessible via help button.
 *
 * When used as a full screen (isModal=false): dark background with "Start" button.
 * When used as a modal (isModal=true): overlay with close button.
 */
export const HowToPlay = ({ onContinue, isModal = false }) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Escape closes the rules modal
  useEffect(() => {
    if (!isModal) return;
    const onKey = (e) => { if (e.key === 'Escape') onContinue(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isModal, onContinue]);

  const sections = [
    {
      title: t('howToPlay.goalTitle'),
      items: [
        t('howToPlay.goal1'),
        t('howToPlay.goal2'),
        t('howToPlay.goal3'),
      ],
    },
    {
      title: t('howToPlay.phasesTitle'),
      items: [
        t('howToPlay.phase1'),
        t('howToPlay.phase2'),
        t('howToPlay.phase3'),
        t('howToPlay.phase4'),
      ],
    },
    {
      title: t('howToPlay.actionsTitle'),
      items: [
        t('howToPlay.action1'),
        t('howToPlay.action2'),
        t('howToPlay.action3'),
        t('howToPlay.action4'),
      ],
    },
    {
      title: t('howToPlay.factionsTitle'),
      items: [
        t('howToPlay.faction1'),
        t('howToPlay.faction2'),
        t('howToPlay.faction3'),
      ],
    },
  ];

  const content = (
    <div
      className="max-w-lg w-full mx-auto px-6"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
      }}
    >
      <h2 id="how-to-play-title" className={`font-display text-3xl md:text-4xl font-bold text-center mb-6 tracking-wide ${
        isModal ? 'text-ink' : 'text-parchment-100'
      }`}>
        {t('howToPlay.title')}
      </h2>

      <div className="space-y-5">
        {sections.map((section, si) => (
          <div key={si}>
            <h3 className={`font-display text-lg font-medium tracking-wide mb-1.5 ${
              isModal ? 'text-accent' : 'text-[#d9bf7a]'
            }`}>
              {section.title}
            </h3>
            <ul className="space-y-1.5">
              {section.items.map((item, ii) => (
                <li key={ii} className={`text-[15px] leading-relaxed flex gap-2 ${
                  isModal ? 'text-ink-light' : 'text-parchment-200'
                }`}>
                  <span className={`flex-shrink-0 mt-0.5 ${isModal ? 'text-gold' : 'text-[#b08a3e]'}`} aria-hidden="true">&#9670;</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-8 text-center">
        <button
          onClick={onContinue}
          className="px-10 py-3 text-lg btn-accent"
        >
          {isModal ? t('howToPlay.close') : t('howToPlay.startPlaying')}
        </button>
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onContinue(); }}
        style={{
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.2s ease-in',
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="how-to-play-title"
          className="card-parchment-raised p-6 max-h-[85vh] overflow-y-auto rounded-xl"
        >
          {content}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.4s ease-in',
      }}
    >
      {/* Backdrop: the campaign map, darkened, behind the rules */}
      <div className="fixed inset-0 pointer-events-none" style={{ background: '#1d150d' }} aria-hidden="true">
        <img
          src={MAP_IMAGE}
          alt=""
          className="w-full h-full object-cover"
          style={{ filter: 'blur(3px) brightness(0.28) sepia(0.6)' }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at center, rgba(20,13,7,0.35) 30%, rgba(12,8,4,0.85) 100%)' }}
        />
      </div>
      {/* min-h-full + centring: short content is centred, tall content starts at the top and scrolls */}
      <div className="relative min-h-full flex items-center justify-center py-8">
        {content}
      </div>
    </div>
  );
};

export default HowToPlay;
