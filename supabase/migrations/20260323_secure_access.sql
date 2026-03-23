-- Secure owner auth + RLS + share-token read RPCs
-- Assumption for legacy single-user data:
-- The first auth user is the current owner and receives ownership during backfill.

create extension if not exists pgcrypto;

do $$
declare
  v_owner_id uuid;
begin
  select id into v_owner_id from auth.users order by created_at asc limit 1;
  if v_owner_id is null then
    raise exception 'No auth.users row exists. Create owner auth user first, then rerun migration.';
  end if;

  -- user-owned tables
  alter table if exists public.workout_plans add column if not exists user_id uuid;
  alter table if exists public.workout_sessions add column if not exists user_id uuid;
  alter table if exists public.session_exercises add column if not exists user_id uuid;
  alter table if exists public.body_weight_logs add column if not exists user_id uuid;
  alter table if exists public.weight_goal add column if not exists user_id uuid;
  alter table if exists public.user_settings add column if not exists user_id uuid;
  alter table if exists public.exercise_library add column if not exists user_id uuid;

  update public.workout_plans set user_id = coalesce(user_id, v_owner_id) where user_id is null;
  update public.workout_sessions set user_id = coalesce(user_id, v_owner_id) where user_id is null;
  update public.body_weight_logs set user_id = coalesce(user_id, v_owner_id) where user_id is null;
  update public.weight_goal set user_id = coalesce(user_id, v_owner_id) where user_id is null;
  update public.user_settings set user_id = coalesce(user_id, v_owner_id) where user_id is null;
  update public.exercise_library set user_id = coalesce(user_id, v_owner_id) where user_id is null;

  update public.session_exercises se
  set user_id = ws.user_id
  from public.workout_sessions ws
  where se.session_id = ws.id
    and se.user_id is null;
  update public.session_exercises set user_id = coalesce(user_id, v_owner_id) where user_id is null;
end $$;

alter table if exists public.workout_plans alter column user_id set not null;
alter table if exists public.workout_sessions alter column user_id set not null;
alter table if exists public.session_exercises alter column user_id set not null;
alter table if exists public.body_weight_logs alter column user_id set not null;
alter table if exists public.weight_goal alter column user_id set not null;
alter table if exists public.user_settings alter column user_id set not null;
alter table if exists public.exercise_library alter column user_id set not null;

create index if not exists idx_workout_plans_user_id on public.workout_plans(user_id);
create index if not exists idx_workout_sessions_user_id on public.workout_sessions(user_id);
create index if not exists idx_session_exercises_user_id on public.session_exercises(user_id);
create index if not exists idx_body_weight_logs_user_id on public.body_weight_logs(user_id);
create index if not exists idx_weight_goal_user_id on public.weight_goal(user_id);
create index if not exists idx_user_settings_user_id on public.user_settings(user_id);
create index if not exists idx_exercise_library_user_id on public.exercise_library(user_id);

alter table if exists public.workout_plans enable row level security;
alter table if exists public.workout_sessions enable row level security;
alter table if exists public.session_exercises enable row level security;
alter table if exists public.body_weight_logs enable row level security;
alter table if exists public.weight_goal enable row level security;
alter table if exists public.user_settings enable row level security;
alter table if exists public.exercise_library enable row level security;

drop policy if exists owner_all_workout_plans on public.workout_plans;
create policy owner_all_workout_plans on public.workout_plans
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists owner_all_workout_sessions on public.workout_sessions;
create policy owner_all_workout_sessions on public.workout_sessions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists owner_all_session_exercises on public.session_exercises;
create policy owner_all_session_exercises on public.session_exercises
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists owner_all_body_weight_logs on public.body_weight_logs;
create policy owner_all_body_weight_logs on public.body_weight_logs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists owner_all_weight_goal on public.weight_goal;
create policy owner_all_weight_goal on public.weight_goal
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists owner_all_user_settings on public.user_settings;
create policy owner_all_user_settings on public.user_settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists owner_all_exercise_library on public.exercise_library;
create policy owner_all_exercise_library on public.exercise_library
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.shared_views (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  share_token text not null unique,
  is_active boolean not null default true,
  expires_at timestamptz null,
  created_at timestamptz not null default now()
);
create index if not exists idx_shared_views_owner on public.shared_views(owner_user_id);
create index if not exists idx_shared_views_token on public.shared_views(share_token);

alter table public.shared_views enable row level security;
drop policy if exists owner_manage_shared_views on public.shared_views;
create policy owner_manage_shared_views on public.shared_views
  for all to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create or replace function public.resolve_share_owner_id(p_share_token text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select sv.owner_user_id
  from public.shared_views sv
  where sv.share_token = p_share_token
    and sv.is_active = true
    and (sv.expires_at is null or sv.expires_at > now())
  limit 1
$$;

revoke all on function public.resolve_share_owner_id(text) from public;

create or replace function public.share_get_workout_plans(p_share_token text)
returns setof public.workout_plans
language sql
stable
security definer
set search_path = public
as $$
  select wp.*
  from public.workout_plans wp
  where wp.user_id = public.resolve_share_owner_id(p_share_token)
  order by wp.sort_order asc
$$;

create or replace function public.share_get_workout_sessions(p_share_token text)
returns table (
  id uuid,
  local_id text,
  workout_id text,
  workout_name text,
  date timestamptz,
  note text,
  sets jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select ws.id,
         ws.local_id,
         ws.workout_id,
         ws.workout_name,
         ws.date,
         ws.note,
         coalesce(
           (
             select jsonb_agg(jsonb_build_object(
               'id', se.id,
               'exercise_name', se.exercise_name,
               'set_number', se.set_number,
               'weight', se.weight,
               'reps', se.reps,
               'failed', se.failed
             ) order by se.set_number asc)
             from public.session_exercises se
             where se.session_id = ws.id
           ),
           '[]'::jsonb
         ) as sets
  from public.workout_sessions ws
  where ws.user_id = public.resolve_share_owner_id(p_share_token)
  order by ws.date asc
$$;

create or replace function public.share_get_weight_logs(p_share_token text)
returns setof public.body_weight_logs
language sql
stable
security definer
set search_path = public
as $$
  select bwl.*
  from public.body_weight_logs bwl
  where bwl.user_id = public.resolve_share_owner_id(p_share_token)
  order by bwl.measured_at asc
$$;

create or replace function public.share_get_weight_goal(p_share_token text)
returns setof public.weight_goal
language sql
stable
security definer
set search_path = public
as $$
  select wg.*
  from public.weight_goal wg
  where wg.user_id = public.resolve_share_owner_id(p_share_token)
  order by wg.updated_at desc
  limit 1
$$;

create or replace function public.share_get_user_settings(p_share_token text)
returns setof public.user_settings
language sql
stable
security definer
set search_path = public
as $$
  select us.*
  from public.user_settings us
  where us.user_id = public.resolve_share_owner_id(p_share_token)
  order by us.updated_at desc
  limit 1
$$;

create or replace function public.share_get_exercise_library(p_share_token text)
returns setof public.exercise_library
language sql
stable
security definer
set search_path = public
as $$
  select el.*
  from public.exercise_library el
  where el.user_id = public.resolve_share_owner_id(p_share_token)
  order by el.name asc
$$;

create or replace function public.share_get_default_token()
returns table (share_token text)
language sql
stable
security definer
set search_path = public
as $$
  select sv.share_token
  from public.shared_views sv
  where sv.is_active = true
    and (sv.expires_at is null or sv.expires_at > now())
  order by sv.created_at desc
  limit 1
$$;

grant execute on function public.share_get_workout_plans(text) to anon, authenticated;
grant execute on function public.share_get_workout_sessions(text) to anon, authenticated;
grant execute on function public.share_get_weight_logs(text) to anon, authenticated;
grant execute on function public.share_get_weight_goal(text) to anon, authenticated;
grant execute on function public.share_get_user_settings(text) to anon, authenticated;
grant execute on function public.share_get_exercise_library(text) to anon, authenticated;
grant execute on function public.share_get_default_token() to anon, authenticated;
