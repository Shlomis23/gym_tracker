create table if not exists public.account_transfer_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  user_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists account_transfer_codes_code_idx
  on public.account_transfer_codes (code);

alter table public.account_transfer_codes enable row level security;

create policy "anon can insert transfer codes"
  on public.account_transfer_codes for insert
  to anon with check (true);

create policy "anon can select transfer codes"
  on public.account_transfer_codes for select
  to anon using (true);

create policy "anon can delete transfer codes"
  on public.account_transfer_codes for delete
  to anon using (true);
