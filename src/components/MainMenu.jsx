import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toggleLanguage } from '../i18n';
import { useGameStore } from '../store/gameStore';
import { FACTION_CARDS, MAP_IMAGE } from '../imageAssets';
import { DISCORD_URL } from '../config';

const FACTIONS = ['Nobles', 'Merchants', 'Commoners'];

// Faction colour for the card's rule and hover outline
const FACTION_CARD_COLORS = {
  Nobles: 'border-faction-nobles/40 hover:border-faction-nobles',
  Merchants: 'border-faction-merchants/50 hover:border-faction-merchants',
  Commoners: 'border-faction-commoners/40 hover:border-faction-commoners',
};

/**
 * MainMenu Component
 *
 * Entry point for the game - allows choosing between:
 * - Solo play (pick a faction, play vs 2 AI)
 * - Local hotseat (multi-human configuration)
 * - Create online room
 * - Join existing online room
 */
export const MainMenu = ({ savedGame, onContinue, onStartLocal, onStartSolo, onCreateRoom, onJoinRoom }) => {
  const { t, i18n } = useTranslation();
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [showGameSetup, setShowGameSetup] = useState(false);
  const [showMultiplayer, setShowMultiplayer] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [aiPlayers, setAiPlayers] = useState([false, false, false]);
  const error = useGameStore((state) => state.error);
  const clearError = useGameStore((state) => state.clearError);

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
    if (preset === 'duo') setAiPlayers([false, false, true]);
    else setAiPlayers([false, false, false]);
  };

  const humanCount = aiPlayers.filter(ai => !ai).length;

  return (
    <div className="parchment-bg min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* The campaign map as a faded, warm backdrop */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
        <img
          src={MAP_IMAGE}
          alt=""
          className="w-full h-full object-cover opacity-30"
          style={{ filter: 'sepia(0.5) saturate(0.7) blur(1.5px)' }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at center, rgba(244,232,209,0.55) 30%, rgba(110,80,40,0.35) 100%)' }}
        />
      </div>

      <div className="card-parchment-raised p-6 sm:p-8 max-w-xl w-full relative">
        {/* Language switcher */}
        <button
          onClick={toggleLanguage}
          className="absolute top-4 right-4 px-3 py-1 text-ink-muted hover:text-ink text-sm font-medium transition-colors"
        >
          {i18n.language === 'en' ? 'RU' : 'EN'}
        </button>

        {/* Title */}
        <div className="text-center mb-6">
          <p className="font-display text-sm tracking-[0.2em] text-accent mb-1">{t('menu.subtitle')}</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-ink leading-tight">
            {t('menu.title')}
          </h1>
          <div className="section-divider mx-auto max-w-xs" />
          <p className="text-ink-light italic">
            {t('menu.tagline')}
          </p>
        </div>

        {/* Error display */}
        {error && (
          <div className="mb-4 p-3 bg-war/5 border border-war/30 text-war rounded" role="alert">
            {error}
            <button
              onClick={clearError}
              className="ml-2 text-war/70 hover:text-war"
              aria-label={t('lobby.dismiss')}
            >
              &times;
            </button>
          </div>
        )}

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
        ) : showJoinForm ? (
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
        ) : (
          <div className="space-y-4">
            {/* Resume an autosaved local game */}
            {savedGame && (
              <button onClick={onContinue} className="w-full btn-accent py-3 px-6">
                {t('menu.continueGame', { turn: Math.min(savedGame.gameState.turn, 20) })}
              </button>
            )}

            {/* Solo — inline faction picker (one click to play) */}
            <p className="text-sm text-ink-muted text-center">{savedGame ? t('menu.orNewGame') : t('menu.chooseFaction')}</p>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {FACTIONS.map((faction, index) => (
                <button
                  key={faction}
                  onClick={() => onStartSolo(index)}
                  className={`group flex flex-col text-center rounded-lg border-2 bg-parchment-50 overflow-hidden shadow-sm transition-all cursor-pointer hover:-translate-y-0.5 hover:shadow-md ${FACTION_CARD_COLORS[faction]}`}
                >
                  <div className="relative aspect-[3/4] overflow-hidden bg-parchment-800">
                    <img
                      src={FACTION_CARDS[faction]}
                      alt=""
                      width={360}
                      height={480}
                      className="art w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(30,18,8,0.4) 100%)' }} />
                  </div>
                  <div className="px-1.5 sm:px-2 py-2">
                    <div className="heading-serif font-bold text-ink text-[13px] leading-tight sm:text-base break-words">{t(`factions.${faction}`)}</div>
                    <div className="text-[11px] sm:text-xs text-ink-muted leading-snug mt-0.5">{t(`factions.${faction.toLowerCase()}Desc`)}</div>
                  </div>
                </button>
              ))}
            </div>

            {/* Collapsible multiplayer section */}
            <div className="relative">
              <div className="section-divider" />
              <div className="relative flex justify-center text-sm -mt-3">
                <button
                  onClick={() => setShowMultiplayer(!showMultiplayer)}
                  className="px-2 bg-parchment-50 text-ink-muted hover:text-ink transition-colors cursor-pointer"
                >
                  {t('menu.moreWaysToPlay')} {showMultiplayer ? '▴' : '▾'}
                </button>
              </div>
            </div>

            {showMultiplayer && (
              <div className="space-y-3">
                {/* Hotseat button */}
                <button
                  onClick={() => setShowGameSetup(true)}
                  className="w-full btn-secondary py-3 px-6"
                >
                  {t('menu.playLocal')}
                </button>

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
            )}
          </div>
        )}

        {/* Game info */}
        <div className="mt-8 pt-4 border-t border-parchment-400">
          <p className="text-sm text-ink-muted text-center">
            {t('menu.gameInfo')}
          </p>
          <p className="text-sm text-center mt-2">
            <a href={DISCORD_URL}
               target="_blank" rel="noopener noreferrer"
               className="text-ink-muted hover:text-ink transition-colors underline">
              {t('menu.discordFeedback')}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default MainMenu;
