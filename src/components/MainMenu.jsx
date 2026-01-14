import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/gameStore';

/**
 * MainMenu Component
 *
 * Entry point for the game - allows choosing between:
 * - Local (hotseat) play
 * - Create online room
 * - Join existing online room
 */
export const MainMenu = ({ onStartLocal, onCreateRoom, onJoinRoom }) => {
  const { t, i18n } = useTranslation();
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const error = useGameStore((state) => state.error);
  const clearError = useGameStore((state) => state.clearError);

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'en' ? 'ru' : 'en');
  };

  const handleCreateRoom = async () => {
    setIsLoading(true);
    clearError();
    try {
      await onCreateRoom(playerName || 'Player');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!roomCode.trim()) return;
    setIsLoading(true);
    clearError();
    try {
      await onJoinRoom(roomCode.toUpperCase(), playerName || 'Player');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-amber-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full relative">
        {/* Language switcher */}
        <button
          onClick={toggleLanguage}
          className="absolute top-4 right-4 px-3 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded font-medium text-sm transition-colors"
        >
          {i18n.language === 'en' ? 'RU' : 'EN'}
        </button>

        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-amber-800 mb-2">
            {t('menu.title')}
          </h1>
          <h2 className="text-xl text-amber-600">{t('menu.subtitle')}</h2>
          <p className="text-gray-500 mt-2 text-sm">
            {t('menu.tagline')}
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

        {/* Main menu options */}
        {!showJoinForm ? (
          <div className="space-y-4">
            {/* Local play button */}
            <button
              onClick={onStartLocal}
              className="w-full py-4 px-6 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-lg transition-colors"
            >
              {t('menu.playLocal')}
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">{t('menu.orPlayOnline')}</span>
              </div>
            </div>

            {/* Player name input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('menu.yourName')}
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder={t('menu.enterName')}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                maxLength={20}
              />
            </div>

            {/* Create room button */}
            <button
              onClick={handleCreateRoom}
              disabled={isLoading}
              className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg font-semibold transition-colors"
            >
              {isLoading ? t('menu.creating') : t('menu.createGame')}
            </button>

            {/* Join room button */}
            <button
              onClick={() => setShowJoinForm(true)}
              className="w-full py-3 px-6 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors"
            >
              {t('menu.joinGame')}
            </button>
          </div>
        ) : (
          /* Join game form */
          <div className="space-y-4">
            <button
              onClick={() => setShowJoinForm(false)}
              className="text-gray-500 hover:text-gray-700 mb-2"
            >
              {t('menu.back')}
            </button>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('menu.yourName')}
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder={t('menu.enterName')}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                maxLength={20}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('menu.roomCode')}
              </label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder={t('menu.roomCodePlaceholder')}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent font-mono text-lg text-center"
                maxLength={11}
              />
            </div>

            <button
              onClick={handleJoinRoom}
              disabled={isLoading || !roomCode.trim()}
              className="w-full py-3 px-6 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded-lg font-semibold transition-colors"
            >
              {isLoading ? t('menu.joining') : t('menu.joinGame')}
            </button>
          </div>
        )}

        {/* Game info */}
        <div className="mt-8 pt-4 border-t border-gray-200">
          <p className="text-sm text-gray-500 text-center">
            {t('menu.gameInfo')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default MainMenu;
