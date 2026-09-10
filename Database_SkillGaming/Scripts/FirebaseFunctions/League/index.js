const functions = require('firebase-functions/v1');
const db = require('../../db');
const { GameError } = require('../Bet/service');
const { createLeagueService } = require('./service');
const service = createLeagueService(db);
const region = functions.region('asia-south1');
for (const name of ['getMyLeague', 'acknowledgeLeagueEvent']) {
  exports[name] = region.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in to view leagues.');
    try { return await service[name](context.auth.uid, data || {}); }
    catch (error) {
      if (error instanceof GameError) throw new functions.https.HttpsError(error.code, error.message);
      console.error(`[${name}]`, error.message);
      throw new functions.https.HttpsError('internal', 'Could not load leagues. Please try again.');
    }
  });
}
// Every minute also recovers missed boundaries and incomplete payout delivery.
// The DB owns the New York calendar and configurable duration, not invocation time.
exports.settleLeagues = region.runWith({ timeoutSeconds: 300 }).pubsub
  .schedule('every 1 minutes').timeZone('America/New_York').onRun(async () => {
    await service.rollover();
    return service.deliverPayouts();
  });
