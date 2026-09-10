export const MIN_BET_CENTS = 100;
export const MAX_BET_CENTS = 2000;
export const QUICK_BET_AMOUNTS_CENTS = [100, 500, 1000, 2000] as const;

export function parseCustomBetAmount(input: string): number | null {
  const value = input.trim();
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const amountCents = Number(value) * 100;
  return Number.isSafeInteger(amountCents) &&
    amountCents >= MIN_BET_CENTS &&
    amountCents <= MAX_BET_CENTS
    ? amountCents
    : null;
}

export function assertBetAmount(amountCents: number): void {
  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents % 100 !== 0 ||
    amountCents < MIN_BET_CENTS ||
    amountCents > MAX_BET_CENTS
  ) {
    throw new Error('Select a whole-dollar bet between $1 and $20.');
  }
}
