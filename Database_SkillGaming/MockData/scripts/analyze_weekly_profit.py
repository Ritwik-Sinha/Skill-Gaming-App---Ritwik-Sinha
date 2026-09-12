#!/usr/bin/env python3
"""Run a deterministic, funded hypothetical eight-week treasury stress path.

Reuses generated settlement templates while carrying player tiers, contribution
history, wallet liabilities, deferred fees and cash forward. Does not touch the
database or modify the original independent scenario datasets. Python stdlib.
"""

import copy
import gzip
import hashlib
import json
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

from analyze_rewards import (MIN_CROWNS, NAMES, POOLS, contribution,
                             money, propose, replay)
from scenario_reference import render_quick_reference

ROOT = Path(__file__).resolve().parents[1]
INPUT_DIR = ROOT / 'data' / 'input'
OUTPUT_DIR = ROOT / 'data' / 'output'
DOCS_DIR = ROOT / 'docs'
PATH_CASES = ["baseline", "high_wager", "master_quiet", "more_games_low_stakes",
              "outage", "whale_surge", "platform_quiet", "baseline"]
START = date(2026, 9, 7)
OPENING = dict(cash_cents=6000000, wallet_cents=3000000,
               deferred_fees_cents=0, withdrawals_payable_cents=200000,
               unsettled_entries_cents=100000, operating_buffer_cents=500000,
               risk_buffer_cents=200000)
REGULAR_DEPOSITS = 2000000
REGULAR_WITHDRAWALS = 500000


def free_headroom(stocks):
    return stocks['cash_cents'] - sum(stocks[k] for k in (
        'wallet_cents', 'deferred_fees_cents', 'withdrawals_payable_cents',
        'unsettled_entries_cents', 'operating_buffer_cents', 'risk_buffer_cents'))


def load_inputs():
    config = json.loads((INPUT_DIR / 'scenarios.json').read_text())
    configs = {x['case']: x for x in config['scenarios']}
    rosters = defaultdict(list)
    for line in (INPUT_DIR / 'players.jsonl').read_text().splitlines():
        row = json.loads(line)
        rosters[row['case']].append(row)
    events = defaultdict(list)
    with gzip.open(INPUT_DIR / 'events.jsonl.gz', 'rt') as stream:
        for line in stream:
            row = json.loads(line)
            events[row['case']].append(row)
    return config, configs, rosters, events


def weekly_config(case, configs):
    cfg = copy.deepcopy(configs['baseline' if case == 'platform_quiet' else case])
    cfg['case'] = case
    cfg['deposits_cents'] = 0 if case == 'platform_quiet' else REGULAR_DEPOSITS
    if case == 'platform_quiet':
        cfg['fraud_loss_cents'] = 0
        cfg['forecast_quality_multiplier'] = 0.0
        cfg['description'] = 'No attempts, no deposits and no withdrawals; $1,000 fixed operating cost remains.'
    return cfg


def next_decision(completed, completed_cfg, history, opening, previous_announced):
    """Use completed information and opening treasury only; no future outcomes."""
    signal = dict(completed, total=dict(completed['total'], current_payout_cents=0))
    cfg = dict(completed_cfg,
               settled_cash_cents=opening['cash_cents'],
               wallet_liability_cents=opening['wallet_cents'],
               withdrawals_outside_wallet_cents=opening['withdrawals_payable_cents'],
               unsettled_entry_liability_cents=opening['unsettled_entries_cents'],
               future_opex_buffer_cents=opening['operating_buffer_cents'],
               risk_reserve_cents=opening['risk_buffer_cents'] + opening['deferred_fees_cents'])
    # This path is the ordinary-policy comparison. Never inherit a one-off
    # scenario campaign or add its equity again from a completed signal.
    cfg.pop('retention_campaign', None)
    # A zero prior pool is a restart, not a permanent zero-growth trap. Normal
    # income, cash and qualification limits still apply to the restart.
    policy = propose(signal, cfg, history[-2], history[-3],
                     baseline_ceiling=previous_announced or None)
    assert policy['headroom_cents'] == free_headroom(opening)
    assert policy['total_pools_cents'] <= max(0, free_headroom(opening))
    return dict(policy, signal_case=completed['case'],
                signal_contribution_history_cents=history[-3:],
                restart_after_zero_pool=previous_announced == 0,
                signal_uses_current_week_outcomes=False,
                risk_reserve_base_cents=opening['risk_buffer_cents'],
                deferred_fee_reserve_cents=opening['deferred_fees_cents'])


def run_path():
    config, configs, rosters, events = load_inputs()
    history = []
    for case in ['prior_2', 'prior_1']:
        calibration, _ = replay(case, rosters[case], events[case])
        history.append(contribution(calibration['total'], weekly_config(case, configs))['net_contribution_cents'])
    initial_history = history[:]
    opening_tiers = {p['player_id']: p['opening_tier'] for p in rosters['baseline']}
    stocks = dict(OPENING)
    weeks = []
    completed = completed_cfg = None
    previous_announced = sum(POOLS)
    for index, case in enumerate(PATH_CASES):
        week_number = index + 1
        opening = dict(stocks)
        if index == 0:
            pools = list(POOLS)
            minimums = [1] * 8
            decision = dict(source='Existing configured commitments retained for week one',
                            pools_cents=pools, total_pools_cents=sum(pools),
                            headroom_cents=free_headroom(opening), publishable=True,
                            signal_uses_current_week_outcomes=False,
                            restart_after_zero_pool=False)
        else:
            decision = next_decision(completed, completed_cfg, history, opening, previous_announced)
            pools = decision['pools_cents']
            minimums = list(MIN_CROWNS)
        cfg = weekly_config(case, configs)
        roster_template = rosters['baseline' if case == 'platform_quiet' else case]
        roster = [dict(p, opening_tier=opening_tiers[p['player_id']],
                       opening_tier_name=NAMES[opening_tiers[p['player_id']]]) for p in roster_template]
        raw_events = [] if case == 'platform_quiet' else events[case]
        actual, players = replay('week_{:02d}_{}'.format(week_number, case), roster, raw_events,
                                 pools=pools, min_crowns=minimums)
        economics = contribution(actual['total'], cfg)
        costs = sum(economics[k] for k in ['processing_cost_cents', 'variable_cost_cents',
                                          'fixed_cost_cents', 'fraud_loss_cents'])
        deposits = cfg['deposits_cents']
        withdrawals = 0 if case == 'platform_quiet' else REGULAR_WITHDRAWALS
        gross_fees = actual['total']['fees_cents']
        deferred_fees = actual['total']['suspect_fees_cents']
        awards = actual['total']['current_payout_cents']
        announced = sum(pools)
        profit = economics['net_contribution_cents'] - awards
        stocks = dict(opening,
                      cash_cents=opening['cash_cents'] + deposits - withdrawals - costs,
                      wallet_cents=opening['wallet_cents'] + deposits - withdrawals - gross_fees + awards,
                      deferred_fees_cents=opening['deferred_fees_cents'] + deferred_fees)
        opening_equity = opening['cash_cents'] - opening['wallet_cents'] - opening['deferred_fees_cents']
        closing_equity = stocks['cash_cents'] - stocks['wallet_cents'] - stocks['deferred_fees_cents']
        assert closing_equity - opening_equity == profit
        assert free_headroom(stocks) - free_headroom(opening) == profit
        assert min(stocks.values()) >= 0
        assert announced <= max(0, free_headroom(opening))
        assert 0 <= awards <= announced
        assert actual['total']['credits_cents'] + gross_fees == actual['total']['handle_cents']
        if announced and index > 0:
            assert all(a < b for a, b in zip(pools, pools[1:]))
            assert all(a < b for a, b in zip(minimums, minimums[1:]))
        player_states = [{k: p[k] for k in (
            'player_id', 'opening_tier', 'closing_tier', 'next_opening_tier',
            'crowns', 'entries', 'handle_cents', 'fees_cents', 'payout_cents')}
            for p in players]
        record = dict(week=week_number, week_start_local=(START + timedelta(weeks=index)).isoformat(),
                      behavior_template=case, description=cfg['description'],
                      input=dict(deposits_cents=deposits, withdrawals_cents=withdrawals,
                                 processing_rate=cfg['processing_rate'],
                                 cost_per_entry_cents=cfg['cost_per_entry_cents'],
                                 fixed_week_cost_cents=cfg['fixed_week_cost_cents'],
                                 fraud_loss_cents=cfg['fraud_loss_cents'],
                                 forecast_quality_multiplier=cfg['forecast_quality_multiplier']),
                      opening=opening, announcement=decision, min_crowns=minimums,
                      opening_free_headroom_cents=free_headroom(opening),
                      headroom_after_announcement_cents=free_headroom(opening)-announced,
                      total=actual['total'], economics=economics,
                      actual_awards_cents=awards, unearned_pool_release_cents=announced-awards,
                      cash_costs_cents=costs, deferred_fees_added_cents=deferred_fees,
                      platform_profit_cents=profit,
                      cumulative_platform_profit_cents=sum(w['platform_profit_cents'] for w in weeks)+profit,
                      closing=stocks, closing_free_headroom_cents=free_headroom(stocks),
                      closing_leagues=actual['current_leagues'],
                      forecast_leagues=actual['forecast_leagues'], player_states=player_states)
        weeks.append(record)
        history.append(economics['net_contribution_cents'])
        completed, completed_cfg = actual, cfg
        previous_announced = announced
        opening_tiers = {p['player_id']: p['next_opening_tier'] for p in players}
    week_nine = next_decision(completed, completed_cfg, history, stocks, previous_announced)
    quiet = weeks[6]
    assert quiet['platform_profit_cents'] == -100000
    assert quiet['actual_awards_cents'] == 0
    assert weeks[7]['announcement']['total_pools_cents'] == 0
    for previous, current in zip(weeks, weeks[1:]):
        assert previous['closing'] == current['opening']
        expected = {p['player_id']: p['next_opening_tier'] for p in previous['player_states']}
        assert all(p['opening_tier'] == expected[p['player_id']] for p in current['player_states'])
    return dict(schema_version=1, synthetic=True, seed=config['seed'], currency='USD',
                timezone=config['timezone'], path=PATH_CASES,
                inputs_sha256={name: hashlib.sha256((INPUT_DIR/name).read_bytes()).hexdigest()
                               for name in ['scenarios.json', 'players.jsonl', 'events.jsonl.gz']},
                opening_stocks=OPENING, calibration_contribution_cents=initial_history,
                notes=[
                    'Fully synthetic funded-product stress projection; current application uses demo wallets.',
                    'Scenario settlement templates are reused, but actual player opening tiers, promotions, rewards, weekly movement, contribution history and treasury stocks roll forward chronologically.',
                    'Activity, outcomes and suspect flags are imposed template inputs; they do not respond causally to rewards, eligibility, prior losses, or changing tiers.',
                    'Dates label eight hypothetical ordinary 168-hour weeks; the entire path is simulated, including dates after the analysis date.',
                    'Match fees release wallet liabilities; they are not added to settled cash a second time. Cleared deposits and paid wallet withdrawals change cash and wallet equally.',
                    'Conservative modeled operating profit excludes deferred suspect-contest fees and modeled costs; it is before omitted taxes, financing and any unmodeled obligations.',
                    'Deferred suspect fees remain a separate protected liability throughout the path. The proposal adapter combines them with the base risk reserve solely for its treasury calculation.',
                    'Announced unearned pools are cash earmarks. Actual awards incur expense and move into wallet liabilities; unused commitments expire. No external prize cash-out is charged again.',
                    'The external withdrawal and unsettled-entry stocks and the operating/risk buffers stay constant; generated games fully settle within each week.',
                    'Regular-week cleared deposits are $20,000, paid wallet withdrawals $5,000, and processing cost $500. The fully quiet week has none of these flows and $1,000 fixed operating cost.',
                    'Week one retains existing $8,376 pools and one-crown eligibility; later weeks use the proposed increasing ladder and minimum crowns only when new funding is available.',
                    'A zero funding decision is an offline publication block requiring a supported pause workflow; the existing backend cannot simply publish all-zero pools.',
                    'The 25% growth ceiling is waived only when restarting from a zero prior pool; ordinary affordability and qualifier limits still apply.',
                ], weeks=weeks, next_week_recommendation=dict(week=9,
                    week_start_local=(START+timedelta(weeks=8)).isoformat(),
                    min_crowns=list(MIN_CROWNS), proposal=week_nine),
                checks=dict(weeks=len(weeks), player_states=sum(len(w['player_states']) for w in weeks),
                            cash_liability_profit_conservation=True, chronological_tier_continuity=True,
                            prior_information_only_for_announcements=True, existing_week_one_commitments_preserved=True,
                            negative_profit_stress_week=True, unfunded_publications_blocked=True))


def table(headers, rows):
    return '\n'.join(['| '+' | '.join(headers)+' |',
                      '| '+' | '.join(['---'] + ['---:']*(len(headers)-1))+' |'] +
                     ['| '+' | '.join(str(x) for x in row)+' |' for row in rows])


def render(data):
    weeks = data['weeks']
    next_week = data['next_week_recommendation']['proposal']
    negative = [w for w in weeks if w['platform_profit_cents'] < 0]
    cumulative = weeks[-1]['cumulative_platform_profit_cents']
    lines = [
        '# How platform profit changes over eight weeks', '', render_quick_reference(), '',
        f'This simulated sequence earns **{money(cumulative)} cumulative platform profit**, including '
        f'**{len(negative)} loss-making week**. Cash, player tiers and past results carry from one week into the next. '
        'Unlike the independent scenarios, these rows can be added together.', '',
        '**Scope:** fictional USD data and dates, including future weeks. This path uses the ordinary reward policy. '
        'The separately funded $10,000 low-liquidity campaign is only in '
        '[SCENARIO_RESULTS.md](SCENARIO_RESULTS.md). Its company funding and two-week profit are not added here.', '',
        '## See the weekly results', '',
        '![Weekly platform profit and its cumulative total through eight simulated weeks](figures/weekly_profit.png)', '',
        '*Read weekly profit for each week’s gain or loss, and cumulative profit for the running total. '
        'The fully quiet week loses $1,000 even with no earned rewards, so the running total briefly falls.*', '',
        '**Columns:** **Week / start** gives the simulated week number and Monday date. **Template** names its imposed activity pattern. '
        '**Announced pools** is the total reward offer fixed before play. **Actual awards** is the amount earned. '
        '**Platform profit** is fees less withheld suspect fees, costs and earned awards. **Cumulative profit** sums Platform profit from week one.', '',
        table(['Week / start', 'Template', 'Announced pools', 'Actual awards', 'Platform profit', 'Cumulative profit'],
              [[f"{w['week']} / {w['week_start_local']}", w['behavior_template'],
                money(w['announcement']['total_pools_cents']), money(w['actual_awards_cents']),
                money(w['platform_profit_cents']), money(w['cumulative_platform_profit_cents'])] for w in weeks]), '',
        '**Clarifications:**', '',
        '- Each pool is shared among league winners, not paid to every player. If nobody qualifies, the unused reservation expires; it is not new income.',
        '- Profit belongs to the platform and excludes deposits, withdrawals and company capital. Omitted taxes and financing costs are also outside this model.',
        '- Activity is imposed, not predicted from reward size. The recovery row does not demonstrate that players return after a reward pause.', '',
        '## Why the unusual weeks look this way', '',
        '- **Week 1 keeps existing promises:** the $8,376 configured pools and old one-crown eligibility remain in force. Later funded weeks use rising pools and rising minimum crowns.',
        '- **Week 7 is completely quiet:** no attempts means no fees or qualifying awards, but $1,000 fixed cost remains. The unused $900 pool reservation is released.',
        '- **Week 8 has no new reward offer:** that decision used the completed quiet week, before recovery was known. The imposed recovery generates profit that can support week nine. A live reward pause needs backend support.', '',
        'New pools use completed results and opening available cash; they never use the coming week’s outcomes. '
        'The ordinary policy buffers contribution by 20%, assigns 25% of the buffered amount to rewards, and applies quality, '
        'growth and qualifier limits. These are adjustable policy assumptions, not an optimized engagement formula.', '',
        '## The next decision: a $1,000 funded restart', '',
        f'For simulated week nine ({data["next_week_recommendation"]["week_start_local"]}), available cash after protection is '
        f'**{money(next_week["headroom_cents"])}**. The contribution rule allows a '
        f'**{money(next_week["budget_cents"])}** budget, but just '
        f'**{weeks[-1]["forecast_leagues"][7]["eligible"]} forecast Master qualifiers** limit the entire rising ladder to '
        f'**{money(next_week["total_pools_cents"])}**, leaving {money(next_week["retained_budget_cents"])} unallocated. '
        'This small offer is driven by the qualifier policy and recent results, not a shortage of cash. '
        'A separately funded recovery campaign could be evaluated as another policy choice.', '',
        '**Columns:** **League** is the projected final tier. **Minimum crowns** is its fresh weekly prize-eligibility threshold. '
        '**Next pool** is its total USD reward budget. **Forecast qualifiers** counts players expected to meet the threshold. '
        '**Platform profit** is the tier’s projected fees available to use, minus allocated costs and its full pool.', '',
        table(['League', 'Minimum crowns', 'Next pool', 'Forecast qualifiers', 'Platform profit'],
              [[NAMES[i], MIN_CROWNS[i], money(next_week['pools_cents'][i]),
                weeks[-1]['forecast_leagues'][i]['eligible'],
                money(next_week['league_profit'][i]['weekly_profit_cents'])] for i in range(8)]), '',
        '**Clarifications:**', '',
        '- Crowns reset weekly and come from winning credits, including returned stake. Minimum crowns are not deposits or promotion thresholds; qualifying does not guarantee a prize.',
        '- Per-league profit is allocated platform profit, not player profit. This forecast repeats recovery-week activity and charges every proposed pool in full.',
        '- This recommendation follows eight weeks of changing membership and contribution; it is different from the independent baseline’s $2,600 offer. Restarting after zero resets only the growth limit.', '',
        '<details>', '<summary>Check the weekly profit arithmetic</summary>', '',
        '**Columns:** **Week** matches the sequence above. **Gross fees** is settled match-fee revenue. **Withheld fees** '
        'is suspect-contest revenue kept unavailable. **Costs** combines processing, attempts, fixed operations and fraud losses. '
        '**Awards** is earned prize expense. **Profit** equals Gross fees minus the next three columns.', '',
        table(['Week', 'Gross fees', 'Withheld fees', 'Costs', 'Awards', 'Profit'],
              [[w['week'], money(w['total']['fees_cents']), money(w['deferred_fees_added_cents']),
                money(w['cash_costs_cents']), money(w['actual_awards_cents']),
                money(w['platform_profit_cents'])] for w in weeks]), '',
        '**Clarifications:**', '',
        '- Regular weeks assume $20,000 deposits and $5,000 withdrawals, with $500 processing cost. The quiet week has none of these cash flows.',
        '- The independent scenario model uses different deposit assumptions and $125 processing cost. Identical activity labels need not produce identical profit across the two reports.', '',
        '</details>', '',
        '<details>', '<summary>Check cash and player obligations</summary>', '',
        'The path starts with $60,000 cash, $30,000 owed in wallets, $3,000 other player obligations and $7,000 operating/risk buffers. '
        'That leaves $20,000 before reserving the first pool.', '',
        '**Columns:** **Week** matches the sequence. **Cash** is closing settled cash. **Wallet owed** is the closing amount '
        'owed to players. **Withheld stock** is accumulated protected suspect-fee money. **Free cash** subtracts Wallet owed, '
        'Withheld stock, the unchanged $3,000 other obligations and $7,000 buffers from Cash, before reserving the following pool.', '',
        table(['Week', 'Cash', 'Wallet owed', 'Withheld stock', 'Free cash'],
              [[w['week'], money(w['closing']['cash_cents']), money(w['closing']['wallet_cents']),
                money(w['closing']['deferred_fees_cents']), money(w['closing_free_headroom_cents'])] for w in weeks]), '',
        '**Clarifications:**', '',
        '- Deposits increase cash and the wallet amount equally; withdrawals decrease both. Neither creates profit. Pending processor funds are excluded.',
        '- Fees reduce wallet obligations; they are not added to cash again. Awards increase wallet obligations, and later withdrawal is not a second prize expense.',
        '- Because other protected stocks stay fixed, the weekly increase in Free cash exactly equals platform profit. Unused prize reservations are released without being counted as revenue.', '',
        '`closing cash = opening cash + deposits − withdrawals − costs`', '',
        '`closing wallet = opening wallet + deposits − withdrawals − gross fees + awards`', '',
        '</details>', '',
        'Full weekly ladders, decisions and player states are in [weekly_profit.json](../data/output/weekly_profit.json). '
        'Generation commands are in [README.md](README.md). The script checks cash/profit reconciliation, tier continuity and funded commitments; '
        'those checks validate the arithmetic, not the assumed player response.', '',
        '**Recommendation:** reserve the $1,000 ordinary-policy restart before announcing it. If stronger rewards are needed for recovery, '
        'compare a separately funded one-week campaign with an explicit loss budget, cumulative-profit horizon and measured player response. '
        'Preserve all earned awards and review the next unannounced offer after the results are known.',
    ]
    return '\n'.join(lines)+'\n'


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    data = run_path()
    (OUTPUT_DIR / 'weekly_profit.json').write_text(json.dumps(data, indent=2)+'\n')
    (DOCS_DIR / 'WEEKLY_PROFIT.md').write_text(render(data))
    print(json.dumps(dict(weeks=len(data['weeks']),
                          cumulative_platform_profit_cents=data['weeks'][-1]['cumulative_platform_profit_cents'],
                          next_week_pools_cents=data['next_week_recommendation']['proposal']['pools_cents'],
                          checks=data['checks'])))


if __name__ == '__main__':
    main()
