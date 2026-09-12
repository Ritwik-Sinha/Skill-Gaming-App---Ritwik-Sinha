# Match flow

This app now uses Firebase callables backed by PostgreSQL for game attempts, results and demo wallet balances. It retains the existing USD currency. Local wallet balances are not imported; top up the new server demo wallet through Add Money.

## Rules

- Profile → Withdraw money opens a bottom sheet accepting positive dollar amounts with up to two decimal places (minimum $0.01). Confirmation removes demo credits through Firebase and updates the shared wallet balance. The server rejects insufficient funds and charges no withdrawal fee. The screen explicitly states that no bank or payment-account payout occurs.
- Tap “Bet and Play” in the Jungle Swing guide to open the bottom sheet. Select a $1, $5, $10 or $20 demo bet, or enter a custom whole-dollar amount between $1 and $20, then tap “Play for” the selected amount. Opening or dismissing the sheet does not place a bet; confirmation starts the entry flow. Entering a custom amount clears the quick selection; choosing a quick bet clears the input. Empty or invalid custom amounts disable Play. New bets must be whole dollars between $1 and $20 inclusive; both the app and server reject fractional-dollar bets or amounts outside this range. API amounts remain integer cents (100, 200, …, 2000). The server debits the entry before authorizing one Unity run. A fresh entry can purchase another run; an existing entry cannot be replayed.
- The game toolbar shows the game name and has no Leave control. Back is consumed during reservation, play and result saving; it neither navigates nor forfeits the attempt. A failed reservation can still return to game details. App backgrounding, closing the app or interrupted recovery forfeits the run. The latest score is retained for display but cannot beat a completed run.
- RN sends a score/lease checkpoint every 15 seconds. The server expires attempts after 120 seconds without a checkpoint; the scheduled finalizer runs every minute. A late completion cannot overwrite a timeout or any other final result.
- Equal completed scores or two forfeits refund both entries with no fee. A single winner receives 90% of the combined pool. For two $10 entries this is $20 gross, $2 match fee and $18 credited. Fees round to the nearest cent.
- An unmatched completed or forfeited entry remains in the matching queue until a different player submits the same game and amount. There is currently no queue expiry or cancellation refund.
- Results and the post-run summary show your score, match status, pool, fee and payout. Once the match settles, both screens also show the matched opponent’s score; forfeited runs are labelled and keep their last recorded score, including zero or “No score” when absent. Pending matches show “Available after settlement”. Both screens refresh automatically. Scores come from `bets`, settlement details from `results`, and per-player earnings from `game_earnings`, fetched together by Firebase. Opponent profiles are not returned or rendered; the leaderboard still displays only your own entry and rank.

## Recovery

AsyncStorage stores pending request IDs and final submissions, never authoritative balances. A lost start response recovers an existing consumed entry and forfeits it without loading Unity. If the request never committed, recovery cancels its request ID without creating or debiting an entry; a delayed original request cannot start it later. A saved final submission is retried after reconnect/relaunch; the server’s expiry and immutable terminal state take precedence. Top-up and withdrawal retries reuse their persisted request IDs and cannot credit or debit twice. Wallet operations resolve pending requests before accepting another operation.

Wallet balances and results also keep the last successful server response as a display cache, in memory and AsyncStorage under the Firebase UID. Switching bottom tabs or restoring the signed-in account shows that saved data while the existing refresh runs. Fresh responses replace it, including a zero balance or empty results list; failed refreshes keep the previous data visible. Initial loading placeholders appear only when there is no saved data. Cache hydration does not add wallet requests or alter result polling, and slow cache reads cannot replace a newer server response. Cached balances never authorize spending: loading/error guards, pending transaction recovery, and server checks still apply. These RN changes need a Metro reload or the next app bundle; no native-code change is required.

Restart correction: sign-in now restores both display caches before exposing the signed-in screens, making the saved results available on their first render. Existing result snapshots whose timestamps were encoded as `{}` remain readable; those missing dates stay blank until the next refresh. Firebase game callables now serialize PostgreSQL timestamps as ISO strings (deployed on 2026-09-10), preventing these invalid date objects in future responses. Verified against the emulator's existing five-result snapshot, then checked that the refreshed snapshot contained string dates. The RN suite passes 348 tests, including real AuthProvider startup and stale-session regressions.

Unity messages include the server bet ID as `sessionId`. RN ignores stale/unidentified messages, retries the same scene-load request while Unity boots, and waits for the matching unload acknowledgment before showing the post-run screen. Unity never resets a terminal run for replay.

## Backend and native setup

Apply migrations and deploy the complete callable/scheduler set as described in [GAME_LIFECYCLE.md](../Database_SkillGaming/GAME_LIFECYCLE.md). This schema was verified and the new wallet/game functions were deployed to `skillgaming-b93ea` on 2026-09-10. Other environments need the same setup before using this protocol.

The Android export was refreshed for this change, preserving the existing Gradle and native integration configuration. The arm64 debug APK builds successfully with `./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a` from `android/`.

For future C# changes, re-export Unity Android using `Tools > Export Android Gradle Project (for React Native)` from the Unity project and rebuild the RN Android app. For iOS, rebuild and embed the updated UnityFramework through the existing integration before running; iOS was not rebuilt in this change. A Metro refresh alone cannot update C# code in a native Unity export.

These balances are demo credits only. Add Money takes no payment; Withdraw Money removes demo credits without a cash payout. Scores originate on the client; this implementation is not an anti-cheat or real-money payment system.

## Checks

From ReactNative_SkillGaming: `npx tsc --noEmit`, `npm test -- --runInBand`, and `npm run lint`.

Backend tests and isolated PostgreSQL 17 integration test commands are documented with the backend lifecycle. Native device checks should include cold boot, game over, repeated Back attempts (must remain in the game), backgrounding, app termination/relaunch, offline completion, and successive fresh paid entries.
