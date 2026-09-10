-- Allow an expired unmatched entry to close with a fee-free refund and no match.
BEGIN;

ALTER TABLE public.bets
  DROP CONSTRAINT bets_finish_reason_check,
  ADD CONSTRAINT bets_finish_reason_check
    CHECK (finish_reason IN ('completed', 'forfeited', 'timeout', 'legacy', 'match_timeout'));

ALTER TABLE public.game_earnings
  ALTER COLUMN match_id DROP NOT NULL,
  ADD CONSTRAINT game_earnings_unmatched_refund_check
    CHECK (match_id IS NOT NULL OR (outcome = 'refunded' AND match_fee_cents = 0));

ALTER TABLE public.wallet_entries
  DROP CONSTRAINT wallet_entries_check,
  ADD CONSTRAINT wallet_entries_check
    CHECK ((kind = 'entry' AND amount_cents < 0 AND bet_id IS NOT NULL)
      OR (kind = 'demo_credit' AND amount_cents > 0 AND bet_id IS NULL AND match_id IS NULL)
      OR (kind = 'demo_withdrawal' AND amount_cents < 0 AND bet_id IS NULL AND match_id IS NULL)
      OR (kind = 'payout' AND amount_cents > 0 AND bet_id IS NOT NULL AND match_id IS NOT NULL)
      OR (kind = 'refund' AND amount_cents > 0 AND bet_id IS NOT NULL));

CREATE INDEX bets_unmatched_expiry_idx ON public.bets (created_at, id)
  WHERE status = 'pending' AND result_id IS NULL;

COMMENT ON TABLE public.game_earnings IS
  'Immutable per-bet settlement and fee-free unmatched expiry refunds, committed atomically with demo wallet credits. match_id is null only for an unmatched refund.';

COMMIT;
