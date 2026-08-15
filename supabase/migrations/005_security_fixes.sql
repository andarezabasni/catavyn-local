-- ============================================================
-- Migration 005: Security fixes for collaboration
-- Run this in Supabase SQL Editor
--
-- Fixes:
--   1. Collaborators could UPDATE/DELETE any shared note regardless
--      of can_edit ("view only" was cosmetic). Now: SELECT always,
--      UPDATE only when can_edit, DELETE never (owner only).
--   2. Collaborators could change protected columns (pin_hash,
--      deleted_at, user_id, ...) via direct API calls.
--   3. Any authenticated user could SELECT all profiles and harvest
--      every user's email. Now: exact-match lookup via RPC only.
--   4. note_activity.user_email was client-supplied and spoofable.
--      Now forced from the caller's real identity by trigger.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Notes RLS: granular owner/collaborator policies
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users and collaborators manage notes" ON public.notes;

CREATE POLICY "Owners manage own notes" ON public.notes
  FOR ALL USING (auth.uid() = user_id);

-- Collaborators can always read shared notes (same as before)
CREATE POLICY "Collaborators read shared notes" ON public.notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.note_collaborators nc
      WHERE nc.note_id = notes.id AND nc.user_id = auth.uid()
    )
  );

-- Collaborators can edit ONLY when can_edit = true; never delete
CREATE POLICY "Collaborators edit shared notes" ON public.notes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.note_collaborators nc
      WHERE nc.note_id = notes.id AND nc.user_id = auth.uid() AND nc.can_edit
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.note_collaborators nc
      WHERE nc.note_id = notes.id AND nc.user_id = auth.uid() AND nc.can_edit
    )
  );

-- ------------------------------------------------------------
-- 2. Protect owner-only columns from collaborator updates.
--    RLS is row-level, not column-level, so a trigger silently
--    reverts protected fields when a non-owner saves.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_note_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM OLD.user_id THEN
    -- Collaborators may only change title/content/updated_at/updated_by
    NEW.user_id     := OLD.user_id;
    NEW.pin_hash    := OLD.pin_hash;
    NEW.is_pinned   := OLD.is_pinned;
    NEW.category_id := OLD.category_id;
    NEW.parent_id   := OLD.parent_id;
    NEW.deleted_at  := OLD.deleted_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS protect_note_columns ON public.notes;
CREATE TRIGGER protect_note_columns
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.protect_note_columns();

-- ------------------------------------------------------------
-- 3. Profiles: stop email harvesting.
--    Invite flow now uses an exact-match RPC instead of open SELECT.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Profiles readable by authenticated users" ON public.profiles;

CREATE OR REPLACE FUNCTION public.lookup_profile_by_email(lookup_email TEXT)
RETURNS TABLE (id UUID, email TEXT)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT p.id, p.email
  FROM public.profiles p
  WHERE p.email = lower(trim(lookup_email));
$$;

REVOKE ALL ON FUNCTION public.lookup_profile_by_email(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.lookup_profile_by_email(TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 4. note_activity: force user_id/user_email from the real caller
--    so activity entries can't impersonate someone else.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_activity_identity()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_id := auth.uid();
  SELECT p.email INTO NEW.user_email FROM public.profiles p WHERE p.id = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS set_activity_identity ON public.note_activity;
CREATE TRIGGER set_activity_identity
  BEFORE INSERT ON public.note_activity
  FOR EACH ROW EXECUTE FUNCTION public.set_activity_identity();

-- Tighten insert policy: only participants of a note they can access
-- (the EXISTS runs under the caller's notes RLS, so it only matches
-- notes they own or collaborate on)
DROP POLICY IF EXISTS "Users insert own activity" ON public.note_activity;
CREATE POLICY "Participants insert own activity" ON public.note_activity
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.notes n WHERE n.id = note_id)
  );
