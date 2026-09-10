import type { OwnResult } from '../../services/gameApi';

export const resultGreen = '#00D69C';
export const resultGold = '#FFCF70';

export function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatScore(score: number | null) {
  return score === null ? 'No score' : score.toLocaleString();
}

export function isPendingResult(result: OwnResult) {
  return result.matchStatus === 'unmatched' || result.matchStatus === 'matched';
}

function outcomePresentation(result: OwnResult) {
  switch (result.outcome) {
    case 'won':
      return {
        title: 'You won!',
        description:
          'Your winning payout is recorded below, after the match fee.',
        color: resultGreen,
      };
    case 'lost':
      return {
        title:
          result.playStatus === 'forfeited' ? 'Run forfeited' : 'Match lost',
        description:
          result.playStatus === 'forfeited'
            ? 'This run ended early, so the match was lost. Its last score does not count toward winning.'
            : 'Your opponent finished ahead. Your score is saved.',
        color: '#FFAB8E',
      };
    case 'tie':
      return {
        title: 'It’s a tie',
        description:
          'Both runs finished with the same score. Both entries were refunded with no match fee.',
        color: resultGold,
      };
    case 'refunded':
      return {
        title: 'Entry refunded',
        description:
          result.playStatus === 'forfeited' && result.matchId !== null
            ? 'Both runs were forfeited. Both entries were refunded with no match fee.'
            : 'Your entry amount has been returned with no match fee. This run is closed.',
        color: resultGreen,
      };
    case 'forfeited':
      return {
        title: 'Run forfeited',
        description: 'This run ended early and cannot be resumed or replayed.',
        color: '#FFAB8E',
      };
    case 'cancelled':
      return {
        title: 'Match cancelled',
        description: 'This match is closed. See the recorded amounts below.',
        color: '#A3A3A8',
      };
    case 'waiting_for_opponent':
      return {
        title: 'Matched · awaiting score',
        description:
          'Your score is saved. Waiting for the other run to finish.',
        color: resultGold,
      };
    case 'waiting_for_match':
      return {
        title: 'Finding your match',
        description: 'Your score is saved. We’re waiting for a matching entry.',
        color: resultGold,
      };
    case 'playing':
      return {
        title: 'Run in progress',
        description: 'The final result will appear when this run ends.',
        color: resultGold,
      };
  }
}

export function resultPresentation(result: OwnResult) {
  const presentation = outcomePresentation(result);
  if (result.isLegacy) {
    return {
      ...presentation,
      title:
        result.outcome === 'refunded' ? 'Recorded refund' : presentation.title,
      description:
        'Historical record from before server wallet settlement. No credit was added to your current wallet for this entry.',
    };
  }
  return presentation;
}

export function matchLabel(result: OwnResult) {
  switch (result.matchStatus) {
    case 'unmatched':
      return 'Not matched yet';
    case 'matched':
      return 'Matched · settlement pending';
    case 'settled':
      return `Match #${result.matchId ?? result.betId}`;
    case 'cancelled':
      return 'Match closed';
  }
}
