-- Migration 019: profile roles + hierarchical user management

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role TEXT;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS created_by_id UUID;

UPDATE profiles
SET role = CASE
  WHEN lower(email) = 'profittebel.admin@gmail.com' THEN 'superadmin'
  ELSE COALESCE(role, 'member')
END
WHERE role IS NULL
   OR lower(email) = 'profittebel.admin@gmail.com';

UPDATE profiles
SET role = 'member'
WHERE role IS NULL;

ALTER TABLE profiles
  ALTER COLUMN role SET DEFAULT 'member';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_role_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('superadmin', 'admin', 'member'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_created_by_id_fkey'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_created_by_id_fkey
      FOREIGN KEY (created_by_id)
      REFERENCES profiles(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_created_by_id ON profiles(created_by_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

ALTER TABLE profiles
  ALTER COLUMN role SET NOT NULL;

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, is_paid, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    false,
    CASE
      WHEN lower(NEW.email) = 'profittebel.admin@gmail.com' THEN 'superadmin'
      ELSE 'member'
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
