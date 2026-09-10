# Games, results, and demo wallet

The Firebase callable functions run in `asia-south1`, authenticate Firebase users,
and transact directly against PostgreSQL through `Scripts/db.js`. Apply migrations
in filename order, including `20260910010000_game_attempts_and_earnings.sql`, before
deploying the updated functions. Deploy `finalizeStaleGames` too: its one-minute
Cloud Scheduler job is needed to close attempts after an app is killed.

Deployment verified on 2026-09-10: the database already contained the required
wallet/game schema, and all game/wallet callables plus `finalizeStaleGames` were
deployed to `skillgaming-b93ea` in `asia-south1`. The missing deployed wallet
endpoints had caused the RN app to show an unavailable balance and disable
Add Money. An already-open app can retry loading its balance after deployment.

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
| `addDemoMoney` | `{ amountCents, requestId }` | Same wallet response |

Use a fresh UUID for each new entry or demo credit. Persist it before sending the
request. Use `recoverGameReservation` after an uncertain entry response; retry
the same credit key after an uncertain top-up response. Reusing a key with a
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
`matchFeePercent: 10`, `walletCreditCents`, `isLegacy`, `createdAt`, and
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
- Checkpoints renew a two-minute lease. A back action, exit, or background event
  should immediately call `finishGame` with `reason: 'forfeited'`. The scheduler
  handles hard kills and unreachable clients after lease expiry. The next history
  read also finalizes the caller's expired attempt. Scheduler execution can add
  up to about one minute to the two-minute expiry.
- A forfeit retains its last score, or null if none was received. It is ineligible
  to win regardless of that score. A late completion after expiry also forfeits
  and cannot submit a new score. Terminal attempts and scores are immutable.
- Matching chooses the oldest other user in the same game and entry amount.
  Completed and forfeited unmatched attempts remain queued until another player
  arrives; their debited entry stays held. A new paid attempt is allowed after
  the previous attempt finishes, even while its match is pending.
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

`wallets` and `wallet_entries` are server-owned demo balances and an immutable
ledger. New wallets start at zero. Old AsyncStorage balances are never imported.
`addDemoMoney` creates explicitly labeled demo credits, without a real payment,
deposit, or cash-out flow. Each top-up is limited to $999,999 and cannot raise the
balance above that cap; earned credits can exceed it. Balances remain integer
cents within JavaScript's safe integer range.

`game_earnings` is the GameEarning table: one immutable row per match participant,
linked through `match_id` and `bet_id`. It records gross award, match fee, net
award, and outcome, including zero loss rows and fee-free refunds. The result,
both earnings rows, and wallet payouts/refunds commit atomically. Unique ledger
keys and row locks prevent repeated debits, payouts, or refunds. No public RLS
policies permit direct client access to these tables.

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

Example isolated test database:

```sh
docker run --rm -d --name skillgaming-bets-test -e POSTGRES_PASSWORD=local-test-only -e POSTGRES_DB=skillgaming_test -p 127.0.0.1:55439:5432 postgres:17-alpine
TEST_DATABASE_URL='postgres://postgres:local-test-only@127.0.0.1:55439/skillgaming_test' npm run test:integration
docker stop skillgaming-bets-test
```
