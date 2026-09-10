-- Global player ratings: start at 0; wins +20, losses -20, all refunds/ties 0.
-- game_earnings is already immutable and unique per bet, so it is also the rating
-- ledger. Its insert trigger commits with settlement and needs no client writes.
BEGIN;

-- Freeze account creation and earnings while installing triggers and backfilling.
-- Waiting inserts continue after COMMIT and are handled by the new triggers.
LOCK TABLE public.users, public.game_earnings IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public.player_ratings (
  firebase_uid text PRIMARY KEY REFERENCES public.users(firebase_uid) ON UPDATE CASCADE ON DELETE RESTRICT,
  rating integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.player_ratings ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.player_ratings IS
  'Server-owned global player rating. Starts at 0 with no floor; trusted matched wins add 20 and losses subtract 20. game_earnings is the immutable source ledger.';

CREATE FUNCTION public.initialize_player_rating() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.firebase_uid IS NOT NULL THEN
    INSERT INTO public.player_ratings (firebase_uid) VALUES (NEW.firebase_uid)
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER users_initialize_player_rating
  AFTER INSERT OR UPDATE OF firebase_uid ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.initialize_player_rating();
REVOKE ALL ON FUNCTION public.initialize_player_rating() FROM PUBLIC;

CREATE FUNCTION public.apply_game_earning_rating() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  delta integer;
BEGIN
  IF NEW.match_id IS NULL OR NEW.outcome NOT IN ('won', 'lost') THEN
    RETURN NEW;
  END IF;
  -- Old attempts have no trusted game/debit provenance. Both participants must
  -- belong to this match and have a server-consumed, finished paid attempt.
  IF NOT EXISTS (
    SELECT 1 FROM public.results r
      JOIN public.bets b ON b.id = NEW.bet_id AND b.result_id = r.id
      JOIN public.bets opponent ON opponent.id = CASE
        WHEN r.user1_bet_id = b.id THEN r.user2_bet_id
        WHEN r.user2_bet_id = b.id THEN r.user1_bet_id END
        AND opponent.result_id = r.id
    WHERE r.id = NEW.match_id AND b.firebase_uid = NEW.firebase_uid
      AND b.request_id IS NOT NULL AND opponent.request_id IS NOT NULL
      AND b.wallet_debited_cents > 0 AND opponent.wallet_debited_cents > 0
      AND b.play_status <> 'playing' AND opponent.play_status <> 'playing'
      AND b.finish_reason <> 'legacy' AND opponent.finish_reason <> 'legacy'
  ) THEN
    RETURN NEW;
  END IF;
  delta := CASE NEW.outcome WHEN 'won' THEN 20 ELSE -20 END;
  INSERT INTO public.player_ratings (firebase_uid, rating)
    VALUES (NEW.firebase_uid, delta)
    ON CONFLICT (firebase_uid) DO UPDATE
      SET rating = public.player_ratings.rating + EXCLUDED.rating,
          updated_at = now();
  RETURN NEW;
END $$;
CREATE TRIGGER game_earnings_apply_rating AFTER INSERT ON public.game_earnings
  FOR EACH ROW EXECUTE FUNCTION public.apply_game_earning_rating();
REVOKE ALL ON FUNCTION public.apply_game_earning_rating() FROM PUBLIC;

-- Backfill only actual matched, nonlegacy wins/losses. Never infer results from
-- scores, old hypothetical payout columns, or an unmatched/forfeited entry alone.
INSERT INTO public.player_ratings (firebase_uid, rating)
SELECT u.firebase_uid, COALESCE(earned.delta, 0)::integer
  FROM public.users u
  LEFT JOIN (
    SELECT e.firebase_uid,
      sum(CASE e.outcome WHEN 'won' THEN 20 ELSE -20 END) AS delta
    FROM public.game_earnings e
      JOIN public.results r ON r.id = e.match_id
      JOIN public.bets b ON b.id = e.bet_id AND b.result_id = r.id
      JOIN public.bets opponent ON opponent.id = CASE
        WHEN r.user1_bet_id = b.id THEN r.user2_bet_id
        WHEN r.user2_bet_id = b.id THEN r.user1_bet_id END
        AND opponent.result_id = r.id
    WHERE e.outcome IN ('won', 'lost') AND r.status = 'settled'
      AND b.firebase_uid = e.firebase_uid
      AND b.request_id IS NOT NULL AND opponent.request_id IS NOT NULL
      AND b.wallet_debited_cents > 0 AND opponent.wallet_debited_cents > 0
      AND b.play_status <> 'playing' AND opponent.play_status <> 'playing'
      AND b.finish_reason <> 'legacy' AND opponent.finish_reason <> 'legacy'
    GROUP BY e.firebase_uid
  ) earned ON earned.firebase_uid = u.firebase_uid
WHERE u.firebase_uid IS NOT NULL;

COMMIT;
