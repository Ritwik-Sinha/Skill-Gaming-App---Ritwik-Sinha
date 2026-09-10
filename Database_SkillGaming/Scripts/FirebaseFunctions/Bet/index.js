/** Firebase-authenticated game attempts, matching, settlement, and private results. */
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const db = require('../../db');
const { createGameService, GameError } = require('./service');

if (!admin.apps.length) admin.initializeApp();
const REGION = 'asia-south1';
const service = createGameService(db);
const SCHEMA_ERROR_CODES = new Set(['42P01', '42703', '42P10']);

function callable(name) {
  return functions.region(REGION).https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
    try {
      return await service[name](context.auth.uid, data || {});
    } catch (error) {
      if (error instanceof GameError) throw new functions.https.HttpsError(error.code, error.message);
      console.error(`[${name}] failed:`, error.message);
      if (SCHEMA_ERROR_CODES.has(error.code)) {
        if (name === 'getMyRating') {
          throw new functions.https.HttpsError('failed-precondition', 'Apply the player-ratings migration before loading ratings.');
        }
        throw new functions.https.HttpsError('failed-precondition', 'Apply the betting and game-attempts migrations before playing.');
      }
      throw new functions.https.HttpsError('internal', 'Could not update or load the game. Please try again.');
    }
  });
}

for (const name of ['placeBet', 'recoverGameReservation', 'checkpointGame', 'finishGame', 'getMyBets',
  'getPendingBetsForGame', 'getMyResults', 'getMyLeaderboard', 'getMyWallet', 'getMyRating', 'addDemoMoney', 'withdrawMoney']) {
  exports[name] = callable(name);
}

// A killed app cannot send a forfeit. Checkpoints renew a two-minute server lease;
// expiry preserves the last accepted score and permanently forfeits the attempt.
// Also closes unmatched bets after 15 minutes and refunds the full entry, fee-free.
exports.finalizeStaleGames = functions.region(REGION).runWith({ timeoutSeconds: 300 }).pubsub
  .schedule('every 1 minutes').onRun(async () => {
    const result = await service.finalizeStaleGames();
    console.info('[finalizeStaleGames]', result);
    return result;
  });
