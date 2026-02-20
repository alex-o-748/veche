/**
 * Discussion Service
 *
 * Calls the backend API to generate AI player discussion
 * about their event voting decisions using an LLM.
 */

// Reuse the same API URL logic as the multiplayer service
const getApiUrl = () => {
  let url;
  if (import.meta.env.VITE_WORKER_URL) {
    url = import.meta.env.VITE_WORKER_URL;
  } else {
    const hostname = window.location.hostname;
    url = `http://${hostname}:8787`;
  }
  return url.replace(/\/+$/, '');
};

/**
 * Request AI discussion for event votes.
 *
 * @param {object} params
 * @param {object} params.gameState - Current game state
 * @param {object} params.event - The current event (id, name, description, type, orderStrength)
 * @param {Array} params.votes - Vote array [vote0, vote1, vote2]
 * @param {Array<boolean>} params.aiPlayers - Which players are AI [bool, bool, bool]
 * @param {string} params.language - Current language ('en' or 'ru')
 * @returns {Promise<Array<{playerIndex: number, message: string}>>}
 */
export async function requestDiscussion({ gameState, event, votes, aiPlayers, language }) {
  try {
    const response = await fetch(`${getApiUrl()}/api/discuss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameState,
        event: {
          id: event.id,
          name: event.name,
          description: event.description,
          type: event.type,
          orderStrength: event.orderStrength,
        },
        votes,
        aiPlayers,
        language,
      }),
    });

    if (!response.ok) {
      console.warn('[Discussion] API returned', response.status);
      return [];
    }

    const data = await response.json();
    return data.messages || [];
  } catch (error) {
    console.warn('[Discussion] Failed to generate discussion:', error.message);
    return [];
  }
}
