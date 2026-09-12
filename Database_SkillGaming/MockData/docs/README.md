# Weekly league reward analysis

<!-- scenario-quick-reference:start -->
**Before reading:** these are simulated USD amounts; the app currently uses demo credits. A **pool** is shared among a league’s prize winners. **Profit** always belongs to the platform: fees minus modeled costs and rewards. **Available cash** is money left after protecting existing obligations and reserves.

**Low-cash decision:** offer $10,000.00 for one retention week, assuming $10,000.00 of new company cash is received first. If earnings after costs halve, that week loses $3,148.25, but current-plus-next-week profit remains $2,179.25. [See the worked example](REWARD_ANALYSIS.md#why-the-low-cash-pool-can-be-larger).

**Cumulative profit:** in a scenario, add its current week and next forecast week. In the weekly report, add the weeks in order. Start at zero in both examples. Do not add different scenarios together or count new company cash as profit.

<details>
<summary>Quick reference: what each case name means</summary>

- **Normal week (`baseline`):** the usual assumed players, games and stakes; our comparison point.
- **Low available cash (`low_liquidity`):** normal gameplay, less starting cash, plus new company funding for the larger one-week reward offer.
- **Higher wagers (`high_wager`):** stakes rise and players make about 10% more attempts; more fees support larger normal-policy pools.
- **Master players go quiet (`master_quiet`):** all but one original Master player stop; fees fall, but existing prizes are still owed.
- **More games, smaller stakes (`more_games_low_stakes`):** attempts rise about 50%, but lower stakes reduce fees and each attempt still costs money.
- **Technical problems (`outage`):** fewer attempts and more unfinished runs; rewards use a more cautious earnings forecast.
- **Four large flagged accounts (`whale_surge`):** wagering is concentrated; fees involving these deliberately flagged mock accounts are set aside. Large wagers alone do not prove abuse.
- **Cash shortfall (`reserve_deficit`):** existing obligations and reserves exceed available cash; new pools are blocked.
- **Earlier examples (`prior_2`, `prior_1`):** fabricated weeks at roughly 90% and 95% of normal attempts, used to smooth the forecast; they are not observed history.
- **Nobody plays (`platform_quiet`):** used only in the weekly report; no fees or earned prizes, but operating costs continue.

The eight-week report follows the ordinary policy. It does not include the new low-cash retention campaign or its company funding.

</details>
<!-- scenario-quick-reference:end -->

## Where to start

This folder asks: **how much should each league offer next week, and what would that leave the platform?** All money and players are synthetic. The app itself uses demo dollars. No production records or real financing are represented.

1. **[Reward analysis](REWARD_ANALYSIS.md)** — start here for charts, the main findings and the proposed next pools.
2. **[Game flow and data plan](FLOW_AND_DATA_PLAN.md)** — how matches become crowns and prizes, and what to measure to improve decisions.
3. **[Scenario results](SCENARIO_RESULTS.md)** — detailed numbers for each alternative case and all eight leagues.
4. **[Weekly profit](WEEKLY_PROFIT.md)** — a separate eight-week simulation showing losses and cumulative profit over time.

The graphs are saved in [figures/](figures/) as PNGs and SVGs. They display directly in the documents; no installation is needed to read them.

**Two comparisons, two purposes.** Scenario cases ask “What if this happened next week?” Each has its own current-plus-next cumulative profit. The weekly report follows eight consecutive weeks under the ordinary policy. It excludes the separately funded low-liquidity campaign. Do not sum scenario rows or treat either profit measure as cash available to spend.

## Folder layout

```text
MockData/
├── docs/             # The five guides and reports
│   └── figures/      # Generated charts: PNG and SVG
├── scripts/          # Generate data, calculate results, build reports/charts
├── tests/            # Model and backend-arithmetic checks
└── data/
    ├── input/        # Synthetic scenarios, players and events
    └── output/       # Calculated player, scenario and weekly results
```

## Reproduce the results

From the repository root, use Python 3.9 or later. The calculations use only Python's standard library; tests also use Node for comparison with backend arithmetic. No database, Firebase credentials or deployment is needed.

```sh
python3 Database_SkillGaming/MockData/scripts/generate_mock_data.py
python3 Database_SkillGaming/MockData/scripts/analyze_rewards.py
python3 Database_SkillGaming/MockData/scripts/analyze_weekly_profit.py
python3 -m unittest discover -s Database_SkillGaming/MockData/tests -p 'test_*.py' -v
```

These commands regenerate inputs, calculated outputs and the two numerical reports. They also refresh the marked case-reference block at the top of all five documents. The remaining narratives are maintained manually and should be reviewed when assumptions change. The seed is `20260912`, with deterministic gzip metadata.

**Optional: regenerate the charts** after recalculating the results. Their Matplotlib dependency is isolated from the standard-library analysis:

```sh
python3 -m venv /tmp/skillgaming-charts
/tmp/skillgaming-charts/bin/python -m pip install -r Database_SkillGaming/MockData/scripts/requirements-charts.txt
/tmp/skillgaming-charts/bin/python Database_SkillGaming/MockData/scripts/plot_analysis.py
```

## What is in the datasets?

**Columns:** **File** links to the dataset. **One record means** explains its level of detail. **Use it for** describes the question it answers.

| File | One record means | Use it for |
| --- | --- | --- |
| [scenarios.json](../data/input/scenarios.json) | One case configuration | Find assumptions for activity, stakes, costs, cash and campaign funding |
| [players.jsonl](../data/input/players.jsonl) | One player in one case | Inspect opening league, planned activity and synthetic player characteristics |
| [events.jsonl.gz](../data/input/events.jsonl.gz) | One paired settlement or unmatched refund | Rebuild attempts, stakes, game credits and fees |
| [player_weeks.jsonl](../data/output/player_weeks.jsonl) | One player's calculated week in one case | Inspect crowns, league movement, awards and projected eligibility |
| [scenario_results.json](../data/output/scenario_results.json) | One case analysis | Find proposed pools, funding, profit and campaign stress results |
| [weekly_profit.json](../data/output/weekly_profit.json) | One chronological week, with nested player states | Follow announced pools, earned awards, cash and cumulative profit |

**Clarifications:**

- There are **384 fictional identities**, repeated across ten cases: 3,840 player records. Two cases are calibration examples. These are not ten observed weeks or independent player samples.
- There are **62,912 event records**. A paired event contains two player attempts; an unmatched refund contains one. The eight-week output separately contains 3,072 player states.
- JSONL means one JSON object per line; `.gz` means gzip compression. `*_cents` values are integer dollar cents: `10000` means $100. Tier numbers `0`–`7` mean Bronze through Master. Player IDs are fictional.
- Proposed scenario profit charges the full next pool. Chronological realized profit charges prizes actually earned. A pool with no qualifiers produces no earned award.

<details>
<summary><strong>Field reference for readers inspecting the JSON</strong></summary>

**Keys and times.** Player rows use `(case, player_id)`; events use `(case, event_id)`. Event times are seconds from the hypothetical week beginning 2026-09-07 at 00:00 New York. All generated entries resolve before closure. This is a complete fabricated week, not observed activity.

**Events.** `kind` is `win`, `tie`, `double_forfeit` or `unmatched`. `players` contains the participating attempt IDs, player IDs, times, status and score. `stake_cents` is one entry's stake; `pool_cents` is combined stakes for paired events and the returned stake for an unmatched refund. `credit_cents` follows participant order. Count `fee_cents` once per event. `suspect` is an explicit fixture flag, not a real detection result.

**Player weeks.** `fees_cents` attributes half the match fee to each participant. `clean_fees_cents` excludes flagged contest fees. `earned_cents` contains winning credits used for crowns; `credits_cents` also includes refunds. `payout_cents` is the current league prize. `forecast_min_crowns` and `forecast_prize_eligible` concern the projected next closing league, without changing current awards.

**Funding.** In each scenario's `proposal`, `pre_funding_headroom_cents` is cash left after obligations and buffers, before new company funding. `equity_funding_cents` adds unrestricted cash; `headroom_cents` is after funding but before reserving next pools. Subtract `total_pools_cents` to find the remaining free cash. `standard_policy_pools_cents` is an eight-tier array showing the ordinary comparison without new funding.

**Campaign and profit.** `retention_campaign` records the one-week target, funding assumption, contribution stress, loss allowance and funded/blocked decision. `retention_sensitivity` varies contribution after costs; its ratios are not player-retention rates. `two_week_cumulative_profit_cents` adds the current and next scenario profits. In the weekly output, `cumulative_platform_profit_cents` instead sums realized weekly profit from week one. Company equity, player deposits and withdrawals are excluded from both measures.

**Rules and provenance.** Increasing pools use weights `1/2/3/4/6/8/11/15`, multiplied by one common whole-dollar unit. Proposed prize gates are `1/5/15/40/100/200/400/800` crowns. Treasury snapshots and costs are assumptions, not reconstructed real balances. The two prior cases reuse identities and random streams to demonstrate smoothing. None of these inputs establishes actual retention or a causal reward effect.

</details>
