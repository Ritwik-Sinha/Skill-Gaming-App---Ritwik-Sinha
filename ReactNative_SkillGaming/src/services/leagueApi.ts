import { httpsCallable } from 'firebase/functions';
import { firebaseAuth, firebaseFunctions } from './firebase';

export interface LeagueTier {
  tier: number;
  name: string;
  poolCents: number;
  threshold: number | null;
  winners: number;
}
export interface LeaguePlayer {
  id: string;
  name: string;
  photoUrl: string | null;
  rank: number;
  crowns: number;
  prizeCents: number;
  isMe: boolean;
}
export interface LeagueEvent {
  id: string;
  tier: number;
  fromTier: number;
  reason: 'instant' | 'weekly' | 'position';
  rank: number | null;
  previousRank: number | null;
}
export interface LeagueData {
  periodId: string;
  endsAt: string;
  serverTime: string;
  tier: number;
  crowns: number;
  remainderCents: number;
  tiers: LeagueTier[];
  top: LeaguePlayer[];
  me: LeaguePlayer;
  prizes: number[];
  eligibleWinners: number;
  events: LeagueEvent[];
  payouts: {
    id: string;
    tier: number;
    rank: number;
    amountCents: number;
    endsAt: string;
    paidAt: string | null;
  }[];
}
function account(uid: string) {
  if (!uid || firebaseAuth.currentUser?.uid !== uid)
    throw new Error('Your account changed. Please sign in again.');
}
export async function getMyLeague(uid: string) {
  account(uid);
  const result = await httpsCallable<Record<string, never>, LeagueData>(
    firebaseFunctions,
    'getMyLeague',
  )({});
  account(uid);
  if (!result.data || !Array.isArray(result.data.tiers) || !result.data.me)
    throw new Error('Could not load leagues.');
  return result.data;
}
export async function acknowledgeLeagueEvent(uid: string, eventId: string) {
  account(uid);
  await httpsCallable(firebaseFunctions, 'acknowledgeLeagueEvent')({ eventId });
  account(uid);
}
