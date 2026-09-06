// Every file under Scripts/FirebaseFunctions exports one or more Cloud Functions.
// Spread them all here so `firebase deploy --only functions` picks every one up.
module.exports = {
  ...require('./Scripts/FirebaseFunctions/Test'),
  ...require('./Scripts/FirebaseFunctions/Auth'),
};
