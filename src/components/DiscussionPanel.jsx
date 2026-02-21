import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/gameStore';

// Faction color schemes (parchment-themed)
const FACTION_COLORS = {
  Nobles: {
    border: 'border-l-purple-600',
    name: 'text-purple-800',
    dot: 'bg-purple-600',
  },
  Merchants: {
    border: 'border-l-amber-600',
    name: 'text-amber-800',
    dot: 'bg-amber-600',
  },
  Commoners: {
    border: 'border-l-emerald-600',
    name: 'text-emerald-800',
    dot: 'bg-emerald-600',
  },
};

const DiscussionPanel = () => {
  const { t } = useTranslation();
  const messages = useGameStore((s) => s.discussionMessages);
  const loading = useGameStore((s) => s.discussionLoading);
  const aiPlayers = useGameStore((s) => s.aiPlayers);
  const scrollRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const factions = ['Nobles', 'Merchants', 'Commoners'];
  const hasAiPlayers = aiPlayers.some(Boolean);

  return (
    <div className="card-parchment overflow-hidden">
      <div className="px-4 py-2.5 border-b border-parchment-400">
        <h3 className="heading-serif text-sm font-semibold">
          {t('discussion.title')}
        </h3>
      </div>

      <div
        ref={scrollRef}
        className="p-3 space-y-2.5 max-h-80 overflow-y-auto discussion-scroll"
      >
        {messages.length === 0 && !loading && (
          <p className="text-xs text-ink-muted italic text-center py-3">
            {hasAiPlayers
              ? t('discussion.empty')
              : 'No AI players detected'}
          </p>
        )}

        {messages.map((msg, i) => {
          const colors = FACTION_COLORS[msg.faction] || FACTION_COLORS.Commoners;
          return (
            <div
              key={i}
              className={`${colors.border} border-l-3 pl-3 py-2`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                <span className={`text-xs font-semibold ${colors.name}`}>
                  {t(`factions.${msg.faction}`)}
                </span>
              </div>
              <p className="text-sm text-ink-light leading-snug">
                {msg.message}
              </p>
            </div>
          );
        })}

        {loading && (
          <div className="space-y-2">
            {aiPlayers.map((isAi, i) => {
              if (!isAi) return null;
              if (messages.some((m) => m.playerIndex === i)) return null;
              const faction = factions[i];
              const colors = FACTION_COLORS[faction] || FACTION_COLORS.Commoners;
              return (
                <div
                  key={i}
                  className={`${colors.border} border-l-3 pl-3 py-2 animate-pulse`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                    <span className={`text-xs font-semibold ${colors.name}`}>
                      {t(`factions.${faction}`)}
                    </span>
                    <span className="text-xs text-ink-muted italic ml-1">
                      {t('discussion.aiThinking')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DiscussionPanel;
