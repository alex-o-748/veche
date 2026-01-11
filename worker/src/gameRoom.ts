/**
 * GameRoom Durable Object
 *
 * Manages a single multiplayer game room:
 * - WebSocket connections for up to 3 players
 * - Room/lobby state (players, factions, ready status)
 * - Game state synchronization
 * - Server-authoritative randomness
 */

import { DurableObject } from 'cloudflare:workers';
import {
  GameState,
  createInitialGameState,
  FACTIONS,
} from './game';
import {
  applyAction,
  GameAction,
  ActionResult,
  RandomValues,
} from './game/actions';

// Message types from client to server
interface ClientMessage {
  type: 'join' | 'ready' | 'action' | 'leave';
  playerName?: string;
  faction?: number; // 0 = Nobles, 1 = Merchants, 2 = Commoners
  action?: GameAction;
}

// Message types from server to client
interface ServerMessage {
  type:
    | 'joined'
    | 'room_update'
    | 'game_start'
    | 'game_state'
    | 'action_result'
    | 'error'
    | 'player_left';
  playerId?: number;
  room?: RoomState;
  gameState?: GameState;
  error?: string;
  result?: ServerActionResult;
}

// Room state (lobby before game starts)
interface RoomState {
  players: (PlayerSlot | null)[];
  gameStarted: boolean;
  createdAt: number;
}

interface PlayerSlot {
  name: string;
  faction: string;
  ready: boolean;
  connected: boolean;
}

// Server action result for client
interface ServerActionResult {
  type: string;
  success: boolean;
  error?: string;
}

// WebSocket with attached player info
interface PlayerWebSocket extends WebSocket {
  playerId?: number;
  playerName?: string;
}

interface Env {
  GAME_ROOM: DurableObjectNamespace;
  ENVIRONMENT: string;
}

export class GameRoom extends DurableObject<Env> {
  private room: RoomState;
  private gameState: GameState | null = null;
  private connections: Map<number, PlayerWebSocket> = new Map();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // Initialize room state
    this.room = {
      players: [null, null, null],
      gameStarted: false,
      createdAt: Date.now(),
    };
  }

  // Handle HTTP requests
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Initialize room
    if (url.pathname === '/init' && request.method === 'POST') {
      return new Response(JSON.stringify({ success: true }));
    }

    // Get room info
    if (url.pathname === '/info' && request.method === 'GET') {
      return new Response(
        JSON.stringify({
          room: this.room,
          gameStarted: this.room.gameStarted,
          playerCount: this.room.players.filter((p) => p !== null).length,
        })
      );
    }

    // WebSocket upgrade
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader === 'websocket') {
      return this.handleWebSocketUpgrade(request);
    }

    return new Response('Not Found', { status: 404 });
  }

  // Handle WebSocket connection
  private handleWebSocketUpgrade(_request: Request): Response {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1] as PlayerWebSocket];

    // Accept the WebSocket connection with hibernation
    this.ctx.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  // WebSocket message handler (called by Durable Object runtime)
  async webSocketMessage(ws: PlayerWebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      const data: ClientMessage = JSON.parse(message as string);
      await this.handleMessage(ws, data);
    } catch (error) {
      this.sendToSocket(ws, {
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // WebSocket close handler
  async webSocketClose(ws: PlayerWebSocket, _code: number, _reason: string): Promise<void> {
    if (ws.playerId !== undefined) {
      this.handlePlayerDisconnect(ws.playerId);
    }
  }

  // WebSocket error handler
  async webSocketError(ws: PlayerWebSocket, _error: unknown): Promise<void> {
    if (ws.playerId !== undefined) {
      this.handlePlayerDisconnect(ws.playerId);
    }
  }

  // Handle incoming messages
  private async handleMessage(ws: PlayerWebSocket, message: ClientMessage): Promise<void> {
    switch (message.type) {
      case 'join':
        await this.handleJoin(ws, message);
        break;
      case 'ready':
        await this.handleReady(ws);
        break;
      case 'action':
        await this.handleAction(ws, message);
        break;
      case 'leave':
        await this.handleLeave(ws);
        break;
    }
  }

  // Player joins the room
  private async handleJoin(ws: PlayerWebSocket, message: ClientMessage): Promise<void> {
    const { playerName, faction } = message;

    if (this.room.gameStarted) {
      this.sendToSocket(ws, { type: 'error', error: 'Game already started' });
      return;
    }

    if (faction === undefined || faction < 0 || faction > 2) {
      this.sendToSocket(ws, { type: 'error', error: 'Invalid faction' });
      return;
    }

    // Check if faction is already taken
    if (this.room.players[faction] !== null) {
      this.sendToSocket(ws, { type: 'error', error: 'Faction already taken' });
      return;
    }

    // Assign player to faction slot
    ws.playerId = faction;
    ws.playerName = playerName || `Player ${faction + 1}`;
    this.connections.set(faction, ws);

    this.room.players[faction] = {
      name: ws.playerName,
      faction: FACTIONS[faction],
      ready: false,
      connected: true,
    };

    // Notify the joining player
    this.sendToSocket(ws, {
      type: 'joined',
      playerId: faction,
      room: this.room,
    });

    // Broadcast room update to all players
    this.broadcastRoomUpdate();
  }

  // Player toggles ready status
  private async handleReady(ws: PlayerWebSocket): Promise<void> {
    if (ws.playerId === undefined) {
      this.sendToSocket(ws, { type: 'error', error: 'Not in room' });
      return;
    }

    if (this.room.gameStarted) {
      this.sendToSocket(ws, { type: 'error', error: 'Game already started' });
      return;
    }

    const player = this.room.players[ws.playerId];
    if (player) {
      player.ready = !player.ready;
    }

    this.broadcastRoomUpdate();

    // Check if all 3 players are ready
    const allReady = this.room.players.every((p) => p !== null && p.ready);
    if (allReady) {
      await this.startGame();
    }
  }

  // Handle game action
  private async handleAction(ws: PlayerWebSocket, message: ClientMessage): Promise<void> {
    if (ws.playerId === undefined) {
      this.sendToSocket(ws, { type: 'error', error: 'Not in room' });
      return;
    }

    if (!this.room.gameStarted || !this.gameState) {
      this.sendToSocket(ws, { type: 'error', error: 'Game not started' });
      return;
    }

    const { action } = message;
    if (!action) {
      this.sendToSocket(ws, { type: 'error', error: 'No action provided' });
      return;
    }

    // Generate server-side random values for actions that need them
    const randomValues: RandomValues = {};

    if (action.type === 'RESOLVE_EVENT' || action.type === 'EXECUTE_ATTACK') {
      randomValues.battleRoll = Math.random();
      randomValues.eventRoll = Math.random();
      randomValues.targetRoll = Math.random();
    }

    // Apply the action using server-authoritative game logic
    const result = applyAction(this.gameState, action, ws.playerId, randomValues);

    if (result.error) {
      this.sendToSocket(ws, {
        type: 'error',
        error: result.error,
      });
      return;
    }

    // Update game state
    this.gameState = result.newState;

    // Broadcast updated game state to all players
    this.broadcastGameState();

    // Send action result to the acting player
    this.sendToSocket(ws, {
      type: 'action_result',
      result: {
        type: action.type,
        success: true,
      },
    });
  }

  // Player leaves the room
  private async handleLeave(ws: PlayerWebSocket): Promise<void> {
    if (ws.playerId !== undefined) {
      this.handlePlayerDisconnect(ws.playerId);
    }
  }

  // Handle player disconnect
  private handlePlayerDisconnect(playerId: number): void {
    const player = this.room.players[playerId];
    if (player) {
      player.connected = false;

      // If game hasn't started, remove the player
      if (!this.room.gameStarted) {
        this.room.players[playerId] = null;
      }
    }

    this.connections.delete(playerId);

    // Broadcast disconnect to remaining players
    this.broadcast({
      type: 'player_left',
      playerId,
      room: this.room,
    });

    // If game is in progress and a player disconnects, they forfeit
    if (this.room.gameStarted && this.gameState) {
      // Mark game as over with remaining players as winners
      // TODO: Implement forfeit logic
    }
  }

  // Start the game
  private async startGame(): Promise<void> {
    this.room.gameStarted = true;

    // Create initial game state
    this.gameState = createInitialGameState();

    // Broadcast game start to all players
    this.broadcast({
      type: 'game_start',
      room: this.room,
      gameState: this.gameState,
    });
  }

  // Send message to a specific socket
  private sendToSocket(ws: PlayerWebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }

  // Broadcast message to all connected players
  private broadcast(message: ServerMessage): void {
    for (const ws of this.connections.values()) {
      this.sendToSocket(ws, message);
    }
  }

  // Broadcast room state update
  private broadcastRoomUpdate(): void {
    this.broadcast({
      type: 'room_update',
      room: this.room,
    });
  }

  // Broadcast game state update
  private broadcastGameState(): void {
    if (this.gameState) {
      this.broadcast({
        type: 'game_state',
        gameState: this.gameState,
      });
    }
  }
}
