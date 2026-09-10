-- Betting queue and matched-result rows.
-- Consumed by: Scripts/FirebaseFunctions/Bet/index.js
-- Apply with:  supabase db push   (or paste into Supabase Dashboard -> SQL Editor)
--
-- Bets are stored as incrementing rows. Matching is done by game_id + amount_cents,
-- so many users can wait on the same amount while the oldest compatible row is matched.

CREATE TABLE IF NOT EXISTS public.bets (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  firebase_uid    text        NOT NULL REFERENCES public.users(firebase_uid) ON UPDATE CASCADE ON DELETE RESTRICT,
  game_id         text        NOT NULL,
  amount_cents    bigint      NOT NULL CHECK (amount_cents > 0),
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'matched', 'cancelled')),
  result_id       bigint,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  matched_at      timestamptz
);

CREATE TABLE IF NOT EXISTS public.results (
  id                     bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id                text        NOT NULL,
  bet_amount_cents       bigint      NOT NULL CHECK (bet_amount_cents > 0),
  user1_firebase_uid     text        NOT NULL REFERENCES public.users(firebase_uid) ON UPDATE CASCADE ON DELETE RESTRICT,
  user2_firebase_uid     text        NOT NULL REFERENCES public.users(firebase_uid) ON UPDATE CASCADE ON DELETE RESTRICT,
  user1_bet_id           bigint      NOT NULL REFERENCES public.bets(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  user2_bet_id           bigint      NOT NULL REFERENCES public.bets(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  user1_win_amount_cents bigint      NOT NULL DEFAULT 0 CHECK (user1_win_amount_cents >= 0),
  user2_win_amount_cents bigint      NOT NULL DEFAULT 0 CHECK (user2_win_amount_cents >= 0),
  status                 text        NOT NULL DEFAULT 'matched'
                                         CHECK (status IN ('matched', 'settled', 'cancelled')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  settled_at             timestamptz,
  CONSTRAINT results_different_users CHECK (user1_firebase_uid <> user2_firebase_uid),
  CONSTRAINT results_distinct_bets CHECK (user1_bet_id <> user2_bet_id),
  CONSTRAINT results_user1_bet_key UNIQUE (user1_bet_id),
  CONSTRAINT results_user2_bet_key UNIQUE (user2_bet_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'bets_result_id_fkey'
       AND conrelid = 'public.bets'::regclass
  ) THEN
    ALTER TABLE public.bets
      ADD CONSTRAINT bets_result_id_fkey
      FOREIGN KEY (result_id) REFERENCES public.results(id)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

-- Fast queue lookup: oldest pending bet for the same game and amount.
CREATE INDEX IF NOT EXISTS bets_pending_match_idx
  ON public.bets (game_id, amount_cents, created_at, id)
  WHERE status = 'pending';

-- Fetching user history should stay cheap as the tables grow.
CREATE INDEX IF NOT EXISTS bets_firebase_uid_created_at_idx
  ON public.bets (firebase_uid, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS results_game_created_at_idx
  ON public.results (game_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS results_user1_created_at_idx
  ON public.results (user1_firebase_uid, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS results_user2_created_at_idx
  ON public.results (user2_firebase_uid, created_at DESC, id DESC);

ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
