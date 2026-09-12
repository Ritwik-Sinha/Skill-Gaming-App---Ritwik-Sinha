"""Shared, data-backed explanations at the top of each analysis document.

No financial model inputs or results are changed here. The analyzer renders this
guide into generated reports and refreshes only marked blocks in manual docs.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / 'data' / 'output'
DOCS_DIR = ROOT / 'docs'
START = '<!-- scenario-quick-reference:start -->'
END = '<!-- scenario-quick-reference:end -->'
MANUAL_DOCS = ('REWARD_ANALYSIS.md', 'FLOW_AND_DATA_PLAN.md', 'README.md')


def money(cents):
    return ('−' if cents < 0 else '') + '${:,.2f}'.format(abs(cents) / 100)


def render_quick_reference(results=None):
    """Keep a short common legend; detailed explanations belong in each report."""
    if results is None:
        results = json.loads((OUTPUT_DIR / 'scenario_results.json').read_text())['scenarios']
    cases = {r['case']: r for r in results}
    low = cases['low_liquidity']['proposal']
    half = next(s for s in low['retention_sensitivity'] if s['ratio'] == .5)
    return '\n'.join([
        START,
        '**Before reading:** these are simulated USD amounts; the app currently uses demo credits. '
        'A **pool** is shared among a league’s prize winners. **Profit** always belongs to the platform: '
        'fees minus modeled costs and rewards. **Available cash** is money left after protecting existing obligations and reserves.', '',
        f"**Low-cash decision:** offer {money(low['total_pools_cents'])} for one retention week, assuming "
        f"{money(low['equity_funding_cents'])} of new company cash is received first. "
        f"If earnings after costs halve, that week loses {money(abs(half['weekly_profit_cents']))}, "
        f"but current-plus-next-week profit remains {money(half['cumulative_profit_cents'])}. "
        '[See the worked example](REWARD_ANALYSIS.md#why-the-low-cash-pool-can-be-larger).', '',
        '**Cumulative profit:** in a scenario, add its current week and next forecast week. '
        'In the weekly report, add the weeks in order. Start at zero in both examples. '
        'Do not add different scenarios together or count new company cash as profit.', '',
        '<details>',
        '<summary>Quick reference: what each case name means</summary>', '',
        '- **Normal week (`baseline`):** the usual assumed players, games and stakes; our comparison point.',
        '- **Low available cash (`low_liquidity`):** normal gameplay, less starting cash, plus new company funding for the larger one-week reward offer.',
        '- **Higher wagers (`high_wager`):** stakes rise and players make about 10% more attempts; more fees support larger normal-policy pools.',
        '- **Master players go quiet (`master_quiet`):** all but one original Master player stop; fees fall, but existing prizes are still owed.',
        '- **More games, smaller stakes (`more_games_low_stakes`):** attempts rise about 50%, but lower stakes reduce fees and each attempt still costs money.',
        '- **Technical problems (`outage`):** fewer attempts and more unfinished runs; rewards use a more cautious earnings forecast.',
        '- **Four large flagged accounts (`whale_surge`):** wagering is concentrated; fees involving these deliberately flagged mock accounts are set aside. Large wagers alone do not prove abuse.',
        '- **Cash shortfall (`reserve_deficit`):** existing obligations and reserves exceed available cash; new pools are blocked.',
        '- **Earlier examples (`prior_2`, `prior_1`):** fabricated weeks at roughly 90% and 95% of normal attempts, used to smooth the forecast; they are not observed history.',
        '- **Nobody plays (`platform_quiet`):** used only in the weekly report; no fees or earned prizes, but operating costs continue.', '',
        'The eight-week report follows the ordinary policy. It does not include the new low-cash retention campaign or its company funding.', '',
        '</details>',
        END,
    ])


def refresh_manual_references(results=None):
    guide = render_quick_reference(results)
    for name in MANUAL_DOCS:
        path = DOCS_DIR / name
        if not path.exists():
            continue
        content = path.read_text()
        if START in content:
            start, end = content.index(START), content.index(END) + len(END)
            updated = content[:start] + guide + content[end:]
        else:
            title, rest = content.split('\n', 1)
            updated = title + '\n\n' + guide + '\n\n' + rest.lstrip('\n')
        if updated != content:
            path.write_text(updated)


if __name__ == '__main__':
    refresh_manual_references()
