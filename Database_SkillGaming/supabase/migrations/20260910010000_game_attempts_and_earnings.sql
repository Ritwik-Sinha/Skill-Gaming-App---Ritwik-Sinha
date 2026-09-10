-- One server-consumed attempt per bet, immutable settlement, and GameEarning ledger.
-- Apply AFTER 20260910000000_bets_and_results.sql. Wallet credits are DEMO ONLY.

ALTER TABLE public.bets
  ADD COLUMN request_id text,
  ADD COLUMN play_status text NOT NULL DEFAULT 'forfeited'
    CHECK (play_status IN ('playing', 'completed', 'forfeited')),
  ADD COLUMN score bigint CHECK (score >= 0 AND score <= 1000000000),
  ADD COLUMN started_at timestamptz,
  ADD COLUMN finished_at timestamptz,
  ADD COLUMN lease_expires_at timestamptz,
  ADD COLUMN wallet_debited_cents bigint NOT NULL DEFAULT 0 CHECK (wallet_debited_cents >= 0),
  ADD COLUMN finish_reason text
    CHECK (finish_reason IN ('completed', 'forfeited', 'timeout', 'legacy'));

-- Old rows never had a playable attempt. Do not allow their purchase to be replayed.
-- Unmatched legacy rows are cancelled; matched legacy rows refund when finalized.
UPDATE public.bets
   SET finished_at = now(), finish_reason = 'legacy',
       status = CASE WHEN status = 'pending' THEN 'cancelled' ELSE status END,
       updated_at = now();

CREATE UNIQUE INDEX bets_request_id_key
  ON public.bets (firebase_uid, request_id) WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX bets_one_playing_per_user_key
  ON public.bets (firebase_uid) WHERE play_status = 'playing';
CREATE INDEX bets_expired_attempts_idx
  ON public.bets (lease_expires_at) WHERE play_status = 'playing';
CREATE INDEX bets_completed_scores_idx
  ON public.bets (game_id, firebase_uid, score DESC) WHERE play_status = 'completed';

-- Recovery must not create a paid game whose original request never arrived.
-- A tombstone also rejects an original request that arrives AFTER recovery.
CREATE TABLE public.cancelled_game_requests (
  firebase_uid text NOT NULL REFERENCES public.users(firebase_uid) ON UPDATE CASCADE ON DELETE RESTRICT,
  request_id text NOT NULL,
  game_id text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (firebase_uid, request_id)
);
ALTER TABLE public.cancelled_game_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.results
  ADD COLUMN gross_pool_cents bigint NOT NULL DEFAULT 0 CHECK (gross_pool_cents >= 0),
  ADD COLUMN match_fee_cents bigint NOT NULL DEFAULT 0 CHECK (match_fee_cents >= 0),
  ADD COLUMN settlement_kind text
    CHECK (settlement_kind IN ('win', 'tie', 'double_forfeit')),
  ADD COLUMN winner_bet_id bigint REFERENCES public.bets(id) ON DELETE RESTRICT;

UPDATE public.results SET gross_pool_cents = bet_amount_cents * 2;
-- The previous matcher populated hypothetical payouts before results were known.
UPDATE public.results
   SET user1_win_amount_cents = 0, user2_win_amount_cents = 0
 WHERE status = 'matched';

CREATE TABLE public.game_earnings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  match_id bigint NOT NULL REFERENCES public.results(id) ON DELETE RESTRICT,
  bet_id bigint NOT NULL UNIQUE REFERENCES public.bets(id) ON DELETE RESTRICT,
  firebase_uid text NOT NULL REFERENCES public.users(firebase_uid) ON UPDATE CASCADE ON DELETE RESTRICT,
  outcome text NOT NULL CHECK (outcome IN ('won', 'lost', 'tie', 'refunded')),
  gross_amount_cents bigint NOT NULL CHECK (gross_amount_cents >= 0),
  match_fee_cents bigint NOT NULL CHECK (match_fee_cents >= 0),
  net_amount_cents bigint NOT NULL CHECK (net_amount_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, firebase_uid),
  CHECK (gross_amount_cents = match_fee_cents + net_amount_cents)
);
COMMENT ON TABLE public.game_earnings IS
  'GameEarning: immutable per-participant match settlement, including zero losses and stake refunds, committed atomically with demo wallet credits.';
CREATE INDEX game_earnings_user_created_at_idx
  ON public.game_earnings (firebase_uid, created_at DESC);
ALTER TABLE public.game_earnings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.wallets (
  firebase_uid text PRIMARY KEY REFERENCES public.users(firebase_uid) ON UPDATE CASCADE ON DELETE RESTRICT,
  balance_cents bigint NOT NULL DEFAULT 0 CHECK (balance_cents BETWEEN 0 AND 9007199254740991),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  mode text NOT NULL DEFAULT 'demo' CHECK (mode = 'demo'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.wallet_entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  firebase_uid text NOT NULL REFERENCES public.wallets(firebase_uid) ON UPDATE CASCADE ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('demo_credit', 'entry', 'payout', 'refund')),
  idempotency_key text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents <> 0),
  balance_after_cents bigint NOT NULL CHECK (balance_after_cents BETWEEN 0 AND 9007199254740991),
  bet_id bigint REFERENCES public.bets(id) ON DELETE RESTRICT,
  match_id bigint REFERENCES public.results(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firebase_uid, idempotency_key),
  CHECK ((kind = 'entry' AND amount_cents < 0 AND bet_id IS NOT NULL)
    OR (kind = 'demo_credit' AND amount_cents > 0 AND bet_id IS NULL AND match_id IS NULL)
    OR (kind IN ('payout', 'refund') AND amount_cents > 0 AND bet_id IS NOT NULL AND match_id IS NOT NULL))
);
CREATE UNIQUE INDEX wallet_entries_one_entry_per_bet ON public.wallet_entries (bet_id) WHERE kind = 'entry';
CREATE UNIQUE INDEX wallet_entries_one_settlement_per_bet ON public.wallet_entries (bet_id) WHERE kind IN ('payout', 'refund');
CREATE INDEX wallet_entries_user_created_at_idx ON public.wallet_entries (firebase_uid, created_at DESC);
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_entries ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.wallets IS 'Server-owned demo credits. New accounts start at zero; client-local balances are never imported.';

ALTER TABLE public.bets ADD CONSTRAINT bets_attempt_state_check CHECK (
  (play_status = 'playing' AND request_id IS NOT NULL AND started_at IS NOT NULL
    AND lease_expires_at IS NOT NULL AND finished_at IS NULL AND finish_reason IS NULL)
  OR (play_status <> 'playing' AND finished_at IS NOT NULL AND lease_expires_at IS NULL AND finish_reason IS NOT NULL)
);
ALTER TABLE public.bets ADD CONSTRAINT bets_completed_score_check
  CHECK (play_status <> 'completed' OR score IS NOT NULL);

CREATE FUNCTION public.protect_finished_game_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.play_status <> 'playing' AND
     ROW(NEW.play_status, NEW.score, NEW.finished_at, NEW.finish_reason, NEW.lease_expires_at)
     IS DISTINCT FROM ROW(OLD.play_status, OLD.score, OLD.finished_at, OLD.finish_reason, OLD.lease_expires_at) THEN
    RAISE EXCEPTION 'A finished game attempt cannot be replayed or changed';
  END IF;
  IF ROW(NEW.firebase_uid, NEW.game_id, NEW.amount_cents, NEW.request_id, NEW.started_at, NEW.wallet_debited_cents)
     IS DISTINCT FROM ROW(OLD.firebase_uid, OLD.game_id, OLD.amount_cents, OLD.request_id, OLD.started_at, OLD.wallet_debited_cents) THEN
    RAISE EXCEPTION 'Game entry identity and stake are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bets_protect_finished_attempt BEFORE UPDATE ON public.bets
  FOR EACH ROW EXECUTE FUNCTION public.protect_finished_game_attempt();

CREATE FUNCTION public.protect_game_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Game and wallet ledger entries are immutable';
END $$;
CREATE TRIGGER game_earnings_immutable BEFORE UPDATE OR DELETE ON public.game_earnings
  FOR EACH ROW EXECUTE FUNCTION public.protect_game_ledger();
CREATE TRIGGER wallet_entries_immutable BEFORE UPDATE OR DELETE ON public.wallet_entries
  FOR EACH ROW EXECUTE FUNCTION public.protect_game_ledger();

-- Settled legacy rows are intentionally untouched: they have no trustworthy score
-- or fee provenance, and must not be retrospectively charged or paid a second time.
