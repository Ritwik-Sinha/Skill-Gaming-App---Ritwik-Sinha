BEGIN;
LOCK TABLE public.users, public.game_earnings IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public.league_tiers (
  tier integer PRIMARY KEY CHECK (tier BETWEEN 0 AND 7),
  name text NOT NULL UNIQUE,
  pool_cents integer NOT NULL CHECK (pool_cents > 0),
  threshold integer CHECK (threshold > 0),
  shares integer[] NOT NULL,
  CHECK ((tier = 7) = (threshold IS NULL))
);
INSERT INTO public.league_tiers VALUES
 (0,'Bronze',100,10,ARRAY[70,30]),
 (1,'Silver',2500,50,ARRAY[50,30,20]),
 (2,'Gold',5000,150,ARRAY[40,25,15,12,8]),
 (3,'Platinum',10000,350,ARRAY[40,25,15,12,8]),
 (4,'Sapphire',30000,750,ARRAY[30,20,14,10,8,6,4,3,3,2]),
 (5,'Ruby',40000,1500,ARRAY[30,20,14,10,8,6,4,3,3,2]),
 (6,'Diamond',250000,3000,ARRAY[30,20,14,10,8,6,4,3,3,2]),
 (7,'Master',500000,NULL,ARRAY[3000,2000,1400,1000,800,600,400,300,250,250]);

CREATE TABLE public.league_config (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 duration interval NOT NULL DEFAULT interval '7 days' CHECK(duration >= interval '1 minute'),
 timezone text NOT NULL DEFAULT 'America/New_York' CHECK(timezone='America/New_York')
);
INSERT INTO public.league_config DEFAULT VALUES;
CREATE TABLE public.league_periods (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL UNIQUE CHECK(ends_at > starts_at),
 tiers jsonb NOT NULL,
 settled_at timestamptz
);
CREATE UNIQUE INDEX league_one_open_period ON public.league_periods ((true)) WHERE settled_at IS NULL;
INSERT INTO public.league_periods(starts_at, ends_at, tiers)
SELECT date_trunc('week', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York',
 (date_trunc('week', now() AT TIME ZONE 'America/New_York') + interval '7 days') AT TIME ZONE 'America/New_York',
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY tier) FROM public.league_tiers t);

CREATE TABLE public.league_players (
 firebase_uid text PRIMARY KEY REFERENCES public.users(firebase_uid) ON UPDATE CASCADE ON DELETE RESTRICT,
 tier integer NOT NULL DEFAULT 0 REFERENCES public.league_tiers(tier),
 earned_cents bigint NOT NULL DEFAULT 0 CHECK(earned_cents >= 0),
 crowns bigint GENERATED ALWAYS AS (earned_cents / 100) STORED,
 reached_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 joined_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX league_ranking ON public.league_players(tier, crowns DESC, reached_at, firebase_uid);
INSERT INTO public.league_players(firebase_uid) SELECT firebase_uid FROM public.users WHERE firebase_uid IS NOT NULL;

CREATE TABLE public.league_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 firebase_uid text NOT NULL REFERENCES public.users(firebase_uid),
 period_id bigint NOT NULL REFERENCES public.league_periods(id),
 from_tier integer NOT NULL, to_tier integer NOT NULL,
 reason text NOT NULL CHECK(reason IN ('instant','weekly','position')),
 previous_rank integer, current_rank integer,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 seen_at timestamptz
);
CREATE INDEX league_unseen_events ON public.league_events(firebase_uid,id) WHERE seen_at IS NULL;
CREATE TABLE public.league_observations (
 firebase_uid text PRIMARY KEY REFERENCES public.users(firebase_uid),
 period_id bigint NOT NULL REFERENCES public.league_periods(id),
 tier integer NOT NULL, rank integer NOT NULL
);
CREATE TABLE public.league_standings (
 period_id bigint NOT NULL REFERENCES public.league_periods(id),
 firebase_uid text NOT NULL REFERENCES public.users(firebase_uid),
 tier integer NOT NULL, rank bigint NOT NULL, crowns bigint NOT NULL,
 PRIMARY KEY(period_id,firebase_uid)
);
CREATE TABLE public.league_payouts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 period_id bigint NOT NULL REFERENCES public.league_periods(id),
 firebase_uid text NOT NULL REFERENCES public.users(firebase_uid),
 tier integer NOT NULL, rank integer NOT NULL,
 amount_cents bigint NOT NULL CHECK(amount_cents > 0),
 paid_at timestamptz,
 UNIQUE(period_id,firebase_uid)
);
CREATE INDEX league_pending_payouts ON public.league_payouts(id) WHERE paid_at IS NULL;
CREATE TABLE public.league_crown_ledger (
 earning_id bigint PRIMARY KEY REFERENCES public.game_earnings(id),
 firebase_uid text NOT NULL REFERENCES public.users(firebase_uid),
 period_id bigint NOT NULL REFERENCES public.league_periods(id),
 amount_cents bigint NOT NULL CHECK(amount_cents > 0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER league_crowns_immutable BEFORE UPDATE OR DELETE ON public.league_crown_ledger
 FOR EACH ROW EXECUTE FUNCTION public.protect_game_ledger();

ALTER TABLE public.wallet_entries DROP CONSTRAINT wallet_entries_kind_check, DROP CONSTRAINT wallet_entries_check;
ALTER TABLE public.wallet_entries ADD CONSTRAINT wallet_entries_kind_check
 CHECK(kind IN ('demo_credit','demo_withdrawal','entry','payout','refund','league_payout')),
 ADD CONSTRAINT wallet_entries_check CHECK(
 (kind='entry' AND amount_cents<0 AND bet_id IS NOT NULL) OR
 (kind IN ('demo_credit','league_payout') AND amount_cents>0 AND bet_id IS NULL AND match_id IS NULL) OR
 (kind='demo_withdrawal' AND amount_cents<0 AND bet_id IS NULL AND match_id IS NULL) OR
 (kind='payout' AND amount_cents>0 AND bet_id IS NOT NULL AND match_id IS NOT NULL) OR
 (kind='refund' AND amount_cents>0 AND bet_id IS NOT NULL));

-- All crown changes and period closure share this lock. No wallet locks here:
-- payout delivery is a separate, idempotent transaction to avoid lock inversion.
CREATE FUNCTION public.rollover_leagues() RETURNS bigint LANGUAGE plpgsql SET search_path='' AS $$
DECLARE p public.league_periods; cfg public.league_config; next_end timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock(734811209);
 SELECT * INTO cfg FROM public.league_config WHERE id;
 LOOP
  SELECT * INTO p FROM public.league_periods WHERE settled_at IS NULL FOR UPDATE;
  IF p.ends_at > clock_timestamp() THEN RETURN p.id; END IF;
  INSERT INTO public.league_standings(period_id,firebase_uid,tier,rank,crowns)
   SELECT p.id,firebase_uid,tier,row_number() OVER(PARTITION BY tier ORDER BY crowns DESC,reached_at,firebase_uid),crowns
   FROM public.league_players;
  -- Normalize shares over eligible winners only. Allocate rounding cents to first.
  WITH eligible AS (
   SELECT s.*, t.value AS config,
    (t.value->'shares'->>((s.rank-1)::integer))::numeric AS weight
   FROM public.league_standings s CROSS JOIN LATERAL jsonb_array_elements(p.tiers) t
   WHERE s.period_id=p.id AND s.crowns>0 AND s.tier=(t.value->>'tier')::integer
    AND s.rank<=jsonb_array_length(t.value->'shares')
  ), allocated AS (
   SELECT *,floor((config->>'pool_cents')::numeric * weight / sum(weight) OVER(PARTITION BY tier))::bigint AS amount
   FROM eligible
  )
  INSERT INTO public.league_payouts(period_id,firebase_uid,tier,rank,amount_cents)
   SELECT p.id,firebase_uid,tier,rank, amount + CASE WHEN rank=1 THEN
    (config->>'pool_cents')::bigint-sum(amount) OVER(PARTITION BY tier) ELSE 0 END FROM allocated;
  INSERT INTO public.league_events(firebase_uid,period_id,from_tier,to_tier,reason)
   SELECT firebase_uid,p.id,tier,tier+1,'weekly' FROM public.league_payouts WHERE period_id=p.id AND tier<7;
  UPDATE public.league_players lp SET
   tier=CASE WHEN EXISTS(SELECT 1 FROM public.league_payouts r WHERE r.period_id=p.id AND r.firebase_uid=lp.firebase_uid)
      THEN least(7,lp.tier+1) WHEN lp.crowns=0 THEN greatest(0,lp.tier-1) ELSE lp.tier END,
   earned_cents=0,reached_at=p.ends_at;
  UPDATE public.league_periods SET settled_at=clock_timestamp() WHERE id=p.id;
  next_end := ((p.ends_at AT TIME ZONE cfg.timezone)+cfg.duration) AT TIME ZONE cfg.timezone;
  INSERT INTO public.league_periods(starts_at,ends_at,tiers)
   SELECT p.ends_at,next_end,jsonb_agg(to_jsonb(t) ORDER BY tier) FROM public.league_tiers t;
 END LOOP;
END $$;

CREATE FUNCTION public.initialize_league_player() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.firebase_uid IS NOT NULL THEN
  PERFORM public.rollover_leagues();
  INSERT INTO public.league_players(firebase_uid) VALUES(NEW.firebase_uid) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER users_initialize_league AFTER INSERT OR UPDATE OF firebase_uid ON public.users
 FOR EACH ROW EXECUTE FUNCTION public.initialize_league_player();

CREATE FUNCTION public.apply_league_crowns() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE pid bigint; player public.league_players; new_tier integer; rules jsonb;
BEGIN
 IF NEW.outcome<>'won' OR NEW.match_id IS NULL OR NEW.net_amount_cents<=0 THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bets b WHERE b.id=NEW.bet_id AND b.firebase_uid=NEW.firebase_uid
  AND b.result_id=NEW.match_id AND b.request_id IS NOT NULL AND b.wallet_debited_cents>0
  AND b.play_status='completed' AND b.finish_reason<>'legacy') THEN RETURN NEW; END IF;
 pid:=public.rollover_leagues();
 INSERT INTO public.league_crown_ledger(earning_id,firebase_uid,period_id,amount_cents)
  VALUES(NEW.id,NEW.firebase_uid,pid,NEW.net_amount_cents) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN NEW; END IF;
 SELECT * INTO player FROM public.league_players WHERE firebase_uid=NEW.firebase_uid;
 UPDATE public.league_players SET earned_cents=earned_cents+NEW.net_amount_cents,
  reached_at=CASE WHEN (earned_cents+NEW.net_amount_cents)/100>crowns THEN clock_timestamp() ELSE reached_at END
  WHERE firebase_uid=NEW.firebase_uid;
 new_tier:=player.tier;
 SELECT tiers INTO rules FROM public.league_periods WHERE id=pid;
 WHILE new_tier<7 AND (player.earned_cents+NEW.net_amount_cents)/100 >= (rules->new_tier->>'threshold')::bigint LOOP
  new_tier:=new_tier+1;
 END LOOP;
 IF new_tier>player.tier THEN
  UPDATE public.league_players SET tier=new_tier WHERE firebase_uid=NEW.firebase_uid;
  INSERT INTO public.league_events(firebase_uid,period_id,from_tier,to_tier,reason)
   VALUES(NEW.firebase_uid,pid,player.tier,new_tier,'instant');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER game_earnings_league_crowns AFTER INSERT ON public.game_earnings
 FOR EACH ROW EXECUTE FUNCTION public.apply_league_crowns();

ALTER TABLE public.league_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_crown_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON FUNCTION public.rollover_leagues(),public.initialize_league_player(),public.apply_league_crowns() FROM PUBLIC;
COMMIT;
