import React from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/gameStore';

const FACTIONS = ['Nobles', 'Merchants', 'Commoners'];
const FACTION_COLORS = {
  Nobles: 'bg-purple-100 border-purple-400 text-purple-800',
  Merchants: 'bg-yellow-100 border-yellow-400 text-yellow-800',
  Commoners: 'bg-green-100 border-green-400 text-green-800',
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

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'en' ? 'ru' : 'en');
  };

  const players = room?.players || [null, null, null];
  const allReady = players.every((p) => p !== null && p.ready);
  const playerCount = players.filter((p) => p !== null).length;

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId);
  };

  return (
    <div className="parchment-bg min-h-screen flex items-center justify-center p-4">
      <div className="card-parchment-raised p-8 max-w-lg w-full relative">
        {/* Language switcher */}
        <button
          onClick={toggleLanguage}
          className="absolute top-4 right-4 px-3 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded font-medium text-sm transition-colors"
        >
          {i18n.language === 'en' ? 'RU' : 'EN'}
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-amber-800 mb-2">{t('lobby.title')}</h1>

          {/* Room code */}
          <div className="flex items-center justify-center gap-2">
            <span className="text-gray-500">{t('lobby.roomCodeLabel')}</span>
            <span className="font-mono text-2xl font-bold text-blue-600">
              {roomId}
            </span>
            <button
              onClick={copyRoomCode}
              className="p-1 text-gray-400 hover:text-gray-600"
              title="Copy room code"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {t('lobby.shareCode')}
          </p>
        </div>

        {/* Error display */}
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
            <button
              onClick={clearError}
              className="ml-2 text-red-500 hover:text-red-700"
            >
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
                className={`p-4 rounded-lg border-2 ${
                  player
                    ? FACTION_COLORS[faction]
                    : 'bg-gray-50 border-gray-200 border-dashed'
                } ${isMe ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold flex items-center gap-2">
                      {t(`factions.${faction}`)}
                      {isMe && (
                        <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded">
                          {t('lobby.you')}
                        </span>
                      )}
                    </div>
                    <div className="text-sm opacity-75">
                      {t(`factions.${faction.toLowerCase()}Desc`)}
                    </div>
                  </div>

                  <div className="text-right">
                    {player ? (
                      <div>
                        <div className="font-medium">{player.name}</div>
                        <div
                          className={`text-sm ${
                            player.ready ? 'text-green-600' : 'text-gray-400'
                          }`}
                        >
                          {player.ready ? t('lobby.ready') : t('lobby.notReady')}
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-400 italic">
                        {t('lobby.waitingForPlayer')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Join button for unoccupied slots */}
                {isAvailable && playerId === null && (
                  <button
                    onClick={() => onSelectFaction(index)}
                    className="mt-3 w-full py-2 bg-blue-500 hover:bg-blue-600 text-white rounded font-medium transition-colors"
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
              className={`w-full py-3 rounded-lg font-semibold text-lg transition-colors ${
                players[playerId]?.ready
                  ? 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {players[playerId]?.ready ? t('lobby.cancelReady') : t('lobby.imReady')}
            </button>
          </div>
        )}

        {/* Status */}
        <div className="text-center text-gray-500 mb-4">
          {playerCount < 3 ? (
            <span>{t('lobby.waitingForPlayers', { count: 3 - playerCount })}</span>
          ) : allReady ? (
            <span className="text-green-600 font-semibold">
              {t('lobby.allReady')}
            </span>
          ) : (
            <span>{t('lobby.waitingAllReady')}</span>
          )}
        </div>

        {/* Leave button */}
        <button
          onClick={onLeave}
          className="w-full py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
        >
          {t('lobby.leaveRoom')}
        </button>
      </div>
    </div>
  );
};

export default Lobby;
