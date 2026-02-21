import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FACTION_IMAGES, BUILDING_IMAGES, EVENT_IMAGES, EQUIPMENT_IMAGES, getEventImage, getEquipmentImage } from './imageAssets';

// Import Zustand store
import { useGameStore } from './store/gameStore';

// Import UI components
import { MainMenu, Lobby, GameMap, DiscussionPanel } from './components';

// Import discussion service
import { requestDiscussion } from './services/discussion';

// Import game logic from modular structure
import {
  // Constants
  PHASES,
  PHASE_NAMES,
  PHASE_DESCRIPTIONS,
  BUILDING_NAMES,
  FORTRESS_DEFENSE_BONUS,

  // Region logic
  MAP_ADJACENCY,
  getValidOrderAttackTargets,
  getValidRepublicAttackTargets,
  countRepublicRegions,
  getRegionsForFortress,

  // Effects
  createEffect,
  getStrengthModifier as getStrengthModifierPure,
  getIncomeModifier as getIncomeModifierPure,

  // Combat
  calculatePlayerStrength as calculatePlayerStrengthPure,
  getVictoryChance,
  rollForVictory as rollForVictoryPure,
  surrenderRegion as surrenderRegionPure,
  executeBattle as executeBattlePure,
  destroyRandomBuildings,

  // Events
  eventDeck,
  eventTypes as eventTypesPure,
  drawEvent as drawEventPure,

  // State
  createInitialGameState,
  formatRegionName,

  // AI
  decideConstruction,
  decideEventVote,
  decideAttackVote,
  decideFortressVote,
} from './game';

const PskovGame = () => {
  // Translation hook
  const { t, i18n } = useTranslation();

  // Get state and actions from Zustand store
  const gameState = useGameStore((state) => state.gameState);
  const setGameState = useGameStore((state) => state.setGameState);
  const initLocalGame = useGameStore((state) => state.initLocalGame);
  const debugMode = useGameStore((state) => state.debugMode);
  const mode = useGameStore((state) => state.mode);
  const playerId = useGameStore((state) => state.playerId);
  const sendAction = useGameStore((state) => state.sendAction);
  const aiPlayers = useGameStore((state) => state.aiPlayers);
  const setDiscussionLoading = useGameStore((state) => state.setDiscussionLoading);
  const addDiscussionMessages = useGameStore((state) => state.addDiscussionMessages);
  const clearDiscussion = useGameStore((state) => state.clearDiscussion);

  // Income notification state (shown briefly at top of construction phase)
  const [incomeNotification, setIncomeNotification] = useState(null);
  const incomeAdvancingRef = useRef(false);

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'en' ? 'ru' : 'en');
  };

  // Helper functions to get translated event content
  const getEventName = (event) => {
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

  // Debug mode - set to true for predictable event order
  const DEBUG_MODE = debugMode;

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

    // Calculate income preview for the notification banner
    const republicRegions = Object.values(gameState.regions).filter(r => r.controller === 'republic').length;
    const incomeData = gameState.players.map((player) => {
      const baseIncome = 0.5 + (republicRegions * 0.25) + (player.improvements * 0.25);
      const modifier = getIncomeModifier(player.faction);
      const finalIncome = baseIncome * modifier;
      return { faction: player.faction, income: finalIncome };
    });

    setIncomeNotification({ turn: gameState.turn, incomes: incomeData });
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

  // Auto-dismiss income notification after a few seconds
  useEffect(() => {
    if (!incomeNotification) return;
    const timer = setTimeout(() => setIncomeNotification(null), 6000);
    return () => clearTimeout(timer);
  }, [incomeNotification]);

  // Animate event image reveal after 2 seconds
  useEffect(() => {
    if (gameState?.currentEvent && !gameState?.eventImageRevealed) {
      const timer = setTimeout(() => {
        // Use functional update to avoid stale closure
        setGameState(prev => ({
          ...prev,
          eventImageRevealed: true
        }));
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [gameState?.currentEvent, gameState?.eventImageRevealed, setGameState]);

  // AI player automation
  useEffect(() => {
    if (!gameState || mode !== 'local' || gameState.gameOver || gameState.turn > 20) return;

    // --- Construction phase: auto-play AI turns ---
    if (gameState.phase === 'construction' && aiPlayers[gameState.currentPlayer]) {
      const timer = setTimeout(() => {
        const currentState = useGameStore.getState().gameState;
        if (!currentState || currentState.phase !== 'construction') return;
        const aiIndex = currentState.currentPlayer;
        if (!aiPlayers[aiIndex]) return;

        const decision = decideConstruction(currentState, aiIndex);

        setGameState(prev => {
          if (!prev || prev.phase !== 'construction' || prev.currentPlayer !== aiIndex) return prev;
          let state = { ...prev };

          // Select region and build if decided
          if (decision.buildingType && decision.regionName && prev.players[aiIndex].money >= 2) {
            const region = state.regions[decision.regionName];
            const buildingType = decision.buildingType;

            // Check building is available
            let canBuild = false;
            if (buildingType.startsWith('merchant_')) {
              canBuild = (region.buildings[buildingType] || 0) < 7;
            } else {
              canBuild = (region.buildings[buildingType] || 0) === 0;
            }

            if (canBuild && !state.constructionActions[aiIndex].improvement) {
              const newBuildings = buildingType.startsWith('merchant_')
                ? { ...region.buildings, [buildingType]: (region.buildings[buildingType] || 0) + 1 }
                : { ...region.buildings, [buildingType]: 1 };

              state = {
                ...state,
                selectedRegion: decision.regionName,
                regions: {
                  ...state.regions,
                  [decision.regionName]: { ...region, buildings: newBuildings },
                },
                players: state.players.map((p, i) =>
                  i === aiIndex ? { ...p, money: p.money - 2, improvements: p.improvements + 1 } : p
                ),
                constructionActions: state.constructionActions.map((ca, i) =>
                  i === aiIndex ? { ...ca, improvement: true } : ca
                ),
              };
            }
          }

          // Buy equipment if decided and affordable
          if (decision.equipmentType && state.players[aiIndex].money >= 1 && !state.constructionActions[aiIndex].equipment) {
            const eqType = decision.equipmentType;
            state = {
              ...state,
              players: state.players.map((p, i) =>
                i === aiIndex ? { ...p, money: p.money - 1, [eqType]: p[eqType] + 1 } : p
              ),
              constructionActions: state.constructionActions.map((ca, i) =>
                i === aiIndex ? { ...ca, equipment: true } : ca
              ),
            };
          }

          // Advance to next player
          return { ...state, currentPlayer: (aiIndex + 1) % 3 };
        });
      }, 800); // Short delay so human can see AI is taking a turn
      return () => clearTimeout(timer);
    }

    // --- Events phase: auto-vote for AI players ---
    if (gameState.phase === 'events' && gameState.currentEvent && !gameState.eventResolved) {
      // Find AI players that haven't voted yet
      const aiNeedsVote = aiPlayers.map((isAi, i) =>
        isAi && gameState.eventVotes[i] === null ? i : -1
      ).filter(i => i >= 0);

      if (aiNeedsVote.length > 0) {
        const timer = setTimeout(() => {
          const currentState = useGameStore.getState().gameState;
          if (!currentState || currentState.phase !== 'events' || !currentState.currentEvent || currentState.eventResolved) return;

          setGameState(prev => {
            if (!prev || !prev.currentEvent) return prev;
            const newVotes = [...prev.eventVotes];
            aiNeedsVote.forEach(aiIndex => {
              if (newVotes[aiIndex] === null) {
                newVotes[aiIndex] = decideEventVote(prev, aiIndex, prev.currentEvent);
              }
            });
            return { ...prev, eventVotes: newVotes };
          });
        }, 1000);
        return () => clearTimeout(timer);
      }
    }

    // --- Veche phase: auto-vote for attacks ---
    if (gameState.phase === 'veche' && gameState.attackPlanning === 'planning') {
      const aiNeedsVote = aiPlayers.map((isAi, i) =>
        isAi && gameState.attackVotes[i] === null ? i : -1
      ).filter(i => i >= 0);

      if (aiNeedsVote.length > 0) {
        const timer = setTimeout(() => {
          setGameState(prev => {
            if (!prev || prev.attackPlanning !== 'planning') return prev;
            const newVotes = [...prev.attackVotes];
            aiNeedsVote.forEach(aiIndex => {
              if (newVotes[aiIndex] === null) {
                newVotes[aiIndex] = decideAttackVote(prev, aiIndex);
              }
            });
            return { ...prev, attackVotes: newVotes };
          });
        }, 800);
        return () => clearTimeout(timer);
      }
    }

    // --- Veche phase: auto-vote for fortress ---
    if (gameState.phase === 'veche' && gameState.fortressPlanning === 'planning') {
      const aiNeedsVote = aiPlayers.map((isAi, i) =>
        isAi && gameState.fortressVotes[i] === null ? i : -1
      ).filter(i => i >= 0);

      if (aiNeedsVote.length > 0) {
        const timer = setTimeout(() => {
          setGameState(prev => {
            if (!prev || prev.fortressPlanning !== 'planning') return prev;
            const newVotes = [...prev.fortressVotes];
            aiNeedsVote.forEach(aiIndex => {
              if (newVotes[aiIndex] === null) {
                newVotes[aiIndex] = decideFortressVote(prev, aiIndex);
              }
            });
            return { ...prev, fortressVotes: newVotes };
          });
        }, 800);
        return () => clearTimeout(timer);
      }
    }
  }, [
    gameState?.phase,
    gameState?.currentPlayer,
    gameState?.currentEvent,
    gameState?.eventResolved,
    gameState?.eventVotes,
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

  // --- AI Discussion: trigger after all AI players have voted on events ---
  useEffect(() => {
    if (!gameState || gameState.phase !== 'events' || !gameState.currentEvent || gameState.eventResolved) return;
    if (gameState.currentEvent.type === 'immediate') return;

    // Check if all AI players have voted
    const allAiVoted = aiPlayers.every((isAi, i) => !isAi || gameState.eventVotes[i] !== null);
    console.log('[Discussion] Phase check: events, allAiVoted:', allAiVoted, 'votes:', gameState.eventVotes, 'aiPlayers:', aiPlayers);
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

  // Effects management functions
  const addEffect = (newEffect) => {
    setGameState(prev => ({
      ...prev,
      activeEffects: [...prev.activeEffects, {
        ...newEffect,
        id: `${newEffect.type}_${Date.now()}` // Generate unique ID
      }]
    }));
  };

  const updateEffects = () => {
    setGameState(prev => ({
      ...prev,
      activeEffects: prev.activeEffects
        .map(effect => ({
          ...effect,
          turnsRemaining: effect.turnsRemaining - 1
        }))
        .filter(effect => effect.turnsRemaining > 0)
    }));
  };

  // Calculate strength modifiers from active effects
  const getStrengthModifier = (faction) => {
    return gameState.activeEffects.reduce((total, effect) => {
      if (effect.type === 'strength_bonus' || effect.type === 'strength_penalty') {
        if (effect.target === 'all' || effect.target === faction) {
          return total + effect.value;
        }
      }
      return total;
    }, 0);
  };

  // Calculate income modifiers from active effects
  const getIncomeModifier = (faction) => {
    let modifier = 1.0; // Start with 100%
    gameState.activeEffects.forEach(effect => {
      if (effect.type === 'income_penalty') {
        if (effect.target === 'all' || effect.target === faction) {
          modifier *= (1 + effect.value); // value should be negative (e.g., -0.5 for -50%)
        }
      }
    });
    return modifier;
  };

  // Military calculation functions
  const calculatePlayerStrength = (playerIndex, isDefending = false, regionName = null) => {
    const player = gameState.players[playerIndex];

    // Base strength by faction
    let strength = 0;
    if (player.faction === 'Nobles') strength = 40;
    else if (player.faction === 'Merchants') strength = 15;
    else if (player.faction === 'Commoners') strength = 25;

    // Equipment bonuses
    strength += player.weapons * 5;
    strength += player.armor * 5;

    // Note: Fortress bonus is applied once to total strength in executeBattle, not per-player

    // Active effects
    strength += getStrengthModifier(player.faction);

    return Math.max(0, strength);
  };

  const calculateTotalPskovStrength = (participants, isDefending = false, regionName = null) => {
    return participants.reduce((total, playerIndex) => {
      return total + calculatePlayerStrength(playerIndex, isDefending, regionName);
    }, 0);
  };

  const getVictoryChance = (strengthDiff) => {
    if (strengthDiff >= 20) return 95;      // almost certain
    if (strengthDiff >= 15) return 85;      // very high chance
    if (strengthDiff >= 10) return 70;      // high chance
    if (strengthDiff >= 5) return 60;       // good chance
    if (strengthDiff >= 0) return 50;       // even
    if (strengthDiff >= -5) return 40;      // slightly unfavorable
    if (strengthDiff >= -10) return 30;     // low chance
    if (strengthDiff >= -15) return 15;     // very low chance
    return 5;                               // almost no chance
  };

  const rollForVictory = (strengthDiff) => {
    const chancePercent = getVictoryChance(strengthDiff);
    const roll = Math.random() * 100;
    return roll < chancePercent;
  };

  // Battle outcome functions
  const surrenderRegion = (gameState, regionName) => {

    console.log("=== SURRENDER REGION START ===");
    console.log("Surrendering region:", regionName);
    console.log("Regions before surrender:", Object.entries(gameState.regions).map(([name, region]) => `${name}: ${region.controller}`));

    if (regionName === 'pskov') {
      // Game over - Pskov captured
      return {
        ...gameState,
        gameOver: true,
        lastEventResult: t('battle.gameOver')
      };
    }

    // Lose the region and destroy all buildings except fortresses
    const newRegions = { ...gameState.regions };
    newRegions[regionName].controller = 'order';

    // Destroy buildings and update player improvement counts
    const newPlayers = [...gameState.players];
    Object.entries(newRegions[regionName].buildings).forEach(([buildingType, count]) => {
      if (count > 0) {
        newRegions[regionName].buildings[buildingType] = 0;

        // Update player improvement count
        newPlayers.forEach((player, index) => {
          if ((buildingType.includes('commoner') && player.faction === 'Commoners') ||
              (buildingType.includes('noble') && player.faction === 'Nobles') ||
              (buildingType.includes('merchant') && player.faction === 'Merchants')) {
            newPlayers[index] = { ...player, improvements: Math.max(0, player.improvements - count) };
          }
        });
      }
    });

    const regionDisplayName = regionName === 'bearhill' ? 'Bear Hill' : regionName.charAt(0).toUpperCase() + regionName.slice(1);

    console.log("Regions after surrender:", Object.entries(newRegions).map(([name, region]) => `${name}: ${region.controller}`));
    console.log("=== SURRENDER REGION END ===");
    
    return {
      ...gameState,
      regions: newRegions,
      players: newPlayers,
      lastEventResult: `${regionDisplayName} surrendered to the Order! All buildings destroyed.`
    };
  };

  const executeBattle = (gameState, orderStrength, targetRegion, defendingPlayers) => {
    // Calculate Pskov strength
    const pskovStrength = calculateTotalPskovStrength(defendingPlayers, true, targetRegion);

    // Add fortress bonus if defending
    let finalPskovStrength = pskovStrength;
    if (gameState.regions[targetRegion]?.fortress) {
      finalPskovStrength += 10;
    }

    // Calculate strength difference and roll for victory
    const strengthDiff = finalPskovStrength - orderStrength;
    const pskovWins = rollForVictory(strengthDiff);
    const chancePercent = getVictoryChance(strengthDiff);

    const regionDisplayName = t(`regions.${targetRegion}`);

    if (pskovWins) {
      // Successful defense
      return {
        ...gameState,
        lastEventResult: t('battle.defenseVictory', {
          region: regionDisplayName,
          chance: chancePercent,
          pskovStrength: finalPskovStrength,
          orderStrength: orderStrength
        })
      };
    } else {
      // Failed defense - lose region
      const result = surrenderRegion(gameState, targetRegion);
      return {
        ...result,
        lastEventResult: `${t('battle.defenseFailed', {
          region: regionDisplayName,
          chance: chancePercent,
          pskovStrength: finalPskovStrength,
          orderStrength: orderStrength
        })} ${result.lastEventResult}`
      };
    }
  };

  const initiateAttack = (targetRegion) => {
    setGameState(prev => ({
      ...prev,
      attackPlanning: 'planning',
      attackTarget: targetRegion,
      attackVotes: [null, null, null]
    }));
  };

  const executeAttack = () => {
    const { attackTarget, attackVotes } = gameState;
    const participants = attackVotes.filter(v => v === true).length;
    const costPerParticipant = participants > 0 ? (6 / participants) : 0;

    // Deduct money from participants
    const newPlayers = gameState.players.map((player, index) => {
      if (attackVotes[index] === true) {
        return { ...player, money: player.money - costPerParticipant };
      }
      return player;
    });

    // Get attacking players
    const attackingPlayers = [];
    attackVotes.forEach((vote, index) => {
      if (vote === true) attackingPlayers.push(index);
    });

    // Calculate Order strength (base 100 + fortress bonus)
    const orderStrength = 100 + (gameState.regions[attackTarget]?.fortress ? 10 : 0);

    // Calculate Pskov strength (attacking, so no fortress bonus for defenders)
    const pskovStrength = calculateTotalPskovStrength(attackingPlayers, false, null);

    // Execute battle
    const strengthDiff = pskovStrength - orderStrength;
    const pskovWins = rollForVictory(strengthDiff);
    const chancePercent = getVictoryChance(strengthDiff);
    const regionDisplayName = t(`regions.${attackTarget}`);

    setGameState(prev => {
      if (pskovWins) {
        // Successful attack - recapture region
        const newRegions = { ...prev.regions };
        newRegions[attackTarget].controller = 'republic';

        return {
          ...prev,
          players: newPlayers,
          regions: newRegions,
          attackPlanning: null,
          attackTarget: null,
          attackVotes: [null, null, null],
          lastEventResult: t('battle.attackVictory', {
            region: regionDisplayName,
            chance: chancePercent,
            pskovStrength: pskovStrength,
            orderStrength: orderStrength
          })
        };
      } else {
        // Failed attack
        return {
          ...prev,
          players: newPlayers,
          attackPlanning: null,
          attackTarget: null,
          attackVotes: [null, null, null],
          lastEventResult: t('battle.attackDefeat', {
            region: regionDisplayName,
            chance: chancePercent,
            pskovStrength: pskovStrength,
            orderStrength: orderStrength
          })
        };
      }
    });
  };

  // Fortress building functions
  const initiateFortressBuild = (targetRegion) => {
    setGameState(prev => ({
      ...prev,
      fortressPlanning: 'planning',
      fortressTarget: targetRegion,
      fortressVotes: [null, null, null]
    }));
  };

  const executeFortressBuild = () => {
    const { fortressTarget, fortressVotes } = gameState;
    const participants = fortressVotes.filter(v => v === true).length;
    const costPerParticipant = participants > 0 ? (6 / participants) : 0;

    // Check if all participants can afford their share
    let allCanAfford = true;
    gameState.players.forEach((player, index) => {
      if (fortressVotes[index] === true && player.money < costPerParticipant) {
        allCanAfford = false;
      }
    });

    if (participants === 0 || !allCanAfford) {
      // Not enough funding - cancel
      setGameState(prev => ({
        ...prev,
        fortressPlanning: null,
        fortressTarget: null,
        fortressVotes: [null, null, null],
        lastEventResult: t('battle.fortressCancelledInsufficient')
      }));
      return;
    }

    // Deduct money from participants
    const newPlayers = gameState.players.map((player, index) => {
      if (fortressVotes[index] === true) {
        return { ...player, money: player.money - costPerParticipant };
      }
      return player;
    });

    // Build the fortress
    const newRegions = { ...gameState.regions };
    newRegions[fortressTarget].fortress = true;

    const regionDisplayName = t(`regions.${fortressTarget}`);

    setGameState(prev => ({
      ...prev,
      players: newPlayers,
      regions: newRegions,
      fortressPlanning: null,
      fortressTarget: null,
      fortressVotes: [null, null, null],
      lastEventResult: t('battle.fortressBuilt', { region: regionDisplayName })
    }));
  };

  // Event system abstraction
  const eventTypes = {
    immediate: {
      resolve: (event, gameState) => {
        return event.effect(gameState);
      }
    },
    participation: {
      resolve: (event, gameState, votes) => {
        const participants = votes.filter(v => v === true).length;
        const costPerParticipant = participants > 0 ? event.totalCost / participants : 0;

        let allCanAfford = true;
        gameState.players.forEach((player, index) => {
          if (votes[index] === true && player.money < costPerParticipant) {
            allCanAfford = false;
          }
        });

        if (!allCanAfford || participants === 0) {
          return gameState;
        }

        const newPlayers = gameState.players.map((player, index) => {
          if (votes[index] === true) {
            return { ...player, money: player.money - costPerParticipant };
          }
          return player;
        });

        return { ...gameState, players: newPlayers };
      }
    },
    order_attack: {
      resolve: (event, gameState, votes) => {
        console.log("=== ORDER ATTACK START ===");
        console.log("Initial regions:", Object.entries(gameState.regions).map(([name, region]) => `${name}: ${region.controller}`));

        // Get valid attack targets using map adjacency (only regions adjacent to Order territory)
        const validTargets = getValidOrderAttackTargets(gameState.regions);

        // Filter out Pskov initially (only attack Pskov if it's the only valid target)
        const nonPskovTargets = validTargets.filter(name => name !== 'pskov');

        console.log("Valid attack targets (adjacent to Order):", validTargets);
        console.log("Non-Pskov targets:", nonPskovTargets);

        let targetRegion;
        if (nonPskovTargets.length > 0) {
          // Random target from valid adjacent regions (excluding Pskov)
          const randomIndex = Math.floor(Math.random() * nonPskovTargets.length);
          targetRegion = nonPskovTargets[randomIndex];
        } else if (validTargets.includes('pskov')) {
          // Only Pskov is a valid target - attack Pskov
          targetRegion = 'pskov';
        } else {
          // No valid targets (shouldn't happen in normal gameplay)
          console.log("No valid attack targets - Order cannot attack");
          return { ...gameState, lastEventResult: 'The Teutonic Order could not find a valid target to attack.' };
        }

        console.log("Selected target region:", targetRegion);

        const participants = votes.filter(v => v === true).length;
        const costPerParticipant = participants > 0 ? 3 / participants : 0;

        console.log("Participants:", participants, "Cost per participant:", costPerParticipant);
        console.log("Votes:", votes);

        // Check if defense is funded
        let allCanAfford = true;
        let defendingPlayers = [];

        gameState.players.forEach((player, index) => {
          if (votes[index] === true) {
            if (player.money < costPerParticipant) {
              allCanAfford = false;
            } else {
              defendingPlayers.push(index);
            }
          }
        });

        const defenseFunded = participants > 0 && allCanAfford;

        console.log("Defense funded:", defenseFunded);

        if (!defenseFunded) {
          // Surrender - lose the region immediately
          return surrenderRegion(gameState, targetRegion);
        }

        // Deduct money from participants
        const newPlayers = gameState.players.map((player, index) => {
          if (votes[index] === true) {
            return { ...player, money: player.money - costPerParticipant };
          }
          return player;
        });

        // Execute the battle
        const gameStateWithPayment = {
          ...gameState,
          players: newPlayers
        };

        return executeBattle(gameStateWithPayment, event.orderStrength, targetRegion, defendingPlayers);
      }
    },
    voting: {
      resolve: (event, gameState, votes) => {
        const voteCounts = {};
        votes.forEach(vote => {
          if (vote) {
            voteCounts[vote] = (voteCounts[vote] || 0) + 1;
          }
        });

        let winningOption = event.defaultOption || 'send_back';
        let maxVotes = 0;
        Object.entries(voteCounts).forEach(([option, count]) => {
          if (count >= 2) {
            if (count > maxVotes) {
              maxVotes = count;
              winningOption = option;
            }
          }
        });

        if (winningOption === 'accept' && event.acceptCost) {
          const acceptVoters = votes.filter(v => v === 'accept').length;
          const costPerVoter = acceptVoters > 0 ? event.acceptCost / acceptVoters : 0;

          let allCanAfford = true;
          gameState.players.forEach((player, index) => {
            if (votes[index] === 'accept' && player.money < costPerVoter) {
              allCanAfford = false;
            }
          });

          if (!allCanAfford || acceptVoters === 0) {
            winningOption = event.defaultOption || 'send_back';
          }
        }

        return event.effects[winningOption](gameState, votes);
      }
    }
  };

  // Event deck with all events
  const eventDeck = [
    {
      id: 'merchants_robbed',
      name: 'Merchants Robbed',
      description: 'Foreign merchants have been robbed near your borders. How will you respond?',
      type: 'voting',
      defaultOption: 'trade_risk',
      options: [
        { id: 'rob_foreign', name: 'Rob foreign merchants', effectText: '50% chance: Order attacks (100)' },
        { id: 'demand_compensation', name: 'Demand compensation', costText: 'Merchants: -1○', effectText: '50% chance: Merchants -10 str/3 turns' },
        { id: 'trade_risk', name: 'Trade is risk', effectText: 'Merchants: -10 str/3 turns' }
      ],
      effects: {
        rob_foreign: (gameState) => {
          // Roll 1-6, on 1-3 Order attack occurs
          const roll = Math.floor(Math.random() * 6) + 1;

          if (roll <= 3) {
            // Trigger immediate Order attack with strength 100
            const orderAttackEvent = {
              id: 'order_attack_rob_foreign',
              name: 'Order Attack (100)',
              description: 'The Teutonic Order retaliates for the robbed merchants! They attack with strength 100.',
              type: 'order_attack',
              orderStrength: 100,
              question: 'Who will help fund the defense? Cost will be split evenly among participants.',
              minCostPerPlayer: 1,
              successText: 'DEFENSE FUNDED',
              failureText: 'NO DEFENSE - SURRENDER'
            };

            return {
              ...gameState,
              currentEvent: orderAttackEvent,
              eventResolved: false,
              eventVotes: [null, null, null],
              lastEventResult: `Rolled ${roll}! The Order attacks immediately!`
            };
          } else {
            return {
              ...gameState,
              lastEventResult: `Rolled ${roll}. The robbery went unnoticed.`
            };
          }
        },
        demand_compensation: (gameState) => {
          const newPlayers = gameState.players.map(player => {
            if (player.faction === 'Merchants') {
              return { ...player, money: Math.max(0, player.money - 1) };
            }
            return player;
          });
          const rollFailed = Math.random() < 0.5;
          if (rollFailed) {
            const merchantWeaknessEffect = {
              id: `merchant_weakness_${Date.now()}`,
              type: 'strength_penalty',
              target: 'Merchants',
              value: -10, // TODO -50% strength implemented as flat -10 points for now
              turnsRemaining: 3,
              description: 'Merchant trading weakness'
            };
            return {
              ...gameState,
              players: newPlayers,
              activeEffects: [...gameState.activeEffects, merchantWeaknessEffect],
              lastEventResult: 'Compensation demand failed! Merchants weakened for 3 turns.'
            };
          } else {
            return {
              ...gameState,
              players: newPlayers,
              lastEventResult: 'Compensation received successfully.'
            };
          }
        },
        trade_risk: (gameState) => {
          const merchantWeaknessEffect = {
            id: `merchant_weakness_${Date.now()}`,
            type: 'strength_penalty',
            target: 'Merchants',
            value: -10, // -50% strength
            turnsRemaining: 3,
            description: 'Trade route disruption'
          };
          return {
            ...gameState,
            activeEffects: [...gameState.activeEffects, merchantWeaknessEffect],
            lastEventResult: 'Trade routes disrupted! Merchants lose 50% strength for 3 turns.'
          };
        }
      }
    },
    {
      id: 'order_attack_95',
      name: 'Order Attack (95)',
      description: 'The Teutonic Order attacks with strength 95. Who will contribute to the defense?',
      type: 'order_attack',
      orderStrength: 95,
      question: 'Who will help fund the defense? Cost will be split evenly among participants.',
      minCostPerPlayer: 1
    },
    {
      id: 'order_attack_110',
      name: 'Order Attack (110)',
      description: 'The Teutonic Order attacks with strength 110. Who will contribute to the defense?',
      type: 'order_attack',  // CHANGE FROM 'participation' TO 'order_attack'
      orderStrength: 110,    // ADD THIS
      question: 'Who will help fund the defense? Cost will be split evenly among participants.',
      minCostPerPlayer: 1
    },
    {
      id: 'boyars_take_bribes',
      name: 'Nobles Take Bribes',
      description: 'Noble corruption has been discovered. How will you handle this?',
      type: 'voting',
      defaultOption: 'ignore',
      options: [
        { id: 'investigate', name: 'Investigate and punish', costText: 'Nobles: -2○', effectText: 'Nobles: -15 str/3 turns' },
        { id: 'ignore', name: 'This is the way it is', effectText: '50% chance: Uprising (buildings destroyed)' }
      ],
      effects: {
        investigate: (gameState) => {
          const newPlayers = gameState.players.map((player, index) => {
            if (player.faction === 'Nobles') {
              return { ...player, money: Math.max(0, player.money - 2) };
            }
            return player;
          });

          // ADD: Noble strength penalty for corruption investigation
          const nobleWeaknessEffect = {
            id: `noble_corruption_penalty_${Date.now()}`,
            type: 'strength_penalty',
            target: 'Nobles',
            value: -15,
            turnsRemaining: 3,
            description: 'Noble corruption investigation penalty'
          };

          return { 
            ...gameState, 
            players: newPlayers,
            activeEffects: [...gameState.activeEffects, nobleWeaknessEffect],
            lastEventResult: 'Nobles punished for corruption! -2○ and -15 strength for 3 turns.'
          };
        },
        ignore: (gameState) => {
          // 50% chance of uprising
          const uprisingRoll = Math.random();
          if (uprisingRoll < 0.5) {
            // Uprising occurs - destroy 2 random buildings in Pskov
            const pskovRegion = gameState.regions.pskov;
            const buildingTypes = Object.entries(pskovRegion.buildings).filter(([_, count]) => count > 0);

            let newRegions = { ...gameState.regions };
            let newPlayers = [...gameState.players];
            let destroyedBuildings = [];

            // Destroy up to 2 buildings
            for (let i = 0; i < Math.min(2, buildingTypes.length); i++) {
              if (buildingTypes.length > 0) {
                const randomIndex = Math.floor(Math.random() * buildingTypes.length);
                const [buildingType, _] = buildingTypes[randomIndex];

                // Destroy the building
                if (buildingType.startsWith('merchant_')) {
                  newRegions.pskov.buildings[buildingType] = Math.max(0, newRegions.pskov.buildings[buildingType] - 1);
                } else {
                  newRegions.pskov.buildings[buildingType] = 0;
                }

                // Update player improvement count
                newPlayers = newPlayers.map(player => {
                  if ((buildingType.includes('commoner') && player.faction === 'Commoners') ||
                      (buildingType.includes('noble') && player.faction === 'Nobles') ||
                      (buildingType.includes('merchant') && player.faction === 'Merchants')) {
                    return { ...player, improvements: Math.max(0, player.improvements - 1) };
                  }
                  return player;
                });

                // Track destroyed building for message
                const buildingNames = {
                  'commoner_huts': 'Huts',
                  'commoner_church': 'Village Church',
                  'noble_manor': 'Manor',
                  'noble_monastery': 'Monastery',
                  'merchant_mansion': 'Mansion',
                  'merchant_church': 'Merchant Church'
                };
                destroyedBuildings.push(buildingNames[buildingType] || buildingType);

                // Remove from available buildings for next iteration
                buildingTypes.splice(randomIndex, 1);
              }
            }

            return { 
              ...gameState, 
              regions: newRegions,
              players: newPlayers,
              activeEffects: [...gameState.activeEffects, {
                id: `uprising_penalty_${Date.now()}`,
                type: 'strength_penalty',
                target: 'all',
                value: -7, // TODO -50% implemented as flat -25 points for now
                turnsRemaining: 2,
                description: 'Uprising strength penalty'
              }],
              lastEventResult: `UPRISING! All factions lose 50% strength. Buildings destroyed: ${destroyedBuildings.join(', ')}`
            };
          } else {
            return { 
              ...gameState,
              lastEventResult: 'Corruption ignored. The people grumble but no uprising occurs.'
            };
          }
        }
      }
    },
    {
      id: 'embassy',
      name: 'Embassy',
      description: 'An embassy from the Grand Prince arrives. How will you receive them?',
      type: 'voting',
      defaultOption: 'modest',
      options: [
        { id: 'modest', name: 'Receive modestly', requiresMinMoney: 1, costText: '3○ split', effectText: 'Relations maintained' },
        { id: 'luxurious', name: 'Receive luxuriously', requiresMinMoney: 2, costText: '6○ split', effectText: 'All: +3 str/3 turns' },
        { id: 'refuse', name: 'Refuse to receive them', effectText: 'All: -15 str, -50% income/5 turns' }
      ],
      effects: {
        modest: (gameState, votes) => {
          const participants = votes.filter(v => v === 'modest').length;
          const costPerParticipant = participants > 0 ? 3 / participants : 0;

          let allCanAfford = true;
          gameState.players.forEach((player, index) => {
            if (votes[index] === 'modest' && player.money < costPerParticipant) {
              allCanAfford = false;
            }
          });

          if (!allCanAfford || participants === 0) {
            // Fall back to refuse with proper effects
            const refusalEffects = [
              {
                id: `embassy_strength_penalty_${Date.now()}`,
                type: 'strength_penalty',
                target: 'all',
                value: -15,
                turnsRemaining: 5,
                description: 'Embassy refusal strength penalty'
              },
              {
                id: `embassy_income_penalty_${Date.now()}`,
                type: 'income_penalty',
                target: 'all',
                value: -0.5, // -50% income
                turnsRemaining: 5,
                description: 'Embassy refusal income penalty'
              }
            ];

            return { 
              ...gameState,
              activeEffects: [...gameState.activeEffects, ...refusalEffects],
              lastEventResult: 'Embassy refused! Grand Prince is insulted. -50% strength and income for 5 turns.'
            };
          }

          const newPlayers = gameState.players.map((player, index) => {
            if (votes[index] === 'modest') {
              return { ...player, money: player.money - costPerParticipant };
            }
            return player;
          });

          return { 
            ...gameState, 
            players: newPlayers,
            lastEventResult: 'Embassy received modestly. Relations maintained.'
          };
        },
        luxurious: (gameState, votes) => {
          const participants = votes.filter(v => v === 'luxurious').length;
          const costPerParticipant = participants > 0 ? 6 / participants : 0;

          let allCanAfford = true;
          gameState.players.forEach((player, index) => {
            if (votes[index] === 'luxurious' && player.money < costPerParticipant) {
              allCanAfford = false;
            }
          });

          if (!allCanAfford || participants === 0) {
            // Fall back to modest reception
            return gameState.currentEvent.effects.modest(gameState, votes.map(() => 'modest'));
          }

          const newPlayers = gameState.players.map((player, index) => {
            if (votes[index] === 'luxurious') {
              return { ...player, money: player.money - costPerParticipant };
            }
            return player;
          });

          // Create the strength bonus effect
          const strengthEffect = {
            id: `embassy_strength_bonus_${Date.now()}`,
            type: 'strength_bonus',
            target: 'all',
            value: 3,
            turnsRemaining: 3,
            description: 'Embassy reception boost'
          };

          return { 
            ...gameState, 
            players: newPlayers,
            activeEffects: [...gameState.activeEffects, strengthEffect],
            lastEventResult: 'Embassy received luxuriously! +10 strength for 3 turns.'
          };
        },
        refuse: (gameState) => {
          const newEffects = [
            {
              id: `embassy_strength_penalty_${Date.now()}`,
              type: 'strength_penalty',
              target: 'all',
              value: -15, // Fixed strength penalty
              turnsRemaining: 5,
              description: 'Embassy refusal strength penalty'
            },
            {
              id: `embassy_income_penalty_${Date.now()}`,
              type: 'income_penalty',
              target: 'all',
              value: -0.5, // Fixed income penalty (-50%)
              turnsRemaining: 5,
              description: 'Embassy refusal income penalty'
            }
          ];

          return { 
            ...gameState,
            activeEffects: [...gameState.activeEffects, ...newEffects],
            lastEventResult: 'Embassy refused! Grand Prince is insulted.  Strength -15 and income -50% for 5 turns.'
          };
        }
      }
    },
    {
      id: 'relics_found',
      name: 'Relics Found',
      description: 'Holy relics have been discovered. Are they genuine or deception?',
      type: 'voting',
      options: [
        { id: 'build_temple', name: 'Build a church', requiresMinMoney: 1, costText: 'All: -3○', effectText: 'All: +5 str/3 turns' },
        { id: 'deception', name: 'It\'s all deception', effectText: 'All: -5 str/3 turns' }
      ],
      effects: {
        build_temple: (gameState) => {
          const newPlayers = gameState.players.map(player => ({
            ...player,
            money: Math.max(0, player.money - 3)
          }));
          // ADD: Morale boost from relics
          const relicsBoostEffect = {
            id: `relics_boost_${Date.now()}`,
            type: 'strength_bonus',
            target: 'all',
            value: 5,
            turnsRemaining: 3,
            description: 'Holy relics morale boost'
          };

          return { 
            ...gameState, 
            players: newPlayers,
            activeEffects: [...gameState.activeEffects, relicsBoostEffect],
            lastEventResult: 'Church built for holy relics! +5 strength for 3 turns.'
          };
          },
        deception: (gameState) => {
          // ADD: Morale penalty from cynicism
          const cynicismEffect = {
            id: `cynicism_penalty_${Date.now()}`,
            type: 'strength_penalty',
            target: 'all',
            value: -5,
            turnsRemaining: 3,
            description: 'Religious cynicism penalty'
          };

          return { 
            ...gameState,
            activeEffects: [...gameState.activeEffects, cynicismEffect],
            lastEventResult: 'Relics declared false! Religious cynicism spreads. -5 strength for 3 turns.'
          };
        }
      }
    },
    {
      id: 'izhorian_delegation',
      name: 'Delegation from the Izhorians',
      description: 'A delegation from the Izhorian people arrives at your gates seeking an audience.',
      type: 'voting',
      acceptCost: 6,
      defaultOption: 'send_back',
      options: [
        { id: 'accept', name: 'Accept into service', requiresMinMoney: 2, costText: '6○ split', effectText: 'All: +5 str/6 turns' },
        { id: 'rob', name: 'Rob them', effectText: 'All: +3○, then -5 str/6 turns' },
        { id: 'send_back', name: 'Send them away', effectText: 'No effect' }
      ],
      effects: {
        accept: (gameState, votes) => {
          const participants = votes.filter(v => v === 'accept').length;
          const costPerParticipant = participants > 0 ? 6 / participants : 0;

          // ADD: Check if all participants can afford it
          let allCanAfford = true;
          gameState.players.forEach((player, index) => {
            if (votes[index] === 'accept' && player.money < costPerParticipant) {
              allCanAfford = false;
            }
          });

          // ADD: Fallback if anyone can't afford it or no participants
          if (!allCanAfford || participants === 0) {
            return gameState.currentEvent.effects.send_back(gameState);
          }
          
          const newPlayers = gameState.players.map((player, index) => {
            if (votes[index] === 'accept') {
              return { ...player, money: player.money - costPerParticipant };
            }
            return player;
          });
          // Alliance strength bonus
          const izhoraAllianceEffect = {
            id: `izhora_alliance_${Date.now()}`,
            type: 'strength_bonus',
            target: 'all',
            value: 5,
            turnsRemaining: 6,
            description: 'Izhora allied forces'
          };

          return { 
            ...gameState, 
            players: newPlayers,
            activeEffects: [...gameState.activeEffects, izhoraAllianceEffect],
            lastEventResult: 'Izhorians accepted into service! +5 strength for 6 turns.'
          };
          },
        rob: (gameState) => {
          const newPlayers = gameState.players.map(player => ({
            ...player,
            money: player.money + 3
          }));
          // Izhora hostility penalty
          const izhoraHostilityEffect = {
            id: `chud_hostility_${Date.now()}`,
            type: 'strength_penalty',
            target: 'all',
            value: -5,
            turnsRemaining: 6,
            description: 'Izhora hostility'
          };

          return { 
            ...gameState, 
            players: newPlayers,
            activeEffects: [...gameState.activeEffects, izhoraHostilityEffect],
            lastEventResult: 'Izhorians robbed! They become hostile. -5 strength for 6 turns.'
          };
        },
        send_back: (gameState) => {
          return gameState;
        }
      }
    },
    {
      id: 'good_harvest',
      name: 'Good Harvest',
      description: 'The fields have produced an abundant harvest. All players receive +1○.',
      type: 'immediate',
      effect: (gameState) => {
        const newPlayers = gameState.players.map(player => ({
          ...player,
          money: player.money + 1
        }));
        return { ...gameState, players: newPlayers };
      }
    },
    {
      id: 'drought',
      name: 'Drought',
      description: 'The crops are failing due to lack of rain. How will you respond?',
      type: 'voting',
      defaultOption: 'no_food',
      options: [
        { id: 'buy_food', name: 'Buy emergency food supplies', requiresMinMoney: 2, costText: '6○ split', effectText: 'Famine avoided' },
        { id: 'no_food', name: 'Let the people endure', effectText: 'Commoners: -12 str/3 turns' }
      ],
      effects: {
        buy_food: (gameState, votes) => {
          const participants = votes.filter(v => v === 'buy_food').length;
          const costPerParticipant = participants > 0 ? 6 / participants : 0;

          // Check if all participants can afford it
          let allCanAfford = true;
          gameState.players.forEach((player, index) => {
            if (votes[index] === 'buy_food' && player.money < costPerParticipant) {
              allCanAfford = false;
            }
          });

          // If anyone can't afford it or no participants, fall back to no food
          if (!allCanAfford || participants === 0) {
            return gameState.currentEvent.effects.no_food(gameState);
          }

          // Deduct money from participants
          const newPlayers = gameState.players.map((player, index) => {
            if (votes[index] === 'buy_food') {
              return { ...player, money: player.money - costPerParticipant };
            }
            return player;
          });

          return { 
            ...gameState, 
            players: newPlayers,
            lastEventResult: 'Emergency food purchased! Famine avoided.'
          };
        },
        no_food: (gameState) => {
          const famineEffect = {
            id: `drought_famine_${Date.now()}`,
            type: 'strength_penalty',
            target: 'Commoners',
            value: -12, // Reduces Commoners from 25 to 13 strength (roughly -50%)
            turnsRemaining: 3,
            description: 'Famine weakens commoners'
          };

          return { 
            ...gameState,
            activeEffects: [...gameState.activeEffects, famineEffect],
            lastEventResult: 'Famine strikes! Commoners lose 50% strength for 3 turns.'
          };
        }
      }
    },
    {
      id: 'fire',
      name: 'Fire',
      description: 'A fire breaks out in one of your regions, destroying a building.',
      type: 'immediate',
      effect: (gameState) => {
        // Roll for region (1-6 for republic regions)
        const republicRegions = Object.entries(gameState.regions).filter(([_, region]) => region.controller === 'republic');
        if (republicRegions.length === 0) return gameState; // No regions to burn

        const randomRegionIndex = Math.floor(Math.random() * republicRegions.length);
        const [regionName, region] = republicRegions[randomRegionIndex];

        // Find all buildings in this region
        const buildingTypes = Object.entries(region.buildings).filter(([_, count]) => count > 0);
        if (buildingTypes.length === 0) {
          // No buildings to burn
          return { 
            ...gameState, 
            lastEventResult: `Fire breaks out in ${regionName.charAt(0).toUpperCase() + regionName.slice(1)}, but there are no buildings to burn.`
          };
        }

        // Roll for building type
        const randomBuildingIndex = Math.floor(Math.random() * buildingTypes.length);
        const [buildingType, _] = buildingTypes[randomBuildingIndex];

        // Destroy the building
        const newRegions = { ...gameState.regions };
        if (buildingType.startsWith('merchant_')) {
          newRegions[regionName].buildings[buildingType] = Math.max(0, newRegions[regionName].buildings[buildingType] - 1);
        } else {
          newRegions[regionName].buildings[buildingType] = 0;
        }

        // Update player improvement count
        const newPlayers = gameState.players.map(player => {
          if ((buildingType.includes('commoner') && player.faction === 'Commoners') ||
              (buildingType.includes('noble') && player.faction === 'Nobles') ||
              (buildingType.includes('merchant') && player.faction === 'Merchants')) {
            return { ...player, improvements: Math.max(0, player.improvements - 1) };
          }
          return player;
        });

        // Create human-readable building name
        const buildingNames = {
          'commoner_huts': 'Huts',
          'commoner_church': 'Village Church',
          'noble_manor': 'Manor',
          'noble_monastery': 'Monastery',
          'merchant_mansion': 'Mansion',
          'merchant_church': 'Merchant Church'
        };

        const buildingName = buildingNames[buildingType] || buildingType;
        const regionDisplayName = regionName === 'bearhill' ? 'Bear Hill' : regionName.charAt(0).toUpperCase() + regionName.slice(1);

        return { 
          ...gameState, 
          regions: newRegions,
          players: newPlayers,
          lastEventResult: `Fire destroys ${buildingName} in ${regionDisplayName}!`
        };
      }
    },
    {
      id: 'city_fire',
      name: 'City Fire',
      description: 'A fire breaks out in Pskov, destroying a building in the city.',
      type: 'immediate',
      effect: (gameState) => {
        const pskovRegion = gameState.regions.pskov;

        // Find all buildings in Pskov
        const buildingTypes = Object.entries(pskovRegion.buildings).filter(([_, count]) => count > 0);
        if (buildingTypes.length === 0) {
          return { 
            ...gameState, 
            lastEventResult: `Fire breaks out in Pskov, but there are no buildings to burn.`
          };
        }

        // Roll for building type
        const randomBuildingIndex = Math.floor(Math.random() * buildingTypes.length);
        const [buildingType, _] = buildingTypes[randomBuildingIndex];

        // Destroy the building
        const newRegions = { ...gameState.regions };
        if (buildingType.startsWith('merchant_')) {
          newRegions.pskov.buildings[buildingType] = Math.max(0, newRegions.pskov.buildings[buildingType] - 1);
        } else {
          newRegions.pskov.buildings[buildingType] = 0;
        }

        // Update player improvement count
        const newPlayers = gameState.players.map(player => {
          if ((buildingType.includes('commoner') && player.faction === 'Commoners') ||
              (buildingType.includes('noble') && player.faction === 'Nobles') ||
              (buildingType.includes('merchant') && player.faction === 'Merchants')) {
            return { ...player, improvements: Math.max(0, player.improvements - 1) };
          }
          return player;
        });

        // Create human-readable building name
        const buildingNames = {
          'commoner_huts': 'Huts',
          'commoner_church': 'Village Church',
          'noble_manor': 'Manor',
          'noble_monastery': 'Monastery',
          'merchant_mansion': 'Mansion',
          'merchant_church': 'Merchant Church'
        };

        const buildingName = buildingNames[buildingType] || buildingType;

        return { 
          ...gameState, 
          regions: newRegions,
          players: newPlayers,
          lastEventResult: `City fire destroys ${buildingName} in Pskov!`
        };
      }
    },
    {
      id: 'heresy',
      name: 'Heresy',
      description: 'Heretical ideas spread among the people, weakening military resolve.',
      type: 'immediate',
      effect: (gameState) => {
        const heresyEffect = {
          id: `heresy_penalty_${Date.now()}`,
          type: 'strength_penalty',
          target: 'all',
          value: -10,
          turnsRemaining: 2,
          description: 'Heretical discord'
        };
    
        return { 
          ...gameState,
          activeEffects: [...gameState.activeEffects, heresyEffect],
          lastEventResult: 'Heretical ideas spread! All factions lose 10 strength for 2 turns.'
        };
      }
    },
    {
      id: 'order_attack_90',
      name: 'Order Attack (90)',
      description: 'The Teutonic Order attacks with strength 90. Who will contribute to the defense?',
      type: 'order_attack',
      orderStrength: 90,
      question: 'Who will help fund the defense? Cost will be split evenly among participants.',
      minCostPerPlayer: 1
    },
    {
      id: 'order_attack_100',
      name: 'Order Attack (100)',
      description: 'The Teutonic Order attacks with strength 100. Who will contribute to the defense?',
      type: 'order_attack',
      orderStrength: 100,
      question: 'Who will help fund the defense? Cost will be split evenly among participants.',
      minCostPerPlayer: 1
    },
    {
      id: 'order_attack_105',
      name: 'Order Attack (105)',
      description: 'The Teutonic Order attacks with strength 105. Who will contribute to the defense?',
      type: 'order_attack',
      orderStrength: 105,
      question: 'Who will help fund the defense? Cost will be split evenly among participants.',
      minCostPerPlayer: 1
    },
    {
      id: 'order_attack_110',
      name: 'Order Attack (110)',
      description: 'The Teutonic Order attacks with strength 110. Who will contribute to the defense?',
      type: 'order_attack',
      orderStrength: 110,
      question: 'Who will help fund the defense? Cost will be split evenly among participants.',
      minCostPerPlayer: 1
    },
    {
      id: 'plague',
      name: 'Plague',
      description: 'A plague spreads through the city. How will you respond?',
      type: 'voting', // CHANGE: from 'participation' to 'voting'
      defaultOption: 'no_isolation',
      options: [
        { id: 'fund_isolation', name: 'Fund isolation and treatment', requiresMinMoney: 1, costText: '3○ split', effectText: 'All: -5 str/2 turns' },
        { id: 'no_isolation', name: 'Trust in God - no isolation', effectText: 'All: -25 str/2 turns' }
      ],
      effects: {
        fund_isolation: (gameState, votes) => {
          const participants = votes.filter(v => v === 'fund_isolation').length;
          const costPerParticipant = participants > 0 ? 3 / participants : 0;

          // Check if all participants can afford it
          let allCanAfford = true;
          gameState.players.forEach((player, index) => {
            if (votes[index] === 'fund_isolation' && player.money < costPerParticipant) {
              allCanAfford = false;
            }
          });

          // If anyone can't afford it or no participants, fall back to no isolation
          if (!allCanAfford || participants === 0) {
            return gameState.currentEvent.effects.no_isolation(gameState);
          }

          // Deduct money from participants
          const newPlayers = gameState.players.map((player, index) => {
            if (votes[index] === 'fund_isolation') {
              return { ...player, money: player.money - costPerParticipant };
            }
            return player;
          });

          // ADD: Even with isolation, there's still some plague impact
          const mildPlagueEffect = {
            id: `mild_plague_${Date.now()}`,
            type: 'strength_penalty',
            target: 'all',
            value: -5, // -5 strength penalty even with isolation
            turnsRemaining: 2,
            description: 'Mild plague effects despite isolation'
          };

          return { 
            ...gameState, 
            players: newPlayers,
            activeEffects: [...gameState.activeEffects, mildPlagueEffect],
            lastEventResult: 'Plague partially contained! All factions lose 5 strength for 2 turns.'
          };
        },
        no_isolation: (gameState) => {
          const plagueEffect = {
            id: `severe_plague_${Date.now()}`,
            type: 'strength_penalty',
            target: 'all',
            value: -25, // -25 strength penalty without isolation
            turnsRemaining: 2,
            description: 'Severe plague weakens population'
          };

          return { 
            ...gameState,
            activeEffects: [...gameState.activeEffects, plagueEffect],
            lastEventResult: 'Plague spreads unchecked! All factions lose 25 strength for 2 turns.'
          };
        }
      }
    }
  ];

  // Draw event (debug mode vs random)
  const drawEvent = (currentDebugIndex = 0) => {
    if (DEBUG_MODE) {
      return eventDeck[currentDebugIndex % eventDeck.length];
    } else {
      return eventDeck[Math.floor(Math.random() * eventDeck.length)];
    }
  };

  // Vote on current event
  const voteOnEvent = (playerIndex, vote) => {
    // In online mode, send action to server
    if (mode === 'online') {
      // Only allow voting for own faction
      if (playerIndex !== playerId) {
        console.warn('Cannot vote for another player');
        return;
      }
      sendAction({ type: 'VOTE_EVENT', vote });

      // After voting, check if all players have voted and auto-resolve
      // Note: We check the NEXT state since this vote will be added
      setTimeout(() => {
        const currentState = useGameStore.getState().gameState;
        if (currentState && currentState.eventVotes) {
          const allVoted = currentState.eventVotes.every(v => v !== null);
          if (allVoted && !currentState.eventResolved) {
            // Auto-resolve when all players have voted
            sendAction({ type: 'RESOLVE_EVENT' });
          }
        }
      }, 500); // Wait for server to broadcast updated votes
    } else {
      // Local mode: update state directly
      setGameState(prev => {
        const newVotes = [...prev.eventVotes];
        newVotes[playerIndex] = vote;
        return { ...prev, eventVotes: newVotes };
      });
    }
  };

  // Get voting result for any multi-option event
  const getVotingResult = () => {
    const votes = gameState.eventVotes;
    const completedVotes = votes.filter(v => v !== null);

    if (completedVotes.length === 3) {
      const voteCounts = {};
      votes.forEach(vote => {
        if (vote) {
          voteCounts[vote] = (voteCounts[vote] || 0) + 1;
        }
      });

      let winningOption = null;
      let maxVotes = 0;
      Object.entries(voteCounts).forEach(([option, count]) => {
        if (count >= 2) {
          if (count > maxVotes) {
            maxVotes = count;
            winningOption = option;
          }
        }
      });

      return winningOption || 'send_back';
    }
    return null;
  };

  // Check if participation is complete and get result
  const getParticipationResult = () => {
    const votes = gameState.eventVotes;
    const completedVotes = votes.filter(v => v !== null);

    if (completedVotes.length === 3) {
      const participants = votes.filter(v => v === true).length;
      return participants > 0 ? 'success' : 'failed';
    }
    return null;
  };

  // Calculate victory points for each player
  const calculateVictoryPoints = (player) => {
    return player.improvements;
  };

  // Check if game is over and determine winner
  const getGameResult = () => {
    if (gameState.turn > 20) {
      const playerScores = gameState.players.map((player, index) => ({
        faction: player.faction,
        victoryPoints: calculateVictoryPoints(player),
        money: player.money,
        index
      }));

      playerScores.sort((a, b) => {
        if (b.victoryPoints !== a.victoryPoints) {
          return b.victoryPoints - a.victoryPoints;
        }
        return b.money - a.money;
      });

      return {
        winner: playerScores[0],
        rankings: playerScores
      };
    }
    return null;
  };

  // Get available buildings for current player in selected region
  const getAvailableBuildings = (playerIndex = gameState.currentPlayer) => {
    const player = gameState.players[playerIndex];
    const region = gameState.regions[gameState.selectedRegion];
    const buildings = [];

    if (player.faction === 'Commoners') {
      buildings.push(
        { 
          type: 'commoner_huts', 
          name: 'Huts', 
          cost: 2, 
          built: region.buildings.commoner_huts > 0,
          canBuild: region.buildings.commoner_huts === 0
        },
        { 
          type: 'commoner_church', 
          name: 'Village Church', 
          cost: 2, 
          built: region.buildings.commoner_church > 0,
          canBuild: region.buildings.commoner_church === 0
        }
      );
    } else if (player.faction === 'Nobles') {
      buildings.push(
        { 
          type: 'noble_manor', 
          name: 'Manor', 
          cost: 2, 
          built: region.buildings.noble_manor > 0,
          canBuild: region.buildings.noble_manor === 0
        },
        { 
          type: 'noble_monastery', 
          name: 'Monastery', 
          cost: 2, 
          built: region.buildings.noble_monastery > 0,
          canBuild: region.buildings.noble_monastery === 0
        }
      );
    } else if (player.faction === 'Merchants') {
      if (gameState.selectedRegion === 'pskov') {
        buildings.push(
          { 
            type: 'merchant_mansion', 
            name: 'Mansion', 
            cost: 2, 
            built: region.buildings.merchant_mansion,
            canBuild: region.buildings.merchant_mansion < 7
          },
          { 
            type: 'merchant_church', 
            name: 'Church', 
            cost: 2, 
            built: region.buildings.merchant_church,
            canBuild: region.buildings.merchant_church < 7
          }
        );
      }
    }

    return buildings;
  };

  const buildBuilding = (buildingType) => {
    // In online mode, send action to server
    if (mode === 'online') {
      sendAction({ type: 'BUILD_BUILDING', buildingType });
      return;
    }

    // Local mode: update state directly
    setGameState(prev => {
      const player = prev.players[prev.currentPlayer];

      if (player.money < 2) {
        return prev;
      }

      const newPlayers = prev.players.map((p, i) =>
        i === prev.currentPlayer
          ? { ...p, money: p.money - 2, improvements: p.improvements + 1 }
          : p
      );

      const newConstructionActions = prev.constructionActions.map((ca, i) =>
        i === prev.currentPlayer
          ? { ...ca, improvement: true }
          : ca
      );

      const currentRegion = prev.regions[prev.selectedRegion];
      const newBuildings = buildingType.startsWith('merchant_')
        ? { ...currentRegion.buildings, [buildingType]: currentRegion.buildings[buildingType] + 1 }
        : { ...currentRegion.buildings, [buildingType]: 1 };

      const newRegions = {
        ...prev.regions,
        [prev.selectedRegion]: {
          ...currentRegion,
          buildings: newBuildings
        }
      };

      return {
        ...prev,
        regions: newRegions,
        players: newPlayers,
        constructionActions: newConstructionActions
      };
    });
  };

  const nextPhase = () => {
    // In online mode, send action to server
    if (mode === 'online') {
      sendAction({ type: 'NEXT_PHASE' });
      return;
    }

    // Local mode: update state directly
    const currentPhaseIndex = phases.indexOf(gameState.phase);
    const isLastPhase = currentPhaseIndex === phases.length - 1;

    setGameState(prev => {
      const isResourcesPhase = prev.phase === 'resources';
      const isConstructionPhase = prev.phase === 'construction';
      const nextPhase = isLastPhase ? phases[0] : phases[currentPhaseIndex + 1];

      let newState = { ...prev };

      // Auto-calculate income during resources phase
      if (isResourcesPhase) {
        const republicRegions = Object.values(prev.regions).filter(r => r.controller === 'republic').length;
        newState.players = prev.players.map((player, index) => {
          const baseIncome = 0.5 + (republicRegions * 0.25) + (player.improvements * 0.25);
          const incomeModifier = getIncomeModifier(player.faction);
          const finalIncome = baseIncome * incomeModifier;
          return {
            ...player,
            money: player.money + finalIncome
          };
        });
      }

      // Draw event when moving TO events phase
      if (nextPhase === 'events') {
        newState.currentEvent = drawEvent(prev.debugEventIndex);
        newState.eventVotes = [null, null, null];
        newState.eventResolved = false;
        newState.eventImageRevealed = false; // Start with hidden image
        if (DEBUG_MODE) {
          newState.debugEventIndex = (prev.debugEventIndex + 1) % eventDeck.length;
        }
      }

      // Reset current player and construction actions when leaving construction
      if (isConstructionPhase) {
        newState.currentPlayer = 0;
        newState.selectedRegion = 'pskov';
        newState.constructionActions = [
          { improvement: false, equipment: false },
          { improvement: false, equipment: false },
          { improvement: false, equipment: false }
        ];
      }

      // Clear event when leaving events phase
      if (prev.phase === 'events') {
        newState.currentEvent = null;
        newState.eventVotes = [null, null, null];
        newState.eventResolved = false;
        newState.lastEventResult = null;
        newState.eventImageRevealed = false;
      }

      return {
        ...newState,
        phase: nextPhase,
        turn: isLastPhase ? prev.turn + 1 : prev.turn
      };
    });

    if (isLastPhase) {
      setTimeout(() => updateEffects(), 100);
    }
  };

  const nextPlayer = () => {
    // In online mode, send action to server
    if (mode === 'online') {
      sendAction({ type: 'NEXT_PLAYER' });
      return;
    }

    // Local mode: update state directly
    setGameState(prev => ({
      ...prev,
      currentPlayer: (prev.currentPlayer + 1) % 3
    }));
  };

  const setConstructionReady = () => {
    // In online mode, send action to server
    if (mode === 'online') {
      sendAction({ type: 'SET_CONSTRUCTION_READY' });
    } else {
      // Local mode: mark current player as ready and check if all are ready
      setGameState(prev => {
        const newReady = [...prev.constructionReady];
        newReady[prev.currentPlayer] = true;

        // If all players are ready in local mode, auto-advance
        if (newReady.every(r => r)) {
          // Trigger nextPhase
          nextPhase();
          return prev; // nextPhase will handle the update
        }

        return { ...prev, constructionReady: newReady };
      });
    }
  };

  const buyItem = (playerIndex, item, cost) => {
    // In online mode, send action to server
    if (mode === 'online') {
      // Only allow buying for own faction
      if (playerIndex !== playerId) {
        console.warn('Cannot buy for another player');
        return;
      }
      sendAction({ type: 'BUY_EQUIPMENT', item });
      return;
    }

    // Local mode: update state directly
    setGameState(prev => {
      const player = prev.players[playerIndex];

      if (player.money < cost) {
        return prev;
      }

      const newPlayers = prev.players.map((p, i) =>
        i === playerIndex
          ? { ...p, money: p.money - cost, [item]: p[item] + 1 }
          : p
      );

      const newConstructionActions = (item === 'weapons' || item === 'armor')
        ? prev.constructionActions.map((action, i) =>
            i === playerIndex ? { ...action, equipment: true } : action
          )
        : prev.constructionActions;

      return {
        ...prev,
        players: newPlayers,
        constructionActions: newConstructionActions
      };
    });
  };

  // Resolve current event using abstracted system
  const resolveEvent = () => {
    console.trace("resolveEvent called from:");

    // In online mode, send resolve action to server
    if (mode === 'online') {
      sendAction({ type: 'RESOLVE_EVENT' });
      return;
    }

    // Local mode: resolve using client-side logic
    const event = gameState.currentEvent;
    const eventType = eventTypes[event.type];

    if (!eventType) {
      console.error('Unknown event type:', event.type);
      return;
    }

    // Execute the resolution ONCE, outside of setGameState
    const newState = eventType.resolve(event, gameState, gameState.eventVotes);

    // Check if a new event was triggered (nested event scenario)
    const newEventTriggered = newState.currentEvent && newState.currentEvent.id !== event.id;

    setGameState({
      ...newState,
      // Only mark as resolved if no new event was triggered
      eventResolved: newEventTriggered ? false : true
    });
  };

  const resetGame = () => {
    // Use the store's initLocalGame to reset to initial state
    initLocalGame();
  };

  const getPhaseDescription = (phase) => {
    const descriptions = {
      resources: 'Players receive income from controlled regions and improvements',
      construction: 'Players can build improvements, fortresses, and buy equipment',
      events: 'Draw and resolve an event card',
      veche: 'Assembly of citizens making collective decisions',
      military: 'Resolve any military conflicts with the Teutonic Order'
    };
    return descriptions[phase];
  };

  return (
    <div className="parchment-bg min-h-screen">

      {/* ===== HEADER BAR ===== */}
      <header className="game-header px-4 py-2.5">
        <div className="max-w-screen-2xl mx-auto flex items-center gap-4">
          {/* Title */}
          <h1 className="heading-serif text-parchment-50 text-xl font-bold tracking-wide flex-shrink-0">
            {t('game.title')}
          </h1>

          {/* Turn + Progress */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-parchment-300 text-sm font-medium">
              {t('game.turn', { turn: gameState.turn })}/20
            </span>
            <div className="progress-bar-track w-16">
              <div className="progress-bar-fill" style={{ width: `${(gameState.turn / 20) * 100}%` }} />
            </div>
          </div>

          {/* Phase Pills (resources phase is auto-skipped, so hide it) */}
          <div className="flex items-center gap-1.5 flex-1 justify-center">
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
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
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

          {/* Controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Next Phase / Ready Button */}
            <button
              onClick={gameState.phase === 'construction' && mode === 'online' ? setConstructionReady : nextPhase}
              disabled={
                gameState.turn > 20 ||
                (gameState.phase === 'events' && !gameState.eventResolved) ||
                (gameState.phase === 'construction' && mode === 'online' && gameState.constructionReady[playerId])
              }
              className="btn-accent px-4 py-1.5 text-sm"
            >
              {gameState.turn > 20 ? t('game.gameComplete') :
               gameState.phase === 'events' && !gameState.eventResolved ? t('game.resolveEventFirst') :
               gameState.phase === 'construction' && mode === 'online' ?
                 (gameState.constructionReady[playerId] ? t('game.readyCheck') : t('game.imDone')) :
               t('game.nextPhase')}
            </button>

            {/* Language Toggle */}
            <button
              onClick={toggleLanguage}
              className="px-2 py-1 text-parchment-400 hover:text-parchment-50 text-xs font-medium transition-colors"
            >
              {i18n.language === 'en' ? 'RU' : 'EN'}
            </button>

            {/* Reset */}
            <button
              onClick={resetGame}
              className="px-2 py-1 text-parchment-500 hover:text-red-400 text-xs transition-colors"
              title={t('game.resetGame')}
            >
              {t('game.resetGame')}
            </button>
          </div>
        </div>
      </header>

      {/* Debug Mode Indicator */}
      {DEBUG_MODE && (
        <div className="fixed bottom-4 left-4 bg-yellow-400 text-yellow-900 px-2 py-1 rounded text-xs font-medium shadow z-40">
          Debug mode
        </div>
      )}

      {/* ===== 2-COLUMN BODY ===== */}
      <div className="flex gap-4 max-w-screen-2xl mx-auto px-4 pt-3 pb-6">

        {/* Left Column: Map + Players */}
        <aside className="w-[380px] flex-shrink-0 space-y-3">
          <GameMap gameState={gameState} />

          {/* Compact Player Strip */}
          <div className="card-parchment p-3">
            <div className="space-y-1">
              {gameState.players.map((player, index) => {
                const isActivePlayer = mode === 'online'
                  ? index === playerId
                  : (gameState.phase === 'construction' && index === gameState.currentPlayer);
                const factionBorder = player.faction === 'Nobles' ? 'faction-border-nobles'
                  : player.faction === 'Merchants' ? 'faction-border-merchants'
                  : 'faction-border-commoners';

                return (
                  <div key={index} className={`player-row ${isActivePlayer ? 'active' : ''} ${!isActivePlayer ? factionBorder : ''}`}>
                    {FACTION_IMAGES[player.faction] && (
                      <img
                        src={FACTION_IMAGES[player.faction]}
                        alt={player.faction}
                        className="w-7 h-7 rounded object-cover flex-shrink-0"
                      />
                    )}
                    <span className="text-sm font-semibold text-ink min-w-[70px]">
                      {t(`factions.${player.faction}`)}
                      {mode === 'online' && index === playerId && (
                        <span className="text-accent ml-0.5 text-xs">{t('game.you')}</span>
                      )}
                      {mode === 'local' && aiPlayers[index] && (
                        <span className="text-blue-500 ml-0.5 text-xs">{t('game.aiLabel')}</span>
                      )}
                    </span>
                    <span className="text-xs text-ink-light">{player.money.toFixed(1)}○</span>
                    <span className="text-xs text-ink-muted">{t('game.strength')}: {calculatePlayerStrength(index)}</span>
                    <span className="text-xs text-ink-muted">{t('game.buildings')}: {player.improvements}</span>
                    <div className="flex items-center gap-0.5 ml-auto">
                      {player.weapons > 0 && getEquipmentImage('weapons', player.faction) && (
                        <img src={getEquipmentImage('weapons', player.faction)} alt="weapons" className="w-4 h-4 object-cover rounded" />
                      )}
                      {player.armor > 0 && getEquipmentImage('armor', player.faction) && (
                        <img src={getEquipmentImage('armor', player.faction)} alt="armor" className="w-4 h-4 object-cover rounded" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Effects (compact) */}
          {gameState.activeEffects.length > 0 && (
            <div className="card-parchment p-3">
              <h4 className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Active Effects</h4>
              <div className="space-y-1.5">
                {gameState.activeEffects.map((effect) => (
                  <div key={effect.id} className="flex justify-between items-center text-xs">
                    <span className="text-ink-light">{effect.description}</span>
                    <span className="text-ink-muted ml-2 flex-shrink-0">
                      {effect.turnsRemaining}t
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

          {/* Victory Points (compact) */}
          {gameState.turn <= 20 && (
            <div className="card-parchment p-3">
              <h4 className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Victory Points</h4>
              <div className="space-y-1">
                {gameState.players.map((player, index) => (
                  <div key={index} className="flex justify-between text-xs">
                    <span className="text-ink-light">{t(`factions.${player.faction}`)}</span>
                    <span className="font-semibold text-ink">{calculateVictoryPoints(player)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Right Column: Phase Content + Discussion */}
        <main className="flex-1 min-w-0 space-y-4">

          {/* Income notification banner (auto-dismissed) */}
          {gameState.phase === 'construction' && incomeNotification && (
            <div className="bg-parchment-100 border border-parchment-400 rounded-lg px-4 py-2.5 flex items-center justify-between phase-enter">
              <div className="flex items-center gap-4 flex-1 justify-center">
                <span className="text-xs font-medium text-ink-muted">
                  {t('game.turn', { turn: incomeNotification.turn })}/20 &mdash; {t('phases.resources')}:
                </span>
                {incomeNotification.incomes.map(({ faction, income }) => (
                  <span key={faction} className="text-sm text-ink">
                    <span className="text-ink-light">{t(`factions.${faction}`)}</span>{' '}
                    <span className="font-semibold text-emerald-700">+{income.toFixed(2)}&cir;</span>
                  </span>
                ))}
              </div>
              <button
                onClick={() => setIncomeNotification(null)}
                className="text-ink-muted hover:text-ink text-xs ml-2 px-1"
              >
                &times;
              </button>
            </div>
          )}

          {/* Construction phase hint for active player */}
          {gameState.phase === 'construction' && (
            <div className="text-xs text-ink-muted text-center">
              {mode === 'local' && aiPlayers[gameState.currentPlayer]
                ? t('game.aiThinking')
                : gameState.phase === 'construction' && mode === 'online'
                ? (gameState.constructionReady[playerId] ? t('game.readyCheck') : t('game.playersTakeTurns'))
                : t('game.playersTakeTurns')}
            </div>
          )}

      {/* ===== CONSTRUCTION PHASE ===== */}
      {gameState.phase === 'construction' && !(mode === 'local' && aiPlayers[gameState.currentPlayer]) && (() => {
        const activePlayerIndex = mode === 'online' ? playerId : gameState.currentPlayer;
        const activePlayer = gameState.players[activePlayerIndex];

        return (
        <div className="card-parchment-raised p-5 phase-enter">
          <h3 className="heading-serif text-lg mb-4">
            {t('game.constructionTurn', { faction: t(`factions.${activePlayer.faction}`) })}
          </h3>

          {/* Region Selection - horizontal row */}
          <div className="mb-4">
            <h4 className="text-sm font-medium text-ink-light mb-2">{t('game.selectRegion')}</h4>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(gameState.regions).map(([regionName, region]) => {
                const isMerchantRestricted = activePlayer.faction === 'Merchants' && regionName !== 'pskov';
                const isOrderControlled = region.controller === 'order';
                const isAvailable = !isMerchantRestricted && !isOrderControlled;

                return (
                  <button
                    key={regionName}
                    onClick={() => setGameState(prev => ({ ...prev, selectedRegion: regionName }))}
                    disabled={!isAvailable}
                    className={`px-3 py-1.5 rounded text-sm border transition-colors ${
                      gameState.selectedRegion === regionName
                        ? 'bg-accent text-white border-accent'
                        : isAvailable
                        ? 'border-parchment-400 text-ink-light hover:border-accent hover:bg-parchment-100'
                        : 'border-parchment-300 text-ink-muted cursor-not-allowed opacity-50'
                    }`}
                  >
                    {t(`regions.${regionName}`)}
                    {isOrderControlled && <span className="text-xs ml-1">({t('game.orderControlled')})</span>}
                  </button>
                );
              })}
            </div>
            {activePlayer.faction === 'Merchants' && gameState.selectedRegion !== 'pskov' && (
              <p className="text-sm text-accent mt-2">{t('game.merchantsPskovOnly')}</p>
            )}
          </div>

          <div className="section-divider" />

          {/* Buildings + Equipment side by side */}
          <div className="grid grid-cols-2 gap-4">
            {/* Available Buildings */}
            <div>
              <h4 className="text-sm font-medium text-ink-light mb-2">{t('game.availableBuildings', { region: t(`regions.${gameState.selectedRegion}`) })}</h4>
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
                    className="w-full btn-accent p-2.5 text-sm flex items-center gap-2 text-left"
                  >
                    {BUILDING_IMAGES[building.type] && (
                      <img
                        src={BUILDING_IMAGES[building.type]}
                        alt={building.name}
                        className="w-9 h-9 rounded object-cover flex-shrink-0"
                      />
                    )}
                    <div>
                      <div className="font-medium">{t(`buildings.${building.type}`)}</div>
                      <div className="text-xs opacity-80">
                        {building.type.startsWith('merchant_')
                          ? t('game.built', { count: building.built })
                          : building.built ? t('game.alreadyBuilt') : t('game.notBuilt')
                        }
                        {' '}&middot; {t('game.cost', { cost: building.cost })}
                      </div>
                    </div>
                  </button>
                ))}
                {getAvailableBuildings(activePlayerIndex).length === 0 && (
                  <p className="text-ink-muted text-center py-4 text-sm">
                    {activePlayer.faction === 'Merchants' && gameState.selectedRegion !== 'pskov'
                      ? t('game.merchantsPskovOnly')
                      : t('game.noBuildingsRegion')
                    }
                  </p>
                )}
              </div>
            </div>

            {/* Equipment */}
            <div>
              <h4 className="text-sm font-medium text-ink-light mb-2">{t('game.equipment')}</h4>
              <div className="space-y-2">
                <button
                  onClick={() => buyItem(activePlayerIndex, 'weapons', 1)}
                  disabled={
                    activePlayer.money < 1 ||
                    gameState.constructionActions[activePlayerIndex].equipment ||
                    activePlayer.weapons >= 2
                  }
                  className="w-full btn-danger p-2.5 text-sm flex items-center gap-2 text-left"
                >
                  {getEquipmentImage('weapons', activePlayer.faction) && (
                    <img
                      src={getEquipmentImage('weapons', activePlayer.faction)}
                      alt="Weapon"
                      className="w-8 h-8 rounded object-cover flex-shrink-0"
                    />
                  )}
                  <div>
                    <div className="font-medium">{t('game.buyWeapon')}</div>
                    <div className="text-xs opacity-80">
                      {gameState.constructionActions[activePlayerIndex].equipment ? t('game.equipmentBought') :
                       activePlayer.weapons >= 2 ? t('game.maxWeapons') :
                       t('game.owned', { count: activePlayer.weapons })}
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => buyItem(activePlayerIndex, 'armor', 1)}
                  disabled={
                    activePlayer.money < 1 ||
                    gameState.constructionActions[activePlayerIndex].equipment ||
                    activePlayer.armor >= 2
                  }
                  className="w-full p-2.5 text-sm flex items-center gap-2 text-left rounded font-semibold text-white transition-colors"
                  style={{ background: activePlayer.money >= 1 && !gameState.constructionActions[activePlayerIndex].equipment && activePlayer.armor < 2 ? '#2563eb' : '#c9b896', cursor: activePlayer.money >= 1 && !gameState.constructionActions[activePlayerIndex].equipment && activePlayer.armor < 2 ? 'pointer' : 'not-allowed' }}
                >
                  {getEquipmentImage('armor', activePlayer.faction) && (
                    <img
                      src={getEquipmentImage('armor', activePlayer.faction)}
                      alt="Armor"
                      className="w-8 h-8 rounded object-cover flex-shrink-0"
                    />
                  )}
                  <div>
                    <div className="font-medium">{t('game.buyArmor')}</div>
                    <div className="text-xs opacity-80">
                      {gameState.constructionActions[activePlayerIndex].equipment ? t('game.equipmentBought') :
                       activePlayer.armor >= 2 ? t('game.maxArmor') :
                       t('game.owned', { count: activePlayer.armor })}
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>

          <div className="section-divider" />

          {/* Next Player / Done */}
          <div className="flex justify-end">
            {mode === 'local' && (
              <button onClick={nextPlayer} className="btn-accent px-5 py-2 text-sm">
                {t('game.nextPlayerTurn')}
              </button>
            )}
            {mode === 'online' && (
              <span className="text-sm text-ink-muted">Click "I'm Done" in the header when finished</span>
            )}
          </div>
        </div>
        );
      })()}

      {/* ===== EVENTS PHASE ===== */}
      {gameState.phase === 'events' && gameState.currentEvent && (
        <div className="phase-enter">
          {/* Event Card with Dramatic Reveal */}
          {!gameState.eventImageRevealed && getEventImage(gameState.currentEvent.id) && (
            <div className="text-center py-16">
              <div className="heading-serif text-2xl text-ink mb-3">{t('events.newEvent')}</div>
              <div className="text-ink-muted">{t('game.revealingEvent')}</div>
            </div>
          )}

          {getEventImage(gameState.currentEvent.id) && gameState.eventImageRevealed && (
            <div className="event-card-revealed mb-5">
              <div className="event-frame mx-auto" style={{ maxWidth: '600px' }}>
                <img
                  src={getEventImage(gameState.currentEvent.id)}
                  alt={gameState.currentEvent.name}
                  className="w-full object-cover"
                  style={{ maxHeight: '50vh' }}
                />
              </div>
            </div>
          )}

          {/* Event Content - Only show after reveal */}
          {(gameState.eventImageRevealed || !getEventImage(gameState.currentEvent.id)) && (
            <div className="card-parchment-raised p-5">
              <h3 className="heading-serif text-xl text-center mb-3">{t('game.event', { name: getEventName(gameState.currentEvent) })}</h3>
              <p className="text-ink-light text-center mb-4">{getEventDescription(gameState.currentEvent)}</p>

              <div className="section-divider" />

              {/* Voting Event */}
              {gameState.currentEvent.type === 'voting' && !gameState.eventResolved && (
                <div>
                  <h4 className="text-sm font-semibold text-ink-light mb-3">{t('game.councilDecision')}</h4>

                  {/* Options with costs/effects */}
                  <div className="mb-4 space-y-1.5">
                    {gameState.currentEvent.options.map(option => {
                      const translatedName = getOptionName(gameState.currentEvent.id, option.id) || option.name;
                      const translatedCost = getOptionCostText(gameState.currentEvent.id, option.id) || option.costText;
                      const translatedEffect = getOptionEffectText(gameState.currentEvent.id, option.id) || option.effectText;
                      return (
                        <div key={option.id} className="flex items-baseline gap-2 text-sm">
                          <span className="font-medium text-ink">{translatedName}</span>
                          {translatedCost && <span className="text-xs text-red-700">[{translatedCost}]</span>}
                          {translatedEffect && <span className="text-xs text-ink-muted">&rarr; {translatedEffect}</span>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Faction voting columns */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {gameState.players.map((player, index) => {
                      const hasVoted = gameState.eventVotes[index] !== null;
                      const isCurrentPlayer = mode === 'online' ? index === playerId : !aiPlayers[index];
                      const votedOptionId = gameState.eventVotes[index];
                      const votedOption = votedOptionId
                        ? gameState.currentEvent.options.find(opt => opt.id === votedOptionId)
                        : null;
                      const factionBorder = player.faction === 'Nobles' ? 'border-l-purple-600'
                        : player.faction === 'Merchants' ? 'border-l-amber-600'
                        : 'border-l-emerald-600';

                      return (
                        <div key={index} className={`border-l-3 ${factionBorder} pl-3 py-2`}>
                          <h5 className="text-sm font-semibold text-ink mb-1">
                            {t(`factions.${player.faction}`)}
                            {mode === 'online' && index === playerId && <span className="text-accent ml-1 text-xs">{t('game.you')}</span>}
                          </h5>
                          <div className="text-xs text-ink-muted mb-2">{player.money.toFixed(1)}○</div>

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
                                      ? t('events.needMoney', { amount: option.requiresMinMoney })
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
                        const optionName = gameState.currentEvent.options.find(opt => opt.id === winningOption)?.name;
                        const acceptVoters = gameState.eventVotes.filter(v => v === 'accept').length;

                        let resultText = `Decision: ${optionName}`;
                        if (winningOption === 'accept' && gameState.currentEvent.acceptCost) {
                          let allCanAfford = true;
                          const costPerVoter = acceptVoters > 0 ? gameState.currentEvent.acceptCost / acceptVoters : 0;
                          gameState.players.forEach((player, index) => {
                            if (gameState.eventVotes[index] === 'accept' && player.money < costPerVoter) {
                              allCanAfford = false;
                            }
                          });

                          if (!allCanAfford || acceptVoters === 0) {
                            resultText = "Decision: Accept into service -- FAILED (insufficient funds) -- Send them away";
                          } else {
                            resultText = `Decision: Accept into service (${acceptVoters} participants, ${costPerVoter.toFixed(1)}○ each)`;
                          }
                        }

                        return (
                          <div className="mb-3">
                            <p className="text-sm text-ink-light mb-2">{resultText}</p>
                          </div>
                        );
                      })()}
                      {mode === 'online' ? (
                        <p className="text-sm text-ink-muted italic">Auto-applying decision...</p>
                      ) : (
                        <button onClick={resolveEvent} className="btn-accent px-5 py-2 text-sm">
                          Apply Decision
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Participation Event */}
              {gameState.currentEvent.type === 'participation' && !gameState.eventResolved && (
                <div>
                  <h4 className="text-sm font-semibold text-ink-light mb-2">{t('game.councilDecision')}</h4>
                  <p className="text-sm text-ink-muted mb-3">{getEventQuestion(gameState.currentEvent) || gameState.currentEvent.question}</p>

                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {gameState.players.map((player, index) => {
                      const hasDecided = gameState.eventVotes[index] !== null;
                      const canAfford = player.money >= gameState.currentEvent.minCostPerPlayer;

                      return (
                        <div key={index} className="text-center">
                          <h5 className="text-sm font-semibold text-ink mb-1">{t(`factions.${player.faction}`)}</h5>
                          <div className="text-xs text-ink-muted mb-2">{player.money.toFixed(1)}○</div>
                          <div className="space-y-1.5">
                            <button
                              onClick={() => voteOnEvent(index, true)}
                              disabled={hasDecided || !canAfford}
                              className={`w-full px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                gameState.eventVotes[index] === true
                                  ? 'bg-emerald-700 text-white'
                                  : canAfford
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                  : 'bg-parchment-300 text-ink-muted cursor-not-allowed'
                              }`}
                            >
                              {gameState.eventVotes[index] === true ? 'Participating' :
                               !canAfford ? `Need ${gameState.currentEvent.minCostPerPlayer}○` :
                               'Participate'}
                            </button>
                            <button
                              onClick={() => voteOnEvent(index, false)}
                              disabled={hasDecided}
                              className={`w-full px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                gameState.eventVotes[index] === false
                                  ? 'bg-red-700 text-white'
                                  : 'btn-secondary'
                              }`}
                            >
                              {gameState.eventVotes[index] === false ? 'Not Participating' : "Don't Participate"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {getParticipationResult() && (
                    <div className="text-center">
                      {(() => {
                        const participants = gameState.eventVotes.filter(v => v === true).length;
                        const costPerParticipant = participants > 0 ? (gameState.currentEvent.totalCost / participants) : 0;

                        let allCanAfford = true;
                        let insufficientFunds = [];
                        gameState.players.forEach((player, index) => {
                          if (gameState.eventVotes[index] === true && player.money < costPerParticipant) {
                            allCanAfford = false;
                            insufficientFunds.push(player.faction);
                          }
                        });

                        const purchaseSucceeds = participants > 0 && allCanAfford;

                        return (
                          <div className="mb-3">
                            <p className="text-sm text-ink-light mb-1">
                              {participants > 0 ? (
                                <>Participants: {participants} &middot; Cost: {costPerParticipant.toFixed(1)}○ each</>
                              ) : (
                                <>No participants</>
                              )}
                            </p>
                            {!allCanAfford && participants > 0 && (
                              <p className="text-sm text-red-700 mb-1">
                                {insufficientFunds.join(', ')} cannot afford {costPerParticipant.toFixed(1)}○
                              </p>
                            )}
                            <p className={`text-sm font-semibold ${purchaseSucceeds ? 'text-emerald-700' : 'text-red-700'}`}>
                              Result: {purchaseSucceeds ?
                                (gameState.currentEvent.successText || 'SUCCESS') :
                                (gameState.currentEvent.failureText || 'FAILED')}
                            </p>
                          </div>
                        );
                      })()}
                      {mode === 'online' ? (
                        <p className="text-sm text-ink-muted italic">Auto-applying result...</p>
                      ) : (
                        <button onClick={resolveEvent} className="btn-accent px-5 py-2 text-sm">Apply Result</button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Immediate Event */}
              {gameState.currentEvent.type === 'immediate' && !gameState.eventResolved && (
                <div className="text-center">
                  {mode === 'online' ? (
                    <p className="text-sm text-ink-muted italic">Auto-applying effect...</p>
                  ) : (
                    <button onClick={resolveEvent} className="btn-accent px-5 py-2 text-sm">Apply Effect</button>
                  )}
                </div>
              )}

              {/* Order Attack Event */}
              {gameState.currentEvent.type === 'order_attack' && !gameState.eventResolved && (
                <div>
                  <h4 className="text-sm font-bold text-red-800 mb-2">Order Attack!</h4>
                  <p className="text-sm text-ink-light mb-3">The Teutonic Order attacks with strength {gameState.currentEvent.orderStrength}. Fund defense or surrender the region?</p>

                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {gameState.players.map((player, index) => {
                      const hasDecided = gameState.eventVotes[index] !== null;
                      const canAfford = player.money >= gameState.currentEvent.minCostPerPlayer;
                      const isCurrentPlayer = mode === 'online' ? index === playerId : !aiPlayers[index];

                      return (
                        <div key={index} className={`text-center p-2.5 rounded ${
                          mode === 'online' && index === playerId ? 'border border-accent bg-parchment-50' : ''
                        }`}>
                          <h5 className="text-sm font-semibold text-ink mb-1">
                            {t(`factions.${player.faction}`)}
                            {mode === 'online' && index === playerId && <span className="text-accent ml-1 text-xs">{t('game.you')}</span>}
                          </h5>
                          <div className="text-xs text-ink-muted mb-2">{player.money.toFixed(1)}○</div>

                          {isCurrentPlayer ? (
                            <div className="space-y-1.5">
                              <button
                                onClick={() => voteOnEvent(index, true)}
                                disabled={hasDecided || !canAfford}
                                className={`w-full px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                  gameState.eventVotes[index] === true
                                    ? 'bg-emerald-700 text-white'
                                    : canAfford
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                    : 'bg-parchment-300 text-ink-muted cursor-not-allowed'
                                }`}
                              >
                                {gameState.eventVotes[index] === true ? 'Defending' :
                                 !canAfford ? `Need ${gameState.currentEvent.minCostPerPlayer}○` :
                                 'Fund Defense'}
                              </button>
                              <button
                                onClick={() => voteOnEvent(index, false)}
                                disabled={hasDecided}
                                className={`w-full px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                  gameState.eventVotes[index] === false
                                    ? 'bg-red-700 text-white'
                                    : 'btn-secondary'
                                }`}
                              >
                                {gameState.eventVotes[index] === false ? 'No Defense' : 'Surrender'}
                              </button>
                            </div>
                          ) : (
                            <div className="text-xs text-ink-muted italic py-1">
                              {hasDecided ? (
                                gameState.eventVotes[index] === true ? (
                                  <span className="text-emerald-700 font-medium">Defending</span>
                                ) : (
                                  <span className="text-red-700 font-medium">Surrendering</span>
                                )
                              ) : (
                                <span>Waiting to decide...</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {getParticipationResult() && (
                    <div className="text-center">
                      <p className="text-sm text-ink-light mb-2">
                        {(() => {
                          const participants = gameState.eventVotes.filter(v => v === true).length;
                          return participants > 0 ? t('events.defendersReady', { count: participants }) : t('events.noDefenders');
                        })()}
                      </p>
                      {mode === 'online' ? (
                        <p className="text-sm text-ink-muted italic">Auto-resolving attack...</p>
                      ) : (
                        <button onClick={resolveEvent} className="btn-accent px-5 py-2 text-sm">Resolve Attack</button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Event Resolved */}
              {gameState.eventResolved && (
                <div className="text-center py-2">
                  <p className="text-emerald-700 font-semibold mb-2">Event Resolved</p>
                  {gameState.lastEventResult && (
                    <p className="text-sm text-ink-light mb-2 font-medium">{gameState.lastEventResult}</p>
                  )}
                  <p className="text-xs text-ink-muted">Click "Next Phase" in the header to continue</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== VECHE (ASSEMBLY) PHASE ===== */}
      {gameState.phase === 'veche' && (
        <div className="card-parchment-raised p-5 phase-enter">
          <h3 className="heading-serif text-lg mb-2">{t('game.cityAssembly')}</h3>
          <p className="text-sm text-ink-muted mb-4">{t('game.cityAssemblyDesc')}</p>

          {/* Attack Planning */}
          <div className="mb-5">
            <h4 className="text-sm font-semibold text-ink-light mb-2">{t('game.militaryCampaigns')}</h4>
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
                      <div className="font-medium">{t('veche.attack', { region: t(`regions.${regionName}`) })}</div>
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
              <p className="text-emerald-700 text-center py-2 text-sm">{t('game.allTerritoriesControlled')}</p>
            )}
          </div>

          {/* Attack Planning Interface */}
          {gameState.attackPlanning === 'planning' && (
            <div className="border border-red-300 rounded-lg p-4 mb-4 bg-red-50/50">
              <h4 className="text-sm font-bold text-red-800 mb-2">
                {t('veche.planningAttack', { region: t(`regions.${gameState.attackTarget}`) })}
              </h4>
              <p className="text-xs text-red-700 mb-3">{t('veche.attackRequiresFunding')}</p>

              <div className="grid grid-cols-3 gap-3 mb-3">
                {gameState.players.map((player, index) => {
                  const hasDecided = gameState.attackVotes[index] !== null;
                  const canAfford = player.money >= 2;

                  return (
                    <div key={index} className="text-center">
                      <h5 className="text-sm font-semibold text-ink mb-1">{t(`factions.${player.faction}`)}</h5>
                      <div className="text-xs text-ink-muted mb-2">{player.money.toFixed(1)}○</div>
                      <div className="space-y-1.5">
                        <button
                          onClick={() => { setGameState(prev => { const nv = [...prev.attackVotes]; nv[index] = true; return { ...prev, attackVotes: nv }; }); }}
                          disabled={hasDecided || !canAfford}
                          className={`w-full px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                            gameState.attackVotes[index] === true ? 'bg-red-700 text-white'
                            : canAfford ? 'bg-red-600 hover:bg-red-700 text-white'
                            : 'bg-parchment-300 text-ink-muted cursor-not-allowed'
                          }`}
                        >
                          {gameState.attackVotes[index] === true ? t('veche.joiningAttack') :
                           !canAfford ? t('events.needMoney', { amount: 2 }) : t('veche.joinAttack')}
                        </button>
                        <button
                          onClick={() => { setGameState(prev => { const nv = [...prev.attackVotes]; nv[index] = false; return { ...prev, attackVotes: nv }; }); }}
                          disabled={hasDecided}
                          className={`w-full px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                            gameState.attackVotes[index] === false ? 'bg-parchment-600 text-white' : 'btn-secondary'
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
                    const participants = gameState.attackVotes.filter(v => v === true).length;
                    const costPerParticipant = participants > 0 ? (6 / participants) : 0;
                    let allCanAfford = true;
                    let insufficientFunds = [];
                    gameState.players.forEach((player, index) => {
                      if (gameState.attackVotes[index] === true && player.money < costPerParticipant) {
                        allCanAfford = false;
                        insufficientFunds.push(player.faction);
                      }
                    });
                    const attackSucceeds = participants > 0 && allCanAfford;

                    return (
                      <div className="mb-3">
                        <p className="text-sm text-ink-light mb-1">
                          {participants > 0 ? t('veche.attackers', { count: participants, cost: costPerParticipant.toFixed(1) }) : t('veche.noParticipants')}
                        </p>
                        {!allCanAfford && participants > 0 && (
                          <p className="text-sm text-red-700 mb-1">{t('veche.cannotAffordAttack', { factions: insufficientFunds.join(', '), cost: costPerParticipant.toFixed(1) })}</p>
                        )}
                        <p className={`text-sm font-semibold ${attackSucceeds ? 'text-emerald-700' : 'text-red-700'}`}>
                          {t('veche.result', { result: attackSucceeds ? t('veche.attackFunded') : t('veche.attackCancelledCaps') })}
                        </p>
                        <div className="mt-3 flex gap-2 justify-center">
                          <button onClick={() => executeAttack()} disabled={!attackSucceeds} className="btn-danger px-4 py-2 text-sm">
                            {attackSucceeds ? t('veche.launchAttack') : t('veche.cannotLaunch')}
                          </button>
                          <button onClick={() => { setGameState(prev => ({ ...prev, attackPlanning: null, attackTarget: null, attackVotes: [null, null, null] })); }} className="btn-secondary px-4 py-2 text-sm">
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
          {gameState.lastEventResult && (gameState.lastEventResult.includes('VICTORY!') || gameState.lastEventResult.includes('DEFEAT!')) && (
            <div className={`p-3 rounded mb-4 text-sm font-medium ${
              gameState.lastEventResult.includes('VICTORY!') ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {gameState.lastEventResult}
            </div>
          )}

          <div className="section-divider" />

          {/* Fortress Building */}
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-ink-light mb-2">{t('veche.fortressConstruction')}</h4>
            <p className="text-xs text-ink-muted mb-3">{t('veche.buildFortressesDesc')}</p>

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
              <p className="text-emerald-700 text-center py-2 text-sm">{t('veche.allFortresses')}</p>
            )}

            {/* Fortress Planning Interface */}
            {gameState.fortressPlanning === 'planning' && (
              <div className="border border-parchment-400 rounded-lg p-4 mt-3 bg-parchment-50">
                <h4 className="text-sm font-semibold text-ink mb-2">
                  {t('veche.planningFortress', { region: t(`regions.${gameState.fortressTarget}`) })}
                </h4>
                <p className="text-xs text-ink-muted mb-3">{t('veche.fortressRequiresFunding')}</p>

                <div className="grid grid-cols-3 gap-3 mb-3">
                  {gameState.players.map((player, index) => {
                    const hasDecided = gameState.fortressVotes[index] !== null;
                    const canAfford = player.money >= 2;

                    return (
                      <div key={index} className="text-center">
                        <h5 className="text-sm font-semibold text-ink mb-1">{t(`factions.${player.faction}`)}</h5>
                        <div className="text-xs text-ink-muted mb-2">{player.money.toFixed(1)}○</div>
                        <div className="space-y-1.5">
                          <button
                            onClick={() => { setGameState(prev => { const nv = [...prev.fortressVotes]; nv[index] = true; return { ...prev, fortressVotes: nv }; }); }}
                            disabled={hasDecided || !canAfford}
                            className={`w-full px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                              gameState.fortressVotes[index] === true ? 'bg-accent text-white'
                              : canAfford ? 'bg-accent-light hover:bg-accent text-white'
                              : 'bg-parchment-300 text-ink-muted cursor-not-allowed'
                            }`}
                          >
                            {gameState.fortressVotes[index] === true ? t('veche.contributing') :
                             !canAfford ? t('events.needMoney', { amount: 2 }) : t('veche.contribute')}
                          </button>
                          <button
                            onClick={() => { setGameState(prev => { const nv = [...prev.fortressVotes]; nv[index] = false; return { ...prev, fortressVotes: nv }; }); }}
                            disabled={hasDecided}
                            className={`w-full px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                              gameState.fortressVotes[index] === false ? 'bg-parchment-600 text-white' : 'btn-secondary'
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
                      const participants = gameState.fortressVotes.filter(v => v === true).length;
                      const costPerParticipant = participants > 0 ? (6 / participants) : 0;
                      let allCanAfford = true;
                      let insufficientFunds = [];
                      gameState.players.forEach((player, index) => {
                        if (gameState.fortressVotes[index] === true && player.money < costPerParticipant) {
                          allCanAfford = false;
                          insufficientFunds.push(player.faction);
                        }
                      });

                      if (participants === 0) {
                        return (
                          <div>
                            <p className="text-ink-muted mb-2 text-sm">{t('veche.noFortressFunding')}</p>
                            <button onClick={() => { setGameState(prev => ({ ...prev, fortressPlanning: null, fortressTarget: null, fortressVotes: [null, null, null] })); }} className="btn-secondary px-4 py-2 text-sm">{t('veche.cancelConstruction')}</button>
                          </div>
                        );
                      } else if (!allCanAfford) {
                        return (
                          <div>
                            <p className="text-red-700 mb-2 text-sm">{t('veche.cannotAffordShare', { factions: insufficientFunds.map(f => t(`factions.${f}`)).join(', '), cost: costPerParticipant.toFixed(2) })}</p>
                            <button onClick={() => { setGameState(prev => ({ ...prev, fortressPlanning: null, fortressTarget: null, fortressVotes: [null, null, null] })); }} className="btn-secondary px-4 py-2 text-sm">{t('veche.cancelConstruction')}</button>
                          </div>
                        );
                      } else {
                        return (
                          <div>
                            <p className="text-emerald-700 mb-2 text-sm">{t('veche.contributors', { count: participants, cost: costPerParticipant.toFixed(2) })}</p>
                            <div className="flex gap-2 justify-center">
                              <button onClick={executeFortressBuild} className="btn-accent px-4 py-2 text-sm">{t('veche.buildFortressButton')}</button>
                              <button onClick={() => { setGameState(prev => ({ ...prev, fortressPlanning: null, fortressTarget: null, fortressVotes: [null, null, null] })); }} className="btn-secondary px-4 py-2 text-sm">{t('veche.cancelFortress')}</button>
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

          <div className="section-divider" />

          <div className="text-center">
            <button onClick={() => nextPhase()} className="btn-accent px-6 py-2 text-sm">
              End Assembly
            </button>
          </div>
        </div>
      )}

      {/* ===== GAME END ===== */}
      {gameState.turn > 20 && (
        <div className="card-parchment-raised p-6 phase-enter">
          <h3 className="heading-serif text-xl text-center mb-4">Game Complete!</h3>
          {(() => {
            const result = getGameResult();
            return (
              <div>
                <div className="border-2 border-accent rounded-lg p-4 mb-4 bg-parchment-50 text-center">
                  <h4 className="heading-serif text-lg">Winner: {result.winner.faction}</h4>
                  <p className="text-sm text-ink-light">{result.winner.victoryPoints} Victory Points &middot; {result.winner.money}○</p>
                </div>

                <h4 className="text-sm font-semibold text-ink-light mb-2">Final Rankings:</h4>
                <div className="space-y-2">
                  {result.rankings.map((player, rank) => (
                    <div key={player.index} className={`p-3 rounded ${rank === 0 ? 'bg-parchment-50 border border-accent' : 'border border-parchment-400'}`}>
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-medium text-ink">#{rank + 1} {player.faction}</span>
                        <span className="text-ink-light">{player.victoryPoints} VP &middot; {player.money}○</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

          {/* Discussion Panel - elevated, below phase content */}
          <DiscussionPanel />

        </main>

      </div>

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
const App = () => {
  const [screen, setScreen] = useState('menu'); // 'menu' | 'lobby' | 'game'
  
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
      // Game has started
      setScreen('game');
    } else if (mode === 'online' && roomId && !room?.gameStarted) {
      // In lobby waiting for game to start
      setScreen('lobby');
    }
  }, [mode, room?.gameStarted, gameState, roomId]);

  // Start local game (with optional AI config)
  const handleStartLocal = (aiConfig) => {
    initLocalGame(aiConfig);
    setScreen('game');
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
    setScreen('menu');
  };

  // Go back to menu
  const handleBackToMenu = () => {
    resetStore();
    setScreen('menu');
  };

  // Render appropriate screen
  switch (screen) {
    case 'menu':
      return (
        <MainMenu
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

    case 'game':
      return (
        <div className="relative">
          {/* Floating back button (positioned to not overlap header) */}
          <div className="fixed top-1 right-2 z-50">
            <button
              onClick={mode === 'online' ? handleLeave : handleBackToMenu}
              className="px-2 py-1 text-xs text-parchment-400 hover:text-red-400 transition-colors"
            >
              {mode === 'online' ? 'Leave Game' : 'Menu'}
            </button>
          </div>
          <PskovGame />
        </div>
      );

    default:
      return <MainMenu onStartLocal={handleStartLocal} onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} />;
  }
};

export default App;
