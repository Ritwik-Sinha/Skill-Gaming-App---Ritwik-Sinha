# Product and engineering decisions

This document explains the implemented choices, answers the league feature-thoughts prompts, and separates current limitations from future work. The app targets **Android**, uses **demo USD credits**, and does not yet verify that a score came from honest gameplay.

## 1. Architecture and gameplay decisions

### One Unity instance, with Addressables for each game

**Decision:** retain one Unity runtime inside the React Native app and use **Addressables to load and unload individual game scenes**. The current Android integration uses one shared Unity player; adding games should reuse that player.

The current lifecycle is:

1. Keep the loading scene and Unity runtime available.
2. Load Jungle Swing additively through `Addressables.LoadSceneAsync` for the server-authorized session.
3. After play, unload the game scene through `Addressables.UnloadSceneAsync` and release the operation handle. React Native waits for the saved result and scene-unload acknowledgement before showing results.
4. Pause the retained Unity player when its view is removed, then resume and reuse it for the next game.

This releases game-scene objects and their Addressables references without restarting the engine. Unused game assets can then be reclaimed as their bundle references are released. The engine, loading scene, shared assets, and caches may remain; scene unloading does not promise that all Unity memory returns to Android immediately.

**Expansion:** package each additional game as its own Addressable scene and assets, register it in the game list, and load only the selected game. This supports a growing catalog without keeping every game in memory or creating another Unity instance. The current [SceneLoader](Unity_SkillGaming/Assets/Project/Scripts/JungleSwing/Addressables/SceneLoader.cs) still has a fixed Jungle Swing address; selecting arbitrary registered games is future work.

### Presentation and scoring

**Decision:** portrait gameplay, a chameleon's tongue as the latch, procedural swings, and floating jump-pad logs. Portrait fits the mobile navigation and one-finger controls; the tongue makes attachment visible.

Score is the greatest forward position reached, multiplied by two and rounded. Backtracking cannot farm distance. The snake's base speed increases with score up to a cap, and it can close an excessive gap behind the player. Procedural generation supports continued play without a finite authored course. See the [game manager](Unity_SkillGaming/Assets/Project/Scripts/JungleSwing/Managers/GameManager.cs) and [player controller](Unity_SkillGaming/Assets/Project/Scripts/JungleSwing/Player/PlayerController.cs).

### Matching, settlement, and interruptions

**Decision:** match the oldest pending entry from another account with the same game and stake. Equal stakes keep contests financially symmetric; avoiding league/rating filters preserves liquidity. A player may finish before finding an opponent, or match while still playing; settlement waits for both attempts.

Entries are whole-dollar amounts from $1 to $20. The decisive winner receives 90% of combined stakes: two $10 entries pay $18 and generate a $2 platform fee. Ties and double forfeits refund both stakes without fees. A completed run beats a forfeit, including with a score of zero. The current +20/−20 rating is a win/loss measure, not opponent-adjusted Elo.

One entry receives one server launch authorization. Persisted request IDs and recovery prevent duplicate debits after lost responses. Backgrounding forfeits; Back is blocked during play. Checkpoints approximately every 15 seconds renew a 120-second server lease. These choices prioritize financial consistency over forgiving interruptions.

**Known gap:** an unmatched entry is refunded 15 minutes after placement, even during a healthy run. Matched runs can continue with renewed leases, but this cutoff means not every entry satisfies the brief's unbounded-play requirement. Active-run lifetime and post-run matching expiry should be separate. The [backend lifecycle](Database_SkillGaming/GAME_LIFECYCLE.md) describes the current rule; the older mobile note saying there is no queue expiry is stale.

### Crowns and the league week

**Decision:** a crown represents a dollar of the winner's game credit after fees, including returned stake. A $10-versus-$10 win credits $18 and earns 18 crowns. Fractional dollars accumulate within the week; losses, draws, refunds, and league bonuses themselves earn none. Bonus credits can later fund another entry.

This resolves “dollars won” using one auditable ledger value. It also makes crowns a measure of winning volume rather than pure skill: larger stakes accelerate advancement.

Reset occurs Monday at midnight in `America/New_York`, including daylight saving. Wins count in the week when the server processes settlement. Active-period settings are snapshotted so changes cannot rewrite announced terms.

## 2. League feature decisions

### Send weekly rewards automatically

**Decision implemented:** credit the demo wallet automatically. Players should not lose access to earned rewards because they miss a claim button. Acknowledging an advancement notification is separate from receiving money.

The [scheduler](Database_SkillGaming/Scripts/FirebaseFunctions/League/index.js) runs **every minute**. Weekly closure freezes standings, queues rewards in **`league_payouts`**, advances winners, demotes zero-crown players, and resets crowns. Unpaid rows form a persistent PostgreSQL queue.

The [worker](Database_SkillGaming/Scripts/FirebaseFunctions/League/service.js) processes up to **100 payouts per invocation**. Each transaction locks the payout and wallet and commits the ledger entry, balance change, and paid marker together. Crashes roll back; retries and overlapping workers cannot double-credit. Backlogs continue in later invocations, so delivery is not guaranteed for everyone at exactly midnight.

### Increase instant-advancement thresholds by tier

**Decision implemented:** make the first promotion reachable, then require progressively more cumulative crowns. This gives an early milestone and longer-term goals; the values are initial tuning choices.

**Weekly pool** is the tier's demo prize budget. **Instant threshold** is the cumulative crown total needed to leave that tier, not an additional cost. **Winners** is the maximum number sharing its weekly pool.

| Tier | Weekly pool | Instant threshold | Winners |
| --- | ---: | ---: | ---: |
| Bronze | $1 | 10 | 2 |
| Silver | $25 | 50 | 3 |
| Gold | $50 | 150 | 5 |
| Platinum | $100 | 350 | 5 |
| Sapphire | $300 | 750 | 10 |
| Ruby | $400 | 1,500 | 10 |
| Diamond | $2,500 | 3,000 | 10 |
| Master | $5,000 | Terminal | 10 |

- Promotion at 10 crowns preserves those crowns; leaving Silver requires **50 total**. A large win may cross several thresholds.
- Instant advancement forfeits the old tier's pool. Weekly prize winners advance one tier; Master winners remain Master.
- Prize eligibility currently requires **one crown in every tier**, distinct from instant thresholds and the higher gates proposed in the mock analysis.
- Zero-crown players drop one tier, with a Bronze floor. Other non-winners retain tier; weekly crowns reset.

### Share the Master pool among ten winners

**Decision implemented:** expand from two Bronze winners to ten upper-tier winners. Ten Master winners create more reachable targets on the global top-20 board than two or five winners, while preserving a substantial first prize.

**Place** is final rank, **share** is its percentage of the $5,000 pool, and **reward** is the demo credit when all ten positions qualify.

| Place | Share | Reward |
| --- | ---: | ---: |
| 1 | 30% | $1,500 |
| 2 | 20% | $1,000 |
| 3 | 14% | $700 |
| 4 | 10% | $500 |
| 5 | 8% | $400 |
| 6 | 6% | $300 |
| 7 | 4% | $200 |
| 8 | 3% | $150 |
| 9 | 2.5% | $125 |
| 10 | 2.5% | $125 |

- Equal crowns favor the player who reached that total first, then stable player ID for identical timestamps. Fractional remainders do not break ties.
- Fewer qualifiers share the whole pool through normalized weights; one eligible Master receives $5,000. No qualifiers means no payout. Rounding cents go to first place.
- Each tier has one global board showing its top 20 plus the viewer's position. Prize winners **are** the weekly advancers.

Normalization honors the published pool, but creates a windfall in a nearly empty league. The one-crown gate excludes zero-crown players. Configuration and rules live in the [league migration](Database_SkillGaming/supabase/migrations/20260910050000_weekly_leagues.sql); [LEAGUES.md](Database_SkillGaming/LEAGUES.md) lists every tier's split.

## 3. Reward economics

**Decision:** keep the brief's **$8,376 combined pools** in the product and test changing budgets in the [Mock Data analysis](Database_SkillGaming/MockData/docs/README.md).

The datasets and scripts model low liquidity, high wagers, a quiet Master league, low-stake volume, outages, concentrated flagged activity, and reserve deficits. They consider players, attempts, stakes, fees, refunds, costs, obligations, concentration, and prize qualifiers, with charts and cumulative platform-profit results.

The normal mock policy recommends **$2,600** in future rewards. The retention example offers **$10,000 for one low-liquidity week**, conditional on **$10,000 of company funding**, and accepts losses under weaker earnings. Funding supplies cash; it is not profit or permission to spend money owed to players.

These are offline proposals, including higher prize-crown gates and increasing tier pools. They do not change live settings. Synthetic data tests arithmetic and assumptions, not whether rewards actually improve retention. See the [worked recommendation](Database_SkillGaming/MockData/docs/REWARD_ANALYSIS.md).

## 4. Score-trust threat model

Assume an attacker controls their device, APK, Unity process, bridge, local storage, input, clock, and requests under a valid Firebase account. They may own several accounts. The backend and database credentials are trusted infrastructure. Google login establishes identity, not honest play.

Each row describes an **attack**, the **existing defence**, and its **limit**.

| Attack | Existing defence | Limit |
| --- | --- | --- |
| Edit score or position in memory | Safe integer score, between 0 and 1,000,000,000 | Fabricated values inside the range can still win |
| Replay an entry or replace a completed score | Request IDs, no repeated launch authorization, immutable terminal scores | A live attempt can hide several local retries; a new attempt can reuse an old numeric score |
| Modify the APK to remove hazards or submit directly | Authentication and attempt ownership | An owner can invent a score without running Unity |
| Script perfect latch timing | One active attempt per account | Plausible bots and multiple accounts are not detected |
| Slow gameplay to gain reaction time | Lease expiry uses database time | Heartbeats can keep the attempt alive; honest simulation speed is not verified |
| Submit for another player's bet | Verified Firebase UID and ownership checks | Stolen session credentials can impersonate that account |
| Race completion and wallet requests | Transactions, locks, unique ledger keys | Accounting can be consistent even when the first score was forged |
| Collude across accounts to farm wins and crowns | Matching requires different account IDs | Different accounts can belong to one person |

### Real server-side defence already implemented

**Authenticated, single-use authorization and immutable completion** protect the score lifecycle:

1. `placeBet` binds an entry to its owner and debits once. Duplicate requests return the receipt with `canStart: false`.
2. `checkpointGame` and `finishGame` check ownership and serialize updates. Only playing attempts can accept completion.
3. Database triggers prevent terminal-score and entry-identity changes; settlement uniqueness prevents another payout.
4. An expired database-time lease forfeits the attempt and ignores a new late score.

A completed score of 93 therefore stays 93 when the same attempt is resubmitted as 9,999. However, an attacker can submit 9,999 as the **first** completion, or replay several local runs before finishing one live attempt. Maximum-checkpoint retention also preserves an inflated accepted score.

These controls catch ownership violations, terminal replay, late revival, and duplicate payouts. They do not verify gameplay, bots, or plausible fabricated scores. There is no implemented score-rate check or server replay.

## 5. Scope cut and remaining gaps

- **Payments:** top-ups and withdrawals only change demo credits. Payment collection and external payouts were deferred to keep testing independent of financial transfers.
- **Score verification:** authoritative replay, attestation, bot detection, and collusion analysis remain unfinished; accounting integrity alone does not satisfy honest-score verification.
- **Unbounded play:** the unmatched 15-minute cutoff remains a requirement gap.
- **Catalog expansion:** Android and Jungle Swing are the current delivery focus. Other games, gem play, remote downloads, and a server-driven Play list remain future work.
- **Operations:** automatic budget changes, payout dashboards, and high-volume queue optimization were deferred. Current league mutations serialize globally for correctness.

## 6. Future implementation

### Remote Addressables and a server-driven Play section

**Plan:** host versioned Android Addressables catalogs and game bundles on a remote server/CDN, then download compatible game content on demand. Reuse the existing Unity instance and unload each game's scene after use.

The React Native **game catalog** and Unity **Addressables catalog** have different jobs:

- The backend returns the available games and their details: game ID, title, description, artwork, enabled status, supported app version, approved content version, and scene address. The Play section renders the returned list and game count, replacing fixed cards and routes.
- Unity resolves the selected game's address through its content catalog and downloads the required scene and dependencies. Show download progress, retry failures, cache downloaded bundles, and load only the selected game.
- Download and check compatibility before reserving a paid attempt, so download time does not consume its lease. Keep backend game eligibility, stake rules, and score validation aligned with the published game version.
- Publish bundles and the versioned content catalog first, then enable the game listing. Keep a previous working version available for rollback. Releasing in-memory content and evicting downloaded disk caches are separate operations.

This makes it possible to grow the Play catalog and deliver compatible game content without another Unity instance. **Addressables distribute assets, not newly compiled C# or native plugins**: games using code already included in the app can arrive as content; new gameplay code still requires an app build.

Today, the loader, React Native routes, and backend allowlist support Jungle Swing only, and Addressables content is local. Remote hosting, generic game selection, and catalog fetching are proposed, not implemented.

### Another week: priority order

1. Separate active-run lifetime from matching expiry. Collect legitimate score traces and profile repeated Addressables load/unload cycles for crashes, retained memory.
2. Implementation of addresssables remote load of the game and play catalog list update based on available games to play updated on the server.
3. Game side checks/implementation for bot play/cheat detection system. If inputs are manipulated for gameplay.
4. Test Android attestation, abuse limits, payout recovery, and weekly boundaries. App Check from firebase can be integrated for device verification and authenticity.

## 7. AI usage

AI helped inspect the repository, explain cross-project flows, iterate mock data and reward analysis, and draft documentation. 

AI was used extensively inside the project while scripting, this helped reduced a massive amount of time for code validation and implementation of many features across all three projects - Database, React Native and Unity.