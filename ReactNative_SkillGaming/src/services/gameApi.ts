import { httpsCallable } from 'firebase/functions';
import { assertBetAmount } from '../config/betConfig';
import { firebaseAuth, firebaseFunctions } from './firebase';

export type PlayStatus = 'playing' | 'completed' | 'forfeited';
export interface Bet {
  id: string;
  gameId: string;
  amountCents: number;
  status: 'pending' | 'matched' | 'cancelled';
  playStatus: PlayStatus;
  score: number | null;
  resultId: string | null;
  startedAt: string;
  finishedAt: string | null;
  leaseExpiresAt: string | null;
  createdAt: string;
}
export interface OwnResult {
  betId: string;
  matchId: string | null;
  gameId: string;
  amountCents: number;
  score: number | null;
  playStatus: PlayStatus;
  opponentScore: number | null;
  opponentPlayStatus: 'completed' | 'forfeited' | null;
  matchStatus: 'unmatched' | 'matched' | 'settled' | 'cancelled';
  outcome:
    | 'playing'
    | 'waiting_for_match'
    | 'waiting_for_opponent'
    | 'won'
    | 'lost'
    | 'tie'
    | 'refunded'
    | 'forfeited'
    | 'cancelled';
  totalPoolCents: number;
  totalMatchFeeCents: number;
  grossAmountCents: number;
  matchFeeCents: number;
  netAmountCents: number;
  walletCreditCents?: number;
  isLegacy?: boolean;
  matchFeePercent: number;
  createdAt: string;
  settledAt: string | null;
}
export interface Leaderboard {
  gameId: string;
  score: number | null;
  bestScore: number | null;
  rank: number | null;
  totalPlayers: number;
  playersBelow: number;
  isPersonalBest: boolean;
}
export interface GameResponse {
  bet: Bet;
  result: OwnResult;
}
export interface FinishRequest {
  betId: string;
  score?: number;
  reason: 'completed' | 'forfeited';
}
export const GAME_ID = 'jungleSwing';

function assertAccount(expectedUid?: string) {
  if (expectedUid && firebaseAuth.currentUser?.uid !== expectedUid) {
    throw new Error(
      'Sign back into the account that started this match to recover it.',
    );
  }
}
export async function placeBet(
  request: { gameId: string; amountCents: number; requestId: string },
  expectedUid?: string,
) {
  assertBetAmount(request.amountCents);
  assertAccount(expectedUid);
  const call = httpsCallable<
    typeof request,
    GameResponse & { canStart: boolean }
  >(firebaseFunctions, 'placeBet');
  return (await call(request)).data;
}
export async function checkpointGame(
  betId: string,
  score?: number,
  expectedUid?: string,
) {
  assertAccount(expectedUid);
  const call = httpsCallable<{ betId: string; score?: number }, GameResponse>(
    firebaseFunctions,
    'checkpointGame',
  );
  return (await call({ betId, ...(score === undefined ? {} : { score }) }))
    .data;
}
export async function recoverGameReservation(
  request: { gameId: string; amountCents: number; requestId: string },
  expectedUid: string,
): Promise<Bet | null> {
  assertAccount(expectedUid);
  const call = httpsCallable<typeof request, { bet: Bet | null }>(
    firebaseFunctions,
    'recoverGameReservation',
  );
  return (await call(request)).data.bet;
}
export async function finishGame(request: FinishRequest, expectedUid?: string) {
  assertAccount(expectedUid);
  const call = httpsCallable<FinishRequest, GameResponse>(
    firebaseFunctions,
    'finishGame',
  );
  return (await call(request)).data;
}
export async function getMyResults(): Promise<OwnResult[]> {
  const call = httpsCallable<{ limit: number }, { results: OwnResult[] }>(
    firebaseFunctions,
    'getMyResults',
  );
  return (await call({ limit: 100 })).data.results;
}
export async function getMyLeaderboard(
  gameId: string,
  betId?: string,
): Promise<Leaderboard> {
  const call = httpsCallable<{ gameId: string; betId?: string }, Leaderboard>(
    firebaseFunctions,
    'getMyLeaderboard',
  );
  return (await call({ gameId, ...(betId ? { betId } : {}) })).data;
}
