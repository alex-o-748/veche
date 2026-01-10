# Online Multiplayer Implementation Plan for Medieval Pskov (Veche)

## Overview

This document outlines the implementation plan for adding online multiplayer functionality to Medieval Pskov, a turn-based strategy board game for 3 players representing factions (Nobles, Merchants, Commoners) defending Pskov from the Teutonic Order.

### Design Decisions
- **Anonymous sessions** - no accounts required
- **No persistence** - games are ephemeral, no match history
- **No AI players** - disconnected players forfeit
- **No turn timers** - players take as long as needed
- **Cloudflare infrastructure** - Workers, Durable Objects, Pages

## Current State Analysis

### Game Characteristics
- **Turn-based**: 20 turns, 4 phases per turn (Resources, Construction, Events, Veche)
- **3 players**: Each controls one faction
- **Cooperative/Competitive**: Cooperate to defend city, compete for victory points
- **Randomness**: Dice rolls for combat, random event selection, random attack targets
- **No hidden information**: All game state visible to all players

### Current Tech Stack
| Component | Technology |
|-----------|------------|
| Frontend | React 18.2 + Vite 5.0 |
| Styling | Tailwind CSS |
| State | React useState (single component) |
| Hosting | Cloudflare Pages |
| Backend | None (purely client-side) |

### Current Architecture Issues
- All game logic in single file (`src/App.jsx` - 3086 lines)
- No external state management
- No networking code
- Hot-seat multiplayer only (pass the device)

---

## Architecture: Cloudflare Durable Objects

### Why Durable Objects?

Cloudflare Durable Objects are perfect for multiplayer games:
- **One object per game room** - natural isolation
- **WebSocket support** - built-in, with hibernation for cost savings
- **Single point of coordination** - all players connect to same instance
- **Edge deployment** - low latency globally
- **No server management** - serverless, scales automatically
- **Already on Cloudflare** - seamless integration with Pages

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Cloudflare Edge Network                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────┐     ┌──────────────────────────────────┐    │
│   │  Cloudflare  │     │        Cloudflare Worker         │    │
│   │    Pages     │────▶│  (API routing, room creation)    │    │
│   │  (Frontend)  │     └──────────────┬───────────────────┘    │
│   └──────────────┘                    │                         │
│                                       │ WebSocket upgrade       │
│                                       ▼                         │
│                        ┌──────────────────────────────────┐    │
│                        │      Durable Object (per room)    │    │
│                        │  ┌─────────────────────────────┐  │    │
│                        │  │   Game State (in memory)    │  │    │
│                        │  │   - turn, phase             │  │    │
│                        │  │   - players[]               │  │    │
│                        │  │   - regions{}               │  │    │
│                        │  │   - currentEvent            │  │    │
│                        │  └─────────────────────────────┘  │    │
│                        │  ┌─────────────────────────────┐  │    │
│                        │  │   WebSocket Connections     │  │    │
│                        │  │   - Player 0 (Nobles)       │  │    │
│                        │  │   - Player 1 (Merchants)    │  │    │
│                        │  │   - Player 2 (Commoners)    │  │    │
│                        │  └─────────────────────────────┘  │    │
│                        └──────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

     ▲                    ▲                    ▲
     │ WSS                │ WSS                │ WSS
     │                    │                    │
┌────┴────┐         ┌────┴────┐         ┌────┴────┐
│ Player 1│         │ Player 2│         │ Player 3│
│ Browser │         │ Browser │         │ Browser │
└─────────┘         └─────────┘         └─────────┘
```

### Authority Model

| Data Type | Authority | Rationale |
|-----------|-----------|-----------|
| Random numbers | Durable Object | Prevent client manipulation |
| Combat outcomes | Durable Object | Dice rolls must be trusted |
| Event selection | Durable Object | Random deck draws |
| Building actions | Client → DO | Deterministic, validated |
| Voting actions | Client → DO | Deterministic, validated |

### State Synchronization
- **Full state broadcast** after each action
- State size ~2KB JSON - bandwidth trivial for turn-based game
- **Optimistic UI**: Apply actions locally, rollback if server rejects

---

## Technology Stack

### Backend (Cloudflare)
```
Cloudflare Workers     - HTTP routing, WebSocket upgrade
Durable Objects        - Game room state, WebSocket handling
WebSocket Hibernation  - Cost savings for idle connections
```

### Frontend Additions
```
Native WebSocket  - No library needed (not Socket.IO)
zustand           - Lightweight state management
```

### No Database Required
- Games are ephemeral (no persistence requirement)
- Room state lives in Durable Object memory
- When all players disconnect, room eventually expires

---

## Implementation Phases

### Phase 1: Code Refactoring (Foundation)

**Goal:** Extract game logic from UI into reusable modules that can run on both client and Durable Object.

#### New File Structure
```
src/
  game/
    state.js          # Initial state, types
    actions.js        # Pure state mutation functions
    events.js         # Event deck, resolution logic
    combat.js         # Strength calculations, battles
    regions.js        # Map adjacency, region logic
    validation.js     # Action validation
  hooks/
    useGameState.js   # State management hook
  components/
    Game/
      GameBoard.jsx
      PlayerCard.jsx
      EventCard.jsx
      RegionMap.jsx
      PhaseBar.jsx
    Lobby/
      Lobby.jsx
      RoomLobby.jsx
```

#### Key Transformation
```javascript
// Before: Mutation inside component
const buildBuilding = (type) => {
  setGameState(prev => { /* mutation */ });
};

// After: Pure function (can run on client or server)
export function buildBuilding(state, playerId, type) {
  if (!validate(state, playerId, type)) return { error: '...' };
  return { ...state, /* new values */ };
}
```

#### Action Types
```javascript
// src/game/actionTypes.js
export const ActionTypes = {
  // Construction phase
  BUILD_BUILDING: 'BUILD_BUILDING',
  BUY_EQUIPMENT: 'BUY_EQUIPMENT',
  END_TURN: 'END_TURN',

  // Events phase
  VOTE_EVENT: 'VOTE_EVENT',

  // Veche phase
  INITIATE_ATTACK: 'INITIATE_ATTACK',
  VOTE_ATTACK: 'VOTE_ATTACK',
  INITIATE_FORTRESS: 'INITIATE_FORTRESS',
  VOTE_FORTRESS: 'VOTE_FORTRESS',

  // Lobby
  SELECT_FACTION: 'SELECT_FACTION',
  READY: 'READY',
  START_GAME: 'START_GAME',
};
```

---

### Phase 2: State Management Migration

**Goal:** Replace useState with Zustand for predictable state updates

```javascript
// src/store/gameStore.js
import { create } from 'zustand';

export const useGameStore = create((set, get) => ({
  // Connection state
  connected: false,
  roomId: null,
  playerId: null,  // 0, 1, or 2

  // Room state (lobby)
  room: null,  // { players: [...], status: 'waiting' | 'playing' }

  // Game state
  gameState: null,

  // Error state
  error: null,

  // Actions
  setConnected: (connected) => set({ connected }),
  setRoom: (room) => set({ room }),
  setGameState: (state) => set({ gameState: state }),
  setError: (error) => set({ error }),
  setPlayerId: (playerId) => set({ playerId }),
}));
```

---

### Phase 3: Cloudflare Worker + Durable Object

**Goal:** Create backend infrastructure for multiplayer

#### Project Structure
```
worker/
  src/
    index.ts              # Worker entry point (routing)
    gameRoom.ts           # Durable Object class
    game/
      state.ts            # Shared with client
      actions.ts          # Shared with client
      random.ts           # Server-only randomness
  wrangler.toml           # Cloudflare configuration
  package.json
```

#### Wrangler Configuration
```toml
# worker/wrangler.toml
name = "veche-multiplayer"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[durable_objects]
bindings = [
  { name = "GAME_ROOM", class_name = "GameRoom" }
]

[[migrations]]
tag = "v1"
new_classes = ["GameRoom"]
```

#### Worker Entry Point
```typescript
// worker/src/index.ts
export { GameRoom } from './gameRoom';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Create new room
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const roomId = generateRoomCode(); // e.g., "PSKOV-1234"
      const id = env.GAME_ROOM.idFromName(roomId);
      const room = env.GAME_ROOM.get(id);
      await room.fetch(new Request('http://internal/init'));
      return Response.json({ roomId });
    }

    // Join room (WebSocket upgrade)
    if (url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/ws')) {
      const roomId = url.pathname.split('/')[3];
      const id = env.GAME_ROOM.idFromName(roomId);
      const room = env.GAME_ROOM.get(id);
      return room.fetch(request);
    }

    // Room info
    if (url.pathname.startsWith('/api/rooms/')) {
      const roomId = url.pathname.split('/')[3];
      const id = env.GAME_ROOM.idFromName(roomId);
      const room = env.GAME_ROOM.get(id);
      return room.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  }
};

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'PSKOV-';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
```

#### Durable Object (Game Room)
```typescript
// worker/src/gameRoom.ts
import { DurableObject } from 'cloudflare:workers';
import { applyAction, validateAction, createInitialState } from './game/actions';

interface Player {
  faction: string | null;
  ready: boolean;
  ws: WebSocket | null;
}

export class GameRoom extends DurableObject {
  players: Player[] = [];
  gameState: any = null;
  status: 'waiting' | 'playing' | 'finished' = 'waiting';

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Initialize room
    if (url.pathname === '/init') {
      this.players = [];
      this.status = 'waiting';
      return new Response('OK');
    }

    // Get room info
    if (request.method === 'GET' && !request.headers.get('Upgrade')) {
      return Response.json({
        players: this.players.map(p => ({
          faction: p.faction,
          ready: p.ready,
          connected: p.ws !== null
        })),
        status: this.status,
      });
    }

    // WebSocket connection
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request);
    }

    return new Response('Not found', { status: 404 });
  }

  async handleWebSocket(request: Request): Promise<Response> {
    if (this.players.length >= 3) {
      return new Response('Room full', { status: 400 });
    }
    if (this.status !== 'waiting') {
      return new Response('Game in progress', { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const playerIndex = this.players.length;
    this.players.push({ faction: null, ready: false, ws: server });

    this.ctx.acceptWebSocket(server);

    // Send player their index and current room state
    server.send(JSON.stringify({
      type: 'connected',
      playerId: playerIndex,
      room: this.getRoomState(),
    }));

    // Notify others
    this.broadcast({ type: 'player_joined', playerId: playerIndex }, server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string) {
    const data = JSON.parse(message);
    const playerIndex = this.players.findIndex(p => p.ws === ws);

    if (playerIndex === -1) return;

    switch (data.type) {
      case 'select_faction':
        this.handleSelectFaction(playerIndex, data.faction, ws);
        break;
      case 'ready':
        this.handleReady(playerIndex, ws);
        break;
      case 'start_game':
        this.handleStartGame(ws);
        break;
      case 'game_action':
        this.handleGameAction(playerIndex, data.action, ws);
        break;
    }
  }

  async webSocketClose(ws: WebSocket) {
    const playerIndex = this.players.findIndex(p => p.ws === ws);
    if (playerIndex !== -1) {
      this.players[playerIndex].ws = null;

      if (this.status === 'playing') {
        // Game forfeited - notify remaining players
        this.broadcast({
          type: 'player_disconnected',
          playerId: playerIndex,
          message: 'Player disconnected. Game ended.'
        });
        this.status = 'finished';
      } else {
        // Remove from lobby
        this.players.splice(playerIndex, 1);
        this.broadcast({ type: 'room_update', room: this.getRoomState() });
      }
    }
  }

  handleSelectFaction(playerIndex: number, faction: string, ws: WebSocket) {
    // Check faction not taken
    if (this.players.some((p, i) => i !== playerIndex && p.faction === faction)) {
      ws.send(JSON.stringify({ type: 'error', message: 'Faction already taken' }));
      return;
    }

    this.players[playerIndex].faction = faction;
    this.broadcast({ type: 'room_update', room: this.getRoomState() });
  }

  handleReady(playerIndex: number, ws: WebSocket) {
    if (!this.players[playerIndex].faction) {
      ws.send(JSON.stringify({ type: 'error', message: 'Select a faction first' }));
      return;
    }

    this.players[playerIndex].ready = true;
    this.broadcast({ type: 'room_update', room: this.getRoomState() });
  }

  handleStartGame(ws: WebSocket) {
    if (this.players.length !== 3) {
      ws.send(JSON.stringify({ type: 'error', message: 'Need 3 players' }));
      return;
    }
    if (!this.players.every(p => p.ready)) {
      ws.send(JSON.stringify({ type: 'error', message: 'All players must be ready' }));
      return;
    }

    // Create initial game state with server-controlled randomness
    this.gameState = createInitialState(this.players.map(p => p.faction!));
    this.status = 'playing';

    this.broadcast({
      type: 'game_started',
      gameState: this.gameState
    });
  }

  handleGameAction(playerIndex: number, action: any, ws: WebSocket) {
    // Validate action
    const validation = validateAction(this.gameState, action, playerIndex);
    if (validation.error) {
      ws.send(JSON.stringify({ type: 'action_rejected', error: validation.error }));
      return;
    }

    // Apply action (with server-side randomness if needed)
    const result = applyAction(this.gameState, action, playerIndex);
    this.gameState = result.newState;

    // Broadcast new state to all players
    this.broadcast({
      type: 'state_update',
      gameState: this.gameState,
      action: action,
      result: result.result
    });

    // Check for game end
    if (this.gameState.gameEnded) {
      this.status = 'finished';
    }
  }

  getRoomState() {
    return {
      players: this.players.map(p => ({
        faction: p.faction,
        ready: p.ready,
        connected: p.ws !== null
      })),
      status: this.status,
    };
  }

  broadcast(message: any, exclude?: WebSocket) {
    const data = JSON.stringify(message);
    for (const player of this.players) {
      if (player.ws && player.ws !== exclude && player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(data);
      }
    }
  }
}
```

---

### Phase 4: Client WebSocket Service

**Goal:** Connect frontend to Durable Object

```javascript
// src/services/websocket.js
import { useGameStore } from '../store/gameStore';

class GameWebSocket {
  ws = null;
  roomId = null;
  reconnectAttempts = 0;
  maxReconnectAttempts = 5;

  connect(roomId) {
    this.roomId = roomId;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.VITE_WS_HOST || window.location.host;

    this.ws = new WebSocket(`${protocol}//${host}/api/rooms/${roomId}/ws`);

    this.ws.onopen = () => {
      useGameStore.getState().setConnected(true);
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleMessage(data);
    };

    this.ws.onclose = () => {
      useGameStore.getState().setConnected(false);
      this.attemptReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  handleMessage(data) {
    const store = useGameStore.getState();

    switch (data.type) {
      case 'connected':
        store.setPlayerId(data.playerId);
        store.setRoom(data.room);
        break;

      case 'room_update':
        store.setRoom(data.room);
        break;

      case 'player_joined':
      case 'player_disconnected':
        store.setRoom(data.room);
        break;

      case 'game_started':
      case 'state_update':
        store.setGameState(data.gameState);
        break;

      case 'action_rejected':
        store.setError(data.error);
        break;

      case 'error':
        store.setError(data.message);
        break;
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      useGameStore.getState().setError('Connection lost. Please refresh.');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    setTimeout(() => {
      if (this.roomId) {
        this.connect(this.roomId);
      }
    }, delay);
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  selectFaction(faction) {
    this.send({ type: 'select_faction', faction });
  }

  ready() {
    this.send({ type: 'ready' });
  }

  startGame() {
    this.send({ type: 'start_game' });
  }

  sendAction(action) {
    this.send({ type: 'game_action', action });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const gameSocket = new GameWebSocket();
```

---

### Phase 5: Lobby UI

**Goal:** Create room creation and joining interface

```jsx
// src/components/Lobby/Lobby.jsx
import { useState } from 'react';
import { gameSocket } from '../../services/websocket';
import { useGameStore } from '../../store/gameStore';

export function Lobby() {
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);
  const { connected, room, error } = useGameStore();

  const createRoom = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/rooms', { method: 'POST' });
      const { roomId } = await res.json();
      gameSocket.connect(roomId);
      // Update URL for sharing
      window.history.pushState({}, '', `/room/${roomId}`);
    } catch (err) {
      useGameStore.getState().setError('Failed to create room');
    }
    setCreating(false);
  };

  const joinRoom = () => {
    if (joinCode.trim()) {
      gameSocket.connect(joinCode.trim().toUpperCase());
      window.history.pushState({}, '', `/room/${joinCode}`);
    }
  };

  if (room) {
    return <RoomLobby />;
  }

  return (
    <div className="lobby">
      <h1>Medieval Pskov - Online</h1>

      {error && <div className="error">{error}</div>}

      <div className="lobby-options">
        <button onClick={createRoom} disabled={creating}>
          {creating ? 'Creating...' : 'Create Room'}
        </button>

        <div className="join-section">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Enter room code (e.g., PSKOV-1234)"
            maxLength={10}
          />
          <button onClick={joinRoom} disabled={!joinCode.trim()}>
            Join Room
          </button>
        </div>
      </div>
    </div>
  );
}
```

```jsx
// src/components/Lobby/RoomLobby.jsx
import { gameSocket } from '../../services/websocket';
import { useGameStore } from '../../store/gameStore';

const FACTIONS = ['Nobles', 'Merchants', 'Commoners'];

export function RoomLobby() {
  const { room, playerId } = useGameStore();
  const roomCode = gameSocket.roomId;

  const takenFactions = room.players
    .map(p => p.faction)
    .filter(Boolean);

  const myFaction = room.players[playerId]?.faction;
  const myReady = room.players[playerId]?.ready;
  const allReady = room.players.length === 3 && room.players.every(p => p.ready);

  return (
    <div className="room-lobby">
      <h2>Room: {roomCode}</h2>
      <p className="share-hint">Share this code with friends!</p>

      <div className="faction-select">
        <h3>Select Your Faction:</h3>
        {FACTIONS.map(faction => (
          <button
            key={faction}
            className={myFaction === faction ? 'selected' : ''}
            disabled={takenFactions.includes(faction) && myFaction !== faction}
            onClick={() => gameSocket.selectFaction(faction)}
          >
            {faction}
            {takenFactions.includes(faction) && myFaction !== faction && ' (Taken)'}
          </button>
        ))}
      </div>

      <div className="players-list">
        <h3>Players ({room.players.length}/3)</h3>
        {room.players.map((player, i) => (
          <div key={i} className={`player ${!player.connected ? 'disconnected' : ''}`}>
            <span className="player-index">Player {i + 1}</span>
            <span className="player-faction">{player.faction || 'Selecting...'}</span>
            {player.ready && <span className="ready-badge">✓ Ready</span>}
            {i === playerId && <span className="you-badge">(You)</span>}
          </div>
        ))}
        {[...Array(3 - room.players.length)].map((_, i) => (
          <div key={`empty-${i}`} className="player empty">
            Waiting for player...
          </div>
        ))}
      </div>

      <div className="actions">
        {myFaction && !myReady && (
          <button onClick={() => gameSocket.ready()}>
            Ready
          </button>
        )}

        {allReady && (
          <button onClick={() => gameSocket.startGame()} className="start-btn">
            Start Game
          </button>
        )}
      </div>
    </div>
  );
}
```

---

### Phase 6: Disconnection Handling

Since we're not implementing AI or persistence, disconnection handling is simple:

1. **During lobby**: Remove player from room, notify others
2. **During game**: Forfeit game, notify remaining players, mark room as finished
3. **Reconnection**: Not supported (game is lost on disconnect)

This is already implemented in the Durable Object `webSocketClose` handler above.

---

## Security Considerations

### Server-Side Validation (in Durable Object)
- [x] All random numbers generated server-side
- [x] Validate player can act (correct turn/phase)
- [x] Validate action is legal (has resources, etc.)
- [x] Room capacity limits (max 3 players)
- [ ] Rate limiting on WebSocket messages (optional)

### Trust Boundaries
| Data | Authority | Notes |
|------|-----------|-------|
| Dice rolls | Durable Object | Never trust client |
| Event selection | Durable Object | Never trust client |
| Attack targets | Durable Object | Never trust client |
| Build actions | Validated | Client initiates, DO validates |
| Votes | Validated | Client initiates, DO validates |

---

## Final Project Structure

```
veche/
├── src/                          # Frontend (React)
│   ├── components/
│   │   ├── Game/
│   │   │   ├── GameBoard.jsx
│   │   │   ├── PlayerCard.jsx
│   │   │   ├── EventCard.jsx
│   │   │   └── ...
│   │   └── Lobby/
│   │       ├── Lobby.jsx
│   │       └── RoomLobby.jsx
│   ├── game/                     # Shared game logic
│   │   ├── state.js
│   │   ├── actions.js
│   │   ├── events.js
│   │   ├── combat.js
│   │   └── validation.js
│   ├── store/
│   │   └── gameStore.js
│   ├── services/
│   │   └── websocket.js
│   ├── App.jsx
│   └── main.jsx
├── worker/                       # Cloudflare Worker
│   ├── src/
│   │   ├── index.ts              # Worker entry (routing)
│   │   ├── gameRoom.ts           # Durable Object
│   │   └── game/                 # Copy of shared game logic
│   │       ├── state.ts
│   │       ├── actions.ts
│   │       └── random.ts         # Server-only
│   ├── wrangler.toml
│   └── package.json
├── package.json
└── vite.config.js
```

---

## Deployment

### Frontend (Cloudflare Pages)
Already deployed - no changes to deployment process.

### Worker (Cloudflare Workers)
```bash
cd worker
npm install
npx wrangler deploy
```

### Environment Configuration
```toml
# worker/wrangler.toml
[vars]
ALLOWED_ORIGIN = "https://your-game.pages.dev"
```

```javascript
// vite.config.js - for local development
export default {
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        ws: true
      }
    }
  }
}
```

---

## Cost Considerations

### Cloudflare Durable Objects Pricing
- **Requests**: $0.15 per million
- **Duration**: $12.50 per million GB-seconds

### WebSocket Hibernation
Durable Objects support hibernation - when all WebSockets are idle (no messages), the DO can hibernate. Clients stay connected but the DO doesn't consume compute. This dramatically reduces costs for turn-based games where players might take time to think.

### Estimated Costs
For a turn-based game with 3 players, ~20 turns, ~100 actions per game:
- Requests: ~100 per game = $0.000015 per game
- Duration: Maybe 30 seconds of active compute = negligible

**Essentially free** for reasonable usage.

---

## Next Steps

1. **Phase 1**: Refactor `App.jsx` - extract game logic into `/src/game/` modules
2. **Phase 2**: Add Zustand for state management
3. **Phase 3**: Create Cloudflare Worker with Durable Object
4. **Phase 4**: Implement WebSocket client service
5. **Phase 5**: Build lobby UI components
6. **Phase 6**: Test end-to-end multiplayer flow
