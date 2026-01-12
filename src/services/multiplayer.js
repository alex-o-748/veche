/**
 * WebSocket Client Service
 *
 * Manages WebSocket connection to the multiplayer server.
 * Handles room creation, joining, and game action synchronization.
 */

import { useGameStore } from '../store/gameStore';
import { eventDeck } from '../game/events';

// Get the API URL from environment or default to same host
const getApiUrl = () => {
  let url;
  // In production, use the deployed worker URL
  if (import.meta.env.VITE_WORKER_URL) {
    url = import.meta.env.VITE_WORKER_URL;
  } else {
    // In development, use the same hostname as the frontend but port 8787
    // This handles cases where you access via IP instead of localhost
    const hostname = window.location.hostname;
    url = `http://${hostname}:8787`;
  }
  // Remove trailing slash to avoid double slashes in URLs
  return url.replace(/\/+$/, '');
};

const getWsUrl = () => {
  const apiUrl = getApiUrl();
  return apiUrl.replace(/^http/, 'ws');
};

/**
 * Enrich game state with full event data from client-side event deck
 * Server only sends minimal event data (id, name, type), client needs full data with options/effects
 */
function enrichGameState(serverGameState) {
  if (!serverGameState) return serverGameState;

  // If there's a current event, look up the full event data from client-side deck
  if (serverGameState.currentEvent && serverGameState.currentEvent.id) {
    const fullEvent = eventDeck.find(e => e.id === serverGameState.currentEvent.id);
    if (fullEvent) {
      return {
        ...serverGameState,
        currentEvent: fullEvent, // Replace with full event data
      };
    }
  }

  return serverGameState;
}

class MultiplayerService {
  constructor() {
    this.ws = null;
    this.roomId = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.messageQueue = [];
  }

  /**
   * Create a new game room
   * @returns {Promise<string>} The room ID (e.g., "PSKOV-A3X7")
   */
  async createRoom() {
    const response = await fetch(`${getApiUrl()}/api/rooms`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error('Failed to create room');
    }

    const data = await response.json();
    return data.roomId;
  }

  /**
   * Get room info
   * @param {string} roomId
   * @returns {Promise<object>} Room info
   */
  async getRoomInfo(roomId) {
    const response = await fetch(`${getApiUrl()}/api/rooms/${roomId}`);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Room not found');
      }
      throw new Error('Failed to get room info');
    }

    return response.json();
  }

  /**
   * Connect to a room via WebSocket
   * @param {string} roomId - The room code
   * @param {number} faction - Faction index (0=Nobles, 1=Merchants, 2=Commoners)
   * @param {string} playerName - Display name for the player
   * @returns {Promise<void>}
   */
  connect(roomId, faction, playerName = 'Player') {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.disconnect();
      }

      this.roomId = roomId;
      const wsUrl = `${getWsUrl()}/api/rooms/${roomId}/ws`;

      console.log('[WS] Connecting to:', wsUrl);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[WS] Connected');
        this.reconnectAttempts = 0;

        // Send join message
        this.send({
          type: 'join',
          faction,
          playerName,
        });

        // Process any queued messages
        while (this.messageQueue.length > 0) {
          const msg = this.messageQueue.shift();
          this.send(msg);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message, resolve, reject);
        } catch (error) {
          console.error('[WS] Failed to parse message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WS] Error:', error);
        useGameStore.getState().setError('Connection error');
        reject(error);
      };

      this.ws.onclose = (event) => {
        console.log('[WS] Disconnected:', event.code, event.reason);
        useGameStore.getState().setConnected(false);

        // Attempt reconnect if not intentional close
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`[WS] Reconnecting... (attempt ${this.reconnectAttempts})`);
          setTimeout(() => {
            const store = useGameStore.getState();
            if (store.playerId !== null) {
              this.connect(this.roomId, store.playerId, playerName);
            }
          }, 1000 * this.reconnectAttempts);
        }
      };
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleMessage(message, resolveConnect, rejectConnect) {
    const store = useGameStore.getState();
    console.log('[WS] Received:', message.type, message);

    switch (message.type) {
      case 'joined':
        // Successfully joined the room
        store.setConnected(true);
        store.setPlayerId(message.playerId);
        store.setRoom(message.room);
        store.setMode('online');
        if (resolveConnect) resolveConnect();
        break;

      case 'room_update':
        // Room state changed (player joined/left/ready)
        store.setRoom(message.room);
        break;

      case 'game_start':
        // Game has started
        store.setRoom(message.room);
        store.setGameState(enrichGameState(message.gameState));
        break;

      case 'game_state':
        // Game state update
        store.setGameState(enrichGameState(message.gameState));
        break;

      case 'action_result':
        // Action was processed
        if (message.result && !message.result.success) {
          store.setError(message.result.error || 'Action failed');
        }
        break;

      case 'player_left':
        // A player disconnected
        store.setRoom(message.room);
        if (message.room?.gameStarted) {
          // If game was in progress, show forfeit message
          store.setError(`A player has disconnected. They forfeit the game.`);
        }
        break;

      case 'error':
        console.error('[WS] Server error:', message.error);
        store.setError(message.error);
        if (rejectConnect) rejectConnect(new Error(message.error));
        break;

      default:
        console.warn('[WS] Unknown message type:', message.type);
    }
  }

  /**
   * Send a message to the server
   */
  send(message) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WS] Not connected, queueing message');
      this.messageQueue.push(message);
      return;
    }

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Toggle ready status
   */
  toggleReady() {
    this.send({ type: 'ready' });
  }

  /**
   * Send a game action to the server
   * @param {object} action - The action to send (e.g., { type: 'VOTE_EVENT', vote: true })
   */
  sendAction(action) {
    this.send({
      type: 'action',
      action,
    });
  }

  /**
   * Leave the current room
   */
  leave() {
    this.send({ type: 'leave' });
    this.disconnect();
    useGameStore.getState().resetStore();
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }
    this.roomId = null;
    this.messageQueue = [];
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
export const multiplayer = new MultiplayerService();

// Export for debugging
if (typeof window !== 'undefined') {
  window.multiplayer = multiplayer;
}
