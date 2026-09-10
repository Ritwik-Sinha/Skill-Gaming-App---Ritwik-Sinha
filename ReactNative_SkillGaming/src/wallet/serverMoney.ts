export const MAX_SERVER_BALANCE = 999_999;

/** Dollars at the UI boundary; all server arithmetic uses integer cents. */
export function formatServerMoney(dollars: number): string {
  const cents = Math.round(Math.abs(dollars) * 100);
  const whole = Math.floor(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = cents % 100;
  return `${dollars < 0 ? '-' : ''}$${whole}${
    fraction ? `.${fraction.toString().padStart(2, '0')}` : ''
  }`;
}

export function parseServerAmount(amount: string): number {
  const value = amount.trim();
  if (!/^\d+$/.test(value)) {
    throw new Error('Enter a whole-dollar amount without decimals.');
  }
  const dollars = Number(value);
  if (!Number.isSafeInteger(dollars) || dollars > MAX_SERVER_BALANCE) {
    throw new Error(
      `Your demo balance can be at most ${formatServerMoney(
        MAX_SERVER_BALANCE,
      )}.`,
    );
  }
  if (dollars <= 0) throw new Error('Enter an amount greater than $0.');
  return dollars * 100;
}
