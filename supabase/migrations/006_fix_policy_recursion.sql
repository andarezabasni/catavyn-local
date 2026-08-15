-- ============================================================
-- Migration 006: Fix "infinite recursion detected" from 005
-- Run this in Supabase SQL Editor
--
-- The live database already had granular policies (Notes select/
-- insert/update/delete) built on a SECURITY DEFINER helper
-- is_note_collaborator(id) — created directly in the SQL editor and
-- never captured in migration files. Migration 005 added overlapping
-- policies whose plain subqueries into note_collaborators re-entered
-- the notes policies and caused recursion.
--
-- This migration:
--   1. Drops the three overlapping policies added by 005.
--   2. Recreates the helper functions (SECURITY DEFINER breaks the
--      policy cycle) including a new can_edit_note() check.
--   3. Rebuilds "Notes update" so collaborators need can_edit = true.
--      (Notes delete/insert were already owner-only — unchanged.)
--
-- The 005 triggers (protect_note_columns, set_activity_identity) and
-- the profiles lockdown are correct and stay as they are.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Remove the recursive/duplicate policies from 005
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Owners manage own notes"        ON public.notes;
DROP POLICY IF EXISTS "Collaborators read shared notes" ON public.notes;
DROP POLICY IF EXISTS "Collaborators edit shared notes" ON public.notes;

-- ------------------------------------------------------------
-- 2. Helper functions (SECURITY DEFINER bypasses RLS on
--    note_collaborators, which is what prevents the recursion)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_note_collaborator(p_note_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.note_collaborators
    WHERE note_id = p_note_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_note(p_note_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.note_collaborators
    WHERE note_id = p_note_id AND user_id = auth.uid() AND can_edit
  );
$$;

REVOKE ALL ON FUNCTION public.is_note_collaborator(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.can_edit_note(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_note_collaborator(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_note(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 3. Enforce can_edit on updates (owner unrestricted; collaborator
--    only when can_edit = true; delete stays owner-only)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Notes update" ON public.notes;
CREATE POLICY "Notes update" ON public.notes
  FOR UPDATE
  USING (auth.uid() = user_id OR public.can_edit_note(id))
  WITH CHECK (auth.uid() = user_id OR public.can_edit_note(id));
