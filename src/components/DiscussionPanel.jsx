import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/gameStore';

// Faction color schemes
const FACTION_COLORS = {
  Nobles: {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    name: 'text-purple-800',
    dot: 'bg-purple-500',
  },
  Merchants: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    name: 'text-amber-800',
    dot: 'bg-amber-500',
  },
  Commoners: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    name: 'text-green-800',
    dot: 'bg-green-500',
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

  if (!hasAiPlayers) return null;

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b">
        <h3 className="text-sm font-semibold text-gray-700">
          {t('discussion.title')}
        </h3>
      </div>

      <div
        ref={scrollRef}
        className="p-3 space-y-3 max-h-64 overflow-y-auto"
      >
        {messages.length === 0 && !loading && (
          <p className="text-xs text-gray-400 italic text-center py-2">
            {t('discussion.empty')}
          </p>
        )}

        {messages.map((msg, i) => {
          const colors = FACTION_COLORS[msg.faction] || FACTION_COLORS.Commoners;
          return (
            <div
              key={i}
              className={`${colors.bg} ${colors.border} border rounded-lg p-2.5`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                <span className={`text-xs font-semibold ${colors.name}`}>
                  {t(`factions.${msg.faction}`)}
                </span>
              </div>
              <p className="text-sm text-gray-700 leading-snug">
                {msg.message}
              </p>
            </div>
          );
        })}

        {loading && (
          <div className="space-y-2">
            {aiPlayers.map((isAi, i) => {
              if (!isAi) return null;
              // Don't show loading for factions that already have a message
              if (messages.some((m) => m.playerIndex === i)) return null;
              const faction = factions[i];
              const colors = FACTION_COLORS[faction] || FACTION_COLORS.Commoners;
              return (
                <div
                  key={i}
                  className={`${colors.bg} ${colors.border} border rounded-lg p-2.5 animate-pulse`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                    <span className={`text-xs font-semibold ${colors.name}`}>
                      {t(`factions.${faction}`)}
                    </span>
                    <span className="text-xs text-gray-400 italic ml-1">
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
