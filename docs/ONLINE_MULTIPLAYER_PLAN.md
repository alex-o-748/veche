# Online Multiplayer Implementation Plan for Medieval Pskov (Veche)

## Overview

This document outlines the implementation plan for adding online multiplayer functionality to Medieval Pskov, a turn-based strategy board game for 3 players representing factions (Nobles, Merchants, Commoners) defending Pskov from the Teutonic Order.

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
| Backend | None (purely client-side) |

### Current Architecture Issues
- All game logic in single file (`src/App.jsx` - 3086 lines)
- No external state management
- No networking code
- Hot-seat multiplayer only (pass the device)

---

## Architecture Decisions

### Network Model: Client-Server

**Why not P2P:**
- NAT traversal complexity
- Requires TURN servers anyway
- Harder to prevent cheating
- Difficult reconnection handling

### Authority Model: Hybrid

| Data Type | Authority | Rationale |
|-----------|-----------|-----------|
| Random numbers | Server only | Prevent client manipulation |
| Combat outcomes | Server only | Dice rolls must be trusted |
| Event selection | Server only | Random deck draws |
| Building actions | Client → Server | Deterministic, validated |
| Voting actions | Client → Server | Deterministic, validated |

### State Synchronization
- **Full state broadcast** after each action
- State size ~2KB JSON - bandwidth trivial for turn-based game
- **Optimistic UI**: Apply actions locally, rollback if server rejects

---

## Technology Stack

### Backend
```
Runtime:        Node.js 20+
WebSocket:      Socket.IO (handles reconnection, fallback, rooms)
HTTP API:       Express.js
Database:       PostgreSQL (via Supabase) or SQLite
Hosting:        Railway / Render / Fly.io
```

### Frontend Additions
```
socket.io-client  - WebSocket communication
zustand           - Lightweight state management
```

---

## Implementation Phases

### Phase 1: Code Refactoring (Foundation)

**Goal:** Extract game logic from UI into reusable modules

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

// After: Pure function
export function buildBuilding(state, playerId, type) {
  if (!validate(state, playerId, type)) return { error: '...' };
  return { ...state, /* new values */ };
}
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
  playerId: null,

  // Game state
  gameState: null,

  // Actions
  setGameState: (state) => set({ gameState: state }),
  applyAction: (action) => {
    const newState = applyGameAction(get().gameState, action);
    set({ gameState: newState });
  },
}));
```

---

### Phase 3: Backend Implementation

#### Server Structure
```
server/
  index.js              # Entry point
  socket/
    handlers.js         # Socket event handlers
    rooms.js            # Room management
  game/
    state.js            # Shared with client
    actions.js          # Shared with client
    random.js           # Server-only randomness
  api/
    routes.js           # REST endpoints
  db/
    schema.sql
    queries.js
```

#### Core Server Setup
```javascript
// server/index.js
import { Server } from 'socket.io';

const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL }
});

const rooms = new Map();

io.on('connection', (socket) => {
  socket.on('create_room', handleCreateRoom);
  socket.on('join_room', handleJoinRoom);
  socket.on('game_action', handleGameAction);
  socket.on('disconnect', handleDisconnect);
});
```

#### Server-Controlled Randomness
```javascript
// server/game/random.js
export function rollCombatDice(attackerStrength, defenderStrength) {
  const strengthDiff = attackerStrength - defenderStrength;
  const chancePercent = calculateWinChance(strengthDiff);
  const roll = Math.random() * 100;
  return {
    roll,
    chancePercent,
    victory: roll < chancePercent
  };
}
```

---

### Phase 4: Client-Server Communication

#### Socket Client Service
```javascript
// src/services/socket.js
import { io } from 'socket.io-client';
import { useGameStore } from '../store/gameStore';

class GameSocket {
  socket = null;

  connect(serverUrl) {
    this.socket = io(serverUrl);

    this.socket.on('state_update', (state) => {
      useGameStore.getState().setGameState(state);
    });

    this.socket.on('action_rejected', (data) => {
      // Rollback optimistic update, show error
    });
  }

  sendAction(action) {
    this.socket.emit('game_action', action);
  }
}

export const gameSocket = new GameSocket();
```

---

### Phase 5: Lobby System

#### Features
- Create room → get shareable code (e.g., "PSKOV-1234")
- Join room by code
- Faction selection (first-come-first-served)
- Ready check before game starts

#### Room States
```
waiting  → Players joining, selecting factions
starting → All ready, initializing game
playing  → Game in progress
finished → Game ended, show results
```

---

### Phase 6: Disconnection Handling

#### Strategy
1. Player disconnects → Mark as disconnected (not removed)
2. Start 5-minute grace period
3. Notify other players
4. If reconnects within grace period → Restore session
5. If timeout expires → Replace with AI or forfeit

#### Reconnection Flow
```
Client stores: { roomId, playerId } in localStorage
On page load: Attempt reconnect with stored credentials
Server validates: Room exists, player slot available
Success: Resume game from current state
```

---

### Phase 7: Turn Timer (Optional)

#### Behavior
- Configurable duration per phase (default: 2 minutes)
- Visual countdown for all players
- Auto-pass when timer expires:
  - Construction: Skip to next player
  - Events: Submit default vote
  - Veche: Auto-pass proposals

---

## Database Schema

```sql
-- Game rooms
CREATE TABLE rooms (
  id VARCHAR(20) PRIMARY KEY,
  status VARCHAR(20) DEFAULT 'waiting',
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  winner_faction VARCHAR(20)
);

-- Room players
CREATE TABLE room_players (
  room_id VARCHAR(20) REFERENCES rooms(id),
  player_id UUID,
  faction VARCHAR(20),
  slot_index INTEGER,
  is_bot BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (room_id, slot_index)
);

-- Game state snapshots
CREATE TABLE game_states (
  id SERIAL PRIMARY KEY,
  room_id VARCHAR(20) REFERENCES rooms(id),
  turn INTEGER,
  phase VARCHAR(20),
  state_json JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Action log (debugging/replay)
CREATE TABLE game_actions (
  id SERIAL PRIMARY KEY,
  room_id VARCHAR(20) REFERENCES rooms(id),
  player_slot INTEGER,
  action_type VARCHAR(50),
  action_data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Security Considerations

### Server-Side Validation
- [ ] All random numbers generated server-side
- [ ] Validate player can act (correct turn/phase)
- [ ] Validate action is legal (has resources, etc.)
- [ ] Rate limiting on socket events
- [ ] Room capacity limits (max 3 players)
- [ ] Input sanitization on player names

### Trust Boundaries
| Data | Authority | Notes |
|------|-----------|-------|
| Dice rolls | Server | Never trust client |
| Event selection | Server | Never trust client |
| Attack targets | Server | Never trust client |
| Build actions | Validated | Client initiates |
| Votes | Validated | Client initiates |

---

## Final Project Structure

```
veche/
├── client/                    # Frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── Game/
│   │   │   └── Lobby/
│   │   ├── game/              # Shared game logic
│   │   ├── store/
│   │   ├── services/
│   │   ├── hooks/
│   │   └── App.jsx
│   └── package.json
│
├── server/                    # Backend
│   ├── src/
│   │   ├── socket/
│   │   ├── game/
│   │   ├── api/
│   │   └── db/
│   ├── index.js
│   └── package.json
│
├── shared/                    # Shared code (alternative)
│   └── game/
│
└── package.json               # Workspace root
```

---

## Alternative Approaches Considered

### Firebase Realtime Database
- **Pros:** No backend to deploy, real-time sync built-in
- **Cons:** Less control over randomness, vendor lock-in

### Supabase Realtime
- **Pros:** PostgreSQL + realtime, open source
- **Cons:** Still need custom game logic server

### Peer-to-Peer (WebRTC)
- **Pros:** No server costs, lowest latency
- **Cons:** NAT issues, cheating prevention hard, complex reconnection

**Decision:** Node.js + Socket.IO for maximum control and simpler debugging.

---

## Next Steps

1. **Phase 1**: Start by refactoring `App.jsx` - extract game logic into modules
2. Set up monorepo structure with client/server workspaces
3. Implement state management migration
4. Build minimal server with room management
5. Add networking layer
6. Implement lobby UI
7. Add disconnection handling
8. (Optional) Add turn timers

---

## Questions to Decide Before Implementation

1. **Player accounts:** Anonymous sessions or require sign-up?
2. **Persistence:** Save games for later? Match history?
3. **Spectator mode:** Allow watching games in progress?
4. **AI players:** Fill empty slots with bots? Handle disconnections?
5. **Turn timer:** Required or optional setting per room?
6. **Private rooms:** Password protection for rooms?
