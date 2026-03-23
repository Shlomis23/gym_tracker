-- Restore PostgREST access for the no-auth (single-user) app mode.
-- Run in Supabase SQL Editor with an admin role.

BEGIN;

-- 1) Schema access for REST roles
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- 2) Existing tables used by the app
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE
  public.workout_sessions,
  public.session_exercises,
  public.weight_goal,
  public.body_weight_logs,
  public.user_settings,
  public.workout_plans,
  public.exercise_library
TO anon, authenticated;

-- 3) Sequences for serial/identity-backed inserts
GRANT USAGE, SELECT, UPDATE
ON ALL SEQUENCES IN SCHEMA public
TO anon, authenticated;

-- 4) Default privileges for future objects in public schema.
-- NOTE: Run as the same owner role that creates future tables/sequences.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO anon, authenticated;

COMMIT;
