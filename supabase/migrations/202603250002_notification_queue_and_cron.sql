create table if not exists public.notification_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null,
  title text not null,
  body text not null,
  scheduled_for timestamptz not null,
  status text not null default 'pending',
  dedupe_key text null,
  payload_json jsonb null,
  created_at timestamptz not null default now(),
  sent_at timestamptz null,
  cancelled_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint notification_queue_status_check check (status in ('pending', 'sent', 'cancelled', 'failed')),
  constraint notification_queue_type_check check (type in ('weight_reminder', 'workout_gap_reminder', 'pr_celebration'))
);

create index if not exists notification_queue_user_id_idx
  on public.notification_queue (user_id);

create index if not exists notification_queue_status_idx
  on public.notification_queue (status);

create index if not exists notification_queue_scheduled_for_idx
  on public.notification_queue (scheduled_for);

create unique index if not exists notification_queue_dedupe_key_uidx
  on public.notification_queue (dedupe_key)
  where dedupe_key is not null;

create or replace function public.set_notification_queue_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_notification_queue_updated_at on public.notification_queue;
create trigger trg_notification_queue_updated_at
before update on public.notification_queue
for each row
execute function public.set_notification_queue_updated_at();

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('enqueue-weight-reminders-job')
where exists (
  select 1 from cron.job where jobname = 'enqueue-weight-reminders-job'
);

select cron.unschedule('send-due-notifications-job')
where exists (
  select 1 from cron.job where jobname = 'send-due-notifications-job'
);

select cron.schedule(
  'enqueue-weight-reminders-job',
  '*/30 * * * *',
  $$
  select
    net.http_post(
      url:='https://jezibgdemidhebbcpdch.supabase.co/functions/v1/enqueue-weight-reminders',
      headers:='{"Content-Type":"application/json", "apikey":"sb_publishable_NDyz8DAcTO8kOs6JhAjTFw_uRTgb5nf"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);

select cron.schedule(
  'send-due-notifications-job',
  '*/5 * * * *',
  $$
  select
    net.http_post(
      url:='https://jezibgdemidhebbcpdch.supabase.co/functions/v1/send-due-notifications',
      headers:='{"Content-Type":"application/json", "apikey":"sb_publishable_NDyz8DAcTO8kOs6JhAjTFw_uRTgb5nf"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);
