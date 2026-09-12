#!/usr/bin/env python3
"""Generate reproducible, hypothetical weekly game fixtures (Python 3.9+).

Run from the repository root: python3 Database_SkillGaming/MockData/scripts/generate_mock_data.py
Writes players.jsonl, scenarios.json, and events.jsonl.gz to MockData/data/input/.
No production data, database, network, or third-party packages are used. The
generator models the existing matching/settlement rules, but deliberately leaves
league promotions and prize calculations to the separate analysis script.
"""

import copy
import gzip
import hashlib
import json
import random
from collections import Counter
from pathlib import Path


SEED = 20260912
OUTPUT_DIR = Path(__file__).resolve().parents[1] / 'data' / 'input'
TIERS = ["Bronze", "Silver", "Gold", "Platinum", "Sapphire", "Ruby", "Diamond", "Master"]
PLAYERS_PER_TIER = 48
WEEK_SECONDS = 7 * 24 * 60 * 60
SLOT_SECONDS = 300
# No new attempt in the final 30 minutes: all unmatched stakes drain before close.
SLOTS = list(range((WEEK_SECONDS - 1800) // SLOT_SECONDS))
BASE_GAMES = [6, 12, 20, 30, 40, 50, 65, 75]
ACTIVE_PROBABILITIES = [.76, .78, .80, .80, .82, .82, .84, .84]
# Whole-dollar entries include both quick choices and supported custom amounts.
STAKE_VALUES = [1, 2, 5, 10, 15, 20]
STAKE_WEIGHTS = [
    [65, 20, 12, 2, 1, 0],
    [35, 30, 25, 8, 2, 0],
    [15, 20, 40, 20, 4, 1],
    [5, 10, 35, 35, 10, 5],
    [2, 5, 20, 40, 20, 13],
    [1, 2, 12, 35, 25, 25],
    [0, 1, 5, 19, 30, 45],
    [0, 0, 3, 12, 25, 60],
]


def rng_for(*parts):
    """Stable stream, independent of PYTHONHASHSEED and processing order."""
    key = ":".join([str(SEED)] + [str(part) for part in parts])
    return random.Random(int.from_bytes(hashlib.sha256(key.encode()).digest()[:16], "big"))


def json_line(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n"


def create_roster():
    roster = []
    for tier in range(len(TIERS)):
        for index in range(1, PLAYERS_PER_TIER + 1):
            player_id = "mock_t{}_p{:03d}".format(tier, index)
            stream = rng_for("roster", player_id)
            active = stream.random() < ACTIVE_PROBABILITIES[tier]
            if tier == 7 and index == 1:
                active = True
            roster.append({
                "player_id": player_id,
                "opening_tier": tier,
                "opening_tier_name": TIERS[tier],
                "baseline_active": active,
                "game_intensity": round(stream.lognormvariate(-.5 * .48 ** 2, .48), 6),
                "skill_score_mean": max(100, int(stream.gauss(1100 + tier * 160, 220))),
            })
    return roster


def scenario_inputs(roster):
    whale_ids = []
    for tier in [6, 7]:
        whale_ids.extend([p["player_id"] for p in roster
                          if p["opening_tier"] == tier and p["baseline_active"]][:2])
    definitions = [
        ("prior_2", "Separate calibration analogue: 90% of baseline games; shared random streams.", .90, 1.0),
        ("prior_1", "Separate calibration analogue: 95% of baseline games; shared random streams.", .95, 1.0),
        ("baseline", "Illustrative mature cohort at ordinary activity and stake mix.", 1.0, 1.0),
        ("low_liquidity", "Baseline gameplay and low opening cash; a one-week retention campaign adds assumed operator equity and accepts bounded downside losses.", 1.0, 1.0),
        ("high_wager", "10% more attempts; stakes multiplied by 1.5, rounded and capped at $20.", 1.10, 1.5),
        ("master_quiet", "Only the first opening-Master player is active; other cohorts are near baseline with a 120-attempt cap.", 1.0, 1.0),
        ("more_games_low_stakes", "50% more attempts but stakes halved, rounded and floored at $1.", 1.50, .5),
        ("outage", "25% fewer attempts, 40% forfeits, and fragmented player-specific three-hour windows.", .75, 1.0),
        ("whale_surge", "Four identified high-tier players make 350 $20 attempts each; their matches are suspect.", 1.0, 1.0),
        ("reserve_deficit", "Exactly baseline gameplay; settled cash is below protected treasury requirements.", 1.0, 1.0),
    ]
    scenarios = []
    for name, description, game_multiplier, stake_multiplier in definitions:
        scenario = {
            "case": name,
            "description": description,
            "game_multiplier": game_multiplier,
            "stake_multiplier": stake_multiplier,
            "forfeit_probability": .40 if name == "outage" else .03,
            "tie_probability_given_both_completed": .03,
            "forecast_quality_multiplier": .5 if name == "outage" else .75 if name == "whale_surge" else 1.0,
            "suspect_player_ids": whale_ids if name == "whale_surge" else [],
            "gameplay_clone_of": "baseline" if name in ("low_liquidity", "reserve_deficit") else None,
            "settled_cash_cents": 4850000 if name == "low_liquidity" else 3500000 if name == "reserve_deficit" else 6000000,
            "wallet_liability_cents": 3000000,
            "withdrawals_outside_wallet_cents": 200000,
            "unsettled_entry_liability_cents": 100000,
            "future_opex_buffer_cents": 500000,
            "risk_reserve_cents": 200000,
            "pending_processor_cash_cents": 300000,
            "deposits_cents": 500000,
            "processing_rate": .025,
            "fixed_week_cost_cents": 100000,
            "cost_per_entry_cents": 2,
            "fraud_loss_cents": 10000,
        }
        scenario["stake_mapping_dollars"] = {
            str(stake): max(1, min(20, int(stake * stake_multiplier + .5)))
            for stake in STAKE_VALUES
        }
        if name == "low_liquidity":
            scenario["retention_campaign"] = {
                "target_pool_cents": 1000000,
                "equity_funding_cents": 1000000,
                "max_weekly_loss_cents": 350000,
                "stress_contribution_ratio": .5,
                "duration_weeks": 1,
                "funding_assumption": "New hypothetical unrestricted operator equity, cleared before announcement; not included in the opening cash snapshot, player deposits or profit.",
            }
        scenarios.append(scenario)
    return scenarios


def generate_attempts(roster, scenario):
    attempts = []
    case_players = []
    for player in roster:
        player_id = player["player_id"]
        tier = player["opening_tier"]
        active = player["baseline_active"]
        if scenario["case"] == "master_quiet" and tier == 7:
            active = player_id == "mock_t7_p001"
        suspect = player_id in scenario["suspect_player_ids"]
        count = max(1, int(BASE_GAMES[tier] * player["game_intensity"] * scenario["game_multiplier"] + .5)) if active else 0
        if scenario["case"] == "master_quiet":
            count = min(count, 120)
        if suspect:
            count = 350
        record = dict(player)
        record.update(case=scenario["case"], active=active, suspect=suspect, planned_attempts=count)
        case_players.append(record)

        # Separate common random streams preserve each player's basic propensity
        # across scenarios while allowing matching to respond to volume/stake mix.
        schedule_stream = rng_for("schedule", player_id)
        stake_stream = rng_for("stake", player_id)
        result_stream = rng_for("performance", player_id)
        allowed_slots = SLOTS
        if scenario["case"] == "outage":
            start_hour = rng_for("outage_window", player_id).randrange(24)
            allowed_hours = {(start_hour + offset) % 24 for offset in range(3)}
            allowed_slots = [slot for slot in SLOTS if (slot // 12) % 24 in allowed_hours]
        if count > len(allowed_slots):
            raise AssertionError("Attempt count exceeds nonoverlapping schedule capacity")
        # Sampling precedes sorting; each run lasts at most 100 sec, while adjacent
        # scheduled starts differ by >=210 sec even after the 0..90 sec jitter.
        slots = sorted(schedule_stream.sample(allowed_slots, count))
        for sequence, slot in enumerate(slots, 1):
            created = slot * SLOT_SECONDS + schedule_stream.randint(0, 90)
            duration = result_stream.randint(30, 100)
            forfeited = result_stream.random() < scenario["forfeit_probability"]
            score = max(0, int(result_stream.gauss(player["skill_score_mean"], 400)))
            stake = stake_stream.choices(STAKE_VALUES, weights=STAKE_WEIGHTS[tier], k=1)[0]
            stake = 20 if suspect else scenario["stake_mapping_dollars"][str(stake)]
            attempts.append({
                "attempt_id": "{}_{:04d}".format(player_id, sequence),
                "player_id": player_id,
                "created_second": created,
                "finished_second": created + duration,
                "play_status": "forfeited" if forfeited else "completed",
                "score": score,
                "stake_cents": stake * 100,
                "suspect": suspect,
            })
    return sorted(attempts, key=lambda row: (row["created_second"], row["attempt_id"])), case_players


def participant(attempt):
    return {key: attempt[key] for key in
            ("attempt_id", "player_id", "created_second", "finished_second", "play_status", "score")}


def settle_pair(first, second, case):
    stake = first["stake_cents"]
    assert stake == second["stake_cents"] and first["player_id"] != second["player_id"]
    completed = [item["play_status"] == "completed" for item in (first, second)]
    players = [participant(first), participant(second)]
    winner_id = None
    if not any(completed):
        kind = "double_forfeit"
    elif all(completed) and rng_for("tie", first["attempt_id"], second["attempt_id"]).random() < .03:
        kind = "tie"
        players[1]["score"] = players[0]["score"]
    elif all(completed) and players[0]["score"] == players[1]["score"]:
        kind = "tie"
    else:
        kind = "win"
        winning_index = 0 if completed[0] and (not completed[1] or players[0]["score"] > players[1]["score"]) else 1
        winner_id = players[winning_index]["player_id"]
    fee = (stake * 2 + 5) // 10 if kind == "win" else 0
    credits = [stake, stake] if kind != "win" else [stake * 2 - fee if p["player_id"] == winner_id else 0 for p in players]
    return {
        "case": case,
        "settled_second": max(second["created_second"], first["finished_second"], second["finished_second"]),
        "stake_cents": stake,
        "kind": kind,
        "players": players,
        "winner_id": winner_id,
        "fee_cents": fee,
        "pool_cents": stake * 2,
        "credit_cents": credits,
        "suspect": first["suspect"] or second["suspect"],
    }


def unmatched_event(attempt, case):
    return {
        "case": case,
        "settled_second": max(attempt["created_second"] + 900, attempt["finished_second"]),
        "stake_cents": attempt["stake_cents"],
        "kind": "unmatched",
        "players": [participant(attempt)],
        "winner_id": None,
        "fee_cents": 0,
        "pool_cents": attempt["stake_cents"],
        "credit_cents": [attempt["stake_cents"]],
        "suspect": attempt["suspect"],
    }


def match_attempts(attempts, case):
    queues = {}
    events = []
    for attempt in attempts:
        queue = queues.setdefault(attempt["stake_cents"], [])
        # FIFO by creation; precisely 900 seconds is already too late to match.
        while queue and queue[0]["created_second"] + 900 <= attempt["created_second"]:
            events.append(unmatched_event(queue.pop(0), case))
        opponent_index = next((index for index, candidate in enumerate(queue)
                               if candidate["player_id"] != attempt["player_id"]), None)
        if opponent_index is None:
            queue.append(attempt)
        else:
            events.append(settle_pair(queue.pop(opponent_index), attempt, case))
    for queue in queues.values():
        events.extend(unmatched_event(attempt, case) for attempt in queue)
    events.sort(key=lambda event: (event["settled_second"], event["players"][0]["attempt_id"]))
    for event_id, event in enumerate(events, 1):
        event["event_id"] = event_id
    return events


def validate_case(roster, events):
    observed = Counter()
    per_player = {}
    winner_credits = Counter()
    previous_time = -1
    for event in events:
        assert 0 <= event["settled_second"] < WEEK_SECONDS
        assert previous_time <= event["settled_second"]
        previous_time = event["settled_second"]
        assert event["pool_cents"] == sum(event["credit_cents"]) + event["fee_cents"]
        assert event["stake_cents"] % 100 == 0 and 100 <= event["stake_cents"] <= 2000
        if event["kind"] != "unmatched":
            assert len(event["players"]) == 2
            assert len({p["player_id"] for p in event["players"]}) == 2
            assert abs(event["players"][1]["created_second"] - event["players"][0]["created_second"]) < 900
        for person, credit in zip(event["players"], event["credit_cents"]):
            observed[person["player_id"]] += 1
            per_player.setdefault(person["player_id"], []).append(person)
            if person["player_id"] == event["winner_id"]:
                winner_credits[person["player_id"]] += credit
    for player in roster:
        assert observed[player["player_id"]] == player["planned_attempts"]
        schedule = sorted(per_player.get(player["player_id"], []), key=lambda item: item["created_second"])
        assert len({p["attempt_id"] for p in schedule}) == len(schedule)
        assert all(a["finished_second"] < b["created_second"] for a, b in zip(schedule, schedule[1:]))
        if player["case"] == "master_quiet" and player["opening_tier"] < 7:
            # No promotion replay here: earning fewer than the terminal threshold
            # is a sufficient independent bound proving no one can enter Master.
            assert winner_credits[player["player_id"]] < 300000, "Quiet scenario gained an incoming Master"


def main():
    roster = create_roster()
    scenarios = scenario_inputs(roster)
    config = {
        "schema_version": 1,
        "seed": SEED,
        "synthetic": True,
        "game_id": "jungleSwing",
        "currency": "USD",
        "week_seconds": WEEK_SECONDS,
        "reference_week_start_local": "2026-09-07T00:00:00-04:00",
        "timezone": "America/New_York",
        "players_per_opening_tier": PLAYERS_PER_TIER,
        "tier_names": TIERS,
        "baseline_games_per_active_player_before_lognormal": BASE_GAMES,
        "baseline_active_probabilities": ACTIVE_PROBABILITIES,
        "baseline_stake_values_dollars": STAKE_VALUES,
        "baseline_stake_weights_by_opening_tier": STAKE_WEIGHTS,
        "duration_seconds_range": [30, 100],
        "attempt_slot_seconds": SLOT_SECONDS,
        "start_jitter_seconds_range": [0, 90],
        "model_notes": [
            "All data and financial assumptions are fabricated; no production/player data was accessed.",
            "384-player mature opening roster: 48 members in each tier. Current newly enrolled accounts actually begin at Bronze.",
            "All cases share the same opening identities and tiers; prior_2/prior_1 are separate calibration analogues using shared random streams, not independent samples, longitudinal retention or observed history.",
            "Times are seconds from a hypothetical ordinary 168-hour Monday-to-Monday New York week; DST transitions and cross-week settlements require separate live treatment.",
            "Only jungleSwing; matching is FIFO by exact stake and different user, never restricted by league/rating. Completion can precede pairing.",
            "Independent player schedules enforce one active run; all runs complete/forfeit within 100 seconds. Forfeit labels aggregate voluntary and technical failures.",
            "All requested entries are assumed affordable; no wallet funding-demand model is claimed. Treasury stocks are hypothetical snapshots independent of this fully drained gameplay ledger.",
            "Top-ups and withdrawals in the actual app are demo-only; synthetic settled cash, deposits, processor balances, reserves and expenses describe a proposed funded-pool planning model.",
            "The final 30 minutes contain no new entries. Every attempt resolves inside the week, with no pending event/cross-week carry; separate treasury unsettled-entry liability models an external planning stock.",
            "Pool on unmatched event is one refunded stake for conservation checks; actual API unmatched totalPoolCents is zero because no match existed.",
            "Scenario cash is measured before paying current committed weekly rewards, after the stated player-liability snapshot; the analyzer must reserve current commitments before next-week prizes.",
            "Only low_liquidity includes a new assumed $10,000 unrestricted operator equity injection and a one-week $10,000 retention target. Funding is added once after the opening cash snapshot, never to contribution or cumulative profit. The 50% net-contribution downside is a sensitivity, not a behavioral estimate.",
            "Wallet liability excludes the separately stated withdrawal and unsettled-entry stocks; processor-pending cash is excluded from settled cash. Deposits are turnover for processing cost, never revenue or extra cash to add again.",
            "Fraud-loss input is an incremental cost; suspect-match fees can be withheld separately as unavailable funding without treating either as an observed fraud finding.",
            "No league progression or prizes are generated here; the analyzer replays chronological terminal events using backend crown/promotion/prize rules.",
            "Outcome variation and scenario scheduling are illustrative, not estimated causal elasticities, realistic loss preferences, or statistically calibrated forecasts.",
        ],
        "scenarios": scenarios,
    }
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / "scenarios.json").write_text(json.dumps(config, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    event_cache = {}
    roster_cache = {}
    event_count = 0
    print("case                         players active attempts events unmatched fee_cents")
    with (OUTPUT_DIR / "players.jsonl").open("w", encoding="utf-8", newline="\n") as player_file:
        with (OUTPUT_DIR / "events.jsonl.gz").open("wb") as raw_file:
            # Empty embedded filename and mtime=0 make gzip bytes reproducible.
            with gzip.GzipFile(filename="", mode="wb", fileobj=raw_file, mtime=0) as event_file:
                for scenario in scenarios:
                    case = scenario["case"]
                    clone = scenario["gameplay_clone_of"]
                    if clone:
                        events = copy.deepcopy(event_cache[clone])
                        case_roster = copy.deepcopy(roster_cache[clone])
                        for row in events + case_roster:
                            row["case"] = case
                    else:
                        attempts, case_roster = generate_attempts(roster, scenario)
                        events = match_attempts(attempts, case)
                    validate_case(case_roster, events)
                    event_cache[case] = events
                    roster_cache[case] = case_roster
                    for player in case_roster:
                        player_file.write(json_line(player))
                    for event in events:
                        event_file.write(json_line(event).encode("utf-8"))
                    event_count += len(events)
                    counts = Counter(event["kind"] for event in events)
                    print("{:<29} {:>4} {:>6} {:>8} {:>6} {:>9} {:>9}".format(
                        case, len(case_roster), sum(p["active"] for p in case_roster),
                        sum(p["planned_attempts"] for p in case_roster), len(events),
                        counts["unmatched"], sum(event["fee_cents"] for event in events)))
    print("Wrote {} player-case rows and {} events to {}".format(len(roster) * len(scenarios), event_count, OUTPUT_DIR))


if __name__ == "__main__":
    main()
