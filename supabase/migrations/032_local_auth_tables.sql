-- Local email/password auth tables used by src/lib/postgres/auth.ts.
-- Keep auth.users populated so legacy foreign keys to Supabase Auth remain valid.

CREATE TABLE IF NOT EXISTS public.auth_users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.auth_sessions (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.auth_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_users_email_lower ON public.auth_users (lower(email));
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON public.auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON public.auth_sessions (expires_at);

CREATE OR REPLACE FUNCTION public.touch_auth_users_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_auth_users_updated_at ON public.auth_users;
CREATE TRIGGER touch_auth_users_updated_at
BEFORE UPDATE ON public.auth_users
FOR EACH ROW
EXECUTE FUNCTION public.touch_auth_users_updated_at();

CREATE OR REPLACE FUNCTION public.ensure_supabase_auth_user_for_local_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO auth.users (
    id,
    aud,
    role,
    email,
    email_confirmed_at,
    confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    'authenticated',
    'authenticated',
    NEW.email,
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', NEW.full_name),
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      raw_user_meta_data = EXCLUDED.raw_user_meta_data,
      updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_supabase_auth_user_for_local_auth ON public.auth_users;
CREATE TRIGGER ensure_supabase_auth_user_for_local_auth
BEFORE INSERT OR UPDATE OF email, full_name ON public.auth_users
FOR EACH ROW
EXECUTE FUNCTION public.ensure_supabase_auth_user_for_local_auth();
