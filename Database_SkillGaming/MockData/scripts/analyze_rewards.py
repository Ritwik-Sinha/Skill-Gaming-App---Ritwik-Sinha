#!/usr/bin/env python3
"""Replay the synthetic ledger and propose next-week pools. Python 3.9+, stdlib.

All amounts are integer USD cents. This is an offline policy model, not a
production payout job. Run generate_mock_data.py before this script.
"""
import gzip
import json
import math
from collections import defaultdict
from pathlib import Path
from scenario_reference import refresh_manual_references, render_quick_reference

ROOT = Path(__file__).resolve().parents[1]
INPUT_DIR = ROOT / 'data' / 'input'
OUTPUT_DIR = ROOT / 'data' / 'output'
DOCS_DIR = ROOT / 'docs'
NAMES = ["Bronze", "Silver", "Gold", "Platinum", "Sapphire", "Ruby", "Diamond", "Master"]
POOLS = [100, 2500, 5000, 10000, 30000, 40000, 250000, 500000]
THRESHOLDS = [10, 50, 150, 350, 750, 1500, 3000, None]
# Proposed prize eligibility; existing backend still requires one crown per tier.
MIN_CROWNS = [1, 5, 15, 40, 100, 200, 400, 800]
LADDER_WEIGHTS = [1, 2, 3, 4, 6, 8, 11, 15]
SHARES = [[70, 30], [50, 30, 20], [40, 25, 15, 12, 8], [40, 25, 15, 12, 8],
          *[[30, 20, 14, 10, 8, 6, 4, 3, 3, 2] for _ in range(3)],
          [3000, 2000, 1400, 1000, 800, 600, 400, 300, 250, 250]]


def prize_amounts(pool, shares, eligible):
    weights = shares[:eligible]
    if not weights:
        return []
    amounts = [pool * w // sum(weights) for w in weights]
    amounts[0] += pool - sum(amounts)
    return amounts


def promote(tier, earned_cents):
    while tier < 7 and earned_cents // 100 >= THRESHOLDS[tier]:
        tier += 1
    return tier


def new_metrics():
    return dict(players=0, active=0, entries=0, handle_cents=0, fees_cents=0,
                clean_fees_cents=0,
                matched_entries=0, unmatched_entries=0, forfeit_entries=0,
                eligible=0, payout_cents=0)


def replay(case, roster, events, pools=None, min_crowns=None):
    pools = POOLS if pools is None else pools
    min_crowns = [1] * 8 if min_crowns is None else min_crowns
    players = {}
    for p in roster:
        players[p['player_id']] = dict(
            case=case, player_id=p['player_id'], opening_tier=p['opening_tier'],
            closing_tier=p['opening_tier'], suspect=p['suspect'], earned_cents=0,
            reached_second=0, entries=0, handle_cents=0, fees_cents=0,
            clean_fees_cents=0, credits_cents=0, matched_entries=0,
            unmatched_entries=0, forfeit_entries=0, wins=0, payout_cents=0,
        )
    seen = set()
    total = dict(matches=0, decisive_matches=0, tie_matches=0, double_forfeit_matches=0,
                 events=0, suspect_fees_cents=0, refunds_cents=0, cross_tier_matches=0)
    last_second = -1
    for e in events:
        assert e['event_id'] not in seen, 'Duplicate event'
        seen.add(e['event_id'])
        assert e['settled_second'] >= last_second, 'Unordered settlement ledger'
        last_second = e['settled_second']
        members = e['players']
        n = len(members)
        assert n == (1 if e['kind'] == 'unmatched' else 2)
        assert len({p['player_id'] for p in members}) == n
        assert 100 <= e['stake_cents'] <= 2000 and e['stake_cents'] % 100 == 0
        assert e['pool_cents'] == n * e['stake_cents']
        assert sum(e['credit_cents']) + e['fee_cents'] == e['pool_cents']
        assert e['suspect'] == any(players[m['player_id']]['suspect'] for m in members)
        assert e['fee_cents'] == ((e['pool_cents'] + 5) // 10 if e['kind'] == 'win' else 0)
        assert e['winner_id'] is None if e['kind'] != 'win' else e['winner_id'] in {m['player_id'] for m in members}
        total['events'] += 1
        if n == 2:
            total['matches'] += 1
            total['decisive_matches' if e['kind'] == 'win' else e['kind'] + '_matches'] += 1
            total['cross_tier_matches'] += len({players[m['player_id']]['closing_tier'] for m in members}) > 1
            assert abs(members[0]['created_second'] - members[1]['created_second']) < 900
        if e['suspect']:
            total['suspect_fees_cents'] += e['fee_cents']
        if e['kind'] != 'win':
            total['refunds_cents'] += sum(e['credit_cents'])
        for i, m in enumerate(members):
            p = players[m['player_id']]
            p['entries'] += 1
            p['handle_cents'] += e['stake_cents']
            p['credits_cents'] += e['credit_cents'][i]
            p['fees_cents'] += e['fee_cents'] // n
            p['clean_fees_cents'] += 0 if e['suspect'] else e['fee_cents'] // n
            p['matched_entries' if n == 2 else 'unmatched_entries'] += 1
            p['forfeit_entries'] += m['play_status'] == 'forfeited'
            if m['player_id'] == e['winner_id']:
                assert m['play_status'] == 'completed'
                old_crowns = p['earned_cents'] // 100
                p['earned_cents'] += e['credit_cents'][i]
                p['wins'] += 1
                if p['earned_cents'] // 100 > old_crowns:
                    p['reached_second'] = e['settled_second']
                p['closing_tier'] = promote(p['closing_tier'], p['earned_cents'])
    current = []
    for tier in range(8):
        board = sorted((p for p in players.values() if p['closing_tier'] == tier),
                       key=lambda p: (-(p['earned_cents'] // 100), p['reached_second'], p['player_id']))
        eligible = [p for p in board if p['earned_cents'] // 100 >= min_crowns[tier]]
        prizes = prize_amounts(pools[tier], SHARES[tier], len(eligible)) if pools[tier] > 0 else []
        for p, prize in zip(eligible, prizes):
            p['payout_cents'] = prize
        current.append(dict(tier=tier, league=NAMES[tier], eligible=len(eligible),
                            winners=len(prizes), pool_cents=pools[tier], min_crowns=min_crowns[tier],
                            actual_payout_cents=sum(prizes), first_prize_cents=prizes[0] if prizes else 0))
    origin = [new_metrics() for _ in range(8)]
    forecast = [new_metrics() for _ in range(8)]
    transitions = [[0] * 8 for _ in range(8)]
    for p in players.values():
        p['crowns'] = p['earned_cents'] // 100
        p['next_opening_tier'] = (min(7, p['closing_tier'] + 1) if p['payout_cents'] else
                                  max(0, p['closing_tier'] - 1) if p['crowns'] == 0 else p['closing_tier'])
        # Transparent one-week persistence forecast: repeat activity/wins after
        # crown reset, from the ACTUAL post-rollover tier. No claim of elasticity.
        p['forecast_closing_tier'] = promote(p['next_opening_tier'], p['earned_cents'])
        p['forecast_min_crowns'] = MIN_CROWNS[p['forecast_closing_tier']]
        p['forecast_prize_eligible'] = p['crowns'] >= p['forecast_min_crowns']
        transitions[p['opening_tier']][p['closing_tier']] += 1
        for metrics, tier in [(origin, p['opening_tier']), (forecast, p['forecast_closing_tier'])]:
            m = metrics[tier]
            m['players'] += 1
            m['active'] += p['entries'] > 0
            m['eligible'] += p['forecast_prize_eligible'] if metrics is forecast else p['crowns'] >= min_crowns[p['closing_tier']]
            for key in ['entries', 'handle_cents', 'fees_cents', 'clean_fees_cents', 'matched_entries',
                        'unmatched_entries', 'forfeit_entries', 'payout_cents']:
                m[key] += p[key]
    for key in ['entries', 'handle_cents', 'fees_cents', 'matched_entries', 'unmatched_entries', 'forfeit_entries']:
        total[key] = sum(p[key] for p in players.values())
    total['active'] = sum(p['entries'] > 0 for p in players.values())
    total['credits_cents'] = sum(p['credits_cents'] for p in players.values())
    total['current_payout_cents'] = sum(p['payout_cents'] for p in players.values())
    total['top_1pct_handle_share'] = sum(sorted((p['handle_cents'] for p in players.values()), reverse=True)
                                           [:max(1, math.ceil(len(players) * .01))]) / max(1, total['handle_cents'])
    assert total['credits_cents'] + total['fees_cents'] == total['handle_cents']
    assert total['entries'] == total['matched_entries'] + total['unmatched_entries']
    assert total['matched_entries'] == 2 * total['matches']
    assert sum(x['fees_cents'] for x in origin) == total['fees_cents']
    return dict(case=case, total=total, current_leagues=current, origin_leagues=origin,
                forecast_leagues=forecast, transition_matrix=transitions), list(players.values())


def contribution(total, cfg):
    processing = round(cfg['deposits_cents'] * cfg['processing_rate'])
    variable = cfg['cost_per_entry_cents'] * total['entries']
    net = total['fees_cents'] - total['suspect_fees_cents'] - processing - variable - cfg['fixed_week_cost_cents'] - cfg['fraud_loss_cents']
    return dict(clean_fees_cents=total['fees_cents'] - total['suspect_fees_cents'],
                processing_cost_cents=processing, variable_cost_cents=variable,
                fixed_cost_cents=cfg['fixed_week_cost_cents'], fraud_loss_cents=cfg['fraud_loss_cents'],
                net_contribution_cents=net)


def allocate(budget, forecast):
    """Scale one strictly increasing ladder; retain all unused dollars.

    A whole-dollar unit costs $50 across tiers. This avoids rounding reversals
    in pools AND full-field first prizes. Cap each tier at $100 times forecast
    qualifiers (zero treated as one potential late qualifier). A scarce tier
    reduces the WHOLE ladder instead of reversing the tier order.
    """
    unit_dollars = max(0, budget // 100 // sum(LADDER_WEIGHTS))
    for weight, metrics in zip(LADDER_WEIGHTS, forecast):
        unit_dollars = min(unit_dollars, 100 * max(1, metrics['eligible']) // weight)
    return [unit_dollars * weight * 100 for weight in LADDER_WEIGHTS]


def split_cents(total, weights):
    """Allocate shared costs exactly; entry-weighted, equal split if no entries."""
    weights = weights if sum(weights) else [1] * len(weights)
    denominator = sum(weights)
    amounts = [total * w // denominator for w in weights]
    order = sorted(range(len(weights)), key=lambda i: (-(total * weights[i] % denominator), i))
    for i in order[:total - sum(amounts)]:
        amounts[i] += 1
    return amounts


def propose(result, cfg, previous_1, previous_2, baseline_ceiling=None, reward_rate=.25):
    economics = contribution(result['total'], cfg)
    net = economics['net_contribution_cents']
    blended = .5 * net + .3 * previous_1 + .2 * previous_2
    conservative = max(0, min(net, blended)) * .8
    quality = cfg.get('forecast_quality_multiplier', 1.)
    economic_ceiling = math.floor(conservative * reward_rate * quality)
    treasury_keys = ['wallet_liability_cents', 'withdrawals_outside_wallet_cents',
                     'unsettled_entry_liability_cents', 'future_opex_buffer_cents', 'risk_reserve_cents']
    committed = result['total']['current_payout_cents']
    pre_funding_headroom = cfg['settled_cash_cents'] - sum(cfg[k] for k in treasury_keys) - committed
    growth_ceiling = math.floor(baseline_ceiling * 1.25) if baseline_ceiling is not None else economic_ceiling
    budget = max(0, min(economic_ceiling, pre_funding_headroom, growth_ceiling)) // 100 * 100
    pools = allocate(budget, result['forecast_leagues'])
    standard_pools = list(pools)
    campaign = cfg.get('retention_campaign')
    equity = 0
    headroom = pre_funding_headroom
    retention = None
    sensitivity = []
    reasons = []
    if campaign:
        # This is an explicit one-week policy exception, not extra game revenue.
        # Independent branches start cumulative profit at zero before this week.
        assert campaign['duration_weeks'] == 1
        assert 0 <= campaign['stress_contribution_ratio'] <= 1
        assert campaign['equity_funding_cents'] >= 0
        assert campaign['max_weekly_loss_cents'] >= 0
        target = campaign['target_pool_cents']
        assert target > 0 and target % (100 * sum(LADDER_WEIGHTS)) == 0
        equity = campaign['equity_funding_cents']
        headroom += equity
        stress_net = min(net, math.floor(net * campaign['stress_contribution_ratio']))
        loss_budget = min(campaign['max_weekly_loss_cents'], max(0, net - committed))
        loss_ceiling = max(0, stress_net + loss_budget)
        budget = max(0, min(target, headroom, loss_ceiling)) // 100 * 100
        pools = allocate(budget, result['forecast_leagues'])
        funded = sum(pools) == target
        if not funded:
            # Do not quietly replace the advertised retention target with a tiny
            # pool. No offer is published until its full funding can be reserved.
            budget, pools = 0, [0] * 8
            reasons.append('Retention target blocked by cash, loss budget or qualifier cap')
        else:
            reasons.append('One-week retention exception replaces ordinary reward and growth ceilings')
        retention = dict(campaign, stress_contribution_cents=stress_net,
                         effective_loss_budget_cents=loss_budget,
                         loss_limited_ceiling_cents=loss_ceiling,
                         status='funded' if funded else 'blocked')
        for ratio in [1., .8, .6, .5, .4]:
            # After-cost contribution sensitivities: no claims about changes in
            # games, wagers or qualifiers, and no cancellation of earned prizes.
            stressed = min(net, math.floor(net * ratio))
            profit = stressed - target
            sensitivity.append(dict(ratio=ratio, net_contribution_cents=stressed,
                                    pool_cents=target, weekly_profit_cents=profit,
                                    cumulative_profit_cents=net - committed + profit,
                                    within_loss_budget=profit >= -loss_budget))
    shared_costs = economics['processing_cost_cents'] + economics['fixed_cost_cents'] + economics['fraud_loss_cents']
    shared_by_tier = split_cents(shared_costs, [m['entries'] for m in result['forecast_leagues']])
    league_profit = []
    for i, m in enumerate(result['forecast_leagues']):
        allocated_cost = shared_by_tier[i] + cfg['cost_per_entry_cents'] * m['entries']
        clean_fee = m.get('clean_fees_cents', m['fees_cents'])
        league_profit.append(dict(tier=i, min_crowns=MIN_CROWNS[i], clean_fees_cents=clean_fee,
                                 allocated_cost_cents=allocated_cost,
                                 contribution_cents=clean_fee - allocated_cost,
                                 pool_cents=pools[i], weekly_profit_cents=clean_fee - allocated_cost - pools[i]))
    if headroom < 0:
        reasons.append('Existing liabilities/reserves exceed settled cash')
    if not campaign and headroom <= economic_ceiling:
        reasons.append('Cash headroom binds')
    if not campaign and growth_ceiling < min(economic_ceiling, max(0, headroom)):
        reasons.append('25% growth ceiling binds')
    if quality < 1:
        reasons.append('Quality haircut applied')
    if sum(pools) < budget:
        reasons.append('Ladder units or qualification cap leave budget in reserve')
    if sum(pools) == 0:
        reasons.append('BLOCK publication: zero-budget mode requires backend support or new funding')
    return dict(**economics, blended_contribution_cents=round(blended),
                conservative_contribution_cents=round(conservative), quality_multiplier=quality,
                economic_ceiling_cents=economic_ceiling, growth_ceiling_cents=growth_ceiling,
                treasury=({k: cfg[k] for k in treasury_keys + ['settled_cash_cents', 'pending_processor_cash_cents']}),
                current_committed_rewards_cents=committed, headroom_cents=headroom,
                pre_funding_headroom_cents=pre_funding_headroom,
                equity_funding_cents=equity, funded_cash_cents=cfg['settled_cash_cents'] + equity,
                standard_policy_pools_cents=standard_pools,
                retention_campaign=retention, retention_sensitivity=sensitivity,
                budget_cents=budget, pools_cents=pools, total_pools_cents=sum(pools),
                retained_budget_cents=budget - sum(pools), reasons=reasons,
                current_week_profit_cents=net - committed,
                next_week_profit_cents=net - sum(pools),
                conservative_next_week_profit_cents=min(net, math.floor(conservative * quality)) - sum(pools),
                league_profit=league_profit,
                publishable=sum(pools) > 0)


def money(cents):
    return ('-' if cents < 0 else '') + '${:,.2f}'.format(abs(cents) / 100)


TABLE_EXPLANATIONS = {
    ('Case', 'Before rewards', 'Current profit', 'Next pools', 'Next profit', 'Cumulative profit'): (
        '**Case** is the alternative week. **Before rewards** is match-fee revenue after modeled costs and suspect-fee withholding. '
        '**Current profit** subtracts existing awards from that amount. **Next pools** is the total proposed reward budget for all eight leagues. '
        '**Next profit** subtracts Next pools from repeated Before rewards. **Cumulative profit** adds Current profit and Next profit.',
        ['All amounts are USD and all profit belongs to the platform. These are separate two-week branches; never add rows together.',
         'Next profit assumes the same activity and costs repeat. Company funding is excluded from profit. A zero pool means new publication is blocked; existing awards remain owed.']),
    ('Contribution retained', 'Before rewards', 'Next pools', 'Next profit', 'Cumulative profit', 'Within loss budget'): (
        '**Contribution retained** is the assumed percentage of current after-cost contribution available next week. '
        '**Before rewards** is that stressed amount. **Next pools** is the full campaign cost. **Next profit** subtracts that cost. '
        '**Cumulative profit** adds the current week’s profit. **Within loss budget** compares the next loss with the campaign’s allowed loss.',
        ['Rows are alternative sensitivities, not consecutive weeks, retention rates or probabilities. The full $10,000 pool is charged in every row.',
         'The company’s $10,000 funding injection is excluded from profit. A budget breach means review the next unannounced offer, not cancel earned awards.']),
    ('League', 'Min crowns', 'Next qualifiers', 'Next pool', 'First prize', 'Platform profit'): (
        '**League** is the projected closing tier. **Min crowns** is its proposed weekly prize-eligibility threshold. '
        '**Next qualifiers** counts players forecast to meet it. **Next pool** is the whole league’s shared USD prize budget. '
        '**First prize** is the forecast payout to first place. **Platform profit** is next-week fees available to use minus allocated costs and the full pool.',
        ['These prize minimums are not deposits and do not replace the existing crown thresholds for promotion. Qualification does not guarantee a paid rank. Forecasts repeat activity after weekly league movement.',
         'A sparse field shares the full pool among fewer winners, so First prize need not increase across tiers. Negative league profit represents a platform subsidy; zero pools mean publication is blocked.']),
    ('Opening league', 'Active', 'Attempts/player', 'Avg stake', 'Attempts change', 'Wager change'): (
        '**Opening league** groups players by their tier at the week’s start. **Active** counts players who made a paid attempt. '
        '**Attempts/player** divides paid attempts by Active. **Avg stake** is dollars wagered per attempt. '
        '**Attempts change** and **Wager change** compare total attempts and total stakes with that same cohort in baseline.',
        ['An attempt can end in a refund or forfeit; two matched attempts make one contest. Changes are percentages, not percentage points.',
         'These starting cohorts measure behavior; players can later compete for a different league’s prize. Wagered stakes are turnover, not platform revenue.']),
    ('Case', 'Matched attempts', 'Forfeited attempts', 'Top 1% wagers', 'Fees withheld'): (
        '**Case** is the scenario. **Matched attempts** and **Forfeited attempts** are shares of all paid attempts. '
        '**Top 1% wagers** is the share of total stakes from the four largest-wagering roster accounts. '
        '**Fees withheld** is USD match-fee revenue deferred because a contest touches a flagged account.',
        ['Matching and forfeiting are different measures, not complementary percentages. A flagged contest’s full fee is withheld once.',
         'The roster has 384 accounts, so the top 1% rounds up to four. Flags are fabricated inputs; high wagering alone does not establish fraud.']),
    ('Reward rate', 'Policy ceiling', 'Allocated pools'): (
        '**Reward rate** is the reward share of conservative contribution. **Policy ceiling** is the resulting USD limit before other constraints. '
        '**Allocated pools** is the final combined league budget after rounding and caps.',
        ['Only the reward rate changes; player behavior remains fixed. This is not a forecast of player response or a confidence interval.',
         'The rate applies after the 20% forecast buffer, not to stakes. This baseline check omits the cross-scenario growth cap; complete ladder units cost $50.']),
    ('Case', 'Attempts', 'Total wagers', 'Fees', 'Before rewards'): (
        '**Case** identifies a fabricated prior week. **Attempts** counts paid entries. **Total wagers** sums their stakes in USD. '
        '**Fees** is gross settled match revenue. **Before rewards** subtracts modeled costs and withheld suspect fees.',
        ['prior_1 and prior_2 supply the smoothing formula. They share random inputs with baseline and are not observed history or independent samples.',
         'Wagers include refunded attempts and both sides of a contest. Before rewards excludes league prizes.']),
}


def table(headers, rows):
    """Keep short definitions and the important ambiguities beside each table."""
    columns, clarifications = TABLE_EXPLANATIONS[tuple(headers)]
    grid = '\n'.join(['| ' + ' | '.join(headers) + ' |', '| ' + ' | '.join(['---'] * len(headers)) + ' |']
                     + ['| ' + ' | '.join(map(str, row)) + ' |' for row in rows])
    return ('**Columns:** ' + columns + '\n\n' + grid + '\n\n**Clarifications:**\n\n'
            + '\n'.join('- ' + note for note in clarifications))


def render(results, sensitivity):
    cases = [r for r in results if not r['case'].startswith('prior_')]
    base = next(r for r in results if r['case'] == 'baseline')
    low = next(r for r in cases if r['case'] == 'low_liquidity')
    p = low['proposal']
    campaign = p['retention_campaign']
    takeaways = {
        'baseline': 'Normal activity supports a $2,600 total pool and $11,103.50 next profit. Use this as the ordinary-policy reference.',
        'low_liquidity': 'The same games generate the same contribution as baseline, but available cash is tight. The one-week campaign adds company funding so rewards can rise despite that cash shortage.',
        'high_wager': 'Larger stakes and more attempts generate more fees. The pool rises to $3,100; the buffered contribution rule retains part of the increase.',
        'master_quiet': 'One original Master player remains active. Lost high-tier activity cuts revenue; only one current Master qualifier still receives the entire existing $5,000 Master pool. The next field changes after promotion.',
        'more_games_low_stakes': 'Players make more attempts but stake less each time. Total fee revenue falls and per-attempt costs rise, so more games do not produce a larger reward budget.',
        'outage': 'Fewer attempts and disrupted play reduce contribution. An additional 50% quality adjustment makes the next pool conservative while service is unreliable.',
        'whale_surge': 'Four flagged accounts create concentrated activity. Their affected contest fees are withheld, and a 25% quality reduction limits reliance on the remaining contribution.',
        'reserve_deficit': 'Existing obligations and buffers exceed cash by $13,376. New rewards are blocked pending funding. The large projected profit assumes play continues without a new pool; it is not evidence that a pause works for players.',
    }
    out = [
        '# What happens to rewards in each scenario?', '', render_quick_reference(results), '',
        'These are **alternative versions of one week**, followed by a next-week forecast. They are not consecutive weeks. '
        'All amounts are synthetic USD; “profit” always means platform operating profit.', '',
        '## Compare the decisions', '',
        '![Total next-week pools and projected platform profit in each alternative scenario](figures/scenario_comparison.png)', '',
        '*Read each case as its own comparison: rewards are the total across eight leagues, and profit is what remains after costs and rewards. '
        'Low liquidity has the largest reward offer because it uses a separately funded retention campaign. These bars assume unchanged activity.*', '',
        '**The calculation:** `next profit = contribution before league rewards − next pools`. '
        '`cumulative profit = current profit + next profit`. Cumulative profit here covers two weeks and starts at zero for each case.', '',
        table(['Case', 'Before rewards', 'Current profit', 'Next pools', 'Next profit', 'Cumulative profit'],
              [[r['case'], money(r['proposal']['net_contribution_cents']), money(r['proposal']['current_week_profit_cents']),
                money(r['proposal']['total_pools_cents']), money(r['proposal']['next_week_profit_cents']),
                money(r['proposal']['two_week_cumulative_profit_cents'])] for r in cases]), '',
        '## Low liquidity: deliberately spend more to support engagement', '',
        f'The ordinary cash rule would permit only **{money(sum(p["standard_policy_pools_cents"]))}** of rewards. '
        f'The revised plan instead commits **{money(p["total_pools_cents"])} for one week**, funded by '
        f'**{money(p["equity_funding_cents"])} of new company money**. This funding must clear before announcement; it is not profit or a player deposit.', '',
        f'Cash starts at $48,500, with $48,376 protected for obligations and buffers. The injection raises cash to '
        f'{money(p["funded_cash_cents"])}. After protecting those amounts and reserving the campaign, '
        f'**{money(p["headroom_cents"] - p["total_pools_cents"])} remains free**. Accepting a loss does not by itself provide cash to pay prizes.', '',
        '![Next-week profit and two-week cumulative profit under weaker contribution](figures/retention_stress.png)', '',
        '*Move from higher to lower retained contribution to see the downside. At 50%, next week loses $3,148.25, '
        'but the two-week total remains $2,179.25 positive. This tests financial tolerance; it does not predict how many players will stay.*', '',
        table(['Contribution retained', 'Before rewards', 'Next pools', 'Next profit', 'Cumulative profit', 'Within loss budget'],
              [[f"{s['ratio']:.0%}", money(s['net_contribution_cents']), money(s['pool_cents']),
                money(s['weekly_profit_cents']), money(s['cumulative_profit_cents']),
                'Yes' if s['within_loss_budget'] else 'No'] for s in p['retention_sensitivity']]), '',
        f'The chosen loss allowance is **{money(campaign["effective_loss_budget_cents"])}** at the 50% contribution stress. '
        'Worse outcomes can exceed it. Run this as a one-week test, preserve promised prizes, and renew only after checking '
        'cash, cumulative results and measured player response. Larger rewards are an engagement hypothesis, not a proven improvement.', '',
        '## Why each case gets its result', '',
        'Each section below gives the reason first. Expand the table only when you need a league-level answer. '
        'Funded pools increase from Bronze to Master. Minimum crowns rise from 1 to 800; these are proposed '
        'weekly prize gates, separate from the current promotion rules.', '',
    ]
    for r in cases:
        p = r['proposal']
        out += [f"### {r['case']}", '', takeaways[r['case']], '',
                f'**Next pools {money(p["total_pools_cents"])} · next platform profit {money(p["next_week_profit_cents"])} '
                f'· two-week cumulative profit {money(p["two_week_cumulative_profit_cents"])}.**', '',
                '<details>', '<summary>League rewards, player activity and funding arithmetic</summary>', '',
                table(['League', 'Min crowns', 'Next qualifiers', 'Next pool', 'First prize', 'Platform profit'],
                      [[NAMES[i], MIN_CROWNS[i], r['forecast_leagues'][i]['eligible'], money(p['pools_cents'][i]),
                        money((prize_amounts(p['pools_cents'][i], SHARES[i], r['forecast_leagues'][i]['eligible']) or [0])[0]),
                        money(p['league_profit'][i]['weekly_profit_cents'])] for i in range(8)]), '',
                table(['Opening league', 'Active', 'Attempts/player', 'Avg stake', 'Attempts change', 'Wager change'],
                      [[NAMES[i], m['active'], f"{m['entries']/max(1,m['active']):.1f}",
                        money(round(m['handle_cents']/max(1,m['entries']))),
                        f"{100*(m['entries']/max(1,base['origin_leagues'][i]['entries'])-1):+.1f}%",
                        f"{100*(m['handle_cents']/max(1,base['origin_leagues'][i]['handle_cents'])-1):+.1f}%"]
                       for i, m in enumerate(r['origin_leagues'])]), '',
                '**Funding arithmetic:** '
                f'clean fees {money(p["clean_fees_cents"])} − processing {money(p["processing_cost_cents"])} '
                f'− attempt costs {money(p["variable_cost_cents"])} − fixed costs {money(p["fixed_cost_cents"])} '
                f'− fraud losses {money(p["fraud_loss_cents"])} = **{money(p["net_contribution_cents"])} before rewards**. '
                f'The ordinary contribution ceiling is {money(p["economic_ceiling_cents"])}; '
                f'cash available after protection and any explicit funding is {money(p["headroom_cents"])}. '
                f'The selected budget is {money(p["budget_cents"])}; {money(p["retained_budget_cents"])} of it remains unallocated.', '',
                'The campaign overrides ordinary reward and growth limits.' if p['retention_campaign'] else
                ('New publication is blocked until funding is resolved.' if not p['publishable'] else
                 'The lowest applicable cash, contribution, growth or qualifier limit constrains the offer. Whole ladder units cost $50, so small remainders stay in reserve.'), '',
                '</details>', '']
    out += ['## Optional checks and assumptions', '', '<details>',
            '<summary>Matching quality, concentrated wagering and policy sensitivity</summary>', '',
            table(['Case', 'Matched attempts', 'Forfeited attempts', 'Top 1% wagers', 'Fees withheld'],
                  [[r['case'], f"{100*r['total']['matched_entries']/max(1,r['total']['entries']):.1f}%",
                    f"{100*r['total']['forfeit_entries']/max(1,r['total']['entries']):.1f}%",
                    f"{100*r['total']['top_1pct_handle_share']:.1f}%", money(r['total']['suspect_fees_cents'])] for r in cases]), '',
            table(['Reward rate', 'Policy ceiling', 'Allocated pools'],
                  [[f"{int(s['reward_rate']*100)}%", money(s['economic_ceiling_cents']), money(s['total_pools_cents'])] for s in sensitivity]), '',
            table(['Case', 'Attempts', 'Total wagers', 'Fees', 'Before rewards'],
                  [[r['case'], f"{r['total']['entries']:,}", money(r['total']['handle_cents']), money(r['total']['fees_cents']),
                    money(r['proposal']['net_contribution_cents'])] for r in results if r['case'].startswith('prior_')]), '',
            '</details>', '',
            '**Next decision:** use the $2,600 baseline ladder for the ordinary reference case, or the separately funded '
            '$10,000 one-week campaign when testing the low-liquidity retention response. Keep higher tiers more rewarding, '
            'measure repeat play and contribution, and decide renewal from the resulting cash and cumulative profit.', '',
            'For consecutive weeks, read [WEEKLY_PROFIT.md](WEEKLY_PROFIT.md). Full counts, fee attribution, current awards '
            'and policy calculations remain in [scenario_results.json](../data/output/scenario_results.json). '
            'See [README.md](README.md) for generation commands and [FLOW_AND_DATA_PLAN.md](FLOW_AND_DATA_PLAN.md) for game rules and measurement.', '']
    return '\n'.join(out)


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    config = json.loads((INPUT_DIR / 'scenarios.json').read_text())
    configs = {x['case']: x for x in config['scenarios']}
    rosters = defaultdict(list)
    for line in (INPUT_DIR / 'players.jsonl').read_text().splitlines():
        row = json.loads(line); rosters[row['case']].append(row)
    events = defaultdict(list)
    with gzip.open(INPUT_DIR / 'events.jsonl.gz', 'rt') as f:
        for line in f:
            row = json.loads(line); events[row['case']].append(row)
    results = {}; player_rows = []
    for case, cfg in configs.items():
        results[case], rows = replay(case, rosters[case], events[case])
        results[case]['description'] = cfg['description']
        player_rows.extend(rows)
    prior1 = contribution(results['prior_1']['total'], configs['prior_1'])['net_contribution_cents']
    prior2 = contribution(results['prior_2']['total'], configs['prior_2'])['net_contribution_cents']
    baseline_proposal = propose(results['baseline'], configs['baseline'], prior1, prior2)
    for case, result in results.items():
        result['proposal'] = propose(result, configs[case], prior1, prior2,
                                     None if case == 'baseline' or case.startswith('prior_') else baseline_proposal['total_pools_cents'])
        p = result['proposal']
        p['two_week_cumulative_profit_cents'] = p['current_week_profit_cents'] + p['next_week_profit_cents']
        assert p['total_pools_cents'] <= max(0, p['headroom_cents'])
        if p['retention_campaign']:
            assert p['total_pools_cents'] <= p['retention_campaign']['loss_limited_ceiling_cents']
        else:
            assert p['total_pools_cents'] <= p['economic_ceiling_cents']
        if p['publishable']:
            assert all(x >= 100 for x in p['pools_cents'])
            assert all(a < b for a, b in zip(p['pools_cents'], p['pools_cents'][1:]))
            normal_first = [prize_amounts(pool, shares, len(shares))[0] for pool, shares in zip(p['pools_cents'], SHARES)]
            assert all(a < b for a, b in zip(normal_first, normal_first[1:]))
            assert all(min(prize_amounts(pool, shares, len(shares))) > 0 for pool, shares in zip(p['pools_cents'], SHARES))
        assert sum(t['weekly_profit_cents'] for t in p['league_profit']) == p['next_week_profit_cents']
    assert results['low_liquidity']['total'] == results['baseline']['total']
    assert results['reserve_deficit']['total'] == results['baseline']['total']
    assert results['master_quiet']['current_leagues'][7]['eligible'] == 1
    sensitivity = []
    for rate in [.10, .20, .25, .35]:
        p = propose(results['baseline'], configs['baseline'], prior1, prior2, reward_rate=rate)
        sensitivity.append(dict(reward_rate=rate, economic_ceiling_cents=p['economic_ceiling_cents'], total_pools_cents=p['total_pools_cents']))
    (OUTPUT_DIR / 'player_weeks.jsonl').write_text(''.join(json.dumps(p, sort_keys=True, separators=(',', ':')) + '\n' for p in player_rows))
    output = dict(seed=config['seed'], policy=dict(
        reward_rate=.25, forecast_buffer=.20, contribution_blend_weights=[.5, .3, .2],
        max_weekly_budget_growth=.25, ladder_weights=LADDER_WEIGHTS, min_prize_crowns=MIN_CROWNS,
        ladder_unit_cents=100, minimum_funded_ladder_cents=5000,
        maximum_allocated_share=.30, per_projected_qualifier_pool_cap_cents=10000,
        zero_qualifier_cap_basis='One potential late qualifier; full announced pool is reserved',
        currency='USD', monetary_basis='integer cents; complete $50 ladder units; unused capacity retained',
        profit_definition='Platform operating contribution minus full reserved pool; suspect fees deferred; before omitted tax/capital costs',
        shared_cost_allocation='By projected tier entry count using exact largest remainders',
        forecast='Repeat current player activity after rollover and crown reset',
        cumulative_profit_definition='Each independent branch starts at zero: current modeled profit plus next projected profit; never sum scenario rows or count equity funding',
        retention_exception='Only explicitly configured one-week campaigns replace normal reward/growth ceilings; require full target funding, ladder qualifier caps and a stress loss allowance capped by positive current modeled profit',
        historical_basis='Synthetic shared-roster calibration analogues; not a longitudinal backtest'),
        scenarios=list(results.values()), sensitivity=sensitivity)
    (OUTPUT_DIR / 'scenario_results.json').write_text(json.dumps(output, indent=2) + '\n')
    (DOCS_DIR / 'SCENARIO_RESULTS.md').write_text(render(list(results.values()), sensitivity))
    refresh_manual_references(list(results.values()))
    print(json.dumps(dict(player_weeks=len(player_rows), scenarios=len(results), baseline_pools=baseline_proposal['pools_cents'], baseline_total=baseline_proposal['total_pools_cents'])))


if __name__ == '__main__':
    main()
