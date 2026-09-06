-- Identity columns for players who sign in through Firebase Auth.
-- Consumed by: Scripts/FirebaseFunctions/Auth.js (onUserLogin)
-- Apply with:  supabase db push   (or paste into Supabase Dashboard → SQL Editor)
--
-- Every statement is idempotent, so this is safe on a fresh database AND on one
-- where `users` already exists — columns that are already present are untouched.
-- If your existing users table has NOT NULL columns without defaults that are not
-- listed here, add them to the INSERT in Auth.js or give them a default.

CREATE TABLE IF NOT EXISTS public.users (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  firebase_uid  text,
  email         text,
  display_name  text,
  photo_url     text,
  auth_provider text,
  login_count   integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

-- Same columns again, for a users table that pre-dates this migration.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS firebase_uid  text,
  ADD COLUMN IF NOT EXISTS email         text,
  ADD COLUMN IF NOT EXISTS display_name  text,
  ADD COLUMN IF NOT EXISTS photo_url     text,
  ADD COLUMN IF NOT EXISTS auth_provider text,
  ADD COLUMN IF NOT EXISTS login_count   integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at    timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at    timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- `ON CONFLICT (firebase_uid)` in onUserLogin requires exactly this unique index.
CREATE UNIQUE INDEX IF NOT EXISTS users_firebase_uid_key ON public.users (firebase_uid);

-- The Cloud Functions connect as the table owner (postgres), which is exempt from RLS.
-- Enabling it only closes the anon/authenticated PostgREST path that Supabase exposes
-- on every public table, so player data is never readable with the public anon key.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
