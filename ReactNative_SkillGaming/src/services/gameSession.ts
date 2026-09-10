import AsyncStorage from '@react-native-async-storage/async-storage';
import { assertBetAmount } from '../config/betConfig';
import {
  finishGame,
  GAME_ID,
  placeBet,
  recoverGameReservation,
  type Bet,
  type FinishRequest,
  type OwnResult,
} from './gameApi';

interface Journal {
  requestId: string;
  amountCents: number;
  betId?: string;
  finish?: FinishRequest;
}
const keyFor = (uid: string) =>
  `@skillgaming/game_attempt/v1/${encodeURIComponent(uid)}`;
const write = (uid: string, journal: Journal) =>
  AsyncStorage.setItem(keyFor(uid), JSON.stringify(journal));
async function read(uid: string): Promise<Journal | null> {
  const value = await AsyncStorage.getItem(keyFor(uid));
  if (value === null) {
    return null;
  }
  const journal = JSON.parse(value) as Journal;
  if (
    typeof journal.requestId !== 'string' ||
    !Number.isSafeInteger(journal.amountCents) ||
    journal.amountCents <= 0
  ) {
    throw new Error(
      'The saved game could not be recovered. Please contact support.',
    );
  }
  return journal;
}

// Stored before the first network request. A lost response can only recover the
// SAME consumed attempt, never launch a new run or charge another entry.
export async function recoverGame(uid: string): Promise<OwnResult | null> {
  const journal = await read(uid);
  if (!journal) {
    return null;
  }
  if (!journal.betId) {
    const bet = await recoverGameReservation(
      {
        gameId: GAME_ID,
        amountCents: journal.amountCents,
        requestId: journal.requestId,
      },
      uid,
    );
    if (!bet) {
      await AsyncStorage.removeItem(keyFor(uid));
      return null;
    }
    journal.betId = bet.id;
    await write(uid, journal);
  }
  const response = await finishGame(
    journal.finish ?? { betId: journal.betId, reason: 'forfeited' },
    uid,
  );
  await AsyncStorage.removeItem(keyFor(uid));
  return response.result;
}

export async function startGame(
  uid: string,
  amountCents: number,
): Promise<{ bet: Bet } | { recovered: OwnResult }> {
  assertBetAmount(amountCents);
  const recovered = await recoverGame(uid);
  if (recovered) {
    return { recovered };
  }
  const journal: Journal = {
    requestId: `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2)}-${Math.random().toString(36).slice(2)}`,
    amountCents,
  };
  await write(uid, journal);
  let response;
  try {
    response = await placeBet(
      { gameId: GAME_ID, amountCents, requestId: journal.requestId },
      uid,
    );
  } catch (error) {
    const code = (error as { code?: string }).code;
    // These callable errors roll back the reservation. Ambiguous network errors
    // retain the journal so a lost success response cannot create a second bet.
    if (
      [
        'functions/invalid-argument',
        'functions/failed-precondition',
        'functions/permission-denied',
        'functions/resource-exhausted',
        'functions/unauthenticated',
      ].includes(code ?? '')
    ) {
      await AsyncStorage.removeItem(keyFor(uid));
    }
    throw error;
  }
  journal.betId = response.bet.id;
  await write(uid, journal);
  if (!response.canStart || response.bet.playStatus !== 'playing') {
    return { recovered: (await recoverGame(uid))! };
  }
  return { bet: response.bet };
}

export async function saveGameFinish(
  uid: string,
  request: FinishRequest,
): Promise<OwnResult> {
  const journal = await read(uid);
  if (!journal || journal.betId !== request.betId) {
    throw new Error('The saved game does not match this attempt.');
  }
  // Persist completion before submitting; an offline final score is retried on
  // relaunch. The server lease remains authoritative if it expired meanwhile.
  journal.finish = request;
  await write(uid, journal);
  const response = await finishGame(request, uid);
  await AsyncStorage.removeItem(keyFor(uid));
  return response.result;
}
