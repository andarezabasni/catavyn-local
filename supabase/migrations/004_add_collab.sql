-- ============================================================
-- Migration 004: Collaboration — profiles, collaborators, activity
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Profiles (public mirror of auth.users, needed for invite-by-email lookup)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles readable by authenticated users" ON public.profiles
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users manage own profile" ON public.profiles
  FOR ALL USING (auth.uid() = id);

-- Trigger: auto-create profile row whenever a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill existing users into profiles
INSERT INTO public.profiles (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 2. Note collaborators (who has access to each note)
CREATE TABLE IF NOT EXISTS public.note_collaborators (
  note_id      UUID REFERENCES public.notes(id) ON DELETE CASCADE NOT NULL,
  user_id      UUID REFERENCES auth.users(id)   ON DELETE CASCADE NOT NULL,
  invited_email TEXT NOT NULL,
  can_edit     BOOLEAN DEFAULT true,
  added_at     TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (note_id, user_id)
);

ALTER TABLE public.note_collaborators ENABLE ROW LEVEL SECURITY;

-- Note owner can manage collaborators
CREATE POLICY "Note owners manage collaborators" ON public.note_collaborators
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.notes
      WHERE notes.id = note_id AND notes.user_id = auth.uid()
    )
  );

-- Collaborators can see their own entries (so they can discover shared notes)
CREATE POLICY "Collaborators view own entries" ON public.note_collaborators
  FOR SELECT USING (user_id = auth.uid());

-- 3. Note activity log
CREATE TABLE IF NOT EXISTS public.note_activity (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id    UUID REFERENCES public.notes(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES auth.users(id),
  user_email TEXT,
  action     TEXT NOT NULL CHECK (action IN ('created', 'edited', 'renamed', 'shared')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.note_activity ENABLE ROW LEVEL SECURITY;

-- Note owner and collaborators can view activity
CREATE POLICY "Note participants view activity" ON public.note_activity
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.notes
      WHERE notes.id = note_id
        AND (
          notes.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.note_collaborators
            WHERE note_collaborators.note_id = note_activity.note_id
              AND note_collaborators.user_id = auth.uid()
          )
        )
    )
  );

-- Authenticated users can log their own activity
CREATE POLICY "Users insert own activity" ON public.note_activity
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 4. Add updated_by to notes (tracks who last saved)
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

-- 5. Update notes RLS to allow collaborators to read and edit
DROP POLICY IF EXISTS "Users manage own notes" ON public.notes;

CREATE POLICY "Users and collaborators manage notes" ON public.notes
  FOR ALL USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.note_collaborators
      WHERE note_collaborators.note_id = notes.id
        AND note_collaborators.user_id = auth.uid()
    )
  );
