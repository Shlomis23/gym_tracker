-- Hardening grants to align with Auth + RLS + share RPC architecture.
-- Run after: 20260323_secure_access.sql

grant usage on schema public to anon, authenticated;

-- Owner tables: authenticated clients can access (RLS still enforces user_id = auth.uid()).
grant select, insert, update, delete on table public.workout_plans to authenticated;
grant select, insert, update, delete on table public.workout_sessions to authenticated;
grant select, insert, update, delete on table public.session_exercises to authenticated;
grant select, insert, update, delete on table public.body_weight_logs to authenticated;
grant select, insert, update, delete on table public.weight_goal to authenticated;
grant select, insert, update, delete on table public.user_settings to authenticated;
grant select, insert, update, delete on table public.exercise_library to authenticated;
grant select, insert, update, delete on table public.shared_views to authenticated;

-- Anonymous clients must not hit owner tables directly.
revoke all on table public.workout_plans from anon;
revoke all on table public.workout_sessions from anon;
revoke all on table public.session_exercises from anon;
revoke all on table public.body_weight_logs from anon;
revoke all on table public.weight_goal from anon;
revoke all on table public.user_settings from anon;
revoke all on table public.exercise_library from anon;
revoke all on table public.shared_views from anon;

-- Keep guest/share reads via RPC only (execute grants are in 20260323_secure_access.sql).
