import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../store/gameStore';

const FACTIONS = ['Nobles', 'Merchants', 'Commoners'];

/**
 * MainMenu Component
 *
 * Entry point for the game - allows choosing between:
 * - Local play with AI configuration (1-3 human players)
 * - Create online room
 * - Join existing online room
 */
export const MainMenu = ({ onStartLocal, onCreateRoom, onJoinRoom }) => {
  const { t, i18n } = useTranslation();
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [showGameSetup, setShowGameSetup] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [aiPlayers, setAiPlayers] = useState([false, false, false]);
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

  const toggleAi = (index) => {
    setAiPlayers(prev => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  const handleStartWithAi = () => {
    // At least one human player required
    if (aiPlayers.every(ai => ai)) return;
    onStartLocal(aiPlayers);
  };

  const setPreset = (preset) => {
    if (preset === 'solo') setAiPlayers([false, true, true]);
    else if (preset === 'duo') setAiPlayers([false, false, true]);
    else setAiPlayers([false, false, false]);
  };

  const humanCount = aiPlayers.filter(ai => !ai).length;

  return (
    <div className="parchment-bg min-h-screen flex items-center justify-center p-4">
      <div className="card-parchment-raised p-8 max-w-md w-full relative">
        {/* Language switcher */}
        <button
          onClick={toggleLanguage}
          className="absolute top-4 right-4 px-3 py-1 text-ink-muted hover:text-ink text-sm font-medium transition-colors"
        >
          {i18n.language === 'en' ? 'RU' : 'EN'}
        </button>

        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="heading-serif text-4xl font-bold text-ink mb-2">
            {t('menu.title')}
          </h1>
          <div className="section-divider" />
          <h2 className="text-lg text-ink-light">{t('menu.subtitle')}</h2>
          <p className="text-ink-muted mt-2 text-sm">
            {t('menu.tagline')}
          </p>
        </div>

        {/* Error display */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-300 text-red-700 rounded">
            {error}
            <button
              onClick={clearError}
              className="ml-2 text-red-500 hover:text-red-700"
            >
              &times;
            </button>
          </div>
        )}

        {/* Game Setup Screen */}
        {showGameSetup ? (
          <div className="space-y-4">
            <button
              onClick={() => setShowGameSetup(false)}
              className="text-ink-muted hover:text-ink mb-2 text-sm"
            >
              {t('menu.back')}
            </button>

            <h3 className="heading-serif text-lg">{t('menu.setupGame')}</h3>

            {/* Quick presets */}
            <div className="flex gap-2">
              <button
                onClick={() => setPreset('solo')}
                className={`flex-1 py-2 px-3 rounded text-sm font-medium border transition-colors ${
                  humanCount === 1 ? 'bg-accent text-white border-accent' : 'border-parchment-400 text-ink-light hover:border-accent'
                }`}
              >
                {t('menu.solo')}
              </button>
              <button
                onClick={() => setPreset('duo')}
                className={`flex-1 py-2 px-3 rounded text-sm font-medium border transition-colors ${
                  humanCount === 2 ? 'bg-accent text-white border-accent' : 'border-parchment-400 text-ink-light hover:border-accent'
                }`}
              >
                {t('menu.duo')}
              </button>
              <button
                onClick={() => setPreset('three')}
                className={`flex-1 py-2 px-3 rounded text-sm font-medium border transition-colors ${
                  humanCount === 3 ? 'bg-accent text-white border-accent' : 'border-parchment-400 text-ink-light hover:border-accent'
                }`}
              >
                {t('menu.threePlayer')}
              </button>
            </div>

            <p className="text-sm text-ink-muted">{t('menu.selectPlayers')}</p>

            {/* Faction toggles */}
            <div className="space-y-3">
              {FACTIONS.map((faction, index) => (
                <div key={faction} className="flex items-center justify-between bg-parchment-50 p-3 rounded-lg border border-parchment-400">
                  <span className="font-medium text-ink">{t(`factions.${faction}`)}</span>
                  <button
                    onClick={() => toggleAi(index)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      aiPlayers[index]
                        ? 'bg-parchment-600 text-white hover:bg-parchment-700'
                        : 'bg-accent text-white hover:bg-accent-hover'
                    }`}
                  >
                    {aiPlayers[index] ? t('menu.ai') : t('menu.human')}
                  </button>
                </div>
              ))}
            </div>

            {/* Validation message */}
            {aiPlayers.every(ai => ai) && (
              <p className="text-red-700 text-sm">{t('menu.needOneHuman')}</p>
            )}

            {/* Start button */}
            <button
              onClick={handleStartWithAi}
              disabled={aiPlayers.every(ai => ai)}
              className="w-full btn-accent py-4 px-6 text-lg"
            >
              {t('menu.startGame')}
            </button>
          </div>
        ) : !showJoinForm ? (
          <div className="space-y-4">
            {/* Local play button */}
            <button
              onClick={() => setShowGameSetup(true)}
              className="w-full btn-accent py-4 px-6 text-lg"
            >
              {t('menu.playLocal')}
            </button>

            <div className="relative">
              <div className="section-divider" />
              <div className="relative flex justify-center text-sm -mt-3">
                <span className="px-2 bg-parchment-50 text-ink-muted">{t('menu.orPlayOnline')}</span>
              </div>
            </div>

            {/* Player name input */}
            <div>
              <label className="block text-sm font-medium text-ink-light mb-1">
                {t('menu.yourName')}
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder={t('menu.enterName')}
                className="w-full p-3 border border-parchment-400 rounded-lg bg-parchment-50 text-ink focus:ring-2 focus:ring-accent focus:border-transparent"
                maxLength={20}
              />
            </div>

            {/* Create room button */}
            <button
              onClick={handleCreateRoom}
              disabled={isLoading}
              className="w-full btn-accent py-3 px-6"
            >
              {isLoading ? t('menu.creating') : t('menu.createGame')}
            </button>

            {/* Join room button */}
            <button
              onClick={() => setShowJoinForm(true)}
              className="w-full btn-secondary py-3 px-6"
            >
              {t('menu.joinGame')}
            </button>
          </div>
        ) : (
          /* Join game form */
          <div className="space-y-4">
            <button
              onClick={() => setShowJoinForm(false)}
              className="text-ink-muted hover:text-ink mb-2 text-sm"
            >
              {t('menu.back')}
            </button>

            <div>
              <label className="block text-sm font-medium text-ink-light mb-1">
                {t('menu.yourName')}
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder={t('menu.enterName')}
                className="w-full p-3 border border-parchment-400 rounded-lg bg-parchment-50 text-ink focus:ring-2 focus:ring-accent focus:border-transparent"
                maxLength={20}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-light mb-1">
                {t('menu.roomCode')}
              </label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder={t('menu.roomCodePlaceholder')}
                className="w-full p-3 border border-parchment-400 rounded-lg bg-parchment-50 text-ink focus:ring-2 focus:ring-accent focus:border-transparent font-mono text-lg text-center"
                maxLength={11}
              />
            </div>

            <button
              onClick={handleJoinRoom}
              disabled={isLoading || !roomCode.trim()}
              className="w-full btn-accent py-3 px-6"
            >
              {isLoading ? t('menu.joining') : t('menu.joinGame')}
            </button>
          </div>
        )}

        {/* Game info */}
        <div className="mt-8 pt-4 border-t border-parchment-400">
          <p className="text-sm text-ink-muted text-center">
            {t('menu.gameInfo')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default MainMenu;
