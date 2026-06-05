-- Supabase Auth can expose confirmed_at as a generated column.
-- Do not write to it from the local-auth compatibility trigger.

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
