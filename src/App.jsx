import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toggleLanguage } from './i18n';
import { fmtCoins } from './format';
import { DISCORD_URL } from './config';
import { CoinIcon, coinify } from './components/Coin';
import { AnimatedNumber, DeltaChips, PhaseBanner, BattleReport } from './components/Fx';
import { playBell, playHorn, playClink, isSoundOn, setSoundOn, onSoundChange } from './sound';
import { FACTION_THUMBS, FACTION_CARDS, BUILDING_IMAGES, EVENT_IMAGES, EQUIPMENT_IMAGES, EXPEDITION_IMAGE, getEventImage, getEventImageFocus, getEquipmentImage } from './imageAssets';

// Import Zustand store
import { useGameStore } from './store/gameStore';
import { loadSave, restoreSave } from './store/save';

// Import UI components
import { MainMenu, Lobby, FactionScreen, GameMap, DiscussionPanel, HowToPlay } from './components';

// Import discussion service
import { requestDiscussion } from './services/discussion';

// The rules engine: the only place game rules live (shared with the online server)
import {
  // Constants
  EXPEDITION_COST,
  EXPEDITION_MAX_PER_GAME,
  ATTACK_COST_PER_PLAYER,
  DEFENSE_COST_PER_PLAYER,
  GLORY_PER_COIN,
  getRules,
  getMerchantVpMultiplier,

  // Actions
  ActionTypes,
  applyAction,

  // Region logic
  getValidRepublicAttackTargets,
  getOrderAttackTargets,
  isPskovThreatened,

  // Combat
  getOrderTurnBonus,
  getAttackStrengthLabel,
  getOrderDefenseStrength,
  calculatePlayerStrength as calculatePlayerStrengthPure,
  calculateTotalStrength as calculateTotalStrengthPure,
  getVictoryChance as getVictoryChancePure,

  // Events
  eventDeck,
  getDefenders,
  getVotingResult as getVotingResultPure,
  getAuctionResult as getAuctionResultPure,
  getParticipationResult as getParticipationResultPure,

  // Score, buildings and Veche funding
  calculateVictoryPoints as calculateVictoryPointsPure,
  calculateBuildingVictoryPoints,
  getGameResult as getGameResultPure,
  getAvailableBuildings as getAvailableBuildingsPure,
  getAttackFunding,
  getFortressFunding,

  // AI
  decideConstruction,
  decideEventVote,
  decideAttackVote,
  decideFortressVote,
} from './game';

const PskovGame = ({ onMenu }) => {
  // Translation hook
  const { t, i18n } = useTranslation();

  // Get state and actions from Zustand store
  const gameState = useGameStore((state) => state.gameState);
  const setGameState = useGameStore((state) => state.setGameState);
  const initLocalGame = useGameStore((state) => state.initLocalGame);
  const mode = useGameStore((state) => state.mode);
  const playerId = useGameStore((state) => state.playerId);
  const sendAction = useGameStore((state) => state.sendAction);
  const aiPlayers = useGameStore((state) => state.aiPlayers);
  const setDiscussionLoading = useGameStore((state) => state.setDiscussionLoading);
  const addDiscussionMessages = useGameStore((state) => state.addDiscussionMessages);
  const clearDiscussion = useGameStore((state) => state.clearDiscussion);

  // Help modal state
  const [showHelp, setShowHelp] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Online games: the region this player is building in (everyone builds at once)
  const [onlineRegion, setOnlineRegion] = useState('pskov');

  // Income notification state (shown briefly at top of construction phase)
  const incomeAdvancingRef = useRef(false);

  // Goes up whenever a new game starts (the turn counter goes back), so the
  // "+n / −n" markers do not show the jump from one game's totals to the next
  const gameEpochRef = useRef({ epoch: 0, turn: 0 });
  if (gameState && gameState.turn < gameEpochRef.current.turn) gameEpochRef.current.epoch += 1;
  if (gameState) gameEpochRef.current.turn = gameState.turn;
  const gameEpoch = gameEpochRef.current.epoch;


  // Region name in the grammatical forms the Russian strings need
  // (nominative, prepositional "в Пскове", accusative "атаковать Медвежью голову").
  // English uses the same name for all three.
  const regionArgs = (name) => ({
    region: t(`regions.${name}`),
    regionIn: t(`regionsIn.${name}`),
    regionAcc: t(`regionsAcc.${name}`),
  });

  // Active-effect descriptions are English strings set by the event cards; map them to keys
  const EFFECT_KEYS = {
    'Merchant trading weakness': 'merchantWeakness',
    'Trade route disruption': 'tradeDisruption',
    'Noble corruption investigation penalty': 'nobleCorruption',
    'Uprising strength penalty': 'uprising',
    'Embassy refusal strength penalty': 'embassyRefusalStrength',
    'Embassy refusal income penalty': 'embassyRefusalIncome',
    'Embassy reception boost': 'embassyBoost',
    'Holy relics morale boost': 'relicsMorale',
    'Religious cynicism penalty': 'religiousCynicism',
    'Izhora allied forces': 'izhoraAllies',
    'Izhora hostility': 'izhoraHostility',
    'Famine weakens commoners': 'famine',
    'Heretical discord': 'heresy',
    'Mild plague effects despite isolation': 'mildPlague',
    'Severe plague weakens population': 'severePlague',
  };
  const getEffectDescription = (effect) => {
    const key = EFFECT_KEYS[effect.description];
    return key ? t(`effects.${key}`) : effect.description;
  };

  // Order attacks scale with the turn, so the card's printed strength is not the real one
  const getOrderAttackInfo = (event) => {
    const strength = event.orderStrength + getOrderTurnBonus(gameState.turn);
    const level = getAttackStrengthLabel(strength); // 'weak' | 'normal' | 'strong'
    return { strength, level };
  };

  // Helper functions to get translated event content
  const getEventName = (event) => {
    if (event.type === 'order_attack') {
      return t(`game.orderAttackTitle.${getOrderAttackInfo(event).level}`);
    }
    const key = `eventCards.${event.id}.name`;
    const translated = t(key);
    return translated !== key ? translated : event.name;
  };

  const getEventDescription = (event) => {
    const key = `eventCards.${event.id}.description`;
    const translated = t(key);
    return translated !== key ? translated : event.description;
  };

  const getEventQuestion = (event) => {
    if (!event.question) return null;
    const key = `eventCards.${event.id}.question`;
    const translated = t(key);
    return translated !== key ? translated : event.question;
  };

  const getOptionName = (eventId, optionId) => {
    const key = `eventCards.${eventId}.${optionId}`;
    const translated = t(key);
    return translated !== key ? translated : null;
  };

  const getOptionCostText = (eventId, optionId) => {
    const key = `eventCards.${eventId}.${optionId}_cost`;
    const translated = t(key);
    return translated !== key ? translated : null;
  };

  const getOptionEffectText = (eventId, optionId) => {
    const key = `eventCards.${eventId}.${optionId}_effect`;
    const translated = t(key);
    return translated !== key ? translated : null;
  };


  // Initialize game on mount (only once)
  useEffect(() => {
    const store = useGameStore.getState();
    if (!store.gameState) {
      store.initLocalGame();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency - run only on mount

  // Auto-advance from resources phase — calculate income and skip to construction
  useEffect(() => {
    if (!gameState || gameState.phase !== 'resources') return;
    if (gameState.turn > 20 || gameState.gameOver) return;
    // Online mode: server handles resources auto-skip
    if (mode === 'online') return;
    if (incomeAdvancingRef.current) return;

    // Income shows up as rising "+n" markers on the player cards
    incomeAdvancingRef.current = true;

    // Auto-advance after a brief tick so React can process state
    const timer = setTimeout(() => {
      nextPhase();
      incomeAdvancingRef.current = false;
    }, 50);

    return () => {
      clearTimeout(timer);
      incomeAdvancingRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.phase, gameState?.turn, gameState?.gameOver, mode]);


  // ---- Sounds: the veche bell, the Order's horn, and the end of the game ----
  const [soundOn, setSoundOnState] = useState(isSoundOn());
  useEffect(() => onSoundChange(setSoundOnState), []);
  const soundCueRef = useRef({ phase: null, horn: null, ended: false });
  useEffect(() => {
    if (!gameState) return;
    const cue = soundCueRef.current;
    const ended = Boolean(gameState.gameOver) || gameState.turn > 20;
    if (ended && !cue.ended) {
      cue.ended = true;
      if (gameState.gameOver) playHorn(); else playBell();
      return;
    }
    if (!ended) cue.ended = false;
    if (gameState.phase === 'veche' && cue.phase !== 'veche') playBell();
    cue.phase = gameState.phase;
    const ev = gameState.currentEvent;
    const hornKey = ev?.type === 'order_attack' && gameState.eventImageRevealed ? `${gameState.turn}-${ev.id}` : null;
    if (hornKey && cue.horn !== hornKey) playHorn();
    if (hornKey) cue.horn = hornKey;
  }, [gameState?.phase, gameState?.currentEvent?.id, gameState?.eventImageRevealed, gameState?.gameOver, gameState?.turn]);

  // Reveal the event art after a short suspense beat, but never before the image
  // has downloaded and decoded, so it does not pop in mid-animation
  useEffect(() => {
    if (!gameState?.currentEvent || gameState?.eventImageRevealed) return;
    let cancelled = false;
    const src = getEventImage(gameState.currentEvent.id);
    const imageReady = src
      ? (() => { const img = new Image(); img.src = src; return img.decode().catch(() => {}); })()
      : Promise.resolve();
    const suspense = new Promise((resolve) => setTimeout(resolve, 1500));
    Promise.all([imageReady, suspense]).then(() => {
      if (cancelled) return;
      // Use functional update to avoid stale closure
      setGameState(prev => (prev ? { ...prev, eventImageRevealed: true } : prev));
    });
    return () => { cancelled = true; };
  }, [gameState?.currentEvent, gameState?.eventImageRevealed, setGameState]);

  // During the Veche, fetch the next event card's art so it is cached when drawn
  useEffect(() => {
    // The draw order indexes the shared deck, the same on the server
    if (!gameState || gameState.phase !== 'veche') return;
    const order = gameState.shuffledEventOrder || [];
    const next = order[gameState.eventDrawIndex];
    if (next === undefined) return; // the deck reshuffles: next card unknown
    const src = getEventImage(eventDeck[next]?.id);
    if (src) new Image().src = src;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.phase, gameState?.eventDrawIndex]);

  // AI player automation
  useEffect(() => {
    if (!gameState || mode !== 'local' || gameState.gameOver || gameState.turn > 20) return;

    // --- Construction phase: auto-play AI turns ---
    if (gameState.phase === 'construction' && aiPlayers[gameState.currentPlayer] && !gameState.constructionReady[gameState.currentPlayer]) {
      const timer = setTimeout(() => {
        const currentState = useGameStore.getState().gameState;
        if (!currentState || currentState.phase !== 'construction') return;
        const aiIndex = currentState.currentPlayer;
        if (currentState.constructionReady[aiIndex]) return;
        if (!aiPlayers[aiIndex]) return;

        const decision = decideConstruction(currentState, aiIndex);

        setGameState(prev => {
          if (!prev || prev.phase !== 'construction' || prev.currentPlayer !== aiIndex) return prev;
          // Play the AI's choices through the rules engine; anything it refuses is skipped
          let state = prev;
          const play = (action) => {
            const { newState, error } = applyAction(state, action, aiIndex);
            if (!error) state = newState;
          };
          if (decision.buildingType && decision.regionName) {
            play({ type: ActionTypes.SELECT_REGION, regionName: decision.regionName });
            play({ type: ActionTypes.BUILD_BUILDING, buildingType: decision.buildingType });
          }
          if (decision.equipmentType) play({ type: ActionTypes.BUY_EQUIPMENT, item: decision.equipmentType });
          if (decision.sendExpedition) play({ type: ActionTypes.SEND_EXPEDITION });
          // Done: mark ready and pass to the next player
          play({ type: ActionTypes.NEXT_PLAYER });
          return state;
        });
      }, 800); // Short delay so human can see AI is taking a turn
      return () => clearTimeout(timer);
    }

    // --- Events phase: auto-vote for AI players ---
    // Once the card is face up, the AI factions decide one after another, like
    // councillors speaking in turn (the effect re-runs after each vote)
    const eventCardUp = gameState.eventImageRevealed || !getEventImage(gameState.currentEvent?.id);
    if (gameState.phase === 'events' && gameState.currentEvent && !gameState.eventResolved && eventCardUp) {
      const nextAi = aiPlayers.findIndex((isAi, i) => isAi && gameState.eventVotes[i] === null);

      if (nextAi >= 0) {
        const timer = setTimeout(() => {
          const currentState = useGameStore.getState().gameState;
          if (!currentState || currentState.phase !== 'events' || !currentState.currentEvent || currentState.eventResolved) return;

          setGameState(prev => {
            if (!prev || !prev.currentEvent || prev.eventVotes[nextAi] !== null) return prev;
            const vote = decideEventVote(prev, nextAi, prev.currentEvent);
            return applyAction(prev, { type: ActionTypes.VOTE_EVENT, vote }, nextAi).newState;
          });
        }, 900);
        return () => clearTimeout(timer);
      }
    }

    // --- Veche phase: auto-vote for attacks ---
    if (gameState.phase === 'veche' && gameState.attackPlanning === 'planning') {
      const nextAi = aiPlayers.findIndex((isAi, i) => isAi && gameState.attackVotes[i] === null);

      if (nextAi >= 0) {
        const timer = setTimeout(() => {
          setGameState(prev => {
            if (!prev || prev.attackPlanning !== 'planning' || prev.attackVotes[nextAi] !== null) return prev;
            const vote = decideAttackVote(prev, nextAi);
            return applyAction(prev, { type: ActionTypes.VOTE_ATTACK, vote }, nextAi).newState;
          });
        }, 700);
        return () => clearTimeout(timer);
      }
    }

    // --- Veche phase: auto-vote for fortress ---
    if (gameState.phase === 'veche' && gameState.fortressPlanning === 'planning') {
      const nextAi = aiPlayers.findIndex((isAi, i) => isAi && gameState.fortressVotes[i] === null);

      if (nextAi >= 0) {
        const timer = setTimeout(() => {
          setGameState(prev => {
            if (!prev || prev.fortressPlanning !== 'planning' || prev.fortressVotes[nextAi] !== null) return prev;
            const vote = decideFortressVote(prev, nextAi);
            return applyAction(prev, { type: ActionTypes.VOTE_FORTRESS, vote }, nextAi).newState;
          });
        }, 700);
        return () => clearTimeout(timer);
      }
    }
  }, [
    gameState?.phase,
    gameState?.currentPlayer,
    gameState?.currentEvent,
    gameState?.eventResolved,
    gameState?.eventVotes,
    gameState?.eventImageRevealed,
    gameState?.attackPlanning,
    gameState?.attackVotes,
    gameState?.fortressPlanning,
    gameState?.fortressVotes,
    gameState?.gameOver,
    gameState?.turn,
    aiPlayers,
    mode,
    setGameState,
  ]);

  // --- Solo mode: auto-advance construction phase when all players are done ---
  useEffect(() => {
    if (!gameState || mode !== 'local' || gameState.phase !== 'construction') return;
    if (!aiPlayers.some(Boolean)) return; // only in solo mode
    if (!gameState.constructionReady.every(Boolean)) return; // not all done yet

    const timer = setTimeout(() => {
      nextPhase();
    }, 400);
    return () => clearTimeout(timer);
  }, [gameState?.phase, gameState?.constructionReady, aiPlayers, mode]);

  // --- AI Discussion: trigger after all AI players have voted on events ---
  useEffect(() => {
    if (!gameState || gameState.phase !== 'events' || !gameState.currentEvent || gameState.eventResolved) return;
    if (gameState.currentEvent.type === 'immediate') return;

    // Check if all AI players have voted
    const allAiVoted = aiPlayers.every((isAi, i) => !isAi || gameState.eventVotes[i] !== null);
    if (!allAiVoted) return;

    // Check if any AI players exist (no discussion needed if all human)
    const hasAi = aiPlayers.some(Boolean);
    if (!hasAi) return;

    // Don't re-trigger if already loading or if messages already exist for this event
    const store = useGameStore.getState();
    if (store.discussionLoading) return;
    if (store.discussionMessages.length > 0) return;

    setDiscussionLoading(true);
    requestDiscussion({
      gameState,
      event: gameState.currentEvent,
      votes: gameState.eventVotes,
      aiPlayers,
      language: i18n.language,
    }).then((messages) => {
      if (messages.length > 0) {
        addDiscussionMessages(messages);
      }
      setDiscussionLoading(false);
    });
  }, [
    gameState?.phase,
    gameState?.currentEvent?.id,
    gameState?.eventVotes,
    gameState?.eventResolved,
    aiPlayers,
  ]);

  // --- Clear discussion when entering a new events phase or leaving events ---
  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase !== 'events') {
      const store = useGameStore.getState();
      if (store.discussionMessages.length > 0 || store.discussionLoading) {
        clearDiscussion();
      }
    }
  }, [gameState?.phase, gameState?.turn]);

  // Show loading state while initializing
  if (!gameState) {
    return (
      <div className="parchment-bg min-h-screen flex items-center justify-center">
        <div className="heading-serif text-xl text-ink">{t('game.loading')}</div>
      </div>
    );
  }

  const phases = ['resources', 'construction', 'events', 'veche'];
  const phaseNames = {
    resources: t('phases.resources'),
    construction: t('phases.construction'),
    events: t('phases.events'),
    veche: t('phases.veche'),
  };

  // ---- Rules: everything below goes through the shared rules engine (src/game) ----
  const rules = getRules(gameState);

  // Local games apply an action through the engine; online games send it to the server,
  // which runs the same engine. `actor` is the player the action is for (validated).
  const dispatch = (action, actor = null) => {
    if (mode === 'online') {
      sendAction(action);
      return;
    }
    setGameState(prev => {
      if (!prev) return prev;
      const { newState, error } = applyAction(prev, action, actor);
      if (error) {
        console.warn(`${action.type}: ${error}`);
        return prev;
      }
      return newState;
    });
  };

  // Military calculation functions — delegate to the engine
  const calculatePlayerStrength = (playerIndex) => {
    return calculatePlayerStrengthPure(gameState.players[playerIndex], gameState.activeEffects);
  };

  const calculateTotalPskovStrength = (participants) => {
    return calculateTotalStrengthPure(gameState.players, participants, gameState.activeEffects);
  };

  const getVictoryChance = (strengthDiff) => getVictoryChancePure(strengthDiff);

  // ---- Outcomes: the engine reports what happened as { key, params }; we translate it ----
  const outcomeParams = (params = {}) => {
    const out = { ...params };
    if (params.region) Object.assign(out, regionArgs(params.region));
    if (params.building) out.building = t(`buildings.${params.building}`);
    if (Array.isArray(params.buildings)) {
      out.buildings = params.buildings.map((b) => t(`buildings.${b}`)).join(', ') || t('battle.nothingDestroyed');
    }
    if (params.faction) out.faction = t(`factions.${params.faction}`);
    if (Array.isArray(params.factions)) out.factions = params.factions.map((f) => t(`factions.${f}`)).join(' & ');
    return out;
  };
  const describeOutcome = (outcome) => {
    if (!outcome) return null;
    const text = t(outcome.key, outcomeParams(outcome.params));
    return outcome.then ? `${text} ${describeOutcome(outcome.then)}` : text;
  };
  // What just happened, in the player's language (older saves only have the English line)
  const outcomeText = gameState.lastOutcome ? describeOutcome(gameState.lastOutcome) : gameState.lastEventResult;

  // Glory each contributor earned in the battle just fought: chips on the battle report
  const gloryChips = (br) => {
    if (!br?.glory || !br.participants?.length) return undefined;
    return br.participants.map((i) => ({ faction: gameState.players[i].faction, amount: br.glory }));
  };

  // ---- Veche: campaigns and fortresses ----
  const initiateAttack = (targetRegion) => dispatch({ type: ActionTypes.INITIATE_ATTACK, targetRegion });
  const voteOnAttack = (index, vote) => dispatch({ type: ActionTypes.VOTE_ATTACK, vote }, index);
  const executeAttack = () => dispatch({ type: ActionTypes.EXECUTE_ATTACK });
  const cancelAttack = () => dispatch({ type: ActionTypes.CANCEL_ATTACK });

  const initiateFortressBuild = (targetRegion) => dispatch({ type: ActionTypes.INITIATE_FORTRESS, targetRegion });
  const voteOnFortress = (index, vote) => dispatch({ type: ActionTypes.VOTE_FORTRESS, vote }, index);
  const executeFortressBuild = () => dispatch({ type: ActionTypes.EXECUTE_FORTRESS });
  const cancelFortress = () => dispatch({ type: ActionTypes.CANCEL_FORTRESS });

  // ---- Events ----
  const voteOnEvent = (playerIndex, vote) => {
    if (mode === 'online') {
      // Only allow voting for own faction
      if (playerIndex !== playerId) {
        console.warn('Cannot vote for another player');
        return;
      }
      sendAction({ type: ActionTypes.VOTE_EVENT, vote });

      // Once everyone has voted, ask the server to resolve the event
      setTimeout(() => {
        const currentState = useGameStore.getState().gameState;
        if (currentState?.eventVotes?.every(v => v !== null) && !currentState.eventResolved) {
          sendAction({ type: ActionTypes.RESOLVE_EVENT });
        }
      }, 500); // Wait for server to broadcast updated votes
      return;
    }
    dispatch({ type: ActionTypes.VOTE_EVENT, vote }, playerIndex);
  };

  const getVotingResult = () => getVotingResultPure(gameState.eventVotes, gameState.currentEvent?.defaultOption);
  const getParticipationResult = () => getParticipationResultPure(gameState.eventVotes);
  const getAuctionResult = () => getAuctionResultPure(gameState.eventVotes);

  const resolveEvent = () => dispatch({ type: ActionTypes.RESOLVE_EVENT });

  // ---- Score ----
  const calculateVictoryPoints = (player) => calculateVictoryPointsPure(player, rules);
  const getGameResult = () => getGameResultPure(gameState);

  // ---- Construction ----
  // Online, each player picks their own region (everyone builds at once); locally it is shared state
  const selectedRegion = mode === 'online' ? onlineRegion : gameState.selectedRegion;

  const getAvailableBuildings = (playerIndex = gameState.currentPlayer) =>
    getAvailableBuildingsPure(gameState, playerIndex, selectedRegion);

  const buildBuilding = (buildingType) => {
    playClink();
    if (mode === 'online') {
      sendAction({ type: ActionTypes.BUILD_BUILDING, buildingType, regionName: selectedRegion });
      return;
    }
    dispatch({ type: ActionTypes.BUILD_BUILDING, buildingType }, gameState.currentPlayer);
  };

  const nextPhase = () => {
    // The game is over: no more phases
    if (gameState.gameOver || gameState.turn > 20) return;
    dispatch({ type: ActionTypes.NEXT_PHASE });
  };

  const nextPlayer = () => dispatch({ type: ActionTypes.NEXT_PLAYER });

  const setConstructionReady = () => dispatch({ type: ActionTypes.SET_CONSTRUCTION_READY }, mode === 'online' ? playerId : gameState.currentPlayer);

  const buyItem = (playerIndex, item) => {
    playClink();
    if (mode === 'online' && playerIndex !== playerId) {
      console.warn('Cannot buy for another player');
      return;
    }
    dispatch({ type: ActionTypes.BUY_EQUIPMENT, item }, playerIndex);
  };

  // Send a trading expedition (Merchants only)
  const sendExpeditionAction = (playerIndex) => {
    playClink();
    if (mode === 'online' && playerIndex !== playerId) return;
    dispatch({ type: ActionTypes.SEND_EXPEDITION }, playerIndex);
  };

  const resetGame = () => {
    // Use the store's initLocalGame to reset to initial state
    initLocalGame(aiPlayers, { ruleset: gameState.ruleset });
  };

  const isGameOver = Boolean(gameState.gameOver) || gameState.turn > 20;
  const isSolo = mode === 'local' && aiPlayers.some(Boolean);
  // The council discussion is written by the AI factions, so it only appears when there are some
  const hasAiCouncil = isSolo;
  const isPlanningVote = gameState.attackPlanning === 'planning' || gameState.fortressPlanning === 'planning';

  // Hot-seat construction: everyone has ended their turn and play waits for "Continue"
  const hotseatConstructionDone =
    mode === 'local' && !isSolo && gameState.phase === 'construction' && gameState.constructionReady.every(Boolean);

  // The one thing to do next on this screen, shown in the action bar.
  // { hint, label, onClick } — no onClick means the button is shown disabled.
  const getPrimaryAction = () => {
    if (isGameOver) return null;

    if (gameState.phase === 'construction') {
      const current = gameState.players[gameState.currentPlayer];
      if (mode === 'online') {
        return gameState.constructionReady[playerId]
          ? { hint: t('game.waitingForPlayers'), label: t('game.readyCheck') }
          : { hint: t('action.constructionOnline'), label: t('game.imDone'), onClick: setConstructionReady };
      }
      if (aiPlayers[gameState.currentPlayer]) {
        return { hint: t('action.aiBuilding', { faction: t(`factions.${current.faction}`) }), label: t('game.endTurn') };
      }
      if (hotseatConstructionDone) {
        return { hint: t('action.constructionDone'), label: t('action.continueToEvents'), onClick: nextPhase };
      }
      return {
        hint: t('action.construction', { faction: t(`factions.${current.faction}`) }),
        label: isSolo ? t('game.endTurn') : t('game.nextPlayerTurn'),
        onClick: nextPlayer,
      };
    }

    if (gameState.phase === 'events' && gameState.currentEvent) {
      const ev = gameState.currentEvent;
      if (gameState.eventResolved) {
        return { hint: t('action.eventDone'), label: t('action.continueToVeche'), onClick: nextPhase };
      }
      const label =
        ev.type === 'immediate' ? t('events.applyEffect')
        : ev.type === 'voting' ? t('events.applyDecision')
        : ev.type === 'order_attack' ? t('game.resolveAttack')
        : t('events.applyResult');
      // The card is still being revealed: nothing to do yet
      if (!gameState.eventImageRevealed && getEventImage(ev.id)) return null;
      const allDecided =
        ev.type === 'immediate' ? true
        : ev.type === 'voting' ? Boolean(getVotingResult())
        : ev.type === 'auction' ? Boolean(getAuctionResult())
        : Boolean(getParticipationResult());
      if (mode === 'online') {
        // The server applies the outcome once everyone has voted
        return { hint: allDecided ? t('game.autoApplying') : t('action.vote'), label };
      }
      return allDecided
        ? { hint: ev.type === 'immediate' ? t('action.immediate') : t('action.allVoted'), label, onClick: resolveEvent }
        : { hint: t('action.vote'), label };
    }

    if (gameState.phase === 'veche') {
      return isPlanningVote
        ? { hint: t('action.finishVote'), label: t('veche.endAssembly') }
        : { hint: t('action.veche'), label: t('veche.endAssembly'), onClick: nextPhase };
    }
    return null;
  };
  const primaryAction = getPrimaryAction();

  // ---- Battle forecasts (same formulas as src/game/combat.js) ----
  const strengthOf = (indices) => calculateTotalPskovStrength(indices);
  const chanceFor = (ours, theirs) => getVictoryChance(ours - theirs);
  const votersFor = (votes) => votes.map((v, i) => (v === true ? i : -1)).filter((i) => i >= 0);

  // The report for the battle just fought, if this screen's result came from one
  const battleOutcome = (br) => {
    if (!br || br.pskovStrength === undefined) return null;
    const won = br.type === 'defense_victory' || br.type === 'attack_victory';
    const lost = br.type === 'defense_defeat' || br.type === 'attack_defeat';
    return won ? 'won' : lost ? 'lost' : null;
  };

  // ---- Region selection for construction (region buttons and the map) ----
  const selectRegion = (regionName) => {
    if (mode === 'online') {
      setOnlineRegion(regionName);
      return;
    }
    dispatch({ type: ActionTypes.SELECT_REGION, regionName });
  };

  // ---- What the map should show for the current moment of the game ----
  const getMapProps = () => {
    const props = {};
    const phase = gameState.phase;
    if (isGameOver) return props;

    // Construction: the builder can pick a region on the map
    const builderIndex = mode === 'online' ? playerId : gameState.currentPlayer;
    const builder = gameState.players[builderIndex];
    const builderCanAct = phase === 'construction' && builder && !hotseatConstructionDone
      && !(mode === 'local' && aiPlayers[gameState.currentPlayer])
      && !(mode === 'online' && gameState.constructionReady[playerId]);
    if (builderCanAct) {
      props.selectedRegion = selectedRegion;
      props.selectableRegions = Object.entries(gameState.regions)
        .filter(([name, region]) => region.controller === 'republic' && (builder.faction !== 'Merchants' || name === 'pskov'))
        .map(([name]) => name);
      props.onRegionClick = selectRegion;
    }

    // Order attack pending: show where the Order may strike (the resolver's own rule)
    const ev = gameState.currentEvent;
    if (phase === 'events' && ev?.type === 'order_attack' && !gameState.eventResolved) {
      props.threatTargets = getOrderAttackTargets(gameState.regions, rules);
    }

    // Siege: the Order holds a region next to Pskov, so the capital itself can be attacked
    props.capitalThreatened = isPskovThreatened(gameState.regions, rules);

    // Veche: the campaign being planned
    if (phase === 'veche' && gameState.attackPlanning === 'planning' && gameState.attackTarget) {
      props.campaign = { target: gameState.attackTarget };
    }

    // The battle just fought (its result text is still on screen)
    const br = gameState.battleResult;
    if (outcomeText && br?.region && (phase === 'events' || phase === 'veche')) {
      props.battle = {
        region: br.region,
        outcome: br.type === 'defense_victory' || br.type === 'attack_victory' ? 'won' : 'lost',
      };
    }
    return props;
  };

  // ---- Shared layout for the per-faction voting columns (events and Veche) ----
  const FACTION_BORDER_CLASS = {
    Nobles: 'faction-border-nobles',
    Merchants: 'faction-border-merchants',
    Commoners: 'faction-border-commoners',
  };
  const voteColumnClass = (index) =>
    `vote-column ${FACTION_BORDER_CLASS[gameState.players[index].faction]} ${
      mode === 'online' && index === playerId ? 'ring-2 ring-accent/60' : ''
    }`;
  const renderVoteHeader = (index) => {
    const player = gameState.players[index];
    return (
      <div className="flex items-center gap-2 mb-2">
        <img
          src={FACTION_THUMBS[player.faction]}
          alt=""
          width={28}
          height={28}
          className="w-7 h-7 rounded-full object-cover border border-parchment-400 flex-shrink-0 art-chip"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1 flex-wrap text-sm font-semibold text-ink">
            {t(`factions.${player.faction}`)}
            {mode === 'online' && index === playerId && <span className="tag-chip bg-accent text-white">{t('player.you')}</span>}
            {mode === 'local' && aiPlayers[index] && <span className="tag-chip bg-parchment-200 text-ink-light">{t('player.ai')}</span>}
          </div>
          <div className="text-xs text-ink-muted lining-nums tabular-nums">{fmtCoins(player.money, i18n.language)}<CoinIcon /></div>
        </div>
      </div>
    );
  };

  return (
    <div className="parchment-bg min-h-screen">

      <PhaseBanner turn={gameState.turn} phase={gameState.phase} hidden={isGameOver} />

      {/* ===== HEADER BAR ===== */}
      <header className="game-header sticky top-0 z-30 px-3 sm:px-4 py-2">
        <div className="max-w-screen-2xl mx-auto flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Title (hidden on phones to leave room for the turn counter) */}
          <h1 className="hidden sm:block font-display text-xl font-bold tracking-wide flex-shrink-0" style={{ color: '#e6d3a8' }}>
            {t('game.title')}
          </h1>

          {/* Turn + Progress */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-parchment-300 text-sm font-medium whitespace-nowrap">
              {t('game.turn', { turn: Math.min(gameState.turn, 20) })}
            </span>
            <div className="progress-bar-track w-12 sm:w-16">
              <div className="progress-bar-fill" style={{ width: `${(Math.min(gameState.turn, 20) / 20) * 100}%` }} />
            </div>
          </div>

          {/* Phase Pills (resources phase is auto-skipped, so hide it).
              Below xl they get their own row so the header never overflows. */}
          {!isGameOver && (
            <div className="order-last w-full xl:order-none xl:w-auto xl:flex-1 flex items-center gap-1.5 justify-center">
              {(() => {
                const visiblePhases = phases.filter(p => p !== 'resources');
                const displayPhase = gameState.phase === 'resources' ? 'construction' : gameState.phase;
                return visiblePhases.map((phase, index) => {
                  const isCurrent = phase === displayPhase;
                  const isPast = index < visiblePhases.indexOf(displayPhase);
                  return (
                    <div key={phase} className="flex items-center gap-1.5">
                      {index > 0 && <div className="w-3 h-px bg-parchment-600" />}
                      <div
                        aria-current={isCurrent ? 'step' : undefined}
                        className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition-all ${
                          isCurrent
                            ? 'bg-parchment-50 text-ink font-semibold shadow-sm'
                            : isPast
                            ? 'bg-parchment-600/40 text-parchment-300'
                            : 'text-parchment-500'
                        }`}
                      >
                        {phaseNames[phase]}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}

          {/* Right-pinned controls */}
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 ml-auto">
            {/* Sound on/off */}
            <button
              onClick={() => setSoundOn(!soundOn)}
              aria-pressed={soundOn}
              aria-label={soundOn ? t('sound.mute') : t('sound.unmute')}
              title={soundOn ? t('sound.mute') : t('sound.unmute')}
              className="w-7 h-7 rounded-full text-parchment-400 hover:text-parchment-50 transition-colors flex items-center justify-center"
            >
              <svg viewBox="0 0 24 24" className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" stroke="none" />
                {soundOn ? (
                  <>
                    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                    <path d="M18.5 5.5a9 9 0 0 1 0 13" />
                  </>
                ) : (
                  <path d="m16 9 6 6m0-6-6 6" />
                )}
              </svg>
            </button>

            {/* Help Button */}
            <button
              onClick={() => setShowHelp(true)}
              className="w-7 h-7 rounded-full border border-parchment-500 text-parchment-400 hover:text-parchment-50 hover:border-parchment-300 text-xs font-bold transition-colors flex items-center justify-center"
              title={t('howToPlay.title')}
              aria-label={t('howToPlay.title')}
            >
              {t('howToPlay.helpButton')}
            </button>

            {/* Language Toggle */}
            <button
              onClick={toggleLanguage}
              className="px-2 py-1 text-parchment-400 hover:text-parchment-50 text-xs font-medium transition-colors"
            >
              {i18n.language === 'en' ? 'RU' : 'EN'}
            </button>

            {/* Discord (also linked from the main menu, so dropped on phones) */}
            <a
              href={DISCORD_URL}
              target="_blank" rel="noopener noreferrer"
              className="hidden sm:inline-block px-2 py-1 text-parchment-400 hover:text-parchment-50 text-xs font-medium transition-colors"
              title={t('menu.discordFeedback')}
            >
              Discord
            </a>

            {/* Menu */}
            <button
              onClick={() => (mode === 'online' && !isGameOver ? setShowLeaveConfirm(true) : onMenu())}
              className="px-2 sm:px-3 py-1.5 text-parchment-300 hover:text-parchment-50 text-sm font-medium transition-colors"
            >
              {t('game.menu')}
            </button>
          </div>
        </div>
      </header>

      {/* ===== 2-COLUMN BODY ===== */}
      {/* Layout. Phones/tablets: one column — player cards, phase content, then effects and map.
          Desktop: a grid with players and map on the left and the phase content on the right. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-start max-w-screen-2xl mx-auto px-3 sm:px-4 pt-3 pb-6">

        <section className="lg:col-start-1 lg:row-start-1" aria-label={t('game.victoryPoints')}>
          {/* Player cards: who is who, money, strength and score at a glance */}
          {/* Three across on phones and tablets (compact on phones), stacked on desktop */}
          <div className="grid grid-cols-3 lg:grid-cols-1 gap-2">
            {gameState.players.map((player, index) => {
              const isYou = mode === 'online' && index === playerId;
              const isAi = mode === 'local' && aiPlayers[index];
              const isTakingTurn = mode === 'local' && gameState.phase === 'construction'
                && index === gameState.currentPlayer && !gameState.constructionReady[index];
              const factionBorder = player.faction === 'Nobles' ? 'faction-border-nobles'
                : player.faction === 'Merchants' ? 'faction-border-merchants'
                : 'faction-border-commoners';

              return (
                <div
                  key={index}
                  className={`card-parchment ${factionBorder} px-2 py-2 sm:px-3 sm:py-2.5 flex flex-col items-center text-center gap-1 sm:flex-row sm:text-left sm:gap-3 min-w-0 transition-shadow ${
                    isTakingTurn || isYou ? 'ring-2 ring-accent/60' : ''
                  }`}
                >
                  <img
                    src={FACTION_THUMBS[player.faction]}
                    alt=""
                    width={40}
                    height={40}
                    className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover border border-parchment-400 flex-shrink-0 art-chip"
                  />
                  <div className="min-w-0 max-w-full sm:flex-1">
                    <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-1.5 flex-wrap">
                      <span className="text-xs sm:text-sm font-semibold text-ink truncate max-w-full">{t(`factions.${player.faction}`)}</span>
                      {isYou && <span className="tag-chip bg-accent text-white">{t('player.you')}</span>}
                      {isAi && <span className="tag-chip bg-parchment-200 text-ink-light">{t('player.ai')}</span>}
                      {isTakingTurn && <span className="tag-chip bg-parchment-600 text-white">{t('player.turn')}</span>}
                    </div>
                    <div className="mt-0.5 flex items-center justify-center sm:justify-start gap-x-2 sm:gap-x-3 gap-y-0.5 flex-wrap text-xs text-ink-light lining-nums tabular-nums">
                      <span title={t('game.money')} className="relative">
                        <AnimatedNumber value={player.money} format={(n) => fmtCoins(n, i18n.language)} /><CoinIcon />
                        <DeltaChips
                          epoch={gameEpoch}
                          value={player.money}
                          className="left-full ml-1 -top-1 flex flex-col items-start gap-0.5 z-10"
                          render={(d) => <>{d > 0 ? '+' : '−'}{fmtCoins(Math.abs(d), i18n.language)}<CoinIcon /></>}
                        />
                      </span>
                      <span title={t('game.strength')}>⚔ {calculatePlayerStrength(index)}</span>
                      <span className="hidden sm:inline" title={t('game.buildings')}>⌂ {player.improvements}</span>
                      {(player.weapons > 0 || player.armor > 0) && (
                        <span className="hidden sm:flex items-center gap-0.5">
                          {player.weapons > 0 && <img src={getEquipmentImage('weapons', player.faction)} alt={t('game.weapons')} title={t('game.weapons')} className="w-4 h-4 object-cover rounded" />}
                          {player.armor > 0 && <img src={getEquipmentImage('armor', player.faction)} alt={t('game.armor')} title={t('game.armor')} className="w-4 h-4 object-cover rounded" />}
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    className="flex items-baseline gap-1 sm:block sm:text-right flex-shrink-0"
                    title={[
                      t('game.victoryPoints'),
                      t('glory.vpBuildings', { count: Math.round(calculateBuildingVictoryPoints(player, rules) * 10) / 10 }),
                      player.bonusPoints > 0 && t('glory.vpBonus', { count: Math.round(player.bonusPoints * 10) / 10 }),
                      rules.glory && t('glory.vpGlory', { count: player.glory || 0 }),
                    ].filter(Boolean).join('\n')}
                  >
                    <div className="relative text-sm sm:text-lg font-bold text-ink leading-none lining-nums tabular-nums">
                      <AnimatedNumber value={calculateVictoryPoints(player)} format={(n) => Math.round(n)} />
                      <DeltaChips
                        epoch={gameEpoch}
                        value={calculateVictoryPoints(player)}
                        className="right-full mr-1 top-0 flex flex-col items-end gap-0.5 z-10"
                        render={(d) => <>{d > 0 ? '+' : '−'}{Math.abs(d)} {t('player.vp')}</>}
                      />
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-ink-muted">{t('player.vp')}</div>
                  </div>
                </div>
              );
            })}
          </div>

        </section>

        {/* Phase content */}
        <main className="min-w-0 space-y-4 lg:col-start-2 lg:row-start-1 lg:row-span-2">

          {/* AI construction turn: show who is building instead of an empty column */}
          {gameState.phase === 'construction' && !isGameOver && mode === 'local' && aiPlayers[gameState.currentPlayer] && (() => {
            const current = gameState.players[gameState.currentPlayer];
            return (
              <div className="card-parchment-raised p-5 phase-enter flex items-center gap-4" aria-live="polite">
                <img src={FACTION_THUMBS[current.faction]} alt="" width={56} height={56} className="w-14 h-14 rounded-full object-cover border border-parchment-400 flex-shrink-0 art-chip" />
                <div>
                  <h3 className="heading-serif text-lg">{t('action.aiBuildingTitle', { faction: t(`factions.${current.faction}`) })}</h3>
                  <p className="text-sm text-ink-muted animate-pulse">{t('game.aiThinking')}</p>
                </div>
              </div>
            );
          })()}

          {/* Hot-seat: everyone has built this turn */}
          {hotseatConstructionDone && !isGameOver && (
            <div className="card-parchment-raised p-5 phase-enter">
              <h3 className="heading-serif text-lg mb-1">{t('game.constructionComplete')}</h3>
              <p className="text-sm text-ink-muted">{t('action.constructionDone')}</p>
            </div>
          )}

      {/* ===== CONSTRUCTION PHASE ===== */}
      {gameState.phase === 'construction' && !isGameOver && !hotseatConstructionDone && !(mode === 'local' && aiPlayers[gameState.currentPlayer]) && (() => {
        const activePlayerIndex = mode === 'online' ? playerId : gameState.currentPlayer;
        const activePlayer = gameState.players[activePlayerIndex];

        return (
        <div className="card-parchment-raised p-5 phase-enter">
          <h3 className="heading-serif text-lg mb-4">
            {t('game.constructionTurn', { faction: t(`factions.${activePlayer.faction}`) })}
          </h3>

          {/* Region Selection - horizontal row */}
          <div className="mb-4">
            <h4 className="font-display text-base font-medium text-ink-light tracking-wide mb-2">{t('game.selectRegion')}</h4>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(gameState.regions).map(([regionName, region]) => {
                const isMerchantRestricted = activePlayer.faction === 'Merchants' && regionName !== 'pskov';
                const isOrderControlled = region.controller === 'order';
                const isAvailable = !isMerchantRestricted && !isOrderControlled;

                return (
                  <button
                    key={regionName}
                    onClick={() => selectRegion(regionName)}
                    aria-pressed={selectedRegion === regionName}
                    disabled={!isAvailable}
                    className={`px-3 py-1.5 rounded text-sm border transition-colors ${
                      selectedRegion === regionName
                        ? 'bg-accent text-white border-accent'
                        : isAvailable
                        ? 'border-parchment-400 text-ink-light hover:border-accent hover:bg-parchment-100'
                        : 'border-parchment-300 text-ink-muted cursor-not-allowed opacity-50'
                    }`}
                  >
                    {t(`regions.${regionName}`)}
                    {isOrderControlled && <span className="text-xs ml-1">{t('game.orderControlled')}</span>}
                  </button>
                );
              })}
            </div>
            {activePlayer.faction === 'Merchants' && selectedRegion !== 'pskov' && (
              <p className="text-sm text-accent mt-2">{t('game.merchantsPskovOnly')}</p>
            )}
          </div>

          <div className="section-divider" />

          {/* Buildings + Equipment side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Available Buildings */}
            <div>
              <h4 className="font-display text-base font-medium text-ink-light tracking-wide mb-2">{t('game.availableBuildings', regionArgs(selectedRegion))}</h4>
              <div className="space-y-2">
                {getAvailableBuildings(activePlayerIndex).map(building => (
                  <button
                    key={building.type}
                    onClick={() => buildBuilding(building.type)}
                    disabled={
                      !building.canBuild ||
                      activePlayer.money < building.cost ||
                      gameState.constructionActions[activePlayerIndex].improvement
                    }
                    className="action-tile text-sm"
                  >
                    {BUILDING_IMAGES[building.type] && (
                      <img
                        src={BUILDING_IMAGES[building.type]}
                        alt={building.name}
                        className="w-16 h-16 rounded-md object-cover flex-shrink-0 art-chip"
                      />
                    )}
                    <div>
                      <div className="tile-title">{t(`buildings.${building.type}`)}</div>
                      <div className="tile-sub">
                        {building.type.startsWith('merchant_')
                          ? t('game.built', { count: building.built })
                          : building.built ? t('game.alreadyBuilt') : t('game.notBuilt')
                        }
                        {' '}&middot; {coinify(t('game.cost', { cost: building.cost }))}
                        {' '}&middot; {building.isReligious ? t('game.religiousBuildingInfo') : t('game.secularBuildingInfo')}
                      </div>
                    </div>
                  </button>
                ))}
                {getAvailableBuildings(activePlayerIndex).length === 0 && (
                  <p className="text-ink-muted text-center py-4 text-sm">
                    {activePlayer.faction === 'Merchants' && selectedRegion !== 'pskov'
                      ? t('game.merchantsPskovOnly')
                      : t('game.noBuildingsRegion')
                    }
                  </p>
                )}
              </div>
            </div>

            {/* Equipment */}
            <div>
              <h4 className="font-display text-base font-medium text-ink-light tracking-wide mb-2">{t('game.equipment')}</h4>
              <div className="space-y-2">
                <button
                  onClick={() => buyItem(activePlayerIndex, 'weapons')}
                  disabled={
                    activePlayer.money < 1 ||
                    gameState.constructionActions[activePlayerIndex].equipment ||
                    activePlayer.weapons >= 2
                  }
                  className="action-tile tile-war text-sm"
                >
                  {getEquipmentImage('weapons', activePlayer.faction) && (
                    <img
                      src={getEquipmentImage('weapons', activePlayer.faction)}
                      alt="Weapon"
                      className="w-16 h-16 rounded-md object-cover flex-shrink-0 art-chip"
                    />
                  )}
                  <div>
                    <div className="tile-title">{coinify(t('game.buyWeapon'))}</div>
                    <div className="tile-sub">
                      {gameState.constructionActions[activePlayerIndex].equipment ? t('game.equipmentBought') :
                       activePlayer.weapons >= 2 ? t('game.maxWeapons') :
                       t('game.owned', { count: activePlayer.weapons })}
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => buyItem(activePlayerIndex, 'armor')}
                  disabled={
                    activePlayer.money < 1 ||
                    gameState.constructionActions[activePlayerIndex].equipment ||
                    activePlayer.armor >= 2
                  }
                  className="action-tile tile-iron text-sm"
                >
                  {getEquipmentImage('armor', activePlayer.faction) && (
                    <img
                      src={getEquipmentImage('armor', activePlayer.faction)}
                      alt="Armor"
                      className="w-16 h-16 rounded-md object-cover flex-shrink-0 art-chip"
                    />
                  )}
                  <div>
                    <div className="tile-title">{coinify(t('game.buyArmor'))}</div>
                    <div className="tile-sub">
                      {gameState.constructionActions[activePlayerIndex].equipment ? t('game.equipmentBought') :
                       activePlayer.armor >= 2 ? t('game.maxArmor') :
                       t('game.owned', { count: activePlayer.armor })}
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Overseas Expedition - Merchants only */}
          {activePlayer.faction === 'Merchants' && (
            <>
              <div className="section-divider" />
              <div>
                <h4 className="font-display text-base font-medium text-ink-light tracking-wide mb-2">{t('game.expeditionTitle')}</h4>
                <button
                  onClick={() => sendExpeditionAction(activePlayerIndex)}
                  disabled={
                    activePlayer.money < EXPEDITION_COST ||
                    activePlayer.expeditions >= EXPEDITION_MAX_PER_GAME ||
                    gameState.constructionActions[activePlayerIndex].expedition
                  }
                  className="action-tile tile-sea text-sm"
                >
                  <img
                    src={EXPEDITION_IMAGE}
                    alt="Expedition"
                    className="w-16 h-16 rounded-md object-cover flex-shrink-0 art-chip"
                  />
                  <div>
                    <div className="tile-title">{coinify(t('game.sendExpedition'))}</div>
                    <div className="tile-sub">
                      {gameState.constructionActions[activePlayerIndex].expedition
                        ? t('game.expeditionSent')
                        : activePlayer.expeditions >= EXPEDITION_MAX_PER_GAME
                        ? t('game.expeditionMaxReached')
                        : t('game.expeditionInfo', { sent: activePlayer.expeditions, max: EXPEDITION_MAX_PER_GAME })}
                    </div>
                  </div>
                </button>
                {gameState.lastExpeditionResult && gameState.lastExpeditionResult.playerIndex === activePlayerIndex && (
                  <div className={`mt-2 p-2.5 rounded text-sm font-medium text-center ${
                    gameState.lastExpeditionResult.outcome === 'loss'
                      ? 'bg-war/10 text-war'
                      : gameState.lastExpeditionResult.outcome === 'profit'
                      ? 'bg-good/10 text-good'
                      : 'bg-gold/15 text-ink'
                  }`}>
                    {gameState.lastExpeditionResult.outcome === 'loss'
                      ? coinify(t('game.expeditionLoss'))
                      : gameState.lastExpeditionResult.outcome === 'profit'
                      ? coinify(t('game.expeditionProfit'))
                      : coinify(t('game.expeditionWindfall'))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        );
      })()}

      {/* ===== EVENTS PHASE ===== */}
      {gameState.phase === 'events' && gameState.currentEvent && !isGameOver && (
        <div className="phase-enter">
          {/* Side-by-side layout: event card left, content right */}
          {true && (
            <div className="flex flex-col xl:flex-row gap-4 xl:items-start">

              {/* The event card: dealt face down, then flipped once its art has loaded.
                  A wide banner on small screens, a portrait card on wide ones. */}
              {getEventImage(gameState.currentEvent.id) && (
                <div className="w-full xl:w-[38%] xl:max-w-[440px] flex-shrink-0 xl:sticky xl:top-20">
                  <div className={`flip-card aspect-[16/9] sm:aspect-[21/9] xl:aspect-[2/3] ${gameState.eventImageRevealed ? 'is-flipped' : ''}`}>
                    <div className="flip-card-inner">
                      {/* Card back */}
                      <div className="flip-face card-back" aria-hidden={gameState.eventImageRevealed}>
                        <svg viewBox="0 0 100 100" className="card-back-emblem" aria-hidden="true">
                          <circle cx="50" cy="50" r="44" fill="none" stroke="#b08a3e" strokeWidth="1.5" />
                          <circle cx="50" cy="50" r="38" fill="none" stroke="#b08a3e" strokeWidth="0.75" strokeDasharray="2 3" />
                          <path d="M50 14 L56 40 L82 34 L62 50 L82 66 L56 60 L50 86 L44 60 L18 66 L38 50 L18 34 L44 40 Z" fill="#d9bf7a" stroke="#8a6a26" strokeWidth="1" />
                          <circle cx="50" cy="50" r="6" fill="#2f2217" stroke="#d9bf7a" strokeWidth="1.5" />
                        </svg>
                        {!gameState.eventImageRevealed && (
                          <div className="text-center px-4" role="status">
                            <div className="font-display text-lg sm:text-xl text-[#f3e3b5] tracking-wide">{t('events.newEvent')}</div>
                            <div className="text-xs sm:text-sm text-[#d9bf7a]/80">{t('game.revealingEvent')}</div>
                          </div>
                        )}
                      </div>
                      {/* Card face: the event art */}
                      <div className="flip-face flip-front">
                        <div className="art-frame h-full">
                          <img
                            src={getEventImage(gameState.currentEvent.id)}
                            alt=""
                            className="art block w-full h-full object-cover"
                            style={{ objectPosition: `center ${getEventImageFocus(gameState.currentEvent.id)}` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* The card's text appears once it has been turned over */}
              <div className={`card-parchment-raised p-4 sm:p-5 flex-1 min-w-0 ${
                gameState.eventImageRevealed || !getEventImage(gameState.currentEvent.id) ? 'event-content-in' : 'hidden'
              }`}>
              <h3 className="heading-serif text-xl text-center mb-3">{t('game.event', { name: getEventName(gameState.currentEvent) })}</h3>
              {/* Order attacks describe themselves below with the real, turn-scaled strength;
                  only the retaliation card has extra story to tell */}
              {(gameState.currentEvent.type !== 'order_attack' || gameState.currentEvent.id === 'order_attack_rob_foreign') && (
                <p className="text-ink-light text-center mb-4">{coinify(getEventDescription(gameState.currentEvent))}</p>
              )}

              <div className="section-divider" />

              {/* Voting Event */}
              {gameState.currentEvent.type === 'voting' && !gameState.eventResolved && (
                <div>
                  <h4 className="font-display text-base font-medium text-ink-light tracking-wide mb-3">{t('game.councilDecision')}</h4>

                  {/* Options with costs/effects */}
                  <div className="mb-4 space-y-1.5">
                    {gameState.currentEvent.options.map(option => {
                      const translatedName = getOptionName(gameState.currentEvent.id, option.id) || option.name;
                      const translatedCost = getOptionCostText(gameState.currentEvent.id, option.id) || option.costText;
                      const translatedEffect = getOptionEffectText(gameState.currentEvent.id, option.id) || option.effectText;
                      return (
                        <div key={option.id} className="flex items-baseline gap-2 text-sm">
                          <span className="font-medium text-ink">{translatedName}</span>
                          {translatedCost && <span className="text-xs text-war">[{coinify(translatedCost)}]</span>}
                          {translatedEffect && <span className="text-xs text-ink-muted">&rarr; {coinify(translatedEffect)}</span>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Faction voting columns */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                    {gameState.players.map((player, index) => {
                      const hasVoted = gameState.eventVotes[index] !== null;
                      const isCurrentPlayer = mode === 'online' ? index === playerId : !aiPlayers[index];
                      const votedOptionId = gameState.eventVotes[index];
                      const votedOption = votedOptionId
                        ? gameState.currentEvent.options.find(opt => opt.id === votedOptionId)
                        : null;

                      return (
                        <div key={index} className={voteColumnClass(index)}>
                          {renderVoteHeader(index)}

                          {isCurrentPlayer ? (
                            <div className="space-y-1.5">
                              {gameState.currentEvent.options.map(option => {
                                const canAfford = !option.requiresMinMoney || player.money >= option.requiresMinMoney;
                                const translatedName = getOptionName(gameState.currentEvent.id, option.id) || option.name;
                                const isSelected = gameState.eventVotes[index] === option.id;

                                return (
                                  <button
                                    key={option.id}
                                    onClick={() => voteOnEvent(index, option.id)}
                                    disabled={hasVoted || !canAfford}
                                    className={`vote-option w-full text-xs py-1.5 px-2 ${isSelected ? 'selected' : ''}`}
                                  >
                                    {isSelected
                                      ? t('game.voted', { option: translatedName })
                                      : !canAfford
                                      ? coinify(t('events.needMoney', { amount: option.requiresMinMoney }))
                                      : translatedName}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-xs text-ink-muted italic py-1">
                              {hasVoted ? (
                                <span className="text-accent font-medium">{t('game.voted', { option: getOptionName(gameState.currentEvent.id, votedOption?.id) || votedOption?.name })}</span>
                              ) : (
                                <span>{t('events.waitingToVote')}</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {getVotingResult() && (
                    <div className="text-center">
                      {(() => {
                        const winningOption = getVotingResult();
                        const optionName = getOptionName(gameState.currentEvent.id, winningOption)
                          || gameState.currentEvent.options.find(opt => opt.id === winningOption)?.name;
                        const acceptVoters = gameState.eventVotes.filter(v => v === 'accept').length;

                        let resultText = t('events.decision', { option: optionName });
                        if (winningOption === 'accept' && gameState.currentEvent.acceptCost) {
                          let allCanAfford = true;
                          const costPerVoter = acceptVoters > 0 ? gameState.currentEvent.acceptCost / acceptVoters : 0;
                          gameState.players.forEach((player, index) => {
                            if (gameState.eventVotes[index] === 'accept' && player.money < costPerVoter) {
                              allCanAfford = false;
                            }
                          });

                          if (!allCanAfford || acceptVoters === 0) {
                            resultText = t('events.decisionAcceptFailed');
                          } else {
                            resultText = t('events.decisionAcceptFunded', { count: acceptVoters, cost: fmtCoins(costPerVoter, i18n.language) });
                          }
                        }

                        return (
                          <div className="mb-3">
                            <p className="text-sm text-ink-light mb-2">{coinify(resultText)}</p>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* Auction Event */}
              {gameState.currentEvent.type === 'auction' && !gameState.eventResolved && (
                <div>
                  <h4 className="font-display text-base font-medium text-ink-light tracking-wide mb-2">{t('auction.title')}</h4>
                  <p className="text-sm text-ink-muted mb-3">{t('auction.rules')}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                    {gameState.players.map((player, index) => {
                      const hasBid = gameState.eventVotes[index] !== null;
                      const isCurrentPlayer = mode === 'online' ? index === playerId : !aiPlayers[index];
                      const maxAffordable = Math.floor(player.money);

                      return (
                        <div key={index} className={voteColumnClass(index)}>
                          {renderVoteHeader(index)}

                          {isCurrentPlayer ? (
                            hasBid ? (
                              <div className="text-xs text-accent font-medium italic py-1">
                                {t('auction.bidPlaced')}
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                <button
                                  onClick={() => voteOnEvent(index, '0')}
                                  className="w-full px-3 py-1.5 rounded text-xs font-medium btn-secondary"
                                >
                                  {t('auction.pass')}
                                </button>
                                {[1, 2, 3, 4, 5, 6].filter(amt => amt <= maxAffordable).map(amt => (
                                  <button
                                    key={amt}
                                    onClick={() => voteOnEvent(index, String(amt))}
                                    className="w-full px-3 py-1.5 text-xs btn-accent"
                                  >
                                    {coinify(t('auction.bid', { amount: amt }))}
                                  </button>
                                ))}
                              </div>
                            )
                          ) : (
                            <div className="text-xs text-ink-muted italic py-1">
                              {hasBid ? (
                                <span className="text-accent font-medium">{t('auction.bidPlaced')}</span>
                              ) : (
                                <span>{t('auction.considering')}</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {getAuctionResult() && (
                    <div className="text-center">
                      {(() => {
                        const auction = getAuctionResult();
                        let resultText = '';
                        let resultColor = 'text-ink-light';

                        if (auction.result === 'no_bids') {
                          resultText = t('auction.noBids');
                        } else if (auction.result === 'tie') {
                          const tiedFactions = auction.tiedIndices.map(i => t(`factions.${gameState.players[i].faction}`)).join(' & ');
                          const pointText = auction.tiedIndices.length === 2 ? '½' : `1/${auction.tiedIndices.length}`;
                          resultText = t('auction.tie', { factions: tiedFactions, amount: auction.amount, points: pointText });
                          resultColor = 'text-ink-light';
                        } else if (auction.result === 'winner') {
                          const winnerFaction = t(`factions.${gameState.players[auction.winnerIndex].faction}`);
                          resultText = t('auction.winner', { faction: winnerFaction, amount: auction.amount });
                          resultColor = 'text-good';
                        }

                        return (
                          <div className="mb-3">
                            <p className={`text-sm font-semibold ${resultColor} mb-1`}>
                              {coinify(t('auction.bids', { bids: gameState.players.map((p, i) => `${t(`factions.${p.faction}`)}: ${gameState.eventVotes[i]}○`).join(' · ') }))}
                            </p>
                            <p className={`text-sm font-semibold ${resultColor}`}>{coinify(resultText)}</p>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* Participation Event */}
              {gameState.currentEvent.type === 'participation' && !gameState.eventResolved && (
                <div>
                  <h4 className="font-display text-base font-medium text-ink-light tracking-wide mb-2">{t('game.councilDecision')}</h4>
                  <p className="text-sm text-ink-muted mb-3">{coinify(getEventQuestion(gameState.currentEvent) || gameState.currentEvent.question)}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                    {gameState.players.map((player, index) => {
                      const hasDecided = gameState.eventVotes[index] !== null;
                      const canAfford = player.money >= gameState.currentEvent.minCostPerPlayer;
                      const canControl = mode === 'online' ? index === playerId : !aiPlayers[index];

                      return (
                        <div key={index} className={voteColumnClass(index)}>
                          {renderVoteHeader(index)}
                          <div className="space-y-1.5">
                            <button
                              onClick={() => voteOnEvent(index, true)}
                              disabled={!canControl || hasDecided || !canAfford}
                              className={`w-full px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                gameState.eventVotes[index] === true
                                  ? 'btn-chosen'
                                  : (hasDecided || !canAfford)
                                  ? 'btn-secondary opacity-60 cursor-not-allowed'
                                  : 'btn-good'
                              }`}
                            >
                              {gameState.eventVotes[index] === true ? t('events.participating') :
                               !canAfford ? coinify(t('events.needMoney', { amount: gameState.currentEvent.minCostPerPlayer })) :
                               t('events.participate')}
                            </button>
                            <button
                              onClick={() => voteOnEvent(index, false)}
                              disabled={!canControl || hasDecided}
                              className={`w-full px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                gameState.eventVotes[index] === false
                                  ? 'btn-chosen'
                                  : hasDecided
                                  ? 'btn-secondary opacity-60 cursor-not-allowed'
                                  : 'btn-secondary'
                              }`}
                            >
                              {gameState.eventVotes[index] === false ? t('events.notParticipating') : t('events.dontParticipate')}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {getParticipationResult() && (
                    <div className="text-center">
                      {(() => {
                        // Iteratively determine actual defenders (same logic as resolution)
                        const totalCost = gameState.currentEvent.totalCost || 3;
                        let candidates = [];
                        gameState.players.forEach((player, index) => {
                          if (gameState.eventVotes[index] === true) {
                            candidates.push(index);
                          }
                        });

                        let stable = false;
                        let excluded = [];
                        while (!stable && candidates.length > 0) {
                          const cost = totalCost / candidates.length;
                          const affordable = candidates.filter(
                            (i) => gameState.players[i].money >= cost
                          );
                          if (affordable.length === candidates.length) {
                            stable = true;
                          } else {
                            excluded = excluded.concat(candidates.filter(i => !affordable.includes(i)));
                            candidates = affordable;
                          }
                        }

                        const actualParticipants = candidates.length;
                        const costPerParticipant = actualParticipants > 0 ? totalCost / actualParticipants : 0;
                        const purchaseSucceeds = actualParticipants > 0;
                        const excludedFactions = excluded.map(i => gameState.players[i].faction);

                        return (
                          <div className="mb-3">
                            <p className="text-sm text-ink-light mb-1">
                              {actualParticipants > 0 ? (
                                <>{coinify(t('events.participantsCost', { count: actualParticipants, cost: fmtCoins(costPerParticipant, i18n.language) }))}</>
                              ) : (
                                <>{t('events.noParticipants')}</>
                              )}
                            </p>
                            {excludedFactions.length > 0 && (
                              <p className="text-sm text-war mb-1">
                                {t('events.cannotAffordParticipate', { factions: excludedFactions.map(f => t(`factions.${f}`)).join(', ') })}
                              </p>
                            )}
                            <p className={`text-sm font-semibold ${purchaseSucceeds ? 'text-good' : 'text-war'}`}>
                              {purchaseSucceeds ? t('events.resultSuccess') : t('events.resultFailed')}
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* Order Attack Event */}
              {gameState.currentEvent.type === 'order_attack' && !gameState.eventResolved && (
                <div>
                  <p className="text-sm text-ink-light mb-3">{(() => {
                    const { strength, level } = getOrderAttackInfo(gameState.currentEvent);
                    return t(`game.orderAttackBody.${level}`, { strength, cost: gameState.currentEvent.minCostPerPlayer || 1 });
                  })()}</p>
                  {getOrderAttackTargets(gameState.regions, rules).includes('pskov') && (
                    <p className="text-sm font-semibold text-war mb-3" role="alert">{t('siege.pskovInReach')}</p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                    {gameState.players.map((player, index) => {
                      const hasDecided = gameState.eventVotes[index] !== null;
                      const canAfford = player.money >= gameState.currentEvent.minCostPerPlayer;
                      const isCurrentPlayer = mode === 'online' ? index === playerId : !aiPlayers[index];

                      return (
                        <div key={index} className={voteColumnClass(index)}>
                          {renderVoteHeader(index)}

                          {isCurrentPlayer ? (
                            <div className="space-y-1.5">
                              <button
                                onClick={() => voteOnEvent(index, true)}
                                disabled={hasDecided || !canAfford}
                                className={`w-full px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                  gameState.eventVotes[index] === true
                                    ? 'btn-chosen'
                                    : (hasDecided || !canAfford)
                                    ? 'btn-secondary opacity-60 cursor-not-allowed'
                                    : 'btn-good'
                                }`}
                              >
                                {gameState.eventVotes[index] === true ? t('game.defending') :
                                 !canAfford ? coinify(t('events.needMoney', { amount: gameState.currentEvent.minCostPerPlayer })) :
                                 rules.glory ? (
                                   <>
                                     {t('game.fundDefense')}
                                     <span className="block text-[11px] font-normal opacity-90">{coinify(t('glory.ifWeWin', { cost: gameState.currentEvent.minCostPerPlayer || DEFENSE_COST_PER_PLAYER, glory: (gameState.currentEvent.minCostPerPlayer || DEFENSE_COST_PER_PLAYER) * GLORY_PER_COIN }))}</span>
                                   </>
                                 ) : t('game.fundDefense')}
                              </button>
                              <button
                                onClick={() => voteOnEvent(index, false)}
                                disabled={hasDecided}
                                className={`w-full px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                  gameState.eventVotes[index] === false
                                    ? 'btn-chosen'
                                    : hasDecided
                                    ? 'btn-secondary opacity-60 cursor-not-allowed'
                                    : 'btn-secondary'
                                }`}
                              >
                                {gameState.eventVotes[index] === false ? t('game.noDefense') : t('game.surrender')}
                              </button>
                            </div>
                          ) : (
                            <div className="text-xs text-ink-muted italic py-1">
                              {hasDecided ? (
                                gameState.eventVotes[index] === true ? (
                                  <span className="text-good font-medium">{t('game.defending')}</span>
                                ) : (
                                  <span className="text-war font-medium">{t('game.surrendering')}</span>
                                )
                              ) : (
                                <span>{t('events.waitingToDecide')}</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {(() => {
                    const { strength: orderStrength } = getOrderAttackInfo(gameState.currentEvent);
                    const ours = strengthOf(votersFor(gameState.eventVotes));
                    return (
                      <div className="mb-4">
                        <BattleReport
                          title={t('battle.forecast')}
                          ours={ours}
                          theirs={orderStrength}
                          chance={chanceFor(ours, orderStrength)}
                          note={t('battle.fortressNote')}
                        />
                      </div>
                    );
                  })()}

                  {getParticipationResult() && (
                    <div className="text-center">
                      <p className="text-sm text-ink-light mb-2">
                        {(() => {
                          const defenders = getDefenders(gameState, gameState.eventVotes, gameState.currentEvent.minCostPerPlayer || DEFENSE_COST_PER_PLAYER);
                          return defenders.length > 0 ? t('events.defendersReady', { count: defenders.length }) : t('events.noDefenders');
                        })()}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Event Resolved */}
              {gameState.eventResolved && (
                <div className="text-center py-2">
                  <p className="text-good font-semibold mb-2">{t('game.eventResolved')}</p>
                  {battleOutcome(gameState.battleResult) && (
                    <div className="mb-3 text-left">
                      <BattleReport
                        key={`${gameState.turn}-${gameState.battleResult.region}`}
                        title={t('battle.reportTitle', regionArgs(gameState.battleResult.region))}
                        ours={gameState.battleResult.pskovStrength}
                        theirs={gameState.battleResult.orderStrength}
                        chance={gameState.battleResult.chancePercent}
                        outcome={battleOutcome(gameState.battleResult)}
                        glory={gloryChips(gameState.battleResult)}
                      />
                    </div>
                  )}
                  {outcomeText && (
                    <p className="text-sm text-ink-light mb-2 font-medium">{coinify(outcomeText)}</p>
                  )}
                </div>
              )}

              {/* Council Discussion - inline in events column (AI players only) */}
              {hasAiCouncil && (
                <div className="mt-4">
                  <DiscussionPanel />
                </div>
              )}
            </div>
            </div>
          )}
        </div>
      )}

      {/* ===== VECHE (ASSEMBLY) PHASE ===== */}
      {gameState.phase === 'veche' && !isGameOver && (
        <div className="card-parchment-raised p-5 phase-enter">
          <h3 className="heading-serif text-lg mb-2">{t('game.cityAssembly')}</h3>
          <p className="text-sm text-ink-muted mb-4">{t('game.cityAssemblyDesc')}</p>

          {/* Attack Planning */}
          <div className="mb-5">
            <h4 className="font-display text-base font-medium text-ink-light tracking-wide mb-2">{t('game.militaryCampaigns')}</h4>
            <p className="text-xs text-ink-muted mb-3">{t('game.militaryCampaignsDesc')}</p>

            <div className="flex flex-wrap gap-2 mb-3">
              {(() => {
                const validTargets = getValidRepublicAttackTargets(gameState.regions);
                const orderRegions = Object.entries(gameState.regions).filter(([name, region]) => region.controller === 'order');

                return orderRegions.map(([regionName, region]) => {
                  const isAdjacent = validTargets.includes(regionName);

                  return (
                    <button
                      key={regionName}
                      onClick={() => initiateAttack(regionName)}
                      disabled={gameState.attackPlanning !== null || !isAdjacent}
                      className={`btn-danger px-4 py-2 text-sm ${!isAdjacent ? 'opacity-50' : ''}`}
                    >
                      <div className="font-medium">{t('veche.attack', regionArgs(regionName))}</div>
                      <div className="text-xs opacity-80">
                        {region.fortress ? t('veche.hasFortress') : t('veche.noFortress')}
                        {!isAdjacent && ` - ${t('veche.notAdjacent')}`}
                      </div>
                    </button>
                  );
                });
              })()}
            </div>

            {Object.entries(gameState.regions).filter(([name, region]) => region.controller === 'order').length === 0 && (
              <p className="text-good text-center py-2 text-sm">{t('game.allTerritoriesControlled')}</p>
            )}
          </div>

          {/* Attack Planning Interface */}
          {gameState.attackPlanning === 'planning' && (
            <div className="border border-war/30 rounded-lg p-4 mb-4 bg-war/5">
              <h4 className="text-sm font-bold text-war mb-2">
                {t('veche.planningAttack', regionArgs(gameState.attackTarget))}
              </h4>
              <p className="text-xs text-war mb-3">{coinify(t('veche.attackRequiresFunding'))}</p>

              {(() => {
                const target = gameState.regions[gameState.attackTarget];
                const orderStrength = getOrderDefenseStrength(gameState, gameState.attackTarget);
                const ours = strengthOf(votersFor(gameState.attackVotes));
                return (
                  <div className="mb-3">
                    <BattleReport
                      title={t('battle.forecast')}
                      ours={ours}
                      theirs={orderStrength}
                      chance={chanceFor(ours, orderStrength)}
                      note={target?.fortress ? t('battle.orderFortressNote') : undefined}
                    />
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                {gameState.players.map((player, index) => {
                  const hasDecided = gameState.attackVotes[index] !== null;
                  const canAfford = player.money >= ATTACK_COST_PER_PLAYER;
                  // AI factions vote on their own; only your own faction's buttons are clickable
                  const canControl = mode === 'online' ? index === playerId : !aiPlayers[index];

                  return (
                    <div key={index} className={voteColumnClass(index)}>
                          {renderVoteHeader(index)}
                      <div className="space-y-1.5">
                        <button
                          onClick={() => voteOnAttack(index, true)}
                          disabled={!canControl || hasDecided || !canAfford}
                          className={`w-full px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                            gameState.attackVotes[index] === true ? 'btn-chosen'
                            : canAfford ? 'btn-war'
                            : 'btn-secondary opacity-60 cursor-not-allowed'
                          }`}
                        >
                          {gameState.attackVotes[index] === true ? t('veche.joiningAttack') :
                           !canAfford ? coinify(t('events.needMoney', { amount: ATTACK_COST_PER_PLAYER }))
                           : rules.glory ? (
                             <>
                               {t('veche.joinAttack')}
                               <span className="block text-[11px] font-normal opacity-90">{coinify(t('glory.ifWeWin', { cost: ATTACK_COST_PER_PLAYER, glory: ATTACK_COST_PER_PLAYER * GLORY_PER_COIN }))}</span>
                             </>
                           )
                           : t('veche.joinAttack')}
                        </button>
                        <button
                          onClick={() => voteOnAttack(index, false)}
                          disabled={!canControl || hasDecided}
                          className={`w-full px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                            gameState.attackVotes[index] === false ? 'btn-chosen' : 'btn-secondary'
                          }`}
                        >
                          {gameState.attackVotes[index] === false ? t('veche.notParticipating') : t('veche.decline')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {gameState.attackVotes.filter(v => v !== null).length === 3 && (
                <div className="text-center">
                  {(() => {
                    const funding = getAttackFunding(gameState);
                    const participants = funding.participants.length;
                    const costPerParticipant = funding.costPerParticipant;
                    const allCanAfford = funding.cannotAfford.length === 0;
                    const insufficientFunds = funding.cannotAfford.map((i) => gameState.players[i].faction);
                    const attackSucceeds = funding.funded;

                    return (
                      <div className="mb-3">
                        <p className="text-sm text-ink-light mb-1">
                          {participants > 0 ? coinify(t('veche.attackers', { count: participants, cost: fmtCoins(costPerParticipant, i18n.language) })) : t('veche.noParticipants')}
                        </p>
                        {!allCanAfford && participants > 0 && (
                          <p className="text-sm text-war mb-1">{coinify(t('veche.cannotAffordAttack', { factions: insufficientFunds.map(f => t(`factions.${f}`)).join(', '), cost: fmtCoins(costPerParticipant, i18n.language) }))}</p>
                        )}
                        <p className={`text-sm font-semibold ${attackSucceeds ? 'text-good' : 'text-war'}`}>
                          {t('veche.result', { result: attackSucceeds ? t('veche.attackFunded') : t('veche.attackCancelledCaps') })}
                        </p>
                        <div className="mt-3 flex gap-2 justify-center">
                          <button onClick={() => executeAttack()} disabled={!attackSucceeds} className="btn-danger px-4 py-2 text-sm">
                            {attackSucceeds ? t('veche.launchAttack') : t('veche.cannotLaunch')}
                          </button>
                          <button onClick={cancelAttack} className="btn-secondary px-4 py-2 text-sm">
                            {t('veche.cancel')}
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Attack Result */}
          {battleOutcome(gameState.battleResult) && outcomeText && (
            <div className="mb-3">
              <BattleReport
                key={`${gameState.turn}-${gameState.battleResult.region}`}
                title={t('battle.reportTitle', regionArgs(gameState.battleResult.region))}
                ours={gameState.battleResult.pskovStrength}
                theirs={gameState.battleResult.orderStrength}
                chance={gameState.battleResult.chancePercent}
                outcome={battleOutcome(gameState.battleResult)}
                glory={gloryChips(gameState.battleResult)}
              />
            </div>
          )}
          {outcomeText && (
            <div className={`p-3 rounded mb-4 text-sm font-medium ${
              gameState.battleResult?.type === 'attack_victory' ? 'bg-good/10 text-good border border-good/30'
              : gameState.battleResult?.type === 'attack_defeat' ? 'bg-war/10 text-war border border-war/30'
              : 'bg-parchment-50 text-ink border border-parchment-400'
            }`}>
              {coinify(outcomeText)}
            </div>
          )}

          <div className="section-divider" />

          {/* Fortress Building */}
          <div className="mb-4">
            <h4 className="font-display text-base font-medium text-ink-light tracking-wide mb-2">{t('veche.fortressConstruction')}</h4>
            <p className="text-xs text-ink-muted mb-3">{coinify(t('veche.buildFortressesDesc'))}</p>

            <div className="flex flex-wrap gap-2">
              {Object.entries(gameState.regions)
                .filter(([name, region]) => region.controller === 'republic' && !region.fortress)
                .map(([regionName]) => (
                  <button
                    key={regionName}
                    onClick={() => initiateFortressBuild(regionName)}
                    disabled={gameState.fortressPlanning !== null}
                    className="btn-accent px-4 py-2 text-sm"
                  >
                    <div className="font-medium">{t('veche.buildFortress')}</div>
                    <div className="text-xs opacity-80">{t(`regions.${regionName}`)} &middot; {t('veche.defenseBonus')}</div>
                  </button>
                ))}
            </div>

            {Object.entries(gameState.regions).filter(([name, region]) => region.controller === 'republic' && !region.fortress).length === 0 && (
              <p className="text-good text-center py-2 text-sm">{t('veche.allFortresses')}</p>
            )}

            {/* Fortress Planning Interface */}
            {gameState.fortressPlanning === 'planning' && (
              <div className="border border-parchment-400 rounded-lg p-4 mt-3 bg-parchment-50">
                <h4 className="text-sm font-semibold text-ink mb-2">
                  {t('veche.planningFortress', regionArgs(gameState.fortressTarget))}
                </h4>
                <p className="text-xs text-ink-muted mb-3">{coinify(t('veche.fortressRequiresFunding'))}</p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  {gameState.players.map((player, index) => {
                    const hasDecided = gameState.fortressVotes[index] !== null;
                    const canAfford = player.money >= 2;
                    const canControl = mode === 'online' ? index === playerId : !aiPlayers[index];

                    return (
                      <div key={index} className={voteColumnClass(index)}>
                          {renderVoteHeader(index)}
                        <div className="space-y-1.5">
                          <button
                            onClick={() => voteOnFortress(index, true)}
                            disabled={!canControl || hasDecided || !canAfford}
                            className={`w-full px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                              gameState.fortressVotes[index] === true ? 'btn-chosen'
                              : canAfford ? 'btn-accent'
                              : 'btn-secondary opacity-60 cursor-not-allowed'
                            }`}
                          >
                            {gameState.fortressVotes[index] === true ? t('veche.contributing') :
                             !canAfford ? coinify(t('events.needMoney', { amount: 2 }))
                             : rules.glory ? (
                               <>
                                 {t('veche.contribute')}
                                 <span className="block text-[11px] font-normal opacity-90">{t('glory.perCoin')}</span>
                               </>
                             )
                             : t('veche.contribute')}
                          </button>
                          <button
                            onClick={() => voteOnFortress(index, false)}
                            disabled={!canControl || hasDecided}
                            className={`w-full px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                              gameState.fortressVotes[index] === false ? 'btn-chosen' : 'btn-secondary'
                            }`}
                          >
                            {gameState.fortressVotes[index] === false ? t('veche.notContributing') : t('veche.decline')}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {gameState.fortressVotes.filter(v => v !== null).length === 3 && (
                  <div className="text-center">
                    {(() => {
                      const funding = getFortressFunding(gameState);
                      const participants = funding.participants.length;
                      const costPerParticipant = funding.costPerParticipant;
                      const allCanAfford = funding.cannotAfford.length === 0;
                      const insufficientFunds = funding.cannotAfford.map((i) => gameState.players[i].faction);

                      if (participants === 0) {
                        return (
                          <div>
                            <p className="text-ink-muted mb-2 text-sm">{t('veche.noFortressFunding')}</p>
                            <button onClick={cancelFortress} className="btn-secondary px-4 py-2 text-sm">{t('veche.cancelConstruction')}</button>
                          </div>
                        );
                      } else if (!allCanAfford) {
                        return (
                          <div>
                            <p className="text-war mb-2 text-sm">{coinify(t('veche.cannotAffordShare', { factions: insufficientFunds.map(f => t(`factions.${f}`)).join(', '), cost: fmtCoins(costPerParticipant, i18n.language) }))}</p>
                            <button onClick={cancelFortress} className="btn-secondary px-4 py-2 text-sm">{t('veche.cancelConstruction')}</button>
                          </div>
                        );
                      } else {
                        return (
                          <div>
                            <p className="text-good mb-2 text-sm">{coinify(t('veche.contributors', { count: participants, cost: fmtCoins(costPerParticipant, i18n.language) }))}</p>
                            {rules.glory && (
                              <p className="text-xs text-ink-light mb-2">{t('glory.fortressStake', { glory: costPerParticipant * GLORY_PER_COIN })}</p>
                            )}
                            <div className="flex gap-2 justify-center">
                              <button onClick={executeFortressBuild} className="btn-accent px-4 py-2 text-sm">{t('veche.buildFortressButton')}</button>
                              <button onClick={cancelFortress} className="btn-secondary px-4 py-2 text-sm">{t('veche.cancelFortress')}</button>
                            </div>
                          </div>
                        );
                      }
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== GAME END / DEFEAT ===== */}
      {isGameOver && (gameState.gameOver ? (
        /* Defeat: Pskov has fallen */
        <div className="relative overflow-hidden rounded-lg phase-enter end-defeat">
          <img src={getEventImage('order_attack')} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: 'grayscale(0.6) sepia(0.3) brightness(0.35) contrast(1.1)' }} />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, rgba(20,12,6,0.2) 20%, rgba(20,12,6,0.85) 100%)' }} />
          <div className="relative px-6 py-10 sm:py-14 text-center">
            <h3 className="font-display text-4xl sm:text-5xl font-bold tracking-wide text-[#e9a089] mb-2">{t('game.gameOver')}</h3>
            <p className="text-lg text-parchment-200 mb-6">{t('game.pskovFallen')}</p>
            <div className="flex justify-center gap-3 mb-8">
              {gameState.players.map((player, i) => (
                <img
                  key={i}
                  src={FACTION_THUMBS[player.faction]}
                  alt={t(`factions.${player.faction}`)}
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover border-2 border-[#6b5a42]"
                  style={{ filter: 'grayscale(1) brightness(0.7)' }}
                />
              ))}
            </div>
            <div className="flex gap-2 justify-center">
              {mode === 'local' && (
                <button onClick={resetGame} className="btn-accent px-6 py-2.5">
                  {t('end.playAgain')}
                </button>
              )}
              <button onClick={onMenu} className="btn-secondary px-6 py-2.5 !bg-parchment-50/90">
                {t('end.backToMenu')}
              </button>
            </div>
          </div>
        </div>
      ) : (() => {
        /* Victory: the Republic survived; the factions take their places on the podium */
        const result = getGameResult();
        const medal = ['#d9bf7a', '#c9c3b8', '#c08a5a'];
        return (
          <div className="card-parchment-raised p-5 sm:p-8 phase-enter">
            <div className="text-center mb-6">
              <p className="font-display text-sm tracking-[0.25em] text-accent">{t('game.republicSurvived')}</p>
              <h3 className="font-display text-4xl sm:text-5xl font-bold text-ink">
                {t('end.winner', { faction: t(`factions.${result.winner.faction}`) })}
              </h3>
              <div className="section-divider mx-auto max-w-xs" />
            </div>

            {/* Podium: second, first, third on wide screens; in rank order on phones */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5 sm:items-end mb-7">
              {result.rankings.map((player, rank) => (
                <div
                  key={player.index}
                  className={`end-podium flex sm:flex-col items-center gap-3 sm:gap-2 text-left sm:text-center ${
                    rank === 0 ? 'sm:order-2' : rank === 1 ? 'sm:order-1' : 'sm:order-3'
                  }`}
                  style={{ animationDelay: `${[0.9, 0.5, 0.2][rank]}s` }}
                >
                  <div className={`relative flex-shrink-0 ${rank === 0 ? 'w-24 sm:w-full' : 'w-20 sm:w-[82%]'}`}>
                    <div className="art-frame aspect-[3/4]" style={rank === 0 ? { borderColor: '#b08a3e', boxShadow: '0 0 0 1px #d9bf7a, 0 0 32px rgba(217,191,122,0.55)' } : undefined}>
                      <img src={FACTION_CARDS[player.faction]} alt="" className="art w-full h-full object-cover object-top" />
                    </div>
                    <span
                      className="absolute -top-2 -left-2 w-9 h-9 rounded-full grid place-items-center font-display text-lg font-bold text-ink border-2 border-[#5c4033] shadow"
                      style={{ background: medal[rank] }}
                    >
                      {rank + 1}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="heading-serif text-lg font-bold text-ink">{t(`factions.${player.faction}`)}</div>
                    <div className="font-display text-2xl font-bold text-ink lining-nums tabular-nums">
                      <AnimatedNumber value={player.victoryPoints} from={0} duration={1400} format={(n) => Math.round(n)} />
                      <span className="ml-1 text-sm text-ink-muted">{t('player.vp')}</span>
                    </div>
                    <div className="text-sm text-ink-light">{fmtCoins(player.money, i18n.language)}<CoinIcon /></div>
                    <div className="text-xs text-ink-muted mt-0.5 flex flex-wrap sm:justify-center gap-x-2">
                      {player.faction === 'Merchants' ? (
                        // Merchant buildings score at a reduced rate: show it in one line
                        player.breakdown.buildingVP > 0 && (
                          <span>{t('end.merchantBuildings', {
                            secular: player.breakdown.secular,
                            religious: player.breakdown.religious,
                            raw: player.breakdown.secular + player.breakdown.religious * 2,
                            vp: Math.round(player.breakdown.buildingVP * 10) / 10,
                            rate: getMerchantVpMultiplier(rules),
                          })}</span>
                        )
                      ) : (
                        <>
                          {player.breakdown.secular > 0 && <span>{t('end.secular', { count: player.breakdown.secular })}</span>}
                          {player.breakdown.religious > 0 && <span>{t('end.religious', { count: player.breakdown.religious, vp: player.breakdown.religious * 2 })}</span>}
                        </>
                      )}
                      {player.breakdown.bonus > 0 && <span>{t('end.bonus', { count: Math.round(player.breakdown.bonus * 10) / 10 })}</span>}
                      {player.breakdown.glory > 0 && <span className="text-accent font-medium">{t('end.glory', { count: player.breakdown.glory })}</span>}
                    </div>
                  </div>
                  {/* Plinth */}
                  <div
                    className="hidden sm:block w-full rounded-t-md border border-b-0 border-[#8b7355]"
                    style={{ height: ['3.5rem', '2.25rem', '1.25rem'][rank], background: 'linear-gradient(to bottom, #e8dcc0, #d4c4a8)' }}
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-2 justify-center">
              {mode === 'local' && (
                <button onClick={resetGame} className="btn-accent px-6 py-2.5">
                  {t('end.playAgain')}
                </button>
              )}
              <button onClick={onMenu} className="btn-secondary px-6 py-2.5">
                {t('end.backToMenu')}
              </button>
            </div>
          </div>
        );
      })())}

          {/* ===== ACTION BAR: the single "what next" control, pinned to the bottom of the screen ===== */}
          {primaryAction && (
            <div className="sticky bottom-0 z-20 pb-3 pt-2 -mt-2 bg-gradient-to-t from-parchment-100 via-parchment-100/90 to-transparent">
              <div className="card-parchment-raised flex items-center gap-3 px-4 py-3">
                <p className="flex-1 min-w-0 text-sm text-ink-light" aria-live="polite">
                  {primaryAction.hint}
                </p>
                <button
                  onClick={primaryAction.onClick}
                  disabled={!primaryAction.onClick}
                  className="btn-accent px-5 py-2.5 text-sm whitespace-nowrap flex-shrink-0"
                >
                  {primaryAction.label}
                </button>
              </div>
            </div>
          )}


        </main>

        {/* Effects and map */}
        <aside className="space-y-3 lg:col-start-1 lg:row-start-2">
          {/* Active Effects (compact) */}
          {gameState.activeEffects.length > 0 && (
            <div className="card-parchment p-3">
              <h4 className="font-display text-sm font-medium text-ink-light tracking-wide mb-2">{t('game.activeEffects')}</h4>
              <div className="space-y-1.5">
                {gameState.activeEffects.map((effect) => (
                  <div key={effect.id} className="flex justify-between items-center text-xs">
                    <span className="text-ink-light">{getEffectDescription(effect)}</span>
                    <span className="text-ink-muted ml-2 flex-shrink-0">
                      {t('game.turnsLeft', { count: effect.turnsRemaining })}
                      {' '}
                      {effect.type === 'strength_bonus' && `+${effect.value}`}
                      {effect.type === 'strength_penalty' && `${effect.value}`}
                      {effect.type === 'income_penalty' && `${(effect.value * 100).toFixed(0)}%`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Map: capped on tablets so the portrait image does not fill the screen */}
          <div className="max-w-sm mx-auto lg:max-w-none">
            <GameMap gameState={gameState} {...getMapProps()} />
            {!isGameOver && isPskovThreatened(gameState.regions, rules) && (
              <p className="mt-2 text-xs sm:text-sm font-semibold text-war text-center" role="status">{t('siege.capitalWarning')}</p>
            )}
          </div>
        </aside>

      </div>

      {/* Help Modal */}
      {showHelp && (
        <HowToPlay isModal onContinue={() => setShowHelp(false)} />
      )}

      {/* Leave-game confirmation */}
      {showLeaveConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowLeaveConfirm(false); }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="leave-title" className="card-parchment-raised p-6 max-w-sm w-full">
            <h3 id="leave-title" className="heading-serif text-lg mb-2">{t('leave.title')}</h3>
            <p className="text-sm text-ink-light mb-5">
              {t('leave.bodyOnline')}
            </p>
            <div className="flex gap-2 justify-end">
              <button autoFocus onClick={() => setShowLeaveConfirm(false)} className="btn-secondary px-4 py-2 text-sm">
                {t('leave.stay')}
              </button>
              <button onClick={() => { setShowLeaveConfirm(false); onMenu(); }} className="btn-accent px-4 py-2 text-sm">
                {t('leave.leave')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

/**
 * App Wrapper Component
 * 
 * Manages navigation between screens:
 * - MainMenu: Choose local or online play
 * - Lobby: Online multiplayer lobby
 * - PskovGame: The actual game
 */
const FACTIONS_LIST = ['Nobles', 'Merchants', 'Commoners'];

// The full-screen rules are shown before a player's first game only;
// afterwards they stay one click away behind the header "?" button.
const RULES_SEEN_KEY = 'veche.rulesSeen';
const hasSeenRules = () => {
  try { return localStorage.getItem(RULES_SEEN_KEY) === '1'; } catch { return false; }
};
const markRulesSeen = () => {
  try { localStorage.setItem(RULES_SEEN_KEY, '1'); } catch { /* storage unavailable */ }
};

const App = () => {
  const [screen, setScreen] = useState('menu'); // 'menu' | 'lobby' | 'faction' | 'howtoplay' | 'game'
  const [soloFaction, setSoloFaction] = useState(null); // faction name for solo intro screen

  // Store state
  const mode = useGameStore((state) => state.mode);
  const room = useGameStore((state) => state.room);
  const gameState = useGameStore((state) => state.gameState);
  const roomId = useGameStore((state) => state.roomId);
  const playerId = useGameStore((state) => state.playerId);
  const initLocalGame = useGameStore((state) => state.initLocalGame);
  const createRoom = useGameStore((state) => state.createRoom);
  const observeRoom = useGameStore((state) => state.observeRoom);
  const joinRoom = useGameStore((state) => state.joinRoom);
  const leaveRoom = useGameStore((state) => state.leaveRoom);
  const resetStore = useGameStore((state) => state.resetStore);

  // Handle screen transitions based on game state
  useEffect(() => {
    if (mode === 'online' && room?.gameStarted && gameState) {
      // Game has started - show faction screen before the game (only once)
      if (screen === 'lobby') {
        setScreen('faction');
      }
    } else if (mode === 'online' && roomId && !room?.gameStarted) {
      // In lobby waiting for game to start
      setScreen('lobby');
    }
  }, [mode, room?.gameStarted, gameState, roomId, screen]);

  // Start solo game (1 human + 2 AI) with faction intro
  const handleStartSolo = (factionIndex, options) => {
    const aiConfig = [true, true, true];
    aiConfig[factionIndex] = false;
    initLocalGame(aiConfig, options);
    setSoloFaction(FACTIONS_LIST[factionIndex]);
    setScreen('faction');
  };

  // Start local hotseat game (with optional AI config)
  const handleStartLocal = (aiConfig, options) => {
    initLocalGame(aiConfig, options);
    setScreen(hasSeenRules() ? 'game' : 'howtoplay');
  };

  // Create online room
  const handleCreateRoom = async (playerName) => {
    sessionStorage.setItem('playerName', playerName);
    const newRoomId = await createRoom();
    // Connect as observer to receive room updates
    await observeRoom(newRoomId);
    setScreen('lobby');
  };

  // Join existing room (first step - just get room code)
  const handleJoinRoom = async (roomCode, playerName) => {
    sessionStorage.setItem('playerName', playerName);
    useGameStore.getState().setRoomId(roomCode);
    // Connect as observer to receive room updates
    await observeRoom(roomCode);
    setScreen('lobby');
  };

  // Select faction in lobby (actually joins the room)
  const handleSelectFaction = async (factionIndex) => {
    const playerName = sessionStorage.getItem('playerName') || 'Player';
    const currentRoomId = useGameStore.getState().roomId;
    await joinRoom(currentRoomId, factionIndex, playerName);
  };

  // Leave room and go back to menu
  const handleLeave = () => {
    leaveRoom();
    resetStore();
    setSoloFaction(null);
    setScreen('menu');
  };

  // Resume the autosaved local game
  const handleContinue = () => {
    if (restoreSave()) setScreen('game');
  };

  // Go back to menu
  const handleBackToMenu = () => {
    resetStore();
    setSoloFaction(null);
    setScreen('menu');
  };

  // Render appropriate screen
  switch (screen) {
    case 'menu':
      return (
        <MainMenu
          savedGame={loadSave()}
          onContinue={handleContinue}
          onStartSolo={handleStartSolo}
          onStartLocal={handleStartLocal}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
        />
      );

    case 'lobby':
      return (
        <Lobby
          onSelectFaction={handleSelectFaction}
          onLeave={handleLeave}
        />
      );

    case 'faction': {
      const faction = soloFaction || FACTIONS_LIST[playerId] || 'Nobles';
      return (
        <FactionScreen
          faction={faction}
          // Solo players can pick again; online players have already taken a seat
          onBack={mode === 'local' ? handleBackToMenu : undefined}
          onContinue={() => setScreen(hasSeenRules() ? 'game' : 'howtoplay')}
        />
      );
    }

    case 'howtoplay':
      return (
        <HowToPlay
          onContinue={() => { markRulesSeen(); setScreen('game'); }}
        />
      );

    case 'game':
      return (
        <div className="relative">
          <PskovGame onMenu={handleBackToMenu} />
        </div>
      );

    default:
      return <MainMenu onStartSolo={handleStartSolo} onStartLocal={handleStartLocal} onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} />;
  }
};

export default App;
