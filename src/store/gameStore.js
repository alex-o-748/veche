import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { createInitialGameState } from '../game';

/**
 * Game Store
 *
 * Central state management for the game, supporting both local and multiplayer modes.
 *
 * State Structure:
 * - mode: 'local' | 'online' - Current game mode
 * - connected: boolean - WebSocket connection status (online mode)
 * - roomId: string | null - Room code for multiplayer (e.g., "PSKOV-1234")
 * - playerId: number | null - Which player slot this client controls (0, 1, or 2)
 * - room: object | null - Room/lobby state (players, ready status)
 * - gameState: object | null - The actual game state
 * - error: string | null - Error message to display
 */

export const useGameStore = create(
  subscribeWithSelector((set, get) => ({
    // Game mode
    mode: 'local', // 'local' | 'online'

    // Connection state (for multiplayer)
    connected: false,
    roomId: null,
    playerId: null, // 0, 1, or 2 (which faction this client controls)

    // Room/lobby state (for multiplayer)
    room: null,

    // Game state
    gameState: null,

    // UI state
    error: null,

    // Debug mode (debugEventIndex is in gameState)
    debugMode: true,

    // ============ Actions ============

    // Connection actions (multiplayer)
    setConnected: (connected) => set({ connected }),
    setRoomId: (roomId) => set({ roomId }),
    setPlayerId: (playerId) => set({ playerId }),
    setRoom: (room) => set({ room }),
    setMode: (mode) => set({ mode }),

    // Game state actions
    // Supports both direct value and functional updates: setGameState(newState) or setGameState(prev => newState)
    setGameState: (gameStateOrUpdater) => set((state) => {
      if (typeof gameStateOrUpdater === 'function') {
        return { gameState: gameStateOrUpdater(state.gameState) };
      }
      return { gameState: gameStateOrUpdater };
    }),

    // Update game state with a partial update
    updateGameState: (updates) => set((state) => ({
      gameState: state.gameState ? { ...state.gameState, ...updates } : null,
    })),

    // Error handling
    setError: (error) => set({ error }),
    clearError: () => set({ error: null }),

    // Debug mode
    setDebugMode: (debugMode) => set({ debugMode }),

    // ============ Game Lifecycle ============

    // Initialize a new local game
    initLocalGame: () => {
      set({
        mode: 'local',
        gameState: createInitialGameState(),
        playerId: null, // In local mode, control all players
        connected: false,
        roomId: null,
        room: null,
        error: null,
      });
    },

    // Initialize for online multiplayer (called when joining a room)
    initOnlineGame: (roomId, playerId) => {
      set({
        mode: 'online',
        roomId,
        playerId,
        connected: true,
        gameState: null, // Will be set when game starts
        error: null,
      });
    },

    // Reset everything (back to menu/lobby)
    resetStore: () => {
      set({
        mode: 'local',
        connected: false,
        roomId: null,
        playerId: null,
        room: null,
        gameState: null,
        error: null,
      });
    },

    // ============ Selectors (computed values) ============

    // Get current player (in local mode, returns current turn's player)
    getCurrentPlayer: () => {
      const { gameState, playerId, mode } = get();
      if (!gameState) return null;

      if (mode === 'online' && playerId !== null) {
        return gameState.players[playerId];
      }
      return gameState.players[gameState.currentPlayer];
    },

    // Check if it's this client's turn (for online mode)
    isMyTurn: () => {
      const { gameState, playerId, mode } = get();
      if (!gameState) return false;
      if (mode === 'local') return true; // Local mode always your turn
      return gameState.currentPlayer === playerId;
    },

    // Check if client can vote (hasn't voted yet)
    canVote: () => {
      const { gameState, playerId, mode } = get();
      if (!gameState) return false;
      if (mode === 'local') return true;
      return gameState.eventVotes[playerId] === null;
    },
  }))
);

// Export a helper to access store outside React components
export const getGameStore = () => useGameStore.getState();

// Export subscribe for WebSocket handler to listen to changes
export const subscribeToStore = useGameStore.subscribe;
