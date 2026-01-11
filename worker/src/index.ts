/**
 * Veche Multiplayer Server
 *
 * Cloudflare Worker entry point that routes requests to Durable Objects.
 * Each game room is a separate Durable Object instance.
 */

import { GameRoom } from './gameRoom';

export { GameRoom };

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
  ENVIRONMENT: string;
}

// Generate a random room code like "PSKOV-A3X7"
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'PSKOV-';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// CORS headers for cross-origin requests
function corsHeaders(origin: string | null): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    try {
      // POST /api/rooms - Create a new room
      if (url.pathname === '/api/rooms' && request.method === 'POST') {
        const roomId = generateRoomCode();

        // Create the Durable Object instance
        const id = env.GAME_ROOM.idFromName(roomId);
        const room = env.GAME_ROOM.get(id);

        // Initialize the room
        await room.fetch(new Request('http://internal/init', { method: 'POST' }));

        return new Response(
          JSON.stringify({ roomId }),
          {
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders(origin),
            },
          }
        );
      }

      // GET /api/rooms/:roomId - Get room info
      if (url.pathname.match(/^\/api\/rooms\/[A-Z0-9-]+$/) && request.method === 'GET') {
        const roomId = url.pathname.split('/')[3];
        const id = env.GAME_ROOM.idFromName(roomId);
        const room = env.GAME_ROOM.get(id);

        const response = await room.fetch(
          new Request('http://internal/info', { method: 'GET' })
        );

        const data = await response.json();

        return new Response(
          JSON.stringify(data),
          {
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders(origin),
            },
          }
        );
      }

      // GET /api/rooms/:roomId/ws - WebSocket connection
      if (url.pathname.match(/^\/api\/rooms\/[A-Z0-9-]+\/ws$/) && request.method === 'GET') {
        const roomId = url.pathname.split('/')[3];

        // Check for WebSocket upgrade
        const upgradeHeader = request.headers.get('Upgrade');
        if (upgradeHeader !== 'websocket') {
          return new Response('Expected WebSocket upgrade', { status: 426 });
        }

        const id = env.GAME_ROOM.idFromName(roomId);
        const room = env.GAME_ROOM.get(id);

        // Forward the WebSocket request to the Durable Object
        return room.fetch(request);
      }

      // Health check
      if (url.pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok', timestamp: Date.now() }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // 404 for unknown routes
      return new Response('Not Found', { status: 404 });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(origin),
          },
        }
      );
    }
  },
};
