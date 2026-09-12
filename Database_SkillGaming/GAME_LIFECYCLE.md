# Games, results, and demo wallet

The Firebase callable functions run in `asia-south1`, authenticate Firebase users,
and transact directly against PostgreSQL through `Scripts/db.js`. Apply migrations
in filename order, including `20260910040000_player_ratings.sql`, before
deploying the updated functions. Deploy `finalizeStaleGames` too: its one-minute
Cloud Scheduler job closes attempts after an app is killed and refunds unmatched
bets once their 15-minute matching deadline expires.

Deployment verified on 2026-09-10: the database already contained the required
wallet/game schema, and all game/wallet callables plus `finalizeStaleGames` were
deployed to `skillgaming-b93ea` in `asia-south1`. The missing deployed wallet
endpoints had caused the RN app to show an unavailable balance and disable
Add Money. An already-open app can retry loading its balance after deployment.
The withdrawal migration was applied and recorded on 2026-09-10, and
`withdrawMoney` was deployed successfully to the same project and region.
The unmatched refund migration and eight affected functions were deployed on
2026-09-10. The enabled `finalizeStaleGames` scheduler was triggered and verified:
four overdue bets closed, $13.00 was returned to their wallets, match fees were
zero, and no overdue unmatched bets remained. Wallet balances matched their
immutable ledgers. The scheduler job is in `us-central1` and targets the function
in `asia-south1`. Updated RN refund wording requires the next app build.

Player ratings were deployed on 2026-09-10: migration
`20260910040000_player_ratings.sql` was applied and recorded, and `getMyRating`
was created in `skillgaming-b93ea` / `asia-south1`. All four existing players have
rating rows, with zero differences from their recorded win/loss totals. Both
rating triggers are enabled, and the deployed callable correctly rejects an
unauthenticated request with HTTP 401. RN Profile display and account-scoped
caching passed all 380 app tests, TypeScript, and targeted ESLint checks; the UI
is included when the updated app code is loaded or built.

## API

All IDs are strings; monetary values are integer USD cents. Callables derive the
owner from Firebase Auth, never a client-supplied UID.

| Callable | Request | Response |
| --- | --- | --- |
| `placeBet` | `{ gameId: 'jungleSwing', amountCents, requestId }` | `{ canStart, bet, result, wallet }` |
| `recoverGameReservation` | `{ gameId, amountCents, requestId }` | `{ bet }`, null when the original reservation never committed |
| `checkpointGame` | `{ betId, score? }` | `{ canContinue, bet, result }` |
| `finishGame` | `{ betId, score?, reason: 'completed' \| 'forfeited' }` | `{ canContinue: false, bet, result }` |
| `getMyResults` | `{ limit? }` | `{ results }`, including unmatched attempts |
| `getMyBets` | `{ limit? }` | `{ bets }` |
| `getPendingBetsForGame` | `{ gameId }` | `{ bets }`, only the caller's pending bets |
| `getMyLeaderboard` | `{ gameId, betId? }` | `{ gameId, score, bestScore, rank, totalPlayers, playersBelow, isPersonalBest }` |
| `getMyWallet` | `{}` | `{ balanceCents, currency: 'USD', mode: 'demo' }` |
| `getMyRating` | `{}` | `{ rating }`, signed integer for the authenticated player |
| `addDemoMoney` | `{ amountCents, requestId }` | Same wallet response |
| `withdrawMoney` | `{ amountCents, requestId }` | Same wallet response; removes demo credits |

Use a fresh UUID for each new entry, demo credit, or withdrawal. Persist it before sending the
request. Use `recoverGameReservation` after an uncertain entry response; retry
the same wallet request key after an uncertain top-up or withdrawal response. Reusing a key with a
different amount/game is rejected. A duplicate game request returns its original
receipt with `canStart: false`, even if the first response was lost. Only the first
successful request authorizes a launch. A consumed attempt cannot be reopened.
Recovery never creates or debits a new bet: when the original entry never
committed, it records a `cancelled_game_requests` tombstone and returns null.
The same per-user transaction lock serializes recovery and placement, so a
delayed original request cannot subsequently create an invisible paid game.
If recovery returns an existing attempt, finish it as forfeited (or retry its
already-persisted finish request); never launch it again.

`bet` contains `id`, `gameId`, `amountCents`, `status` (`pending`, `matched`, or
`cancelled`), `playStatus` (`playing`, `completed`, or `forfeited`), nullable `score`,
nullable `resultId`, `startedAt`, `finishedAt`, `leaseExpiresAt`, `finishReason`,
`createdAt`, `updatedAt`, and `matchedAt`.

Each own `result` contains `betId`, nullable `matchId`, `gameId`, `amountCents`,
nullable `score`, `playStatus`, nullable `opponentScore`, nullable
`opponentPlayStatus` (`completed` or `forfeited`), `finishReason`, `matchStatus` (`unmatched`,
`matched`, `settled`, or `cancelled`), `outcome`, `grossAmountCents`,
`matchFeeCents`, `netAmountCents`, `totalPoolCents`, `totalMatchFeeCents`,
`matchFeePercent` (10 for matches, 0 for unmatched closures), `walletCreditCents`, `isLegacy`, `createdAt`, and
`settledAt`. Amounts prefixed with `total` describe the match; gross/fee/net describe
the caller's settlement. `walletCreditCents` is the amount actually credited to
the server wallet. Outcomes are `playing`, `waiting_for_match`,
`waiting_for_opponent`, `won`, `lost`, `tie`, `refunded`, `forfeited`, or `cancelled`.
Results combine the caller's attempt from `bets`, match state from `results`,
settlement amounts from `game_earnings`, and actual credits from `wallet_entries`.
Once a match is settled, results also include the exact matched opponent's final
score and completion/forfeit status from their `bets` row. These two fields are
null before settlement. A forfeited score remains null if no score was saved;
zero is a recorded score. Results expose no opponent identity, and leaderboard
responses continue to contain only the caller's score and standing.

## Attempt and matching rules

- New bets must be whole-dollar amounts between $1 and $20 inclusive (100–2000
  USD cents in steps of 100), enforced by `placeBet` before database access.
  Existing fractional-dollar entries or entries outside that range can still be
  recovered and finished; settlement rules are unchanged.
- An entry is debited and its single attempt starts in the same transaction.
  A user can have only one playing attempt across all entry amounts.
- Send a checkpoint approximately every 15 seconds. A checkpoint can omit a score
  while the game is loading. Scores are nonnegative integers up to 1,000,000,000;
  checkpoints retain the largest accepted score.
- Checkpoints renew a two-minute lease. RN consumes Back during an attempt and
  has no Leave control; a blocked Back action does not call `finishGame`.
  A real app background event should immediately call `finishGame` with
  `reason: 'forfeited'`. The scheduler
  handles hard kills and unreachable clients after lease expiry. The next history
  read also finalizes the caller's expired attempt. Scheduler execution can add
  up to about one minute to the two-minute expiry.
- A forfeit retains its last score, or null if none was received. It is ineligible
  to win regardless of that score. A late completion after expiry also forfeits
  and cannot submit a new score. Terminal attempts and scores are immutable.
- Matching chooses the oldest other user in the same game and entry amount.
  Pending entries are eligible only until 15 minutes after server `created_at`,
  regardless of when play finishes. At or after that deadline, an unmatched bet
  is closed (`status: 'cancelled'`) and its full server-debited entry is refunded
  with no match fee. Expired bets cannot match even before the scheduler processes
  them. Matched bets continue through normal settlement.
  A new paid attempt is allowed after the previous attempt finishes, even while
  its match is pending.
- `finalizeStaleGames` processes up to 100 unmatched closures per minute, normally
  crediting a refund within the minute after the deadline; outages or a larger
  backlog can delay processing. Wallet/history/pending reads and a new bet also
  process the caller's expired entries. A heartbeat or finish request at the
  deadline closes an unmatched running attempt with `finishReason: 'match_timeout'`
  and `canContinue: false`, retaining its last accepted score. Completed and
  forfeited attempts keep their original immutable score and finish fields.
- Settlement waits for both attempts to finish. A completed attempt beats a
  forfeited attempt, including a completed score of zero. Otherwise the higher
  completed score wins. Ties and double forfeits refund both entry stakes.
- The winner receives 90% of the combined pool. The 10% fee is rounded to the
  nearest cent using integer arithmetic. A $10 + $10 match pays $18 and records a
  $2 fee. Ties and double forfeits have no fee.
- `rank` describes this run's score compared with every other player's best
  completed score for this game. Players with equal scores share a rank. Each
  player is counted once, and forfeited attempts have no rank. Omitting `betId`
  returns the caller's best completed score and its standing.

## Money and migration behavior

`player_ratings` stores one global rating per Firebase UID. Players start at **0**;
each settled win adds **20** and each settled loss subtracts **20**. Ratings can
be negative. Draws, double forfeits, unmatched entries and unmatched refunds make
no change. A completed player beating a matched forfeited or timed-out opponent
gets the same +20, and the opponent gets -20. Entry amount, score margin and
opponent rating do not affect the change.

The existing immutable `game_earnings` table also serves as the rating ledger.
An insert trigger applies the delta in the same transaction as both earnings,
the match settlement and wallet payouts. Its unique per-bet key prevents retries
from counting twice; atomic increments and the existing sorted wallet locks
preserve changes from simultaneous matches. There is no client rating-write
endpoint. `getMyRating` uses the authenticated Firebase UID and ignores any UID
or rating supplied in its request. The table has RLS enabled with no public
policies, like the wallet tables.

`20260910040000_player_ratings.sql` initializes existing users and backfills
trusted settled wins/losses, starting from zero. Both participants must have
nonlegacy, finished attempts with recorded server entry debits. Legacy results,
unmatched refunds and hypothetical payout columns never affect rating. The
migration leaves all earnings and wallet rows unchanged and locks users/earnings
while installing triggers and backfilling, so concurrent signups or settlements
cannot be missed. New users receive a zero-rating row automatically.
The trigger also works with the already-deployed settlement functions; after
applying the migration, deploy the new `getMyRating` callable in `asia-south1`.

`wallets` and `wallet_entries` are server-owned demo balances and an immutable
ledger. New wallets start at zero. Old AsyncStorage balances are never imported.
`addDemoMoney` creates explicitly labeled demo credits, without a real payment.
Each top-up is limited to $999,999 and cannot raise the
balance above that cap; earned credits can exceed it. Balances remain integer
cents within JavaScript's safe integer range.

Profile contains a Withdraw Money section. `withdrawMoney` removes demo credits;
it does not pay a bank or payment account and charges no withdrawal fee. The UI
accepts positive USD amounts with up to two decimal places, starting at $0.01,
and converts decimal digits to integer cents before calling Firebase. The server
accepts only positive safe integer cents and rejects amounts above the available
balance. Whole-dollar betting rules remain $1–$20.

The withdrawal migration adds `demo_withdrawal` to the immutable `wallet_entries`
ledger with a negative amount and no bet or match association. Each withdrawal
and its balance update commit together. User and wallet row locks serialize
withdrawals against top-ups, entries and settlement credits. A repeated request
returns the current balance without another debit, even when the remaining
balance is below the original withdrawal. RN journals pending withdrawals per
account and resolves uncertain requests before allowing another wallet operation.

`game_earnings` is the GameEarning table: one immutable row per match participant,
linked through `match_id` and `bet_id`. It records gross award, match fee, net
award, and outcome, including zero loss rows and fee-free refunds. The result,
both earnings rows, and wallet payouts/refunds commit atomically. Unique ledger
keys and row locks prevent repeated debits, payouts, or refunds. No public RLS
policies permit direct client access to these tables.

An unmatched refund has a `game_earnings` row with `match_id: null`,
`outcome: 'refunded'`, equal gross/net amounts, and zero fee, plus a `wallet_entries`
refund with key `unmatched-refund:<betId>`. Closure and both ledger writes commit
in one transaction under the matching bucket and bet row locks. Concurrent
matching, heartbeats, retries, and overlapping scheduler runs cannot pay the bet
twice. Refund amounts come from immutable `wallet_debited_cents`; entries without
a trusted debit close without minting credits. Results show `matchStatus: 'cancelled'`,
`outcome: 'refunded'`, `matchId: null`, zero pool/fee, the actual wallet credit,
and the refund ledger time in `settledAt`.

Game callable timestamps are explicitly converted from PostgreSQL `Date` objects
to ISO strings before Firebase encodes the response. Without this conversion,
the callable encoder produces `{}`, which caused RN to reject saved result
snapshots on restart. The seven affected game/history endpoints were updated on
2026-09-10; transport regression and integration checks passed (11 unit tests and
41 PostgreSQL integration tests). RN also restores existing snapshots containing
the old empty timestamp objects.

Pre-migration attempts have no trustworthy score or server debit. Unmatched ones
are cancelled, and matched unfinished ones finalize as double forfeits. Their
recorded legacy refunds are historical only: `isLegacy: true` and
`walletCreditCents: 0`; no server credits are minted. Previously settled records
are preserved, with no retrospective fee or wallet credit. The original users
migration's trailing comma was also corrected so a fresh database can migrate.

Scores still originate in the bundled client game. This protects lifecycle and
demo accounting, but does not constitute server-authoritative anti-cheat or a
production real-money/payment implementation.

## Validation

`npm test` runs settlement arithmetic, validation, and callable authentication
tests. `npm run test:integration` exercises actual PostgreSQL concurrency,
migrations, idempotency, privacy, stale attempts, wallet conservation and rollback.
It only accepts a disposable local database named `skillgaming_test` and resets
that database's public schema.

Unmatched expiry validation passed: 10 backend unit tests and 41 PostgreSQL
integration tests, including deadline boundaries, concurrent matching/refunds,
retry idempotency, transaction rollback, and preservation of completed scores.
ResultsScreen/ScoreSummaryScreen passed 44 RN tests, including the closed refund
display; targeted ESLint also passed.

Player rating validation passed: 11 backend unit tests and 48 PostgreSQL
integration tests, including historical backfill, zero/negative ratings, caller
isolation, wins/losses, forfeit/timeouts, neutral draws/refunds, overlapping
settlements, duplicate retries and rollback after the rating trigger executes.

Example isolated test database:

```sh
docker run --rm -d --name skillgaming-bets-test -e POSTGRES_PASSWORD=local-test-only -e POSTGRES_DB=skillgaming_test -p 127.0.0.1:55439:5432 postgres:17-alpine
TEST_DATABASE_URL='postgres://postgres:local-test-only@127.0.0.1:55439/skillgaming_test' npm run test:integration
docker stop skillgaming-bets-test
```
