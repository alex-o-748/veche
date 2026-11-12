import { useGameStore } from './gameStore';

/**
 * Local game autosave.
 *
 * Local (solo / hot-seat) games are written to localStorage on every state change,
 * so leaving to the menu or reloading the page does not lose a game.
 * Online games are never saved: the server owns their state.
 *
 * Event cards carry effect functions, which JSON drops. That is fine:
 * resolveEvent looks the live card up by id before resolving.
 */

const SAVE_KEY = 'veche.save.v1';

const isFinished = (gameState) => gameState.gameOver || gameState.turn > 20;

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (!save?.gameState || isFinished(save.gameState)) return null;
    return save;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage unavailable (private mode, blocked): nothing to clear
  }
}

/** Restore a saved local game into the store. Returns true on success. */
export function restoreSave() {
  const save = loadSave();
  if (!save) return false;
  useGameStore.setState({
    mode: 'local',
    gameState: save.gameState,
    aiPlayers: save.aiPlayers || [false, false, false],
    playerId: null,
    connected: false,
    roomId: null,
    room: null,
    error: null,
    discussionMessages: [],
    discussionLoading: false,
  });
  return true;
}

// Write-through: keep the save in sync with the current local game.
useGameStore.subscribe(
  (state) => [state.mode, state.gameState, state.aiPlayers, state.roomId],
  ([mode, gameState, aiPlayers, roomId]) => {
    // roomId is set as soon as an online room is created or observed, before mode flips
    if (mode !== 'local' || roomId || !gameState) return;
    if (isFinished(gameState)) {
      clearSave();
      return;
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ gameState, aiPlayers }));
    } catch {
      // Storage full or unavailable: the game still works, it just is not saved
    }
  },
  { equalityFn: (a, b) => a.every((v, i) => v === b[i]) }
);
