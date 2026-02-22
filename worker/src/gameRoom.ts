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
  nextPhase,
  GameAction,
  RandomValues,
} from './game/actions';

// Message types from client to server
interface ClientMessage {
  type: 'join' | 'observe' | 'ready' | 'action' | 'leave';
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

// WebSocket attachment data (persisted across hibernation)
interface WebSocketAttachment {
  playerId: number | null; // null for observers
  playerName: string;
  isObserver: boolean;
}

interface Env {
  GAME_ROOM: DurableObjectNamespace;
  ENVIRONMENT: string;
}

export class GameRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  // Get room state from storage (with default)
  private async getRoom(): Promise<RoomState> {
    const room = await this.ctx.storage.get<RoomState>('room');
    if (!room) {
      return {
        players: [null, null, null],
        gameStarted: false,
        createdAt: Date.now(),
      };
    }
    return room;
  }

  // Save room state to storage
  private async saveRoom(room: RoomState): Promise<void> {
    await this.ctx.storage.put('room', room);
  }

  // Get game state from storage
  private async getGameState(): Promise<GameState | null> {
    return await this.ctx.storage.get<GameState>('gameState') || null;
  }

  // Save game state to storage
  private async saveGameState(gameState: GameState): Promise<void> {
    await this.ctx.storage.put('gameState', gameState);
  }

  // Get WebSocket for a specific player ID
  private getPlayerSocket(playerId: number): WebSocket | null {
    const sockets = this.ctx.getWebSockets();
    for (const ws of sockets) {
      const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
      if (attachment?.playerId === playerId) {
        return ws;
      }
    }
    return null;
  }

  // Handle HTTP requests
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Initialize room
    if (url.pathname === '/init' && request.method === 'POST') {
      const room = await this.getRoom();
      if (room.createdAt === 0) {
        room.createdAt = Date.now();
        await this.saveRoom(room);
      }
      return new Response(JSON.stringify({ success: true }));
    }

    // Get room info
    if (url.pathname === '/info' && request.method === 'GET') {
      const room = await this.getRoom();
      return new Response(
        JSON.stringify({
          room: room,
          gameStarted: room.gameStarted,
          playerCount: room.players.filter((p) => p !== null).length,
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
    const [client, server] = [pair[0], pair[1]];

    // Accept the WebSocket connection with hibernation
    this.ctx.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  // WebSocket message handler (called by Durable Object runtime)
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
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
  async webSocketClose(ws: WebSocket, _code: number, _reason: string): Promise<void> {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
    if (attachment?.playerId !== undefined) {
      await this.handlePlayerDisconnect(attachment.playerId);
    }
  }

  // WebSocket error handler
  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
    if (attachment?.playerId !== undefined) {
      await this.handlePlayerDisconnect(attachment.playerId);
    }
  }

  // Handle incoming messages
  private async handleMessage(ws: WebSocket, message: ClientMessage): Promise<void> {
    switch (message.type) {
      case 'observe':
        await this.handleObserve(ws);
        break;
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

  // Observer connects to see room state without joining
  private async handleObserve(ws: WebSocket): Promise<void> {
    const room = await this.getRoom();

    // Set attachment as observer
    const attachment: WebSocketAttachment = {
      playerId: null,
      playerName: '',
      isObserver: true,
    };
    ws.serializeAttachment(attachment);

    // Send current room state to observer
    this.sendToSocket(ws, {
      type: 'room_update',
      room: room,
    });
  }

  // Player joins the room
  private async handleJoin(ws: WebSocket, message: ClientMessage): Promise<void> {
    const { playerName, faction } = message;
    const room = await this.getRoom();

    if (room.gameStarted) {
      this.sendToSocket(ws, { type: 'error', error: 'Game already started' });
      return;
    }

    if (faction === undefined || faction < 0 || faction > 2) {
      this.sendToSocket(ws, { type: 'error', error: 'Invalid faction' });
      return;
    }

    // Check if faction is already taken
    if (room.players[faction] !== null) {
      this.sendToSocket(ws, { type: 'error', error: 'Faction already taken' });
      return;
    }

    const name = playerName || `Player ${faction + 1}`;

    // Store player info in WebSocket attachment (survives hibernation)
    const attachment: WebSocketAttachment = {
      playerId: faction,
      playerName: name,
      isObserver: false,
    };
    ws.serializeAttachment(attachment);

    room.players[faction] = {
      name: name,
      faction: FACTIONS[faction],
      ready: false,
      connected: true,
    };

    await this.saveRoom(room);

    // Notify the joining player
    this.sendToSocket(ws, {
      type: 'joined',
      playerId: faction,
      room: room,
    });

    // Broadcast room update to all players
    await this.broadcastRoomUpdate();
  }

  // Player toggles ready status
  private async handleReady(ws: WebSocket): Promise<void> {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;

    if (!attachment || attachment.playerId === undefined) {
      this.sendToSocket(ws, { type: 'error', error: 'Not in room' });
      return;
    }

    const room = await this.getRoom();

    if (room.gameStarted) {
      this.sendToSocket(ws, { type: 'error', error: 'Game already started' });
      return;
    }

    const player = room.players[attachment.playerId];
    if (player) {
      player.ready = !player.ready;
    }

    await this.saveRoom(room);
    await this.broadcastRoomUpdate();

    // Check if all 3 players are ready
    const allReady = room.players.every((p) => p !== null && p.ready);
    if (allReady) {
      await this.startGame();
    }
  }

  // Handle game action
  private async handleAction(ws: WebSocket, message: ClientMessage): Promise<void> {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;

    if (!attachment || attachment.playerId === undefined) {
      this.sendToSocket(ws, { type: 'error', error: 'Not in room' });
      return;
    }

    const room = await this.getRoom();
    const gameState = await this.getGameState();

    if (!room.gameStarted || !gameState) {
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
    const result = applyAction(gameState, action, attachment.playerId, randomValues);

    if (result.error) {
      this.sendToSocket(ws, {
        type: 'error',
        error: result.error,
      });
      return;
    }

    // Update game state
    await this.saveGameState(result.newState);

    // Broadcast updated game state to all players
    await this.broadcastGameState();

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
  private async handleLeave(ws: WebSocket): Promise<void> {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
    if (attachment?.playerId !== undefined) {
      await this.handlePlayerDisconnect(attachment.playerId);
    }
  }

  // Handle player disconnect
  private async handlePlayerDisconnect(playerId: number | null): Promise<void> {
    // If observer disconnects, nothing to do
    if (playerId === null) {
      return;
    }

    const room = await this.getRoom();
    const player = room.players[playerId];

    if (player) {
      player.connected = false;

      // If game hasn't started, remove the player
      if (!room.gameStarted) {
        room.players[playerId] = null;
      }
    }

    await this.saveRoom(room);

    // Broadcast disconnect to remaining players
    await this.broadcast({
      type: 'player_left',
      playerId,
      room: room,
    });

    // If game is in progress and a player disconnects, they forfeit
    if (room.gameStarted) {
      const gameState = await this.getGameState();
      if (gameState) {
        // Mark game as over with remaining players as winners
        // TODO: Implement forfeit logic
      }
    }
  }

  // Start the game
  private async startGame(): Promise<void> {
    const room = await this.getRoom();
    room.gameStarted = true;
    await this.saveRoom(room);

    // Create initial game state and auto-advance past resources phase
    // (resources phase is auto-skipped; income is calculated and we start at construction)
    const initialState = createInitialGameState();
    const gameState = nextPhase(initialState, true);
    await this.saveGameState(gameState);

    // Broadcast game start to all players
    await this.broadcast({
      type: 'game_start',
      room: room,
      gameState: gameState,
    });
  }

  // Send message to a specific socket
  private sendToSocket(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }

  // Broadcast message to all connected players
  private async broadcast(message: ServerMessage): Promise<void> {
    const sockets = this.ctx.getWebSockets();
    for (const ws of sockets) {
      this.sendToSocket(ws, message);
    }
  }

  // Broadcast room state update
  private async broadcastRoomUpdate(): Promise<void> {
    const room = await this.getRoom();
    await this.broadcast({
      type: 'room_update',
      room: room,
    });
  }

  // Broadcast game state update
  private async broadcastGameState(): Promise<void> {
    const gameState = await this.getGameState();
    if (gameState) {
      await this.broadcast({
        type: 'game_state',
        gameState: gameState,
      });
    }
  }
}
