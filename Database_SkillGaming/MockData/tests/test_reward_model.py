"""Offline checks for the mock ledger and proposed reward policy (Python 3.9+).

Run: python3 -m unittest discover -s Database_SkillGaming/MockData/tests -p 'test_*.py'
Node is used only to call the existing services' exported pure calculation
functions. No service is instantiated, database is opened, or network is used.
Generator reproducibility runs write exclusively into a temporary directory.
"""

import copy
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
INPUT_DIR = ROOT / 'data' / 'input'
OUTPUT_DIR = ROOT / 'data' / 'output'
SCRIPTS_DIR = ROOT / 'scripts'
DATABASE_ROOT = ROOT.parent
sys.path.insert(0, str(SCRIPTS_DIR))

import analyze_rewards as model
import analyze_weekly_profit as weekly


def roster(*specifications):
    return [dict(player_id=name, opening_tier=tier, suspect=False)
            for name, tier in specifications]


def win(event_id, winner, loser, stake=100, second=100):
    """Small, explicitly funded terminal fixture; dollar stakes have exact fees."""
    return dict(
        event_id=event_id, settled_second=second, stake_cents=stake,
        kind='win', pool_cents=stake * 2, fee_cents=stake // 5,
        credit_cents=[stake * 9 // 5, 0], winner_id=winner, suspect=False,
        players=[dict(player_id=winner, created_second=second - 20,
                      play_status='completed'),
                 dict(player_id=loser, created_second=second - 10,
                      play_status='completed')],
    )


def forecast(eligible=100):
    return [dict(model.new_metrics(), eligible=eligible, active=eligible,
                 entries=125, fees_cents=125000, clean_fees_cents=125000,
                 capped_clean_fees_cents=10000) for _ in range(8)]


def finance_fixture():
    result = dict(total=dict(fees_cents=1000000, suspect_fees_cents=0,
                             entries=1000, current_payout_cents=50000),
                  forecast_leagues=forecast())
    cfg = dict(deposits_cents=500000, processing_rate=0,
               cost_per_entry_cents=0, fixed_week_cost_cents=0,
               fraud_loss_cents=0, settled_cash_cents=1000000,
               wallet_liability_cents=200000, withdrawals_outside_wallet_cents=20000,
               unsettled_entry_liability_cents=10000, future_opex_buffer_cents=100000,
               risk_reserve_cents=50000, pending_processor_cash_cents=300000,
               forecast_quality_multiplier=1)
    return result, cfg


def retention_fixture():
    """A cash-funded $8,000 offer tolerating a $3,000 half-contribution loss."""
    result, cfg = finance_fixture()
    cfg['retention_campaign'] = dict(
        target_pool_cents=800000, equity_funding_cents=300000,
        max_weekly_loss_cents=350000, stress_contribution_ratio=.5,
        duration_weeks=1,
    )
    return result, cfg


class SourceParityTests(unittest.TestCase):
    def node_calculations(self, payload):
        self.assertIsNotNone(shutil.which('node'), 'Node is required for source parity checks')
        javascript = r"""
const fs = require('fs');
const { calculateSettlement } = require(process.argv[1]);
const { prizeAmounts } = require(process.argv[2]);
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const output = {
  prizes: (input.prizes || []).map(x => prizeAmounts(x.pool, x.shares, x.eligible)),
  matches: (input.matches || []).map(x => {
    const bets = x.players.map((p, i) => ({ id: String(i + 1),
      firebase_uid: p.player_id, amount_cents: x.stake_cents,
      score: p.score, play_status: p.play_status }));
    const decision = calculateSettlement(bets[0], bets[1]);
    return { kind: decision.kind, fee_cents: decision.fee, pool_cents: decision.pool,
      winner_id: decision.winnerBetId === null ? null
        : bets[Number(decision.winnerBetId) - 1].firebase_uid,
      credit_cents: decision.earnings.map(x => x.net) };
  })
};
process.stdout.write(JSON.stringify(output));
"""
        process = subprocess.run(
            ['node', '-e', javascript,
             str(DATABASE_ROOT / 'Scripts/FirebaseFunctions/Bet/service.js'),
             str(DATABASE_ROOT / 'Scripts/FirebaseFunctions/League/service.js')],
            input=json.dumps(payload), text=True, capture_output=True, check=True,
            timeout=30,
        )
        return json.loads(process.stdout)

    def test_prize_rounding_and_eligibility_match_exported_backend(self):
        fixtures = [dict(pool=pool, shares=shares, eligible=count)
                    for configured_pool, shares in zip(model.POOLS, model.SHARES)
                    for pool in [100, 101, 12345, configured_pool]
                    for count in range(len(shares) + 3)]
        actual = self.node_calculations(dict(prizes=fixtures))['prizes']
        for fixture, backend in zip(fixtures, actual):
            with self.subTest(fixture=fixture):
                local = model.prize_amounts(**fixture)
                self.assertEqual(local, backend)
                self.assertEqual(sum(local), fixture['pool'] if fixture['eligible'] else 0)
                self.assertTrue(all(amount > 0 for amount in local))

    def test_raw_mock_outcomes_match_exported_backend(self):
        # One event per observed stake/outcome/completion/winner-position cell.
        representatives = {}
        with gzip.open(INPUT_DIR / 'events.jsonl.gz', 'rt') as source:
            for line in source:
                event = json.loads(line)
                if event['kind'] == 'unmatched':
                    continue
                key = (event['stake_cents'], event['kind'],
                       tuple(p['play_status'] for p in event['players']),
                       tuple(p['player_id'] == event['winner_id'] for p in event['players']))
                representatives.setdefault(key, event)
        fixtures = list(representatives.values())
        self.assertEqual({x['kind'] for x in fixtures}, {'win', 'tie', 'double_forfeit'})
        self.assertGreater(len(fixtures), 30)
        actual = self.node_calculations(dict(matches=fixtures))['matches']
        for fixture, backend in zip(fixtures, actual):
            self.assertEqual(backend, {key: fixture[key] for key in backend})

    def test_tier_constants_match_actual_migration(self):
        source = (DATABASE_ROOT / 'supabase/migrations/20260910050000_weekly_leagues.sql').read_text()
        rows = re.findall(r"\((\d),'([^']+)',(\d+),(\d+|NULL),ARRAY\[([\d,]+)\]\)", source)
        self.assertEqual(len(rows), 8)
        for tier, name, pool, threshold, shares in rows:
            index = int(tier)
            self.assertEqual(model.NAMES[index], name)
            self.assertEqual(model.POOLS[index], int(pool))
            self.assertEqual(model.THRESHOLDS[index], None if threshold == 'NULL' else int(threshold))
            self.assertEqual(model.SHARES[index], [int(x) for x in shares.split(',')])
        self.assertRegex(source, r'pool_cents integer NOT NULL CHECK\s*\(pool_cents > 0\)')
        self.assertRegex(source, r'amount_cents bigint NOT NULL CHECK\s*\(amount_cents > 0\)')


class LeagueReplayTests(unittest.TestCase):
    def test_fractional_crowns_accumulate_and_ties_use_time_then_uid(self):
        players = roster(('a', 7), ('b', 7), ('c', 7), ('loser', 0))
        events = [win(1, 'a', 'loser', second=100),
                  win(2, 'c', 'loser', stake=200, second=200),
                  win(3, 'b', 'loser', stake=200, second=200),
                  win(4, 'a', 'loser', second=300)]
        result, rows = model.replay('fractional', players, events)
        by_id = {p['player_id']: p for p in rows}
        # a earned $1.80 twice. Flooring each win separately would yield 2 crowns.
        self.assertEqual(by_id['a']['earned_cents'], 360)
        self.assertEqual(by_id['a']['crowns'], 3)
        self.assertEqual(by_id['a']['reached_second'], 300)
        self.assertEqual([by_id[p]['payout_cents'] for p in ['b', 'c', 'a']],
                         [234375, 156250, 109375])
        self.assertEqual(result['total']['current_payout_cents'], 500000)

    def test_threshold_boundaries_and_multi_tier_promotion(self):
        for current, threshold in enumerate([10, 50, 150, 350, 750, 1500, 3000]):
            self.assertEqual(model.promote(current, threshold * 100 - 1), current)
            self.assertEqual(model.promote(current, threshold * 100), current + 1)
        self.assertEqual(model.promote(0, 300000), 7)
        self.assertEqual(model.promote(7, 0), 7)

    def test_forecast_starts_after_weekly_rollover_and_resets_crowns(self):
        result, rows = model.replay(
            'migration', roster(('winner', 0), ('loser', 0), ('inactive', 3)),
            [win(1, 'winner', 'loser', stake=1000)],
        )
        by_id = {p['player_id']: p for p in rows}
        winner = by_id['winner']
        self.assertEqual(winner['earned_cents'], 1800)
        self.assertEqual(winner['closing_tier'], 1)       # instant Bronze -> Silver
        self.assertEqual(winner['payout_cents'], 2500)    # sole eligible Silver
        self.assertEqual(winner['next_opening_tier'], 2)  # weekly Silver -> Gold
        self.assertEqual(winner['forecast_closing_tier'], 2)
        self.assertEqual(by_id['inactive']['next_opening_tier'], 2)
        self.assertEqual(by_id['loser']['next_opening_tier'], 0)
        self.assertEqual(result['forecast_leagues'][2]['eligible'], 1)

    def test_positive_crowns_without_prize_stay_in_tier(self):
        result, rows = model.replay(
            'rank_cutoff', roster(('a', 0), ('b', 0), ('c', 0), ('loser', 0)),
            [win(1, 'a', 'loser', second=100), win(2, 'b', 'loser', second=200),
             win(3, 'c', 'loser', second=300)],
        )
        by_id = {p['player_id']: p for p in rows}
        self.assertEqual(result['current_leagues'][0]['winners'], 2)
        self.assertEqual([by_id[p]['next_opening_tier'] for p in ['a', 'b', 'c']], [1, 1, 0])

    def test_zero_and_single_qualifier_payout_exposure(self):
        empty, _ = model.replay('empty', roster(('idle', 7)), [])
        self.assertEqual(empty['total']['current_payout_cents'], 0)
        self.assertTrue(all(tier['actual_payout_cents'] == 0 for tier in empty['current_leagues']))
        single, rows = model.replay('single', roster(('solo', 7), ('loser', 0)),
                                    [win(1, 'solo', 'loser')])
        self.assertEqual(single['current_leagues'][7]['eligible'], 1)
        self.assertEqual(single['current_leagues'][7]['first_prize_cents'], 500000)
        self.assertEqual(next(p for p in rows if p['player_id'] == 'solo')['earned_cents'], 180)

    def test_proposed_minimum_crowns_gate_prizes_after_weekly_reset(self):
        self.assertTrue(all(a < b for a, b in zip(model.MIN_CROWNS, model.MIN_CROWNS[1:])))
        for tier, minimum in enumerate(model.MIN_CROWNS):
            if tier < 7:
                self.assertLess(minimum, model.THRESHOLDS[tier])
            # Each whole-dollar stake win earns $1.80. Some integer crowns are
            # skipped, so exercise the nearest valid ledger total on each side.
            units_to_qualify = (minimum * 100 + 179) // 180
            for total_units in [units_to_qualify - 1, units_to_qualify]:
                events = []
                remaining = total_units
                while remaining:
                    units = min(20, remaining)
                    events.append(win(len(events) + 1, 'winner', 'loser',
                                      stake=units * 100, second=(len(events) + 1) * 100))
                    remaining -= units
                result, rows = model.replay(
                    'minimum', roster(('winner', tier), ('loser', 0)), events,
                    min_crowns=model.MIN_CROWNS,
                )
                player = next(p for p in rows if p['player_id'] == 'winner')
                qualifies = total_units == units_to_qualify
                with self.subTest(tier=tier, earned_cents=player['earned_cents']):
                    self.assertEqual(player['closing_tier'], tier)
                    self.assertEqual(player['crowns'] >= minimum, qualifies)
                    self.assertEqual(result['current_leagues'][tier]['eligible'], int(qualifies))
                    self.assertEqual(player['payout_cents'] > 0, qualifies)
                    if not qualifies and player['crowns'] > 0:
                        self.assertEqual(player['next_opening_tier'], tier)

    def test_zero_pool_does_not_create_winners_or_weekly_promotion(self):
        result, rows = model.replay(
            'paused', roster(('winner', 0), ('loser', 0)),
            [win(1, 'winner', 'loser')], pools=[0] * 8,
        )
        player = next(p for p in rows if p['player_id'] == 'winner')
        self.assertEqual(player['crowns'], 1)
        self.assertEqual(result['current_leagues'][0]['eligible'], 1)
        self.assertEqual(result['current_leagues'][0]['winners'], 0)
        self.assertEqual(result['total']['current_payout_cents'], 0)
        self.assertEqual(player['next_opening_tier'], 0)

    def test_proposed_forecast_eligibility_uses_new_tier_minimum(self):
        result, rows = model.replay(
            'reset_gate', roster(('winner', 6), ('loser', 0)),
            [win(1, 'winner', 'loser', stake=2000)],
        )
        player = next(p for p in rows if p['player_id'] == 'winner')
        # Current awards retain the backend's one-crown rule. The next period
        # begins in Master after prize promotion, with an 800-crown prize gate.
        self.assertEqual(player['payout_cents'], model.POOLS[6])
        self.assertEqual(player['next_opening_tier'], 7)
        self.assertEqual(player['forecast_min_crowns'], 800)
        self.assertFalse(player['forecast_prize_eligible'])
        self.assertEqual(result['forecast_leagues'][7]['eligible'], 0)

    def test_refunds_do_not_create_crowns(self):
        fixtures = []
        for index, kind in enumerate(['tie', 'double_forfeit', 'unmatched'], 1):
            event = win(index, 'a', 'b', second=100 * index)
            count = 1 if kind == 'unmatched' else 2
            event.update(kind=kind, winner_id=None, players=event['players'][:count],
                         credit_cents=[100] * count, pool_cents=100 * count, fee_cents=0)
            if kind == 'double_forfeit':
                for p in event['players']:
                    p['play_status'] = 'forfeited'
            fixtures.append(event)
        result, rows = model.replay('refunds', roster(('a', 3), ('b', 3)), fixtures)
        self.assertEqual(result['total']['refunds_cents'], 500)
        self.assertEqual(result['total']['fees_cents'], 0)
        self.assertTrue(all(p['crowns'] == 0 and p['next_opening_tier'] == 2 for p in rows))

    def test_duplicate_event_rejected(self):
        event = win(1, 'a', 'b')
        with self.assertRaisesRegex(AssertionError, 'Duplicate event'):
            model.replay('duplicate', roster(('a', 0), ('b', 0)), [event, event])


class TreasuryAndPolicyTests(unittest.TestCase):
    def test_contribution_excludes_deposits_and_unavailable_suspect_fees(self):
        totals = dict(fees_cents=100000, suspect_fees_cents=10000, entries=1000)
        cfg = dict(deposits_cents=100000, processing_rate=.025,
                   cost_per_entry_cents=2, fixed_week_cost_cents=10000, fraud_loss_cents=1000)
        economics = model.contribution(totals, cfg)
        self.assertEqual(economics['clean_fees_cents'], 90000)
        self.assertEqual(economics['processing_cost_cents'], 2500)
        self.assertEqual(economics['net_contribution_cents'], 74500)

    def test_treasury_stocks_do_not_double_count_cash_or_cost_flows(self):
        result, cfg = finance_fixture()
        proposal = model.propose(result, cfg, 1000000, 1000000)
        # $10,000 cash - $3,800 protected stocks - $500 current commitment.
        self.assertEqual(proposal['headroom_cents'], 570000)
        self.assertEqual(proposal['economic_ceiling_cents'], 200000)
        self.assertEqual(proposal['total_pools_cents'], 200000)
        altered = dict(cfg, deposits_cents=9000000, pending_processor_cash_cents=9000000)
        unchanged = model.propose(result, altered, 1000000, 1000000)
        self.assertEqual(unchanged['headroom_cents'], proposal['headroom_cents'])
        self.assertEqual(unchanged['total_pools_cents'], proposal['total_pools_cents'])
        changed_fees = copy.deepcopy(result)
        changed_fees['total']['fees_cents'] += 500000
        self.assertEqual(model.propose(changed_fees, cfg, 1000000, 1000000)['headroom_cents'], 570000)

    def test_current_commitments_are_reserved_exactly_once(self):
        result, cfg = finance_fixture()
        proposal = model.propose(result, cfg, 1000000, 1000000)
        result['total']['current_payout_cents'] += 10000
        reduced = model.propose(result, cfg, 1000000, 1000000)
        self.assertEqual(reduced['headroom_cents'], proposal['headroom_cents'] - 10000)
        self.assertEqual(reduced['net_contribution_cents'], proposal['net_contribution_cents'])
        self.assertEqual(reduced['current_week_profit_cents'], proposal['current_week_profit_cents'] - 10000)
        self.assertEqual(reduced['next_week_profit_cents'], proposal['next_week_profit_cents'])

    def test_platform_profit_separates_current_awards_from_next_commitments(self):
        result, cfg = finance_fixture()
        proposal = model.propose(result, cfg, 1000000, 1000000)
        self.assertEqual(proposal['current_week_profit_cents'], 950000)
        self.assertEqual(proposal['next_week_profit_cents'], 800000)
        self.assertEqual(sum(x['weekly_profit_cents'] for x in proposal['league_profit']), 800000)
        reduced_rewards = model.propose(result, cfg, 1000000, 1000000, reward_rate=.10)
        self.assertEqual(reduced_rewards['current_week_profit_cents'], 950000)
        self.assertEqual(reduced_rewards['next_week_profit_cents'], 920000)

    def test_growth_quality_and_cash_caps(self):
        result, cfg = finance_fixture()
        growth = model.propose(result, cfg, 1000000, 1000000, baseline_ceiling=100000)
        self.assertEqual(growth['total_pools_cents'], 125000)
        haircut = model.propose(result, dict(cfg, forecast_quality_multiplier=.5), 1000000, 1000000)
        self.assertEqual(haircut['total_pools_cents'], 100000)
        cash = model.propose(result, dict(cfg, settled_cash_cents=442399), 1000000, 1000000)
        self.assertEqual(cash['headroom_cents'], 12399)
        self.assertEqual(cash['total_pools_cents'], 10000)
        self.assertEqual(cash['retained_budget_cents'], 2300)

    def test_zero_budget_and_insufficient_floor_block_publication(self):
        result, cfg = finance_fixture()
        for cash in [400000, 430000, 434999]:
            with self.subTest(cash=cash):
                proposal = model.propose(result, dict(cfg, settled_cash_cents=cash), 1000000, 1000000)
                self.assertFalse(proposal['publishable'])
                self.assertEqual(proposal['pools_cents'], [0] * 8)
                self.assertTrue(any('BLOCK publication' in reason for reason in proposal['reasons']))
        result['total']['fees_cents'] = 0
        loss_cfg = dict(cfg, fixed_week_cost_cents=100)
        loss = model.propose(result, loss_cfg, 1000000, 1000000)
        self.assertEqual(loss['total_pools_cents'], 0)
        self.assertEqual(loss['next_week_profit_cents'], -100)
        self.assertEqual(loss['conservative_next_week_profit_cents'], -100)

    def test_ladder_is_strict_and_affordable_across_budget_boundaries(self):
        fields = forecast(100000)
        budgets = list(range(0, 10001)) + [12399, 12400, 263100, 1000000, 123456789]
        for budget in budgets:
            pools = model.allocate(budget, fields)
            with self.subTest(budget=budget):
                self.assertLessEqual(sum(pools), budget)
                if budget < 5000:
                    self.assertEqual(pools, [0] * 8)
                    continue
                self.assertTrue(all(x > 0 and x % 100 == 0 for x in pools))
                self.assertTrue(all(a < b for a, b in zip(pools, pools[1:])))
                first = [model.prize_amounts(pool, shares, len(shares))[0]
                         for pool, shares in zip(pools, model.SHARES)]
                self.assertTrue(all(a < b for a, b in zip(first, first[1:])))
                self.assertTrue(all(min(model.prize_amounts(pool, shares, len(shares))) > 0
                                    for pool, shares in zip(pools, model.SHARES)))

    def test_qualification_cap_reduces_whole_ladder_and_retains_budget(self):
        budget = 1000000
        mixed = forecast(1000)
        mixed[7]['capped_clean_fees_cents'] = 10 ** 12
        pools = model.allocate(budget, mixed)
        self.assertEqual(sum(pools), budget)
        sparse = forecast(1000)
        sparse[7]['eligible'] = 1
        sparse_pools = model.allocate(budget, sparse)
        self.assertEqual(sparse_pools, [600, 1200, 1800, 2400, 3600, 4800, 6600, 9000])
        self.assertEqual(sum(sparse_pools), 30000)
        self.assertTrue(all(s < p for s, p in zip(sparse_pools, pools)))
        self.assertLessEqual(sparse_pools[7], 10000)
        # The policy reserves for one possible late qualifier even with zero
        # forecast qualifiers; it does not pretend this is an observed player.
        self.assertEqual(model.allocate(budget, [model.new_metrics() for _ in range(8)]), sparse_pools)

    def test_retention_offer_requires_cash_and_preserves_existing_obligations(self):
        result, cfg = retention_fixture()
        original = copy.deepcopy((result, cfg))
        proposal = model.propose(result, cfg, 1000000, 1000000, baseline_ceiling=100000)
        self.assertEqual(proposal['pre_funding_headroom_cents'], 570000)
        self.assertEqual(proposal['equity_funding_cents'], 300000)
        self.assertEqual(proposal['funded_cash_cents'], 1300000)
        self.assertEqual(proposal['headroom_cents'], 870000)
        self.assertEqual(proposal['total_pools_cents'], 800000)
        self.assertEqual(sum(proposal['standard_policy_pools_cents']), 125000)
        self.assertGreater(proposal['total_pools_cents'], proposal['economic_ceiling_cents'])
        self.assertGreater(proposal['total_pools_cents'], proposal['growth_ceiling_cents'])
        self.assertEqual(proposal['retention_campaign']['status'], 'funded')
        self.assertTrue(proposal['publishable'])
        self.assertLessEqual(proposal['total_pools_cents'], proposal['headroom_cents'])
        self.assertEqual(proposal['current_committed_rewards_cents'], 50000)
        for key in ['wallet_liability_cents', 'withdrawals_outside_wallet_cents',
                    'unsettled_entry_liability_cents', 'future_opex_buffer_cents', 'risk_reserve_cents']:
            self.assertEqual(proposal['treasury'][key], cfg[key])
        self.assertEqual((result, cfg), original)

    def test_retention_equity_is_not_profit_and_is_not_applied_twice(self):
        result, cfg = retention_fixture()
        funded = model.propose(result, cfg, 1000000, 1000000)
        self.assertEqual(model.propose(result, cfg, 1000000, 1000000), funded)
        extra_equity = copy.deepcopy(cfg)
        extra_equity['retention_campaign']['equity_funding_cents'] += 100000
        larger_cash = model.propose(result, extra_equity, 1000000, 1000000)
        self.assertEqual(larger_cash['headroom_cents'], funded['headroom_cents'] + 100000)
        for key in ['net_contribution_cents', 'current_week_profit_cents', 'next_week_profit_cents']:
            self.assertEqual(larger_cash[key], funded[key])
        self.assertEqual(funded['net_contribution_cents'], 1000000)
        self.assertEqual(funded['current_week_profit_cents'], 950000)
        self.assertEqual(funded['next_week_profit_cents'], 200000)

    def test_retention_offer_blocks_instead_of_substituting_an_unfunded_or_smaller_offer(self):
        for constraint in ['cash', 'loss_budget', 'qualifiers']:
            result, cfg = retention_fixture()
            if constraint == 'cash':
                cfg['retention_campaign']['equity_funding_cents'] = 0
            elif constraint == 'loss_budget':
                cfg['retention_campaign']['max_weekly_loss_cents'] = 200000
            else:
                result['forecast_leagues'][7]['eligible'] = 1
            with self.subTest(constraint=constraint):
                proposal = model.propose(result, cfg, 1000000, 1000000)
                self.assertFalse(proposal['publishable'])
                self.assertEqual(proposal['retention_campaign']['status'], 'blocked')
                self.assertEqual(proposal['pools_cents'], [0] * 8)
                self.assertEqual(proposal['current_committed_rewards_cents'], 50000)
                self.assertEqual(proposal['current_week_profit_cents'], 950000)

    def test_retention_loss_budget_cannot_exceed_positive_current_profit(self):
        for current_awards, expected_loss_budget in [(900000, 100000), (1100000, 0)]:
            result, cfg = retention_fixture()
            result['total']['current_payout_cents'] = current_awards
            cfg['retention_campaign']['equity_funding_cents'] = 2000000
            with self.subTest(current_awards=current_awards):
                proposal = model.propose(result, cfg, 1000000, 1000000)
                self.assertGreater(proposal['headroom_cents'], 800000)
                self.assertEqual(proposal['retention_campaign']['effective_loss_budget_cents'],
                                 expected_loss_budget)
                self.assertEqual(proposal['retention_campaign']['loss_limited_ceiling_cents'],
                                 500000 + expected_loss_budget)
                self.assertFalse(proposal['publishable'])
                self.assertEqual(proposal['current_week_profit_cents'], 1000000 - current_awards)

    def test_retention_stress_keeps_full_announced_prizes_when_loss_limit_is_breached(self):
        result, cfg = retention_fixture()
        proposal = model.propose(result, cfg, 1000000, 1000000)
        sensitivity = {row['ratio']: row for row in proposal['retention_sensitivity']}
        self.assertEqual(set(sensitivity), {1.0, .8, .6, .5, .4})
        for ratio, row in sensitivity.items():
            with self.subTest(ratio=ratio):
                self.assertEqual(row['net_contribution_cents'], round(1000000 * ratio))
                self.assertEqual(row['pool_cents'], 800000)
                self.assertEqual(row['weekly_profit_cents'], row['net_contribution_cents'] - 800000)
                self.assertEqual(row['cumulative_profit_cents'], 950000 + row['weekly_profit_cents'])
        self.assertEqual(sensitivity[.5]['weekly_profit_cents'], -300000)
        self.assertTrue(sensitivity[.5]['within_loss_budget'])
        self.assertEqual(sensitivity[.4]['weekly_profit_cents'], -400000)
        self.assertFalse(sensitivity[.4]['within_loss_budget'])
        self.assertEqual(sensitivity[.4]['cumulative_profit_cents'], 550000)

    def test_retention_stress_does_not_reduce_an_existing_operating_loss(self):
        result, cfg = retention_fixture()
        result['total']['fees_cents'] = 0
        cfg['fixed_week_cost_cents'] = 10000
        proposal = model.propose(result, cfg, 1000000, 1000000)
        self.assertEqual(proposal['net_contribution_cents'], -10000)
        self.assertEqual(proposal['retention_campaign']['stress_contribution_cents'], -10000)
        self.assertEqual(proposal['retention_campaign']['effective_loss_budget_cents'], 0)
        self.assertFalse(proposal['publishable'])
        self.assertEqual(proposal['current_week_profit_cents'], -60000)


class GeneratedArtifactTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = json.loads((OUTPUT_DIR / 'scenario_results.json').read_text())
        cls.cases = {row['case']: row for row in cls.output['scenarios']}

    def test_liquidity_cases_hold_gameplay_constant(self):
        base = self.cases['baseline']
        for name in ['low_liquidity', 'reserve_deficit']:
            case = self.cases[name]
            self.assertEqual(case['total'], base['total'])
            self.assertEqual(case['origin_leagues'], base['origin_leagues'])
            self.assertEqual(case['forecast_leagues'], base['forecast_leagues'])
        self.assertFalse(self.cases['reserve_deficit']['proposal']['publishable'])
        low = self.cases['low_liquidity']['proposal']
        self.assertGreater(low['total_pools_cents'], base['proposal']['total_pools_cents'])
        self.assertGreater(low['total_pools_cents'], low['current_committed_rewards_cents'])
        self.assertEqual(low['pools_cents'], [20000, 40000, 60000, 80000, 120000, 160000, 220000, 300000])
        self.assertEqual(sum(low['standard_policy_pools_cents']), 10000)
        self.assertEqual(low['pre_funding_headroom_cents'], 12400)
        self.assertEqual(low['equity_funding_cents'], 1000000)
        self.assertEqual(low['funded_cash_cents'], 5850000)
        self.assertEqual(low['headroom_cents'], 1012400)
        self.assertEqual(low['next_week_profit_cents'], 370350)
        self.assertEqual(low['two_week_cumulative_profit_cents'], 903100)

    def test_campaign_stress_accepts_a_bounded_weekly_loss_without_inventing_profit(self):
        proposal = self.cases['low_liquidity']['proposal']
        campaign = proposal['retention_campaign']
        self.assertEqual(campaign['duration_weeks'], 1)
        self.assertEqual(campaign['status'], 'funded')
        self.assertEqual(campaign['stress_contribution_cents'], 685175)
        self.assertEqual(campaign['effective_loss_budget_cents'], 350000)
        self.assertEqual(campaign['loss_limited_ceiling_cents'], 1035175)
        sensitivity = {row['ratio']: row for row in proposal['retention_sensitivity']}
        self.assertEqual(sensitivity[.5]['weekly_profit_cents'], -314825)
        self.assertEqual(sensitivity[.5]['cumulative_profit_cents'], 217925)
        self.assertTrue(sensitivity[.5]['within_loss_budget'])
        self.assertEqual(sensitivity[.4]['weekly_profit_cents'], -451860)
        self.assertEqual(sensitivity[.4]['cumulative_profit_cents'], 80890)
        self.assertFalse(sensitivity[.4]['within_loss_budget'])
        self.assertEqual(sensitivity[.4]['pool_cents'], 1000000)

    def test_quiet_master_has_one_current_qualifier_then_incoming_winners(self):
        quiet = self.cases['master_quiet']
        self.assertEqual(quiet['origin_leagues'][7]['active'], 1)
        self.assertEqual(quiet['current_leagues'][7]['eligible'], 1)
        self.assertEqual(quiet['current_leagues'][7]['first_prize_cents'], 500000)
        self.assertEqual(quiet['forecast_leagues'][7]['eligible'], 10)
        self.assertLess(quiet['forecast_leagues'][7]['eligible'],
                        1 + quiet['current_leagues'][6]['winners'])
        self.assertLess(quiet['proposal']['current_week_profit_cents'], 0)
        self.assertGreater(quiet['proposal']['next_week_profit_cents'], 0)

    def test_generated_forecast_qualifiers_match_new_crown_gates(self):
        observed = {case: [0] * 8 for case in self.cases}
        for line in (OUTPUT_DIR / 'player_weeks.jsonl').read_text().splitlines():
            player = json.loads(line)
            tier = player['forecast_closing_tier']
            eligible = player['crowns'] >= model.MIN_CROWNS[tier]
            self.assertEqual(player['forecast_min_crowns'], model.MIN_CROWNS[tier])
            self.assertEqual(player['forecast_prize_eligible'], eligible)
            observed[player['case']][tier] += eligible
        for case, counts in observed.items():
            self.assertEqual(counts, [x['eligible'] for x in self.cases[case]['forecast_leagues']])

    def test_generated_platform_and_league_profit_reconcile_without_double_counting(self):
        for case, result in self.cases.items():
            proposal = result['proposal']
            with self.subTest(case=case):
                self.assertEqual(proposal['current_week_profit_cents'],
                                 proposal['net_contribution_cents'] - result['total']['current_payout_cents'])
                self.assertEqual(proposal['next_week_profit_cents'],
                                 proposal['net_contribution_cents'] - proposal['total_pools_cents'])
                self.assertEqual(proposal['two_week_cumulative_profit_cents'],
                                 proposal['current_week_profit_cents'] + proposal['next_week_profit_cents'])
                self.assertEqual(sum(x['clean_fees_cents'] for x in proposal['league_profit']),
                                 proposal['clean_fees_cents'])
                self.assertEqual(sum(x['allocated_cost_cents'] for x in proposal['league_profit']),
                                 sum(proposal[key] for key in ['processing_cost_cents', 'variable_cost_cents',
                                                              'fixed_cost_cents', 'fraud_loss_cents']))
                self.assertEqual(sum(x['weekly_profit_cents'] for x in proposal['league_profit']),
                                 proposal['next_week_profit_cents'])
                self.assertLessEqual(proposal['conservative_next_week_profit_cents'],
                                     proposal['next_week_profit_cents'])
                pools = proposal['pools_cents']
                if proposal['publishable']:
                    self.assertTrue(all(a < b for a, b in zip(pools, pools[1:])))

    def test_raw_ledger_conservation_matches_reported_totals(self):
        raw = {case: dict(entries=0, handle_cents=0, fees_cents=0, credits_cents=0)
               for case in self.cases}
        with gzip.open(INPUT_DIR / 'events.jsonl.gz', 'rt') as source:
            for line in source:
                event = json.loads(line)
                totals = raw[event['case']]
                totals['entries'] += len(event['players'])
                totals['handle_cents'] += event['stake_cents'] * len(event['players'])
                totals['fees_cents'] += event['fee_cents']
                totals['credits_cents'] += sum(event['credit_cents'])
                self.assertEqual(event['pool_cents'], event['fee_cents'] + sum(event['credit_cents']))
        for case, totals in raw.items():
            for key, value in totals.items():
                self.assertEqual(value, self.cases[case]['total'][key], (case, key))
            self.assertEqual(totals['credits_cents'] + totals['fees_cents'], totals['handle_cents'])

    def test_generator_files_are_byte_reproducible_across_hash_seeds(self):
        with tempfile.TemporaryDirectory(prefix='skill-gaming-mock-test-') as directory:
            script = Path(directory) / 'scripts' / 'generate_mock_data.py'
            script.parent.mkdir()
            generated = Path(directory) / 'data' / 'input'
            shutil.copy2(SCRIPTS_DIR / script.name, script)
            hashes = []
            for seed in ['1', '987654']:
                environment = dict(os.environ, PYTHONHASHSEED=seed)
                subprocess.run([sys.executable, str(script)], check=True,
                               stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                               env=environment, timeout=120)
                hashes.append({name: hashlib.sha256((generated / name).read_bytes()).hexdigest()
                               for name in ['scenarios.json', 'players.jsonl', 'events.jsonl.gz']})
            self.assertEqual(hashes[0], hashes[1])
            self.assertEqual((generated / 'events.jsonl.gz').read_bytes()[4:8], b'\x00' * 4)


class ChronologicalProfitTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.path = json.loads((OUTPUT_DIR / 'weekly_profit.json').read_text())

    def test_announcements_do_not_use_their_weeks_outcomes(self):
        changed_path = list(weekly.PATH_CASES)
        changed_path[1] = 'baseline'
        with mock.patch.object(weekly, 'PATH_CASES', changed_path):
            altered = weekly.run_path()
        baseline_weeks = self.path['weeks']
        self.assertNotEqual(altered['weeks'][1]['total']['fees_cents'],
                            baseline_weeks[1]['total']['fees_cents'])
        # Altered week-two outcomes cannot affect an already funded week-two
        # announcement; they can affect week three and later decisions.
        self.assertEqual(altered['weeks'][0], baseline_weeks[0])
        self.assertEqual(altered['weeks'][1]['announcement'], baseline_weeks[1]['announcement'])
        history = list(self.path['calibration_contribution_cents'])
        for week in baseline_weeks:
            decision = week['announcement']
            self.assertFalse(decision['signal_uses_current_week_outcomes'])
            if week['week'] > 1:
                self.assertEqual(decision['signal_contribution_history_cents'], history[-3:])
            history.append(week['economics']['net_contribution_cents'])

    def test_weekly_profit_equals_cash_less_liability_equity_change(self):
        cumulative = 0
        for week in self.path['weeks']:
            opening, closing = week['opening'], week['closing']
            equity = lambda stock: stock['cash_cents'] - stock['wallet_cents'] - stock['deferred_fees_cents']
            expected = (week['total']['fees_cents'] - week['deferred_fees_added_cents']
                        - week['cash_costs_cents'] - week['actual_awards_cents'])
            with self.subTest(week=week['week']):
                self.assertEqual(week['platform_profit_cents'], expected)
                self.assertEqual(equity(closing) - equity(opening), expected)
                self.assertEqual(weekly.free_headroom(closing) - weekly.free_headroom(opening), expected)
                self.assertEqual(closing['cash_cents'] - opening['cash_cents'],
                                 week['input']['deposits_cents'] - week['input']['withdrawals_cents']
                                 - week['cash_costs_cents'])
                self.assertEqual(closing['wallet_cents'] - opening['wallet_cents'],
                                 week['input']['deposits_cents'] - week['input']['withdrawals_cents']
                                 - week['total']['fees_cents'] + week['actual_awards_cents'])
                cumulative += expected
                self.assertEqual(week['cumulative_platform_profit_cents'], cumulative)

    def test_weekly_profit_table_exposes_chronological_cumulative_profit(self):
        rendered = weekly.render(self.path)
        header = next(line for line in rendered.splitlines()
                      if line.startswith('| Week / start | Template |'))
        self.assertIn('| Cumulative profit |', header)
        self.assertIn(model.money(self.path['weeks'][-1]['cumulative_platform_profit_cents']), rendered)

    def test_actual_tiers_and_treasury_carry_between_weeks(self):
        for previous, current in zip(self.path['weeks'], self.path['weeks'][1:]):
            self.assertEqual(current['opening'], previous['closing'])
            previous_tiers = {p['player_id']: p['next_opening_tier'] for p in previous['player_states']}
            current_tiers = {p['player_id']: p['opening_tier'] for p in current['player_states']}
            self.assertEqual(current_tiers, previous_tiers)
        for week in self.path['weeks']:
            self.assertEqual(sum(p['payout_cents'] for p in week['player_states']), week['actual_awards_cents'])
            self.assertLessEqual(week['actual_awards_cents'], week['announcement']['total_pools_cents'])
            self.assertLessEqual(week['announcement']['total_pools_cents'], week['opening_free_headroom_cents'])

    def test_quiet_week_can_lose_money_even_with_no_earned_prizes(self):
        quiet = next(w for w in self.path['weeks'] if w['behavior_template'] == 'platform_quiet')
        self.assertEqual(quiet['total']['entries'], 0)
        self.assertEqual(quiet['actual_awards_cents'], 0)
        self.assertEqual(quiet['platform_profit_cents'], -quiet['input']['fixed_week_cost_cents'])
        self.assertLess(quiet['platform_profit_cents'], 0)
        self.assertEqual(quiet['unearned_pool_release_cents'], quiet['announcement']['total_pools_cents'])
        recovery = self.path['weeks'][quiet['week']]
        self.assertEqual(recovery['announcement']['total_pools_cents'], 0)
        self.assertGreater(recovery['total']['fees_cents'], 0)
        self.assertEqual(recovery['actual_awards_cents'], 0)

    def test_recovered_contribution_can_restart_after_zero_pool(self):
        decision = self.path['next_week_recommendation']['proposal']
        self.assertTrue(decision['restart_after_zero_pool'])
        self.assertGreater(decision['total_pools_cents'], 0)
        self.assertLessEqual(decision['total_pools_cents'], decision['headroom_cents'])
        self.assertLessEqual(decision['total_pools_cents'], decision['economic_ceiling_cents'])
        self.assertTrue(all(a < b for a, b in zip(decision['pools_cents'], decision['pools_cents'][1:])))


if __name__ == '__main__':
    unittest.main()
