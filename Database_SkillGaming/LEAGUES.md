# Leagues

Firebase project: `skillgaming-b93ea`, region: `asia-south1`. Storage is the existing PostgreSQL database. Rewards credit the existing **demo wallet**; no external cash transfer or gems are implemented.

| Tier | Pool | Crowns to advance instantly | Weekly winners | Prize percentages |
| --- | ---: | ---: | ---: | --- |
| Bronze | $1 | 10 | 2 | 70 / 30 |
| Silver | $25 | 50 | 3 | 50 / 30 / 20 |
| Gold | $50 | 150 | 5 | 40 / 25 / 15 / 12 / 8 |
| Platinum | $100 | 350 | 5 | 40 / 25 / 15 / 12 / 8 |
| Sapphire | $300 | 750 | 10 | 30 / 20 / 14 / 10 / 8 / 6 / 4 / 3 / 3 / 2 |
| Ruby | $400 | 1,500 | 10 | 30 / 20 / 14 / 10 / 8 / 6 / 4 / 3 / 3 / 2 |
| Diamond | $2,500 | 3,000 | 10 | 30 / 20 / 14 / 10 / 8 / 6 / 4 / 3 / 3 / 2 |
| Master | $5,000 | Terminal | 10 | 30 / 20 / 14 / 10 / 8 / 6 / 4 / 3 / 2.5 / 2.5 |

The selected Master split is $1,500 / $1,000 / $700 / $500 / $400 / $300 / $200 / $150 / $125 / $125. Compared with two or five winners, ten provides more competitive targets on the single global board while retaining a meaningful first prize. These are initial engagement settings, not an economic forecast; the app has no retention or funded-prize data to calibrate them yet.

## Rules

- One crown per full dollar of a trusted winning game's payout after fees, including returned stake. Remaining cents accumulate across wins within the period. Losses, ties, refunds, legacy untrusted attempts, and league bonuses give no crowns.
- A crown threshold is a cumulative weekly total, not an incremental cost. Promotion preserves the total and can skip multiple tiers after a sufficiently large win. No old-tier prize is awarded. Master cannot advance further.
- Each tier has one global ranking, sorted by whole crowns descending, time that total was reached ascending, then stable player ID for identical timestamps. Fractional cents do not break ties.
- Prize winners and weekly advancers are the same set. Master winners receive rewards and stay Master. At least one crown is required for a prize.
- If fewer players qualify than available prize positions, shares are normalized among those who qualify, allocating the entire pool. Rounding cents go to first place. No eligible players means no payout.
- The period closes Monday at 00:00 `America/New_York`, including daylight saving. This means a DST-change week may be 167 or 169 actual hours. All crowns and fractional cents reset, active non-winners retain tier, and zero-crown players lose one tier with a Bronze floor. Missed periods are processed in order.
- Wins belong to the period in which the server processes their settlement under the league lock. A game started before the boundary but settled after it earns crowns in the new period.
- Installation enrolls existing users at Bronze with zero crowns, without backfilling historical wins. A user-creation trigger enrolls future users.

## Storage and execution

`league_tiers` stores tier rules. `league_config` stores duration (default seven calendar days) and timezone. `league_periods` snapshots tier settings so an administrative edit cannot alter an active pool or crown threshold. `league_players` is the current board; `league_crown_ledger` references unique immutable game earnings. `league_standings` archives final ranks. `league_events` persists unseen promotions and observed position improvements; `league_observations` remembers each player's last observed rank. `league_payouts` holds pending and credited rewards.

All tables use RLS without public policies. All callable identities come from verified Firebase Auth. Clients cannot set crowns, tier, payout amount, or another player's event state.

The earning trigger and `rollover_leagues()` serialize on one transaction advisory lock. Period closure freezes standings, creates unique payout records, promotes/demotes, and resets crowns atomically. It never acquires wallet locks. The separate payout worker locks each payout and wallet and atomically writes `wallet_entries.kind='league_payout'`, updates balance, and marks paid. A crash rolls all three back; overlapping workers cannot double-credit. The initial implementation serializes league mutations globally for correctness; unusually high settlement volume should be profiled before expanding usage.

Firebase exports:

- `getMyLeague`: current rules, top 20 plus own row, own events and last 50 payouts. No leaderboard pagination beyond rank 20.
- `acknowledgeLeagueEvent`: acknowledges one owned event, idempotently.
- `settleLeagues`: runs every minute, catches missed boundaries, and delivers up to 100 pending payouts per invocation. Rewards begin delivery after closure; an unusually large backlog continues in subsequent invocations.

The app refreshes while foregrounded every 15 seconds, on foreground entry, on tab changes and after gameplay. Announcements remain queued until acknowledged and are hidden during gameplay, startup recovery, result summaries and the add-money dialog. The Leagues tab includes the pinned own rank, tier guide, prize split and payout history.

Firebase's [schedule API](https://firebase.google.com/docs/reference/functions/firebase-functions.schedule) supports IANA timezones. Retry safety is handled in database transactions, following Firebase's [idempotent retry guidance](https://firebase.google.com/docs/functions/retries).

## Deployment and verification

```sh
cd Database_SkillGaming
node --env-file=.env Scripts/deploy-leagues.js --apply
firebase deploy --only functions:getMyLeague,functions:acknowledgeLeagueEvent,functions:settleLeagues --project skillgaming-b93ea --non-interactive
node --test test/leagues.integration.test.js
```

The migration helper records its SHA-256 checksum in `app_schema_migrations` and refuses silently modified or untracked migrations. Integration tests **reset a disposable local `skillgaming_test` schema only**. Default test connection: localhost port 55433; `TEST_DATABASE_URL` may override it with another local `skillgaming_test` URL. Tests never point to production.

For a different duration, an administrator can update `league_config.duration` (minimum one minute). It takes effect when the current period closes; it does not truncate the active period. Tier-rule edits likewise take effect on the next period. Shortened duration is intended for isolated testing, not for unexpectedly changing an announced live week.
