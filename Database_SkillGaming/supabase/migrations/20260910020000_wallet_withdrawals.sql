-- Allow cent-precision demo withdrawals in the existing immutable wallet ledger.
-- Existing entry, credit, payout and refund rules remain unchanged.
BEGIN;

ALTER TABLE public.wallet_entries
  DROP CONSTRAINT wallet_entries_kind_check,
  DROP CONSTRAINT wallet_entries_check,
  ADD CONSTRAINT wallet_entries_kind_check
    CHECK (kind IN ('demo_credit', 'demo_withdrawal', 'entry', 'payout', 'refund')),
  ADD CONSTRAINT wallet_entries_check
    CHECK ((kind = 'entry' AND amount_cents < 0 AND bet_id IS NOT NULL)
      OR (kind = 'demo_credit' AND amount_cents > 0 AND bet_id IS NULL AND match_id IS NULL)
      OR (kind = 'demo_withdrawal' AND amount_cents < 0 AND bet_id IS NULL AND match_id IS NULL)
      OR (kind IN ('payout', 'refund') AND amount_cents > 0 AND bet_id IS NOT NULL AND match_id IS NOT NULL));

COMMIT;
