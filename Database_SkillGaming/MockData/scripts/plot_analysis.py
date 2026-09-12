#!/usr/bin/env python3
"""Render five data-backed PNG/SVG figures without modifying the mock datasets.

Install the optional pinned dependency from requirements-charts.txt in a virtual
environment, then run this script from any directory. All amounts come from the
generated JSON reports. PNGs use 160 dpi; SVGs retain editable text.
"""

import hashlib
import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter, MultipleLocator

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data' / 'output'
FIGURES = ROOT / 'docs' / 'figures'
BLUE = '#2563a6'
TEAL = '#087e83'
ORANGE = '#c76b17'
RED = '#bb354a'
GRAY = '#7b8797'
INK = '#243247'
LIGHT = '#e6ebf0'
BACKGROUND = '#ffffff'
NAMES = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Sapphire', 'Ruby', 'Diamond', 'Master']
CASE_LABELS = {
    'baseline': 'Normal week',
    'low_liquidity': 'Low cash + new company funding*',
    'high_wager': 'Higher wagers',
    'master_quiet': 'Original Master cohort goes quiet',
    'more_games_low_stakes': 'More games, smaller stakes',
    'outage': 'Technical problems',
    'whale_surge': 'Four large flagged accounts',
    'reserve_deficit': 'Cash shortfall: new pools blocked',
}


def dollars(cents):
    return cents / 100


def money(value, decimals=0):
    return ('−' if value < 0 else '') + '${:,.{}f}'.format(abs(value), decimals)


def currency_axis(value, position=None):
    if abs(value) >= 1000:
        return ('−' if value < 0 else '') + '${:g}k'.format(abs(value)/1000)
    return money(value)


def style():
    plt.rcParams.update({
        'font.family': 'DejaVu Sans', 'font.size': 11,
        'text.color': INK, 'axes.labelcolor': INK,
        'xtick.color': INK, 'ytick.color': INK,
        'axes.titleweight': 'bold', 'axes.titlesize': 12,
        'axes.spines.top': False, 'axes.spines.right': False,
        'axes.spines.left': False, 'axes.spines.bottom': False,
        'axes.axisbelow': True, 'figure.facecolor': BACKGROUND,
        'axes.facecolor': BACKGROUND, 'savefig.facecolor': BACKGROUND,
        'svg.fonttype': 'none', 'svg.hashsalt': 'skill-gaming-reward-analysis',
    })


def frame(ax, currency='y'):
    ax.grid(axis=currency, color=LIGHT, linewidth=.8)
    ax.tick_params(axis='both', length=0, pad=8)
    axis = ax.yaxis if currency == 'y' else ax.xaxis
    axis.set_major_formatter(FuncFormatter(currency_axis))


def heading(fig, title, subtitle):
    fig.text(.045, .965, title, ha='left', va='top', fontsize=18, weight='bold')
    fig.text(.045, .918, subtitle, ha='left', va='top', fontsize=11, color='#516176')


def footer(fig, text):
    fig.text(.045, .03, text, ha='left', va='bottom', fontsize=9.5,
             color='#516176', linespacing=1.55)


def save(fig, name):
    FIGURES.mkdir(parents=True, exist_ok=True)
    fig.savefig(FIGURES / (name+'.png'), dpi=160, bbox_inches='tight', pad_inches=.18,
                metadata={'Software': 'Matplotlib; synthetic reward analysis'})
    fig.savefig(FIGURES / (name+'.svg'), bbox_inches='tight', pad_inches=.18,
                metadata={'Date': None, 'Creator': 'Matplotlib; synthetic reward analysis'})
    plt.close(fig)


def scenario_comparison(cases):
    rows = [r for r in cases.values() if not r['case'].startswith('prior_')]
    fig, axes = plt.subplots(1, 2, figsize=(14, 7.4), sharey=True)
    fig.subplots_adjust(left=.285, right=.96, top=.81, bottom=.22, wspace=.25)
    heading(fig, 'The larger low-cash pool is a separately funded exception',
            'Eight alternative scenarios • next announced rewards and repeat-activity platform profit')
    y = list(range(len(rows)))
    colors = [ORANGE if r['case']=='low_liquidity' else GRAY if not r['proposal']['publishable'] else BLUE for r in rows]
    for ax, key, title in zip(axes,
            ['total_pools_cents', 'next_week_profit_cents'],
            ['Next total pool', 'Projected next-week platform profit']):
        values = [dollars(r['proposal'][key]) for r in rows]
        limit = max(values)*1.25
        bars = ax.barh(y, values, height=.57, color=colors, zorder=3)
        for i, (bar, value, row) in enumerate(zip(bars, values, rows)):
            if row['case'] == 'low_liquidity':
                bar.set_hatch('//')
                bar.set_edgecolor('#8a450e')
            if not row['proposal']['publishable']:
                bar.set_alpha(.55)
                bar.set_hatch('..')
            label = money(value, 0 if key=='total_pools_cents' else 2)
            if not row['proposal']['publishable']:
                label += ' · blocked' if key=='total_pools_cents' else ' †'
            ax.text(value+limit*.018, i, label, ha='left', va='center', fontsize=10.3)
        ax.set_xlim(0, limit)
        ax.set_title(title, loc='left', pad=20)
        ax.set_xlabel('USD', labelpad=11)
        frame(ax, 'x')
    axes[0].set_yticks(y, [CASE_LABELS[r['case']] for r in rows], fontsize=10.6)
    axes[0].invert_yaxis()
    axes[1].tick_params(axis='y', labelleft=False)
    axes[0].xaxis.set_major_locator(MultipleLocator(5000))
    axes[1].xaxis.set_major_locator(MultipleLocator(5000))
    footer(fig,
        '* Low cash includes new company equity for a one-week retention campaign; ordinary reward/growth ceilings are replaced.\n'
        '† Conditional profit assumes gameplay repeats with zero new rewards. Positive earnings do not repair the existing cash deficit.\n'
        'Synthetic USD • profit belongs to the platform, after modeled costs and pools • scenarios are alternatives, not consecutive weeks.')
    save(fig, 'scenario_comparison')


def reward_ladder(cases, policy):
    baseline = cases['baseline']['proposal']
    retention = cases['low_liquidity']['proposal']
    mins = policy['min_prize_crowns']
    fig, ax = plt.subplots(figsize=(13, 7))
    fig.subplots_adjust(left=.085, right=.975, top=.79, bottom=.23)
    heading(fig, 'Higher tiers receive larger total prize pools',
            'Same increasing ladder and weekly crown thresholds • normal policy versus the funded one-week campaign')
    for shift, result, color, label in [(-.19, baseline, BLUE, 'Normal policy'),
                                         (.19, retention, ORANGE, 'Funded retention campaign')]:
        values = [dollars(p) for p in result['pools_cents']]
        bars = ax.bar([i+shift for i in range(8)], values, width=.34,
                      color=color, label=label+' · '+money(dollars(result['total_pools_cents']))+' total')
        for bar, value in zip(bars, values):
            ax.text(bar.get_x()+bar.get_width()/2, value+65, money(value),
                    ha='center', va='bottom', fontsize=10)
    ax.set_xticks(range(8), [name+'\n'+f'{minimum:,} crown'+('s' if minimum!=1 else '')
                           for name, minimum in zip(NAMES, mins)], fontsize=10.5)
    ax.set_ylim(0, max(dollars(p) for p in retention['pools_cents'])*1.18)
    ax.set_ylabel('Total pool for the league (USD)', labelpad=12)
    ax.legend(loc='upper left', frameon=False, ncol=2, bbox_to_anchor=(0, 1.12), fontsize=10.5)
    frame(ax)
    footer(fig,
        'Crowns shown below each tier are minimum weekly prize-eligibility thresholds, not promotion thresholds or a purchase requirement.\n'
        'A pool is shared among eligible prize ranks; it is not a guaranteed amount per player. Both schedules apply only to new periods.')
    save(fig, 'reward_ladder')


def liquidity_funding(low):
    p = low['proposal']
    opening = dollars(p['treasury']['settled_cash_cents'])
    initial = dollars(p['pre_funding_headroom_cents'])
    protected = opening-initial
    equity = dollars(p['equity_funding_cents'])
    available = dollars(p['headroom_cents'])
    campaign = dollars(p['total_pools_cents'])
    remaining = available-campaign
    fig, axes = plt.subplots(1, 2, figsize=(14, 7), gridspec_kw={'width_ratios': [1, 1.8]})
    fig.subplots_adjust(left=.075, right=.965, top=.78, bottom=.23, wspace=.34)
    heading(fig, 'New equity funds the campaign; it does not create profit',
            'Low-cash scenario • existing player obligations and reserves stay protected before new rewards')
    ax = axes[0]
    values = [opening, protected]
    bars = ax.bar(range(2), values, color=[BLUE, GRAY], width=.58)
    for bar, value in zip(bars, values):
        ax.text(bar.get_x()+bar.get_width()/2, value+1000, money(value), ha='center', weight='bold')
    ax.set_xticks(range(2), ['Opening\nsettled cash', 'Protected\namount'])
    ax.set_ylim(0, opening*1.19)
    ax.set_title('1. Starting cash constraint', loc='left', pad=20)
    ax.set_ylabel('USD')
    frame(ax)
    ax.text(.5, .52, money(initial)+' free', transform=ax.transAxes, ha='center',
            fontsize=17, weight='bold', color=INK,
            bbox=dict(boxstyle='round,pad=.55', fc='white', ec=LIGHT))
    ax = axes[1]
    labels = ['Free before\nfunding', 'New company\nequity', 'Available\nafter funding',
              'Reserve next\nreward pool', 'Free after\nreservation']
    heights = [initial, equity, available, campaign, remaining]
    bottoms = [0, initial, 0, remaining, 0]
    colors = [TEAL, ORANGE, BLUE, GRAY, TEAL]
    ax.bar(range(5), heights, bottom=bottoms, color=colors, width=.58)
    ends = [initial, available, available, remaining]
    starts = [initial, available, available, remaining]
    for i, (end, start) in enumerate(zip(ends, starts)):
        ax.plot([i+.3, i+.7], [end, start], color=GRAY, linestyle='--', linewidth=1)
    texts = [money(initial), '+'+money(equity), money(available), '−'+money(campaign), money(remaining)]
    for i, (bottom, height, text) in enumerate(zip(bottoms, heights, texts)):
        ax.text(i, bottom+height+350, text, ha='center', va='bottom', fontsize=11, weight='bold')
    ax.set_xticks(range(5), labels, fontsize=10)
    ax.set_ylim(0, available*1.22)
    ax.set_title('2. Free-cash reservation waterfall', loc='left', pad=20)
    ax.set_ylabel('Free cash / movement (USD)')
    frame(ax)
    footer(fig,
        'The protected amount includes existing wallets, separate withdrawal/unsettled liabilities, current prizes and operating/risk buffers.\n'
        'The small '+money(initial)+' balances are labeled explicitly; bar heights remain proportional. Company equity must be cleared first.\n'
        'Neither new equity nor player deposits count as platform profit. Reserving a new pool does not cancel or spend existing obligations.')
    save(fig, 'liquidity_funding')


def retention_stress(low):
    p = low['proposal']
    rows = p['retention_sensitivity']
    loss_limit = dollars(p['retention_campaign']['effective_loss_budget_cents'])
    fig, axes = plt.subplots(2, 1, figsize=(12.7, 9), sharex=True)
    fig.subplots_adjust(left=.10, right=.97, top=.83, bottom=.21, hspace=.43)
    heading(fig, 'The retention offer can absorb a limited weekly loss',
            money(dollars(p['total_pools_cents']))+' fixed campaign pool • reduce contribution after costs, not games or wagers')
    for ax, key, title in zip(axes, ['weekly_profit_cents', 'cumulative_profit_cents'],
            ['Campaign week: platform profit', 'Current + campaign week: cumulative platform profit']):
        values = [dollars(r[key]) for r in rows]
        colors = [TEAL if value>=0 else RED for value in values]
        bars = ax.bar(range(len(rows)), values, width=.55, color=colors)
        for i, (value, bar, row) in enumerate(zip(values, bars, rows)):
            if not row['within_loss_budget']:
                bar.set_hatch('//')
                bar.set_edgecolor('#742536')
            ax.annotate(money(value, 2), (i, value), xytext=(0, 7 if value>=0 else -8),
                        textcoords='offset points', ha='center', va='bottom' if value>=0 else 'top',
                        fontsize=10.5, weight='bold',
                        bbox=dict(facecolor='white', edgecolor='none', pad=1.5))
        ax.axhline(0, color=INK, linewidth=1)
        ax.set_title(title, loc='left', pad=17)
        ax.set_ylabel('USD', labelpad=10)
        frame(ax)
    axes[0].axhline(-loss_limit, color=RED, linestyle='--', linewidth=1.2)
    axes[0].text(.02, .12, 'Weekly loss allowance: −'+money(loss_limit), transform=axes[0].transAxes,
                 color=RED, fontsize=10, bbox=dict(facecolor='white', edgecolor='none', pad=3))
    axes[0].set_ylim(-loss_limit*1.62, max(dollars(r['weekly_profit_cents']) for r in rows)*1.45)
    axes[1].set_ylim(0, max(dollars(r['cumulative_profit_cents']) for r in rows)*1.30)
    axes[1].set_xticks(range(len(rows)), [f"{int(r['ratio']*100)}%" for r in rows])
    axes[1].set_xlabel('Remaining net contribution versus the normal case', labelpad=11)
    footer(fig,
        'Contribution already deducts modeled costs and deferred fees. These percentages do not imply equal changes in attempts, stakes or retention.\n'
        'Cumulative profit = current modeled '+money(dollars(p['current_week_profit_cents']),2)+' + campaign-week profit; each branch starts at zero.\n'
        'Hatching marks the branch outside the weekly loss allowance, even though its two-week cumulative profit remains positive. Equity is excluded.')
    save(fig, 'retention_stress')


def weekly_profit(weekly):
    weeks = weekly['weeks']
    x = list(range(len(weeks)))
    profits = [dollars(w['platform_profit_cents']) for w in weeks]
    cumulative = [dollars(w['cumulative_platform_profit_cents']) for w in weeks]
    short = {'baseline': 'Normal', 'high_wager': 'Higher wagers', 'master_quiet': 'Master cohort\nquiet',
             'more_games_low_stakes': 'Smaller stakes', 'outage': 'Technical\nproblems',
             'whale_surge': 'Flagged\naccounts', 'platform_quiet': 'Nobody plays'}
    fig, axes = plt.subplots(2, 1, figsize=(14, 8.6), sharex=True)
    fig.subplots_adjust(left=.09, right=.97, top=.82, bottom=.21, hspace=.48)
    heading(fig, 'A profitable run can still contain a loss-making week',
            'Eight chronological weeks under the ordinary policy • no low-cash campaign or new company funding in this path')
    axes[0].bar(x, profits, width=.56, color=[BLUE if p>=0 else RED for p in profits])
    axes[0].axhline(0, color=INK, linewidth=1)
    for i, value in enumerate(profits):
        axes[0].annotate(money(value,2), (i,value), xytext=(0,7 if value>=0 else -7),
                        textcoords='offset points', ha='center', va='bottom' if value>=0 else 'top', fontsize=10)
    axes[0].set_title('Profit earned in each week', loc='left', pad=17)
    axes[0].set_ylim(min(profits)*3.4, max(profits)*1.25)
    axes[1].plot(x, cumulative, color=TEAL, marker='o', linewidth=2.5, markersize=7)
    axes[1].fill_between(x, cumulative, color=TEAL, alpha=.07)
    for i, value in enumerate(cumulative):
        axes[1].annotate(money(value,2), (i,value), xytext=(0,10), textcoords='offset points',
                        ha='center', va='bottom', fontsize=10)
    axes[1].set_title('Cumulative profit, starting at zero', loc='left', pad=17)
    axes[1].set_ylim(0, max(cumulative)*1.2)
    axes[1].set_xticks(x, [f"W{w['week']}\n{short[w['behavior_template']]}" for w in weeks], fontsize=10)
    for ax in axes:
        ax.set_ylabel('Platform profit (USD)', labelpad=12)
        frame(ax)
    footer(fig,
        'Player tiers, cash, liabilities and prior-week contribution carry forward. Each reward announcement precedes that week’s outcomes.\n'
        'W7 has no entrants or earned prizes but still incurs fixed costs. W8 recovers while new reward publication is blocked by the prior quiet week.\n'
        'Synthetic funded-product projection • cumulative profit adds actual weekly model results, not independent scenario forecasts or cash injections.')
    save(fig, 'weekly_profit')


def main():
    sources = [DATA/'scenario_results.json', DATA/'weekly_profit.json']
    before = {p: hashlib.sha256(p.read_bytes()).digest() for p in sources}
    scenarios = json.loads(sources[0].read_text())
    weekly = json.loads(sources[1].read_text())
    cases = {r['case']: r for r in scenarios['scenarios']}
    style()
    scenario_comparison(cases)
    reward_ladder(cases, scenarios['policy'])
    liquidity_funding(cases['low_liquidity'])
    retention_stress(cases['low_liquidity'])
    weekly_profit(weekly)
    assert all(hashlib.sha256(p.read_bytes()).digest()==digest for p,digest in before.items())
    print(json.dumps({'figures': 5, 'formats': ['png', 'svg'], 'png_dpi': 160,
                      'matplotlib_version': matplotlib.__version__, 'input_data_unchanged': True,
                      'output_directory': str(FIGURES)}))


if __name__ == '__main__':
    main()
