import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

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
      <h2 className={`text-2xl md:text-3xl font-bold text-center mb-6 tracking-wide ${
        isModal ? 'text-ink' : 'text-parchment-100'
      }`}>
        {t('howToPlay.title')}
      </h2>

      <div className="space-y-5">
        {sections.map((section, si) => (
          <div key={si}>
            <h3 className={`text-sm font-semibold uppercase tracking-wider mb-2 ${
              isModal ? 'text-ink-light' : 'text-parchment-400'
            }`}>
              {section.title}
            </h3>
            <ul className="space-y-1.5">
              {section.items.map((item, ii) => (
                <li key={ii} className={`text-sm leading-relaxed flex gap-2 ${
                  isModal ? 'text-ink-muted' : 'text-parchment-300'
                }`}>
                  <span className="flex-shrink-0 mt-0.5">&#8226;</span>
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
          className={`px-8 py-3 rounded-lg text-lg font-semibold transition-all cursor-pointer ${
            isModal
              ? 'btn-accent'
              : 'bg-parchment-100/10 hover:bg-parchment-100/20 text-parchment-200 border border-parchment-400/30 hover:border-parchment-400/50'
          }`}
        >
          {isModal ? t('howToPlay.close') : t('howToPlay.startPlaying')}
        </button>
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        onClick={(e) => { if (e.target === e.currentTarget) onContinue(); }}
        style={{
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.2s ease-in',
        }}
      >
        <div className="card-parchment-raised p-6 max-h-[85vh] overflow-y-auto rounded-xl">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950 overflow-y-auto py-8"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.4s ease-in',
      }}
    >
      {content}
    </div>
  );
};

export default HowToPlay;
