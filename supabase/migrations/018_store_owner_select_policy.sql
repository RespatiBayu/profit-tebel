-- Migration 018: let store creators read their own rows directly
--
-- This avoids RLS failures on INSERT ... RETURNING / select-after-insert flows
-- before the owner membership row is observed by a follow-up SELECT policy.

DROP POLICY IF EXISTS "Users can view accessible stores" ON stores;

CREATE POLICY "Users can view accessible stores" ON stores
  FOR SELECT
  USING (auth.uid() = user_id OR public.user_can_access_store(id));
