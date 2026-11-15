import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toggleLanguage } from '../i18n';
import { useGameStore } from '../store/gameStore';
import { FACTION_THUMBS } from '../imageAssets';

const FACTIONS = ['Nobles', 'Merchants', 'Commoners'];
const FACTION_BORDER_CLASS = {
  Nobles: 'faction-border-nobles',
  Merchants: 'faction-border-merchants',
  Commoners: 'faction-border-commoners',
};

/**
 * Lobby Component
 *
 * Shows the room lobby where players:
 * - See room code to share
 * - Select their faction (by joining a slot)
 * - Toggle ready status
 * - Wait for all 3 players to be ready
 */
export const Lobby = ({ onSelectFaction, onLeave }) => {
  const { t, i18n } = useTranslation();
  const roomId = useGameStore((state) => state.roomId);
  const room = useGameStore((state) => state.room);
  const playerId = useGameStore((state) => state.playerId);
  const toggleReady = useGameStore((state) => state.toggleReady);
  const error = useGameStore((state) => state.error);
  const clearError = useGameStore((state) => state.clearError);
  const [copied, setCopied] = useState(false);

  const players = room?.players || [null, null, null];
  const allReady = players.every((p) => p !== null && p.ready);
  const playerCount = players.filter((p) => p !== null).length;

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  return (
    <div className="parchment-bg min-h-screen flex items-center justify-center p-4">
      <div className="card-parchment-raised p-6 sm:p-8 max-w-lg w-full relative">
        {/* Language switcher */}
        <button
          onClick={toggleLanguage}
          className="absolute top-4 right-4 px-3 py-1 text-ink-muted hover:text-ink text-sm font-medium transition-colors"
        >
          {i18n.language === 'en' ? 'RU' : 'EN'}
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="heading-serif text-3xl font-bold text-ink mb-3">{t('lobby.title')}</h1>

          {/* Room code */}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <span className="text-ink-muted">{t('lobby.roomCodeLabel')}</span>
            <span className="font-mono text-2xl font-bold text-accent tracking-wider whitespace-nowrap">
              {roomId}
            </span>
            <button
              onClick={copyRoomCode}
              className="p-1 text-ink-muted hover:text-ink transition-colors"
              title={t('lobby.copyCode')}
              aria-label={t('lobby.copyCode')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            {copied && <span className="text-xs text-good" role="status">{t('lobby.copied')}</span>}
          </div>
          <p className="text-sm text-ink-muted mt-1">
            {t('lobby.shareCode')}
          </p>
        </div>

        {/* Error display */}
        {error && (
          <div className="mb-4 p-3 bg-war/5 border border-war/30 text-war rounded flex items-start justify-between gap-2" role="alert">
            <span>{error}</span>
            <button onClick={clearError} className="text-war/70 hover:text-war" aria-label={t('lobby.dismiss')}>
              ✕
            </button>
          </div>
        )}

        {/* Player slots */}
        <div className="space-y-3 mb-6">
          {FACTIONS.map((faction, index) => {
            const player = players[index];
            const isMe = playerId === index;
            const isAvailable = player === null;

            return (
              <div
                key={faction}
                className={`vote-column ${FACTION_BORDER_CLASS[faction]} ${
                  player ? '' : 'border-dashed opacity-90'
                } ${isMe ? 'ring-2 ring-accent/60' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <img
                    src={FACTION_THUMBS[faction]}
                    alt=""
                    width={44}
                    height={44}
                    className={`w-11 h-11 rounded-full object-cover border border-parchment-400 flex-shrink-0 art-chip ${player ? '' : 'grayscale'}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-ink flex items-center gap-2">
                      {t(`factions.${faction}`)}
                      {isMe && <span className="tag-chip bg-accent text-white">{t('player.you')}</span>}
                    </div>
                    <div className="text-sm text-ink-muted">
                      {t(`factions.${faction.toLowerCase()}Desc`)}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    {player ? (
                      <div>
                        <div className="font-medium text-ink">{player.name}</div>
                        <div className={`text-sm whitespace-nowrap ${player.ready ? 'text-good font-semibold' : 'text-ink-muted'}`}>
                          {player.ready ? t('lobby.ready') : t('lobby.notReady')}
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-ink-muted italic">
                        {t('lobby.waitingForPlayer')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Join button for unoccupied slots */}
                {isAvailable && playerId === null && (
                  <button
                    onClick={() => onSelectFaction(index)}
                    className="mt-3 w-full py-2 btn-accent"
                  >
                    {t('lobby.joinAs', { faction: t(`factions.${faction}`) })}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Ready button */}
        {playerId !== null && (
          <div className="mb-4">
            <button
              onClick={toggleReady}
              className={`w-full py-3 text-lg ${players[playerId]?.ready ? 'btn-secondary' : 'btn-good'}`}
            >
              {players[playerId]?.ready ? t('lobby.cancelReady') : t('lobby.imReady')}
            </button>
          </div>
        )}

        {/* Status */}
        <div className="text-center text-ink-muted mb-4" aria-live="polite">
          {playerCount < 3 ? (
            <span>{t('lobby.waitingForPlayers', { count: 3 - playerCount })}</span>
          ) : allReady ? (
            <span className="text-good font-semibold">{t('lobby.allReady')}</span>
          ) : (
            <span>{t('lobby.waitingAllReady')}</span>
          )}
        </div>

        {/* Leave button */}
        <button onClick={onLeave} className="w-full py-2 btn-secondary">
          {t('lobby.leaveRoom')}
        </button>
      </div>
    </div>
  );
};

export default Lobby;
