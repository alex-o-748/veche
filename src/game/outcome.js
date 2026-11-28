// Outcomes: what just happened, as data the UI translates.
//
// The rules never produce player-facing text in a particular language. Each outcome is
// { key, params, then? }, where key is a translation key and params hold raw values
// (region ids, building type ids, faction names, numbers). `then` chains a second
// outcome that is shown right after the first ("Pskov held. Then ...").
//
// lastEventResult keeps a plain-English line for logs and the simulator.

export const createOutcome = (key, params = {}, then = null) =>
  then ? { key, params, then } : { key, params };

export const setOutcome = (state, outcome, englishText = null) => ({
  ...state,
  lastOutcome: outcome,
  lastEventResult: englishText ?? outcome.key,
});
