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
  ANTHROPIC_API_KEY: string;
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

      // POST /api/discuss - Generate AI discussion for event votes
      if (url.pathname === '/api/discuss' && request.method === 'POST') {
        if (!env.ANTHROPIC_API_KEY) {
          return new Response(
            JSON.stringify({ error: 'Discussion service not configured' }),
            { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
          );
        }

        const body = await request.json() as {
          gameState: any;
          event: { id: string; name: string; description: string; type: string; orderStrength?: number };
          votes: (string | boolean | null)[];
          aiPlayers: boolean[];
          language: string;
        };

        const { gameState, event, votes, aiPlayers, language } = body;

        // Build compact game state summary
        const factions = ['Nobles', 'Merchants', 'Commoners'];
        const playerSummaries = gameState.players.map((p: any, i: number) => {
          return `${factions[i]}: ${p.money}○ money, ${p.weapons} weapons, ${p.armor} armor, ${p.improvements} improvements`;
        }).join('\n  ');

        const republicRegions = Object.entries(gameState.regions)
          .filter(([_, r]: [string, any]) => r.controller === 'republic')
          .map(([name]: [string, any]) => name);
        const orderRegions = Object.entries(gameState.regions)
          .filter(([_, r]: [string, any]) => r.controller === 'order')
          .map(([name]: [string, any]) => name);

        const effects = gameState.activeEffects?.length > 0
          ? gameState.activeEffects.map((e: any) => `${e.description} (${e.turnsRemaining} turns left)`).join(', ')
          : 'None';

        // Build vote descriptions
        const voteDescriptions = votes.map((vote: any, i: number) => {
          if (!aiPlayers[i]) return null;
          const voteLabel = vote === true ? 'Yes / Defend' : vote === false ? 'No / Surrender' : String(vote);
          return `${factions[i]} (AI) voted: "${voteLabel}"`;
        }).filter(Boolean).join('\n');

        const lang = language === 'ru' ? 'Russian' : 'English';

        const systemPrompt = `You are generating in-character dialogue for AI council members in a medieval strategy game about the Pskov Republic (a medieval Russian city-state). Each faction has a distinct voice:

- Nobles: Proud, honor-bound, focused on military strength and legacy. Speak formally.
- Merchants: Pragmatic, shrewd, focused on money and trade. Speak in terms of costs and profits.
- Commoners: Practical, community-minded, focused on survival and defense. Speak plainly.

Write brief (1-2 sentences) in-character council statements explaining their vote. Reference specific game details when relevant (money, strength, threats). Sound like medieval council members debating, not modern people.

Respond ONLY with a JSON object: {"messages": [{"playerIndex": <number>, "message": "<string>"}]}
Only include messages for the AI players listed.
${lang !== 'English' ? `Write the messages in ${lang}.` : ''}`;

        const userPrompt = `GAME STATE (Turn ${gameState.turn}/20):
  ${playerSummaries}
  Republic regions: ${republicRegions.join(', ')}
  Order regions: ${orderRegions.join(', ')}
  Active effects: ${effects}

EVENT: ${event.name}
${event.description}
${event.orderStrength ? `Order attack strength: ${event.orderStrength}` : ''}

VOTES:
${voteDescriptions}

Generate council statements for each AI voter explaining their reasoning.`;

        try {
          const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': env.ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 512,
              system: systemPrompt,
              messages: [{ role: 'user', content: userPrompt }],
            }),
          });

          if (!apiResponse.ok) {
            const errText = await apiResponse.text();
            console.error('Anthropic API error:', apiResponse.status, errText);
            return new Response(
              JSON.stringify({ error: 'AI discussion generation failed' }),
              { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
            );
          }

          const apiResult = await apiResponse.json() as { content: Array<{ type: string; text: string }> };
          const text = apiResult.content?.[0]?.text || '{}';

          // Parse the JSON from Claude's response
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { messages: [] };

          return new Response(
            JSON.stringify(parsed),
            { headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
          );
        } catch (apiError) {
          console.error('Discussion API error:', apiError);
          return new Response(
            JSON.stringify({ error: 'Discussion generation failed' }),
            { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
          );
        }
      }

      // Health check
      if (url.pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok', timestamp: Date.now() }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // 404 for unknown routes
      return new Response('Not Found', {
        status: 404,
        headers: corsHeaders(origin),
      });

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
